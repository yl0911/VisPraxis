from __future__ import annotations

import hashlib
import re
import time
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from .models import DataAsset, ScanResult, XmlSummary

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
CONTENT_DIRECTORIES = {
    "image", "images", "img", "imgs", "icon", "icons", "bg", "background", "backgrounds",
    "xml", "annotation", "annotations", "label", "labels", "test", "train", "val", "valid", "validation",
}


def _asset_id(source_id: str, relative_path: str) -> str:
    digest = hashlib.sha1(f"{source_id}:{relative_path}".encode("utf-8")).hexdigest()
    return f"asset-{digest[:20]}"


def _parse_xml(path: Path, root: Path) -> XmlSummary | None:
    try:
        tree = ET.parse(path)
        width = int(tree.findtext(".//size/width") or 0) or None
        height = int(tree.findtext(".//size/height") or 0) or None
        objects = []
        for index, node in enumerate(tree.findall(".//object")):
            box = node.find("bndbox")
            if box is None:
                continue
            try:
                objects.append({
                    "id": f"xml-{index}",
                    "label": (node.findtext("name") or "unknown").strip(),
                    "xmin": int(float(box.findtext("xmin") or 0)),
                    "ymin": int(float(box.findtext("ymin") or 0)),
                    "xmax": int(float(box.findtext("xmax") or 0)),
                    "ymax": int(float(box.findtext("ymax") or 0)),
                })
            except ValueError:
                continue
        classes = Counter(
            (node.findtext("name") or "unknown").strip()
            for node in tree.findall(".//object")
        )
        return XmlSummary(
            path=path.relative_to(root).as_posix(),
            object_count=sum(classes.values()),
            classes=dict(classes),
            image_width=width,
            image_height=height,
            objects=objects,
        )
    except (ET.ParseError, OSError, ValueError):
        return None


def scan_local_source(source_id: str, endpoint: str, include_assets: bool = True, association_rules: dict | None = None) -> ScanResult:
    started = time.perf_counter()
    root = Path(endpoint).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"目录不存在或不可访问: {root}")

    images: list[Path] = []
    xml_paths: list[Path] = []
    scanned_files = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        scanned_files += 1
        suffix = path.suffix.lower()
        if suffix in IMAGE_EXTENSIONS:
            images.append(path)
        elif suffix == ".xml":
            xml_paths.append(path)

    association_rules = association_rules or {}
    content_directories = CONTENT_DIRECTORIES | {
        str(item).strip().lower() for item in association_rules.get("content_directories", []) if str(item).strip()
    }
    suffix_markers = ["_icon", "_"] + [
        str(item).strip() for item in association_rules.get("suffix_markers", [])
        if re.fullmatch(r"[._-][A-Za-z_-]{0,20}", str(item).strip())
    ]
    suffix_markers = list(dict.fromkeys(suffix_markers))
    literal_suffixes = ["_bg", "_background"] + [
        str(item).strip() for item in association_rules.get("literal_suffixes", [])
        if re.fullmatch(r"[._-][A-Za-z0-9_-]{1,24}", str(item).strip())
    ]
    literal_suffixes = list(dict.fromkeys(literal_suffixes))
    sibling_groups: dict[Path, list[Path]] = defaultdict(list)
    for image in images:
        scope = image.parent.parent if image.parent.name.lower() in content_directories else image.parent
        sibling_groups[scope].append(image)

    primary_by_image: dict[Path, Path] = {}
    for group in sibling_groups.values():
        by_stem: dict[str, list[Path]] = defaultdict(list)
        for image in group:
            by_stem[image.stem].append(image)
        for image in group:
            primary_stem = None
            for marker in suffix_markers:
                suffix_match = re.match(rf"^(.+){re.escape(marker)}[0-9]+$", image.stem, re.IGNORECASE)
                if suffix_match:
                    primary_stem = suffix_match.group(1)
                    if primary_stem in by_stem:
                        break
            if not primary_stem or primary_stem not in by_stem:
                for suffix in literal_suffixes:
                    if image.stem.lower().endswith(suffix.lower()):
                        candidate_stem = image.stem[:-len(suffix)]
                        if candidate_stem in by_stem:
                            primary_stem = candidate_stem
                            break
            candidates = by_stem.get(primary_stem or "", [])
            if not candidates:
                continue
            candidates.sort(key=lambda candidate: (
                candidate.parent != image.parent,
                candidate.parent.name.lower() not in {"image", "images", "img", "imgs"},
                candidate.as_posix(),
            ))
            primary_by_image[image] = candidates[0]
    companions_by_primary: dict[Path, list[Path]] = defaultdict(list)
    for companion, primary in primary_by_image.items():
        companions_by_primary[primary].append(companion)
    xml_by_scope_and_stem: dict[tuple[Path, str], list[Path]] = defaultdict(list)
    for xml_path in xml_paths:
        scope = xml_path.parent.parent if xml_path.parent.name.lower() in content_directories else xml_path.parent
        xml_by_scope_and_stem[(scope, xml_path.stem)].append(xml_path)

    assets: list[DataAsset] = []
    for image in images:
        relative = image.relative_to(root)
        stat = image.stat()
        primary = primary_by_image.get(image)
        role = "companion" if primary else "primary"
        companions = [item.relative_to(root).as_posix() for item in companions_by_primary.get(image, [])]
        scope = image.parent.parent if image.parent.name.lower() in content_directories else image.parent
        xml_candidates = xml_by_scope_and_stem.get((scope, image.stem), [])
        xml_candidates.sort(key=lambda candidate: (candidate.parent != image.parent, candidate.as_posix()))
        xml_path = xml_candidates[0] if xml_candidates else None
        hierarchy = list(relative.parts[:-1])
        assets.append(
            DataAsset(
                id=_asset_id(source_id, relative.as_posix()),
                source_id=source_id,
                relative_path=relative.as_posix(),
                filename=image.name,
                extension=image.suffix.lower(),
                size_bytes=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc),
                group_key=f"{relative.parent.as_posix()}:{primary.stem if primary else image.stem}",
                role=role,
                primary_relative_path=primary.relative_to(root).as_posix() if primary else None,
                hierarchy=hierarchy,
                companion_images=companions,
                xml=_parse_xml(xml_path, root) if xml_path else None,
            )
        )

    duration_ms = round((time.perf_counter() - started) * 1000)
    return ScanResult(
        source_id=source_id,
        scanned_files=scanned_files,
        image_count=len(images),
        xml_count=len(xml_paths),
        asset_count=len(assets),
        duration_ms=duration_ms,
        assets=assets if include_assets else [],
    )

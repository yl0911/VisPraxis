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


def scan_local_source(source_id: str, endpoint: str, include_assets: bool = True) -> ScanResult:
    started = time.perf_counter()
    root = Path(endpoint).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"目录不存在或不可访问: {root}")

    images: list[Path] = []
    xml_by_stem: dict[tuple[Path, str], Path] = {}
    scanned_files = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        scanned_files += 1
        suffix = path.suffix.lower()
        if suffix in IMAGE_EXTENSIONS:
            images.append(path)
        elif suffix == ".xml":
            xml_by_stem[(path.parent, path.stem)] = path

    sibling_groups: dict[Path, list[Path]] = defaultdict(list)
    for image in images:
        sibling_groups[image.parent].append(image)

    assets: list[DataAsset] = []
    for image in images:
        relative = image.relative_to(root)
        stat = image.stat()
        siblings = sibling_groups[image.parent]
        stem_match = re.match(r"^(.+)_([0-9]+)$", image.stem)
        primary = next(
            (candidate for candidate in siblings if stem_match and candidate.stem == stem_match.group(1)),
            None,
        )
        role = "companion" if primary else "primary"
        companions = [
            item.relative_to(root).as_posix()
            for item in siblings
            if role == "primary" and item != image and re.match(rf"^{re.escape(image.stem)}_[0-9]+$", item.stem)
        ]
        xml_path = xml_by_stem.get((image.parent, image.stem))
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
        xml_count=len(xml_by_stem),
        asset_count=len(assets),
        duration_ms=duration_ms,
        assets=assets if include_assets else [],
    )

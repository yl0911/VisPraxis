from __future__ import annotations

import time
import os
import string
import re
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .connectors import test_connection
from .capability_service import (
    AiSettingsUpdate,
    CapabilityAnalyzeRequest,
    CapabilityImportRequest,
    CapabilityUpdate,
    analyze_capability_source,
    get_ai_settings,
    get_capability_taxonomy,
    import_capabilities,
    list_capabilities,
    update_capability,
    delete_capability,
    save_ai_settings,
    test_ai_connection,
)
from .models import (
    DataSource,
    DataSourceCreate,
    DataSourceUpdate,
    HierarchyConfig,
    AnnotationSaveRequest,
    XmlSummary,
    ReviewRequest,
    SourceStatus,
    SourceType,
    StorageConfig,
    utc_now,
)
from .repository import Repository, create_repository
from .scanner import scan_local_source

app = FastAPI(title="VisPraxis Data Center API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/capabilities")
def capabilities_catalog():
    return list_capabilities()


@app.get("/api/capabilities/taxonomy")
def capability_taxonomy():
    return get_capability_taxonomy()


@app.get("/api/capabilities/ai-settings")
def capability_ai_settings():
    return get_ai_settings()


@app.put("/api/capabilities/ai-settings")
def update_capability_ai_settings(payload: AiSettingsUpdate):
    return save_ai_settings(payload)


@app.post("/api/capabilities/ai-settings/test")
def test_capability_ai_settings():
    try:
        return test_ai_connection()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/capabilities/analyze")
def analyze_capability(payload: CapabilityAnalyzeRequest):
    try:
        return analyze_capability_source(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/capabilities/import")
def create_capabilities(payload: CapabilityImportRequest):
    return import_capabilities(payload)


@app.patch("/api/capabilities/{capability_id}")
def patch_capability(capability_id: str, payload: CapabilityUpdate):
    record = update_capability(capability_id, payload.model_dump(exclude_unset=True))
    if not record:
        raise HTTPException(status_code=404, detail="能力不存在")
    return record


@app.delete("/api/capabilities/{capability_id}", status_code=204)
def remove_capability(capability_id: str):
    if not delete_capability(capability_id):
        raise HTTPException(status_code=404, detail="能力不存在")
    return Response(status_code=204)
repository: Repository = create_repository()


def _source_or_404(source_id: str) -> DataSource:
    source = repository.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")
    return source


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vispraxis-python-api", "version": app.version}


def _filesystem_roots() -> list[str]:
    if os.name == "nt":
        return [f"{letter}:\\" for letter in string.ascii_uppercase if Path(f"{letter}:\\").exists()]
    return ["/"]


@app.get("/api/filesystem/roots")
def filesystem_roots():
    return {"items": _filesystem_roots()}


@app.get("/api/filesystem/directories")
def filesystem_directories(path: str = Query(min_length=1)):
    target = Path(path).expanduser().resolve()
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="目录不存在或不可访问")
    children = []
    try:
        for item in target.iterdir():
            try:
                if item.is_dir() and not item.name.startswith("."):
                    children.append({"name": item.name, "path": str(item.resolve())})
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError) as error:
        raise HTTPException(status_code=403, detail="没有权限读取该目录") from error
    children.sort(key=lambda item: item["name"].lower())
    parent = None if str(target) in _filesystem_roots() or target.parent == target else str(target.parent)
    return {"path": str(target), "parent": parent, "items": children}


@app.get("/api/data-sources", response_model=list[DataSource])
@app.get("/api/sources", response_model=list[DataSource])
def list_sources() -> list[DataSource]:
    return repository.list_sources()


@app.post("/api/data-sources", response_model=DataSource, status_code=status.HTTP_201_CREATED)
def create_source(payload: DataSourceCreate) -> DataSource:
    now = utc_now()
    source = DataSource(
        **payload.model_dump(),
        id=f"source-{uuid4().hex[:12]}",
        created_at=now,
        updated_at=now,
    )
    return repository.save_source(source)


@app.get("/api/data-sources/{source_id}", response_model=DataSource)
def get_source(source_id: str) -> DataSource:
    return _source_or_404(source_id)


@app.patch("/api/data-sources/{source_id}", response_model=DataSource)
def update_source(source_id: str, payload: DataSourceUpdate) -> DataSource:
    source = _source_or_404(source_id)
    updated = source.model_copy(update={**payload.model_dump(exclude_none=True), "updated_at": utc_now()})
    return repository.save_source(updated)


@app.delete("/api/data-sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: str) -> Response:
    _source_or_404(source_id)
    repository.delete_source(source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/data-sources/{source_id}/test")
@app.post("/api/sources/{source_id}/test")
def test_source(source_id: str):
    source = _source_or_404(source_id)
    result = test_connection(source)
    source.status = SourceStatus.HEALTHY if result.ok else SourceStatus.WARNING
    source.latency_ms = result.latency_ms
    source.updated_at = utc_now()
    repository.save_source(source)
    return result


def _synchronize_source(source_id: str, include_assets: bool = False):
    source = _source_or_404(source_id)
    if source.type != SourceType.LOCAL:
        action = "同步对象清单" if source.type in {SourceType.OSS, SourceType.MINIO} else "读取数据索引"
        raise HTTPException(
            status_code=501,
            detail=f"{source.type.value} 已完成注册，但{action}适配器尚未启用",
        )
    try:
        result = scan_local_source(source.id, source.endpoint, include_assets=True)
    except (FileNotFoundError, PermissionError) as error:
        source.status = SourceStatus.OFFLINE
        source.updated_at = utc_now()
        repository.save_source(source)
        raise HTTPException(status_code=422, detail=str(error)) from error
    repository.replace_assets(source.id, result.assets)
    source.status = SourceStatus.HEALTHY
    source.image_count = result.image_count
    source.asset_count = result.asset_count
    source.last_sync_at = utc_now()
    source.latency_ms = result.duration_ms
    source.updated_at = utc_now()
    repository.save_source(source)
    if not include_assets:
        result.assets = []
    return result


@app.post("/api/data-sources/{source_id}/scan")
def scan_source(source_id: str, include_assets: bool = Query(default=False)):
    return _synchronize_source(source_id, include_assets)


@app.post("/api/data-sources/{source_id}/sync")
def synchronize_source(source_id: str, include_assets: bool = Query(default=False)):
    return _synchronize_source(source_id, include_assets)


@app.get("/api/data-sources/{source_id}/assets")
def list_assets(
    source_id: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    branch: str | None = None,
    version: str | None = None,
    status_path: list[str] = Query(default=[]),
    search: str | None = None,
):
    _source_or_404(source_id)
    items, total = repository.list_assets(source_id, skip, limit, branch, version, status_path, search)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@app.get("/api/data-sources/{source_id}/hierarchy")
def source_hierarchy(source_id: str):
    source = _source_or_404(source_id)
    assets, _ = repository.list_assets(source_id, 0, 10_000_000)
    branches: dict[str, dict[str, int]] = {}
    route_counts: dict[str, int] = {}
    directory_paths: set[str] = {Path(source.endpoint).name}
    for asset in assets:
        parts = asset.hierarchy
        if not parts:
            continue
        for depth in range(1, len(parts) + 1):
            directory_paths.add("/".join([Path(source.endpoint).name, *parts[:depth]]))
        branch = parts[0]
        versions = branches.setdefault(branch, {})
        version = next((part for part in parts[1:] if re.fullmatch(r"\d{8}", part)), None)
        versions[version or "未识别版本"] = versions.get(version or "未识别版本", 0) + 1
        normalized = [part for part in parts if not re.fullmatch(r"\d{8}", part)]
        for depth in range(2, len(normalized) + 1):
            route = "/".join(normalized[:depth])
            route_counts[route] = route_counts.get(route, 0) + 1
    return {
        "type": Path(source.endpoint).name,
        "branches": [
            {
                "name": name,
                "count": sum(versions.values()),
                "versions": [{"name": version, "count": count} for version, count in sorted(versions.items(), reverse=True)],
            }
            for name, versions in sorted(branches.items())
        ],
        "status_paths": source.options.get("status_paths", []),
        "examples": source.options.get("hierarchy_examples", {}),
        "directory_paths": sorted(directory_paths, key=lambda path: (path.count("/"), path.lower())),
        "route_candidates": [
            {"path": path, "count": count}
            for path, count in sorted(route_counts.items())
        ],
    }


@app.put("/api/data-sources/{source_id}/hierarchy-config", response_model=DataSource)
def update_hierarchy_config(source_id: str, payload: HierarchyConfig):
    source = _source_or_404(source_id)
    cleaned = list(dict.fromkeys(path.replace("\\", "/").strip("/") for path in payload.status_paths if path.strip("/\\")))
    source.options = {
        **source.options,
        "status_paths": cleaned,
        "hierarchy_examples": {
            "type": payload.type_example.replace("\\", "/").strip("/"),
            "branch": payload.branch_example.replace("\\", "/").strip("/"),
            "version": payload.version_example.replace("\\", "/").strip("/"),
        },
    }
    source.updated_at = utc_now()
    return repository.save_source(source)


@app.get("/api/data-sources/{source_id}/content")
def source_image_content(source_id: str, path: str = Query(..., min_length=1)):
    source = _source_or_404(source_id)
    if source.type != SourceType.LOCAL:
        raise HTTPException(status_code=501, detail="远程图像代理适配器尚未启用")
    root = Path(source.endpoint).expanduser().resolve()
    target = (root / path).resolve()
    image_suffixes = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}
    if not target.is_relative_to(root) or not target.is_file() or target.suffix.lower() not in image_suffixes:
        raise HTTPException(status_code=404, detail="关联图像不存在或已移动")
    return FileResponse(target)


@app.get("/api/data-sources/{source_id}/assets/{asset_id}/content")
def asset_content(source_id: str, asset_id: str):
    source = _source_or_404(source_id)
    if source.type != SourceType.LOCAL:
        raise HTTPException(status_code=501, detail="远程图像代理适配器尚未启用")
    asset = repository.get_asset(source_id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="图像资产不存在")
    root = Path(source.endpoint).expanduser().resolve()
    target = (root / asset.relative_path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(status_code=404, detail="原始图像不存在或已移动")
    return FileResponse(target)


@app.post("/api/data-sources/{source_id}/assets/{asset_id}/annotation")
def save_asset_annotation(source_id: str, asset_id: str, payload: AnnotationSaveRequest):
    source = _source_or_404(source_id)
    asset = repository.get_asset(source_id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="图像资产不存在")
    storage = repository.get_storage()
    if storage.type != "local":
        raise HTTPException(status_code=501, detail="当前仅支持保存到本地受管存储")
    root = Path(storage.endpoint).expanduser().resolve()
    target = (root / source.name / Path(asset.relative_path).with_suffix(".xml")).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(status_code=422, detail="标注输出路径无效")
    target.parent.mkdir(parents=True, exist_ok=True)

    annotation = ET.Element("annotation")
    ET.SubElement(annotation, "filename").text = asset.filename
    size = ET.SubElement(annotation, "size")
    ET.SubElement(size, "width").text = str(payload.image_width)
    ET.SubElement(size, "height").text = str(payload.image_height)
    ET.SubElement(size, "depth").text = "3"
    parsed_objects = []
    for index, item in enumerate(payload.objects):
        xmin = round(item.x * payload.image_width / 100)
        ymin = round(item.y * payload.image_height / 100)
        xmax = round(min(100, item.x + item.width) * payload.image_width / 100)
        ymax = round(min(100, item.y + item.height) * payload.image_height / 100)
        node = ET.SubElement(annotation, "object")
        ET.SubElement(node, "name").text = item.label
        box = ET.SubElement(node, "bndbox")
        for key, value in (("xmin", xmin), ("ymin", ymin), ("xmax", xmax), ("ymax", ymax)):
            ET.SubElement(box, key).text = str(value)
        parsed_objects.append({"id": f"xml-{index}", "label": item.label, "xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax})
    ET.indent(annotation, space="  ")
    ET.ElementTree(annotation).write(target, encoding="utf-8", xml_declaration=True)

    classes = Counter(item.label for item in payload.objects)
    asset.xml = XmlSummary(path=str(target), object_count=len(payload.objects), classes=dict(classes), image_width=payload.image_width, image_height=payload.image_height, objects=parsed_objects)
    repository.save_asset(asset)
    return {"ok": True, "path": str(target), "object_count": len(payload.objects)}


@app.get("/api/storage", response_model=StorageConfig)
def get_storage() -> StorageConfig:
    return repository.get_storage()


@app.put("/api/storage", response_model=StorageConfig)
def update_storage(payload: StorageConfig) -> StorageConfig:
    if payload.type == "local":
        endpoint = Path(payload.endpoint).expanduser()
        endpoint.mkdir(parents=True, exist_ok=True)
        if not endpoint.is_dir():
            raise HTTPException(status_code=422, detail="标准数据存储位置不可用")
    payload.updated_at = utc_now()
    return repository.save_storage(payload)


DEMO_IMAGES = [
    {
        "id": f"img-{index:03d}",
        "sourceId": "demo-source",
        "sourceName": "几何视觉样本库",
        "imageUrl": f"/samples/geometry-matching/{index % 8}.jpg",
        "filename": f"geometry-{index:03d}.jpg",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "prediction": "failure" if index in {2, 5, 9} else "success",
        "reviewStatus": "unreviewed",
        "confidence": 0.72 if index in {2, 5, 9} else 0.96,
        "taskType": "matching",
        "problemTags": ["几何匹配"],
        "modelVersion": "geometry-matching-v2",
        "latencyMs": 84,
        "width": 1920,
        "height": 1080,
    }
    for index in range(1, 13)
]


@app.get("/api/dashboard")
def dashboard():
    sources = repository.list_sources()
    return {
        "summary": {
            "totalToday": sum(source.image_count for source in sources) or 286,
            "successRate": 96.4,
            "needsReview": 3,
            "capturedCases": 28,
            "averageLatencyMs": 84,
        },
        "sources": [
            {
                "id": source.id,
                "name": source.name,
                "type": source.type.value,
                "status": "healthy" if source.status == SourceStatus.UNKNOWN else source.status.value,
                "endpoint": source.endpoint,
                "description": source.description,
                "imageCount": source.image_count,
                "lastSyncAt": (source.last_sync_at or source.updated_at).isoformat(),
                "latencyMs": source.latency_ms,
                "writable": False,
            }
            for source in sources
        ],
        "images": DEMO_IMAGES,
    }


@app.patch("/api/images/{image_id}/review")
def review_image(image_id: str, payload: ReviewRequest):
    image = next((item for item in DEMO_IMAGES if item["id"] == image_id), None)
    if not image:
        raise HTTPException(status_code=404, detail="图像不存在")
    image["reviewStatus"] = payload.status
    return image

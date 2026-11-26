from __future__ import annotations

import time
import os
import string
import re
import shutil
import hashlib
import threading
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
    CapabilityBatchStatusUpdate,
    ToolSetUpdate,
    analyze_capability_source,
    analyze_data_hierarchy,
    get_ai_settings,
    get_capability_taxonomy,
    import_capabilities,
    list_capabilities,
    list_tool_set,
    add_tool_set_capabilities,
    remove_tool_set_capabilities,
    update_capability,
    update_capability_status_batch,
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
    StorageSyncRequest,
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

_managed_storage_cache: dict[str, object] = {"root": "", "created_at": 0.0, "assets": [], "image_count": 0}
_managed_storage_cache_lock = threading.Lock()


def _invalidate_managed_storage_cache() -> None:
    with _managed_storage_cache_lock:
        _managed_storage_cache.update({"root": "", "created_at": 0.0, "assets": [], "image_count": 0})


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


@app.patch("/api/capabilities/status")
def patch_capability_status_batch(payload: CapabilityBatchStatusUpdate):
    try:
        return update_capability_status_batch(payload.capability_ids, payload.status)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


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


@app.get("/api/tool-set")
def tool_set_catalog():
    return {"items": list_tool_set()}


@app.post("/api/tool-set")
def add_tool_set_items(payload: ToolSetUpdate):
    try:
        return add_tool_set_capabilities(payload.capability_ids)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.delete("/api/tool-set")
def remove_tool_set_items(payload: ToolSetUpdate):
    return remove_tool_set_capabilities(payload.capability_ids)
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


def _source_identity(source_type: SourceType, endpoint: str, options: dict) -> tuple[str, str, str, str]:
    if source_type == SourceType.LOCAL:
        normalized_endpoint = os.path.normcase(str(Path(endpoint).expanduser().resolve()))
    else:
        normalized_endpoint = endpoint.strip().rstrip("/").lower()
    return (
        source_type.value,
        normalized_endpoint,
        str(options.get("bucket", "")).strip().lower(),
        str(options.get("prefix", "")).replace("\\", "/").strip("/"),
    )


@app.post("/api/data-sources", response_model=DataSource, status_code=status.HTTP_201_CREATED)
def create_source(payload: DataSourceCreate) -> DataSource:
    now = utc_now()
    identity = _source_identity(payload.type, payload.endpoint, payload.options)
    existing = next(
        (
            item
            for item in repository.list_sources()
            if _source_identity(item.type, item.endpoint, item.options) == identity
        ),
        None,
    )
    if existing:
        updated = existing.model_copy(
            update={
                "name": payload.name,
                "endpoint": payload.endpoint,
                "description": payload.description,
                "options": {**existing.options, **payload.options},
                "updated_at": now,
            }
        )
        return repository.save_source(updated)
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
        result = scan_local_source(source.id, source.endpoint, include_assets=True, association_rules=source.options.get("association_rules"))
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


@app.get("/api/data-sources/{source_id}/version-previews")
def version_previews(
    source_id: str,
    branch: str = Query(min_length=1),
    category: str | None = None,
    status_path: list[str] = Query(default=[]),
    search: str | None = None,
    limit_per_version: int = Query(default=10, ge=1, le=20),
):
    source = _source_or_404(source_id)
    candidates, _ = repository.list_assets(source_id, 0, 10_000_000, None, None, status_path, search)
    grouped: dict[str, dict] = {}
    for asset in candidates:
        if asset.role != "primary":
            continue
        dataset = _asset_dataset(source, asset.hierarchy)
        if not dataset or dataset[1] != branch or (category and dataset[0] != category):
            continue
        version = dataset[2]
        group = grouped.setdefault(version, {"version": version, "total": 0, "items": []})
        group["total"] += 1
        if len(group["items"]) < limit_per_version:
            group["items"].append(asset)
    return {"items": [grouped[key] for key in sorted(grouped, reverse=True)]}


@app.get("/api/data-sources/{source_id}/branch-previews")
def branch_previews(
    source_id: str,
    category: str = Query(min_length=1),
    status_path: list[str] = Query(default=[]),
    search: str | None = None,
    limit_per_branch: int = Query(default=10, ge=1, le=20),
):
    source = _source_or_404(source_id)
    candidates, _ = repository.list_assets(source_id, 0, 10_000_000, None, None, status_path, search)
    grouped: dict[str, dict] = {}
    for asset in candidates:
        if asset.role != "primary":
            continue
        dataset = _asset_dataset(source, asset.hierarchy)
        if not dataset or dataset[0] != category:
            continue
        branch = dataset[1]
        group = grouped.setdefault(branch, {"branch": branch, "total": 0, "items": []})
        group["total"] += 1
        if len(group["items"]) < limit_per_branch:
            group["items"].append(asset)
    return {"items": [grouped[key] for key in sorted(grouped, key=str.casefold)]}


@app.get("/api/data-sources/{source_id}/assets")
def list_assets(
    source_id: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    category: str | None = None,
    branch: str | None = None,
    version: str | None = None,
    status_path: list[str] = Query(default=[]),
    search: str | None = None,
):
    source = _source_or_404(source_id)
    mappings = source.options.get("dataset_mappings", [])
    if mappings and (category or branch or version):
        candidates, _ = repository.list_assets(source_id, 0, 10_000_000, None, None, status_path, search)
        candidates = [asset for asset in candidates if (
            (dataset := _asset_dataset(source, asset.hierarchy))
            and (not category or dataset[0] == category)
            and (not branch or dataset[1] == branch)
            and (not version or dataset[2] == version)
        )]
        total = len(candidates)
        items = candidates[skip : skip + limit]
    else:
        items, total = repository.list_assets(source_id, skip, limit, branch, version, status_path, search)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@app.get("/api/data-sources/{source_id}/hierarchy")
def source_hierarchy(source_id: str):
    source = _source_or_404(source_id)
    assets, _ = repository.list_assets(source_id, 0, 10_000_000)
    categories: dict[str, dict[str, dict[str, int]]] = {}
    route_counts: dict[str, int] = {}
    directory_paths: set[str] = {Path(source.endpoint).name}
    for asset in assets:
        parts = asset.hierarchy
        if not parts:
            continue
        for depth in range(1, len(parts) + 1):
            directory_paths.add("/".join([Path(source.endpoint).name, *parts[:depth]]))
        dataset = _asset_dataset(source, asset.hierarchy)
        if dataset and asset.role == "primary":
            category, branch, version = dataset
            versions = categories.setdefault(category, {}).setdefault(branch, {})
            versions[version] = versions.get(version, 0) + 1
        normalized = [part for part in parts if not re.fullmatch(r"\d{8}", part)]
        for depth in range(2, len(normalized) + 1):
            route = "/".join(normalized[:depth])
            route_counts[route] = route_counts.get(route, 0) + 1
    return {
        "type": " / ".join(categories) if len(categories) <= 2 else f"AI 已识别 {len(categories)} 个大类",
        "categories": [
            {"name": category, "count": sum(sum(versions.values()) for versions in branches.values()), "branches": [
                {"name": branch, "count": sum(versions.values()), "versions": [{"name": version, "count": count} for version, count in sorted(versions.items(), reverse=True)]}
                for branch, versions in sorted(branches.items())
            ]}
            for category, branches in sorted(categories.items())
        ],
        "branches": [
            {
                "name": name,
                "count": sum(versions.values()),
                "versions": [{"name": version, "count": count} for version, count in sorted(versions.items(), reverse=True)],
            }
            for name, versions in sorted({branch: versions for branches in categories.values() for branch, versions in branches.items()}.items())
        ],
        "status_paths": source.options.get("status_paths", []),
        "examples": source.options.get("hierarchy_examples", {}),
        "directory_paths": sorted(directory_paths, key=lambda path: (path.count("/"), path.lower())),
        "route_candidates": [
            {"path": path, "count": count}
            for path, count in sorted(route_counts.items())
        ],
        "dataset_mappings": source.options.get("dataset_mappings", []),
        "hierarchy_analysis": source.options.get("hierarchy_analysis", {}),
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


@app.post("/api/data-sources/{source_id}/hierarchy/analyze")
def analyze_source_hierarchy(source_id: str):
    source = _source_or_404(source_id)
    assets, _ = repository.list_assets(source.id, 0, 10_000_000)
    if not assets:
        raise HTTPException(status_code=422, detail="请先为数据源建立索引")
    directory_counts: dict[str, int] = {}
    for asset in assets:
        if asset.hierarchy:
            path = "/".join(asset.hierarchy)
            directory_counts[path] = directory_counts.get(path, 0) + 1
    file_samples = [
        {"directory": "/".join(asset.hierarchy), "filename": asset.filename}
        for asset in assets
        if re.search(r"(?:icon|crop|tile|piece|[_-][0-9]+)", asset.filename, re.IGNORECASE)
    ][:60]
    try:
        result = analyze_data_hierarchy(source.name, directory_counts, source.options.get("hierarchy_examples", {}), file_samples)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    result["mappings"] = _respect_source_root_boundary(source, result["mappings"])
    result["mappings"] = _ground_hierarchy_to_source(source, result["mappings"])
    source.options = {
        **source.options,
        "dataset_mappings": result["mappings"],
        "association_rules": result.get("association_rules", {}),
        "hierarchy_analysis": {key: value for key, value in result.items() if key != "mappings"},
    }
    source.updated_at = utc_now()
    repository.save_source(source)
    reindexed = _synchronize_source(source_id, include_assets=False)
    return {
        **result,
        "dataset_count": len({(item["category"], item["branch"], item["version"]) for item in result["mappings"]}),
        "reindexed_assets": reindexed.asset_count,
    }


def _respect_source_root_boundary(source: DataSource, mappings: list[dict]) -> list[dict]:
    """Prevent a provider parent and domain suffix from replacing real task branches."""
    source_dir = Path(source.endpoint).name
    parent_dir = Path(source.endpoint).parent.name
    prefix = f"{parent_dir}_"
    if not parent_dir or not source_dir.casefold().startswith(prefix.casefold()):
        return mappings
    domain = source_dir[len(prefix):].strip("_ -")
    if not domain:
        return mappings
    normalized = []
    changed = False
    for mapping in mappings:
        item = dict(mapping)
        parts = str(item.get("path_prefix", "")).replace("\\", "/").strip("/").split("/")
        category = str(item.get("category", ""))
        branch = str(item.get("branch", ""))
        if category.casefold() in {source_dir.casefold(), parent_dir.casefold()}:
            item["category"] = domain
            item["reason"] = f"根目录边界规则：从大类中移除来源前缀 {parent_dir}，保留领域 {domain}"
            if parts and branch.casefold() == domain.casefold():
                item["branch"] = parts[0]
            changed = True
        normalized.append(item)
    if changed:
        return normalized
    return mappings


def _ground_hierarchy_to_source(source: DataSource, mappings: list[dict]) -> list[dict]:
    """Reject semantic labels invented by the model instead of observed in the source tree."""
    source_dir = Path(source.endpoint).name
    parent_dir = Path(source.endpoint).parent.name
    grounded_categories = {source_dir.casefold(), parent_dir.casefold()}
    for name in (source_dir, parent_dir):
        grounded_categories.update(part.casefold() for part in re.split(r"[_\-\s]+", name) if part)
    for mapping in mappings:
        prefix = str(mapping.get("path_prefix", "")).replace("\\", "/").strip("/")
        grounded_categories.update(part.casefold() for part in prefix.split("/") if part)

    normalized = []
    for mapping in mappings:
        item = dict(mapping)
        prefix = str(item.get("path_prefix", "")).replace("\\", "/").strip("/")
        parts = [part for part in prefix.split("/") if part]
        if str(item.get("category", "")).casefold() not in grounded_categories:
            item["category"] = source_dir
            item["reason"] = f"目录约束：AI 大类缺少真实目录依据，回退为数据源目录 {source_dir}"
        version = str(item.get("version", "")).strip()
        if version.casefold() != "unknown" and version.casefold() not in {part.casefold() for part in parts}:
            item["version"] = "unknown"
        normalized.append(item)
    return normalized


def _asset_dataset(source: DataSource, hierarchy: list[str]) -> tuple[str, str, str] | None:
    parts = [part for part in hierarchy if part not in {"", ".", ".."}]
    relative_directory = "/".join(parts)
    mappings = sorted(source.options.get("dataset_mappings", []), key=lambda item: len(str(item.get("path_prefix", ""))), reverse=True)
    for mapping in mappings:
        prefix = str(mapping.get("path_prefix", "")).replace("\\", "/").strip("/")
        if relative_directory == prefix or relative_directory.startswith(f"{prefix}/"):
            values = tuple(str(mapping.get(key, "")).replace("\\", "/").strip("/").split("/")[-1] for key in ("category", "branch", "version"))
            if all(values):
                return values
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    if len(parts) >= 2:
        return Path(source.endpoint).name, parts[0], parts[1]
    return None


def _source_datasets(source: DataSource):
    assets, _ = repository.list_assets(source.id, 0, 10_000_000)
    grouped: dict[tuple[str, str, str], dict[str, int | str]] = {}
    for asset in assets:
        dataset = _asset_dataset(source, asset.hierarchy)
        if not dataset:
            continue
        entry = grouped.setdefault(dataset, {
            "category": dataset[0], "branch": dataset[1], "version": dataset[2],
            "group_count": 0, "file_count": 0, "image_count": 0, "annotation_count": 0,
        })
        if asset.role != "primary":
            continue
        entry["group_count"] = int(entry["group_count"]) + 1
        entry["file_count"] = int(entry["file_count"]) + 1 + len(asset.companion_images)
        entry["image_count"] = entry["file_count"]
        if asset.xml:
            entry["annotation_count"] = int(entry["annotation_count"]) + 1
    return sorted(grouped.values(), key=lambda item: (str(item["category"]), str(item["branch"]), str(item["version"])), reverse=True)


@app.get("/api/data-sources/{source_id}/datasets")
def source_datasets(source_id: str):
    source = _source_or_404(source_id)
    return {"items": _source_datasets(source)}


@app.post("/api/data-sources/{source_id}/storage-sync")
def synchronize_to_storage(source_id: str, payload: StorageSyncRequest):
    source = _source_or_404(source_id)
    if source.type != SourceType.LOCAL:
        raise HTTPException(status_code=501, detail="当前仅支持本地数据源同步到标准目录")
    storage = repository.get_storage()
    if storage.type != "local":
        raise HTTPException(status_code=501, detail="当前仅支持本地标准目录")
    source_root = Path(source.endpoint).expanduser().resolve()
    storage_root = Path(storage.endpoint).expanduser().resolve()
    if not source_root.is_dir():
        raise HTTPException(status_code=422, detail="数据源目录不存在或不可访问")
    storage_root.mkdir(parents=True, exist_ok=True)

    assets, _ = repository.list_assets(source.id, 0, 10_000_000)
    if not assets:
        result = scan_local_source(source.id, source.endpoint, include_assets=True, association_rules=source.options.get("association_rules"))
        assets = result.assets
        repository.replace_assets(source.id, assets)
    selected = None if not payload.dataset else (
        payload.dataset.category, payload.dataset.branch, payload.dataset.version,
    )
    copied = skipped = updated = annotations = groups = companions = renamed_groups = 0
    datasets: set[tuple[str, str, str]] = set()
    selected_assets = []
    filename_counts: Counter[tuple[tuple[str, str, str], str]] = Counter()
    for asset in assets:
        if asset.role != "primary":
            continue
        dataset = _asset_dataset(source, asset.hierarchy)
        if not dataset or (selected and dataset != selected):
            continue
        selected_assets.append((asset, dataset))
        filename_counts[(dataset, Path(asset.relative_path).name.casefold())] += 1

    for asset, dataset in selected_assets:
        datasets.add(dataset)
        destination_dir = storage_root.joinpath(*dataset).resolve()
        if not destination_dir.is_relative_to(storage_root):
            raise HTTPException(status_code=422, detail="数据集标准路径无效")
        try:
            destination_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"标准目录不可写：{destination_dir}。请检查目录权限或存储配置。",
            ) from exc
        groups += 1
        primary_source = (source_root / asset.relative_path).resolve()
        primary_name = primary_source.name
        if filename_counts[(dataset, primary_name.casefold())] > 1:
            digest = hashlib.sha1(asset.relative_path.replace("\\", "/").encode("utf-8")).hexdigest()[:10]
            primary_name = f"{primary_source.stem}__{digest}{primary_source.suffix.lower()}"
            renamed_groups += 1
        target_stem = Path(primary_name).stem
        group_paths = [asset.relative_path, *asset.companion_images]
        companions += len(asset.companion_images)
        for index, relative_path in enumerate(group_paths):
            source_image = (source_root / relative_path).resolve()
            if not source_image.is_relative_to(source_root) or not source_image.is_file():
                continue
            destination_name = primary_name if index == 0 else f"{target_stem}_{index}{source_image.suffix.lower()}"
            destination_image = destination_dir / destination_name
            if destination_image.exists() and not payload.overwrite:
                skipped += 1
            else:
                existed = destination_image.exists()
                try:
                    shutil.copy2(source_image, destination_image)
                except OSError as exc:
                    raise HTTPException(status_code=422, detail=f"无法写入标准目录文件：{destination_image}") from exc
                updated += int(existed)
                copied += int(not existed)
        if asset.xml:
            source_xml = (source_root / asset.xml.path).resolve()
            destination_xml = destination_dir / f"{target_stem}.xml"
            if source_xml.is_relative_to(source_root) and source_xml.is_file():
                if destination_xml.exists() and not payload.overwrite:
                    skipped += 1
                else:
                    existed = destination_xml.exists()
                    try:
                        shutil.copy2(source_xml, destination_xml)
                    except OSError as exc:
                        raise HTTPException(status_code=422, detail=f"无法写入标准目录标注：{destination_xml}") from exc
                    updated += int(existed)
                    copied += int(not existed)
                    annotations += 1
    if selected and not datasets:
        raise HTTPException(status_code=404, detail="所选数据集不存在或尚未建立索引")
    _invalidate_managed_storage_cache()
    return {
        "source_id": source.id,
        "dataset_count": len(datasets),
        "copied": copied,
        "updated": updated,
        "skipped": skipped,
        "annotations": annotations,
        "groups": groups,
        "companions": companions,
        "renamed_groups": renamed_groups,
        "overwrite": payload.overwrite,
        "storage_path": str(storage_root),
    }


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
    if source.type != SourceType.LOCAL:
        raise HTTPException(status_code=501, detail="当前仅支持保存本地图像标注")
    asset = repository.get_asset(source_id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="图像资产不存在")
    root = Path(source.endpoint).expanduser().resolve()
    result = _write_asset_annotation(root, asset, payload)
    repository.save_asset(asset)
    return result


def _write_asset_annotation(root: Path, asset, payload: AnnotationSaveRequest):
    image_path = (root / asset.relative_path).resolve()
    target = image_path.with_suffix(".xml")
    if not target.is_relative_to(root):
        raise HTTPException(status_code=422, detail="标注输出路径无效")
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="原始图像不存在或已移动")

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
    try:
        ET.ElementTree(annotation).write(target, encoding="utf-8", xml_declaration=True)
    except OSError as error:
        raise HTTPException(status_code=422, detail="图像目录不可写，无法保存标注") from error

    classes = Counter(item.label for item in payload.objects)
    asset.xml = XmlSummary(path=target.relative_to(root).as_posix(), object_count=len(payload.objects), classes=dict(classes), image_width=payload.image_width, image_height=payload.image_height, objects=parsed_objects)
    return {"ok": True, "path": str(target), "object_count": len(payload.objects)}


@app.post("/api/storage/assets/{asset_id}/annotation")
def save_storage_asset_annotation(asset_id: str, payload: AnnotationSaveRequest):
    root, assets, _ = _managed_storage_assets()
    asset = next((item for item in assets if item.id == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail="标准目录图像不存在或已移动")
    result = _write_asset_annotation(root, asset, payload)
    return result


@app.get("/api/storage", response_model=StorageConfig)
def get_storage() -> StorageConfig:
    return repository.get_storage()


def _managed_storage_assets(force: bool = False):
    storage = repository.get_storage()
    if storage.type != "local":
        raise HTTPException(status_code=501, detail="当前仅支持浏览本地标准目录")
    root = Path(storage.endpoint).expanduser().resolve()
    if not root.is_dir():
        return root, [], 0
    cache_key = str(root).casefold()
    with _managed_storage_cache_lock:
        if not force and _managed_storage_cache["root"] == cache_key:
            return root, _managed_storage_cache["assets"], int(_managed_storage_cache["image_count"])
        result = scan_local_source("managed-storage", str(root), include_assets=True)
        assets = [asset for asset in result.assets if asset.role == "primary"]
        _managed_storage_cache.update({
            "root": cache_key, "created_at": time.monotonic(), "assets": assets, "image_count": result.image_count,
        })
        return root, assets, result.image_count


def _managed_dataset(asset) -> tuple[str, str, str] | None:
    return tuple(asset.hierarchy[:3]) if len(asset.hierarchy) >= 3 else None


@app.get("/api/storage/hierarchy")
def storage_hierarchy(refresh: bool = False):
    _, assets, image_count = _managed_storage_assets(force=refresh)
    categories: dict[str, dict[str, dict[str, int]]] = {}
    for asset in assets:
        dataset = _managed_dataset(asset)
        if not dataset:
            continue
        category, branch, version = dataset
        versions = categories.setdefault(category, {}).setdefault(branch, {})
        versions[version] = versions.get(version, 0) + 1
    return {
        "image_count": image_count,
        "group_count": len(assets),
        "annotation_count": sum(1 for asset in assets if asset.xml),
        "categories": [
            {"name": category, "count": sum(sum(versions.values()) for versions in branches.values()), "branches": [
                {"name": branch, "count": sum(versions.values()), "versions": [
                    {"name": version, "count": count} for version, count in sorted(versions.items(), reverse=True)
                ]} for branch, versions in sorted(branches.items())
            ]} for category, branches in sorted(categories.items())
        ],
    }


@app.get("/api/storage/assets")
def storage_assets(
    skip: int = Query(default=0, ge=0), limit: int = Query(default=48, ge=1, le=200),
    category: str | None = None, branch: str | None = None, version: str | None = None,
    search: str | None = None, annotated_only: bool = False,
):
    _, assets, image_count = _managed_storage_assets()
    assets = [asset for asset in assets if (
        (dataset := _managed_dataset(asset))
        and (not category or dataset[0] == category)
        and (not branch or dataset[1] == branch)
        and (not version or dataset[2] == version)
    )]
    if annotated_only:
        assets = [asset for asset in assets if asset.xml]
    if search:
        needle = search.lower()
        assets = [asset for asset in assets if needle in asset.filename.lower() or needle in asset.relative_path.lower()]
    return {
        "items": assets[skip : skip + limit],
        "total": len(assets),
        "image_count": image_count,
        "annotation_count": sum(1 for asset in assets if asset.xml),
    }


@app.get("/api/storage/branch-previews")
def storage_branch_previews(category: str = Query(min_length=1), search: str | None = None, annotated_only: bool = False, limit_per_branch: int = Query(default=8, ge=1, le=20)):
    _, assets, _ = _managed_storage_assets()
    grouped: dict[str, dict] = {}
    for asset in assets:
        dataset = _managed_dataset(asset)
        if not dataset or dataset[0] != category or (search and search.lower() not in asset.relative_path.lower()):
            continue
        if annotated_only and not asset.xml:
            continue
        group = grouped.setdefault(dataset[1], {"branch": dataset[1], "total": 0, "items": []})
        group["total"] += 1
        if len(group["items"]) < limit_per_branch:
            group["items"].append(asset)
    return {"items": [grouped[key] for key in sorted(grouped, key=str.casefold)]}


@app.get("/api/storage/version-previews")
def storage_version_previews(category: str = Query(min_length=1), branch: str = Query(min_length=1), search: str | None = None, annotated_only: bool = False, limit_per_version: int = Query(default=8, ge=1, le=20)):
    _, assets, _ = _managed_storage_assets()
    grouped: dict[str, dict] = {}
    for asset in assets:
        dataset = _managed_dataset(asset)
        if not dataset or dataset[:2] != (category, branch) or (search and search.lower() not in asset.relative_path.lower()):
            continue
        if annotated_only and not asset.xml:
            continue
        group = grouped.setdefault(dataset[2], {"version": dataset[2], "total": 0, "items": []})
        group["total"] += 1
        if len(group["items"]) < limit_per_version:
            group["items"].append(asset)
    return {"items": [grouped[key] for key in sorted(grouped, reverse=True)]}


@app.get("/api/storage/content")
def storage_content(path: str = Query(..., min_length=1)):
    storage = repository.get_storage()
    if storage.type != "local":
        raise HTTPException(status_code=501, detail="当前仅支持浏览本地标准目录")
    root = Path(storage.endpoint).expanduser().resolve()
    target = (root / path).resolve()
    image_suffixes = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}
    if not target.is_relative_to(root) or not target.is_file() or target.suffix.lower() not in image_suffixes:
        raise HTTPException(status_code=404, detail="标准图像不存在或已移动")
    return FileResponse(target)


@app.put("/api/storage", response_model=StorageConfig)
def update_storage(payload: StorageConfig) -> StorageConfig:
    if payload.type == "local":
        endpoint = Path(payload.endpoint).expanduser()
        endpoint.mkdir(parents=True, exist_ok=True)
        if not endpoint.is_dir():
            raise HTTPException(status_code=422, detail="标准数据存储位置不可用")
    payload.updated_at = utc_now()
    saved = repository.save_storage(payload)
    _invalidate_managed_storage_cache()
    return saved


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

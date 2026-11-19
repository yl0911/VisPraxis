from __future__ import annotations

import json
import os
import threading
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from pymongo import MongoClient, ReplaceOne

from .models import DataAsset, DataSource, StorageConfig


class Repository(ABC):
    @abstractmethod
    def list_sources(self) -> list[DataSource]: ...

    @abstractmethod
    def get_source(self, source_id: str) -> DataSource | None: ...

    @abstractmethod
    def save_source(self, source: DataSource) -> DataSource: ...

    @abstractmethod
    def delete_source(self, source_id: str) -> bool: ...

    @abstractmethod
    def replace_assets(self, source_id: str, assets: list[DataAsset]) -> None: ...

    @abstractmethod
    def list_assets(
        self,
        source_id: str,
        skip: int,
        limit: int,
        branch: str | None = None,
        version: str | None = None,
        status_paths: list[str] | None = None,
        search: str | None = None,
    ) -> tuple[list[DataAsset], int]: ...

    @abstractmethod
    def get_asset(self, source_id: str, asset_id: str) -> DataAsset | None: ...

    @abstractmethod
    def save_asset(self, asset: DataAsset) -> DataAsset: ...

    @abstractmethod
    def get_storage(self) -> StorageConfig: ...

    @abstractmethod
    def save_storage(self, config: StorageConfig) -> StorageConfig: ...


class JsonRepository(Repository):
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        if not self.path.exists():
            self._write({"sources": [], "assets": [], "storage": StorageConfig().model_dump(mode="json")})

    def _read(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, data: dict[str, Any]) -> None:
        with self._lock:
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(self.path)

    def list_sources(self) -> list[DataSource]:
        return [DataSource.model_validate(item) for item in self._read()["sources"]]

    def get_source(self, source_id: str) -> DataSource | None:
        return next((item for item in self.list_sources() if item.id == source_id), None)

    def save_source(self, source: DataSource) -> DataSource:
        data = self._read()
        serialized = source.model_dump(mode="json")
        data["sources"] = [item for item in data["sources"] if item["id"] != source.id] + [serialized]
        self._write(data)
        return source

    def delete_source(self, source_id: str) -> bool:
        data = self._read()
        before = len(data["sources"])
        data["sources"] = [item for item in data["sources"] if item["id"] != source_id]
        data["assets"] = [item for item in data["assets"] if item["source_id"] != source_id]
        self._write(data)
        return len(data["sources"]) < before

    def replace_assets(self, source_id: str, assets: list[DataAsset]) -> None:
        data = self._read()
        data["assets"] = [item for item in data["assets"] if item["source_id"] != source_id]
        data["assets"].extend(asset.model_dump(mode="json") for asset in assets)
        self._write(data)

    def list_assets(
        self,
        source_id: str,
        skip: int,
        limit: int,
        branch: str | None = None,
        version: str | None = None,
        status_paths: list[str] | None = None,
        search: str | None = None,
    ) -> tuple[list[DataAsset], int]:
        rows = [item for item in self._read()["assets"] if item["source_id"] == source_id]
        rows = _filter_asset_rows(rows, branch, version, status_paths or [], search)
        return [DataAsset.model_validate(item) for item in rows[skip : skip + limit]], len(rows)

    def get_asset(self, source_id: str, asset_id: str) -> DataAsset | None:
        row = next(
            (item for item in self._read()["assets"] if item["source_id"] == source_id and item["id"] == asset_id),
            None,
        )
        return DataAsset.model_validate(row) if row else None

    def save_asset(self, asset: DataAsset) -> DataAsset:
        data = self._read()
        serialized = asset.model_dump(mode="json")
        data["assets"] = [item for item in data["assets"] if not (item["source_id"] == asset.source_id and item["id"] == asset.id)] + [serialized]
        self._write(data)
        return asset

    def get_storage(self) -> StorageConfig:
        return StorageConfig.model_validate(self._read()["storage"])

    def save_storage(self, config: StorageConfig) -> StorageConfig:
        data = self._read()
        data["storage"] = config.model_dump(mode="json")
        self._write(data)
        return config


class MongoRepository(Repository):
    def __init__(self, uri: str, database: str):
        self.client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        self.client.admin.command("ping")
        self.db = self.client[database]
        self.db.assets.create_index([("source_id", 1), ("relative_path", 1)], unique=True)

    @staticmethod
    def _clean(document: dict[str, Any] | None) -> dict[str, Any] | None:
        if document:
            document.pop("_id", None)
        return document

    def list_sources(self) -> list[DataSource]:
        return [DataSource.model_validate(self._clean(row)) for row in self.db.sources.find()]

    def get_source(self, source_id: str) -> DataSource | None:
        row = self._clean(self.db.sources.find_one({"id": source_id}))
        return DataSource.model_validate(row) if row else None

    def save_source(self, source: DataSource) -> DataSource:
        self.db.sources.replace_one({"id": source.id}, source.model_dump(mode="json"), upsert=True)
        return source

    def delete_source(self, source_id: str) -> bool:
        result = self.db.sources.delete_one({"id": source_id})
        self.db.assets.delete_many({"source_id": source_id})
        return result.deleted_count > 0

    def replace_assets(self, source_id: str, assets: list[DataAsset]) -> None:
        self.db.assets.delete_many({"source_id": source_id})
        if assets:
            self.db.assets.bulk_write([
                ReplaceOne(
                    {"source_id": asset.source_id, "relative_path": asset.relative_path},
                    asset.model_dump(mode="json"),
                    upsert=True,
                )
                for asset in assets
            ])

    def list_assets(
        self,
        source_id: str,
        skip: int,
        limit: int,
        branch: str | None = None,
        version: str | None = None,
        status_paths: list[str] | None = None,
        search: str | None = None,
    ) -> tuple[list[DataAsset], int]:
        rows = [self._clean(row) for row in self.db.assets.find({"source_id": source_id}).sort("relative_path", 1)]
        rows = _filter_asset_rows(rows, branch, version, status_paths or [], search)
        return [DataAsset.model_validate(row) for row in rows[skip : skip + limit]], len(rows)

    def get_asset(self, source_id: str, asset_id: str) -> DataAsset | None:
        row = self._clean(self.db.assets.find_one({"source_id": source_id, "id": asset_id}))
        return DataAsset.model_validate(row) if row else None

    def save_asset(self, asset: DataAsset) -> DataAsset:
        self.db.assets.replace_one(
            {"source_id": asset.source_id, "id": asset.id},
            asset.model_dump(mode="json"),
            upsert=True,
        )
        return asset

    def get_storage(self) -> StorageConfig:
        row = self._clean(self.db.settings.find_one({"key": "storage"}))
        return StorageConfig.model_validate(row["value"]) if row else StorageConfig()

    def save_storage(self, config: StorageConfig) -> StorageConfig:
        self.db.settings.replace_one(
            {"key": "storage"},
            {"key": "storage", "value": config.model_dump(mode="json")},
            upsert=True,
        )
        return config


def create_repository() -> Repository:
    uri = os.getenv("VISPRAXIS_MONGODB_URI")
    if uri:
        return MongoRepository(uri, os.getenv("VISPRAXIS_MONGODB_DATABASE", "vispraxis"))
    data_file = Path(os.getenv("VISPRAXIS_DATA_FILE", Path(__file__).parents[1] / "data" / "catalog.json"))
    return JsonRepository(data_file)


def _path_contains(hierarchy: list[str], configured_path: str) -> bool:
    normalized = [part for part in hierarchy if not re.fullmatch(r"\d{8}", part)]
    parts = [part for part in configured_path.replace("\\", "/").strip("/").split("/") if part]
    parts = [part for part in parts if not re.fullmatch(r"\d{8}", part)]
    if not parts:
        return True
    return any(normalized[index : index + len(parts)] == parts for index in range(len(normalized) - len(parts) + 1))


def _filter_asset_rows(
    rows: list[dict[str, Any]],
    branch: str | None,
    version: str | None,
    status_paths: list[str],
    search: str | None,
) -> list[dict[str, Any]]:
    filtered = []
    for row in rows:
        hierarchy = row.get("hierarchy", [])
        if branch and (not hierarchy or hierarchy[0] != branch):
            continue
        if version and version not in hierarchy[1:]:
            continue
        if status_paths and not any(_path_contains(hierarchy, path) for path in status_paths):
            continue
        if search and search.lower() not in row.get("filename", "").lower():
            continue
        filtered.append(row)
    return filtered

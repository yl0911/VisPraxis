from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SourceType(str, Enum):
    LOCAL = "local"
    OSS = "oss"
    MINIO = "minio"
    REDIS = "redis"
    MONGODB = "mongodb"


class SourceStatus(str, Enum):
    HEALTHY = "healthy"
    WARNING = "warning"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class DataSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: SourceType
    endpoint: str = Field(min_length=1, max_length=2048)
    description: str = Field(default="", max_length=500)
    read_only: bool = True
    options: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def raw_sources_are_read_only(self) -> "DataSourceCreate":
        if not self.read_only:
            raise ValueError("原始数据源必须以只读方式接入")
        return self


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    endpoint: str | None = Field(default=None, min_length=1, max_length=2048)
    description: str | None = Field(default=None, max_length=500)
    options: dict[str, Any] | None = None


class HierarchyConfig(BaseModel):
    type_example: str = ""
    branch_example: str = ""
    version_example: str = ""
    status_paths: list[str] = Field(default_factory=list)


class DataSource(DataSourceCreate):
    id: str
    status: SourceStatus = SourceStatus.UNKNOWN
    image_count: int = 0
    asset_count: int = 0
    last_sync_at: datetime | None = None
    latency_ms: int | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ConnectionResult(BaseModel):
    ok: bool
    latency_ms: int
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class XmlSummary(BaseModel):
    path: str
    object_count: int = 0
    classes: dict[str, int] = Field(default_factory=dict)
    image_width: int | None = None
    image_height: int | None = None
    objects: list[dict[str, Any]] = Field(default_factory=list)


class DataAsset(BaseModel):
    id: str
    source_id: str
    relative_path: str
    filename: str
    extension: str
    size_bytes: int
    modified_at: datetime
    group_key: str
    role: Literal["primary", "companion"] = "primary"
    primary_relative_path: str | None = None
    hierarchy: list[str] = Field(default_factory=list)
    companion_images: list[str] = Field(default_factory=list)
    xml: XmlSummary | None = None
    indexed_at: datetime = Field(default_factory=utc_now)


class ScanResult(BaseModel):
    source_id: str
    scanned_files: int
    image_count: int
    xml_count: int
    asset_count: int
    duration_ms: int
    assets: list[DataAsset] = Field(default_factory=list)


class AnnotationObject(BaseModel):
    label: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)


class AnnotationSaveRequest(BaseModel):
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    objects: list[AnnotationObject] = Field(default_factory=list)


class StorageConfig(BaseModel):
    type: str = "local"
    endpoint: str = "D:\\VisPraxis\\managed-data"
    hierarchy_template: str = "{category}/{branch}/{version}"
    updated_at: datetime = Field(default_factory=utc_now)


class ReviewRequest(BaseModel):
    status: str = Field(pattern="^(verified|incorrect|captured)$")

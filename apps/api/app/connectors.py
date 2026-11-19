from __future__ import annotations

import time
from pathlib import Path

from .models import ConnectionResult, DataSource, SourceType


def test_connection(source: DataSource) -> ConnectionResult:
    started = time.perf_counter()
    if source.type == SourceType.LOCAL:
        path = Path(source.endpoint).expanduser()
        ok = path.is_dir()
        return ConnectionResult(
            ok=ok,
            latency_ms=round((time.perf_counter() - started) * 1000),
            message="目录可访问" if ok else "目录不存在或不可访问",
            details={"directory": str(path.resolve()) if ok else str(path)},
        )

    return ConnectionResult(
        ok=False,
        latency_ms=round((time.perf_counter() - started) * 1000),
        message="连接配置已保存；该类型的真实连接适配器尚未启用",
        details={"endpoint": source.endpoint, "adapter": source.type.value, "configured": True},
    )

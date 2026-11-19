from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class AiSettingsUpdate(BaseModel):
    provider: str = "openrouter"
    base_url: str = "https://openrouter.ai/api/v1"
    model: str = "openrouter/auto"
    api_key: str = ""


class CapabilityAnalyzeRequest(BaseModel):
    source_type: str
    location: str = Field(min_length=1)
    preferred_type: str = "auto"
    group: str = "auto"


class CapabilityImportRequest(BaseModel):
    source_type: str
    location: str
    project_summary: str
    capabilities: list[dict[str, Any]]


class CapabilityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    type: str | None = Field(default=None, pattern="^(模型|算法|脚本|工具|服务)$")
    summary: str | None = None
    categories: list[str] | None = None
    entrypoints: list[str] | None = None
    runtime: str | None = None
    invocation: str | None = None
    inputs: list[str] | None = None
    outputs: list[str] | None = None
    parameters: list[str] | None = None
    dependencies: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(draft|published|disabled|deleted)$")


_data_path = Path(__file__).parents[1] / "data" / "capabilities.json"
_lock = threading.RLock()
_ignored = {".git", ".idea", ".vscode", "node_modules", "dist", "build", "__pycache__", ".venv", "venv", "target"}
_text_suffixes = {".py", ".js", ".ts", ".tsx", ".jsx", ".ps1", ".sh", ".bat", ".md", ".txt", ".json", ".toml", ".yaml", ".yml"}
_entry_suffixes = {".py", ".js", ".ts", ".ps1", ".sh", ".bat"}

PROVIDER_PRESETS = {
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "model": "openrouter/auto"},
    "deepseek": {"base_url": "https://api.deepseek.com", "model": "deepseek-flash"},
}

CAPABILITY_TAXONOMY = {
    "模型": ["图像", "文本", "语音", "多模态", "LLM", "Embedding", "检测", "分割", "分类", "生成", "OCR"],
    "算法": ["检测", "分类", "聚类", "分割", "匹配", "跟踪", "检索", "评估", "去重", "特征工程", "几何计算"],
    "脚本": ["文件整理", "批量改名", "格式转换", "数据清洗", "图像处理", "标注处理", "数据采集", "下载同步", "导入导出", "训练辅助", "评估统计", "部署运维", "自动化编排", "调试诊断"],
    "工具": ["标注工具", "数据管理", "可视化", "开发调试", "训练工具", "推理工具", "运维工具"],
    "服务": ["推理服务", "LLM 服务", "存储服务", "数据服务", "标注服务", "检索服务", "调度服务", "监控服务"],
}


def get_capability_taxonomy() -> dict[str, list[str]]:
    return CAPABILITY_TAXONOMY


def _read_store() -> dict[str, Any]:
    with _lock:
        if not _data_path.exists():
            return {"ai": {}, "capabilities": []}
        return json.loads(_data_path.read_text(encoding="utf-8"))


def _write_store(data: dict[str, Any]) -> None:
    with _lock:
        _data_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = _data_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(_data_path)


def get_ai_settings() -> dict[str, Any]:
    settings = _read_store().get("ai", {})
    provider = settings.get("provider", "openrouter")
    preset = PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["openrouter"])
    key = settings.get("api_key") or os.getenv("DEEPSEEK_API_KEY" if provider == "deepseek" else "OPENROUTER_API_KEY", "")
    return {
        "provider": provider,
        "base_url": settings.get("base_url", preset["base_url"]),
        "model": settings.get("model", preset["model"]),
        "configured": bool(key),
        "presets": PROVIDER_PRESETS,
    }


def save_ai_settings(payload: AiSettingsUpdate) -> dict[str, Any]:
    data = _read_store()
    current = data.get("ai", {})
    preset = PROVIDER_PRESETS.get(payload.provider, PROVIDER_PRESETS["openrouter"])
    data["ai"] = {
        "provider": payload.provider.strip() or "openrouter",
        "base_url": payload.base_url.rstrip("/") or preset["base_url"],
        "model": payload.model.strip() or preset["model"],
        "api_key": payload.api_key.strip() or current.get("api_key", ""),
    }
    _write_store(data)
    return get_ai_settings()


def test_ai_connection() -> dict[str, Any]:
    settings = _read_store().get("ai", {})
    provider = settings.get("provider", "openrouter")
    api_key = settings.get("api_key") or os.getenv("DEEPSEEK_API_KEY" if provider == "deepseek" else "OPENROUTER_API_KEY", "")
    if not api_key:
        raise ValueError("尚未配置 OpenRouter API Key")
    preset = PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["openrouter"])
    provider_name = "DeepSeek" if provider == "deepseek" else "OpenRouter"
    base_url = settings.get("base_url", preset["base_url"]).rstrip("/")
    model = settings.get("model", preset["model"])
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps({
            "model": model,
            "max_tokens": 8,
            "temperature": 0,
            "messages": [{"role": "user", "content": "Reply only: OK"}],
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "X-Title": "VisPraxis"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")[:800]
        try:
            parsed = json.loads(detail)
            detail = parsed.get("error", {}).get("message") or parsed.get("message") or detail
        except json.JSONDecodeError:
            pass
        raise ValueError(f"{provider_name} 返回 {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise ValueError(f"无法连接 {provider_name}: {error.reason}") from error
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {
        "ok": True,
        "provider": provider,
        "requested_model": model,
        "resolved_model": body.get("model", model),
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "response": content[:80],
    }


def _scan_local(location: str) -> tuple[dict[str, Any], str]:
    root = Path(location).expanduser().resolve()
    if not root.is_dir():
        raise ValueError("本地目录不存在或不可读取")
    files: list[Path] = []
    for path in root.rglob("*"):
        if len(files) >= 500:
            break
        if not path.is_file() or any(part in _ignored for part in path.relative_to(root).parts):
            continue
        files.append(path)
    extensions: dict[str, int] = {}
    for path in files:
        suffix = path.suffix.lower() or "[no extension]"
        extensions[suffix] = extensions.get(suffix, 0) + 1
    priority_names = {"readme.md", "package.json", "pyproject.toml", "requirements.txt", "setup.py", "dockerfile", "docker-compose.yml"}
    readable = sorted(
        (path for path in files if path.suffix.lower() in _text_suffixes or path.name.lower() in priority_names),
        key=lambda path: (path.name.lower() not in priority_names, len(path.relative_to(root).parts), str(path).lower()),
    )
    excerpts: list[str] = []
    used = 0
    for path in readable:
        if used >= 36_000 or len(excerpts) >= 28:
            break
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")[:4000]
        except OSError:
            continue
        if not content.strip():
            continue
        relative = path.relative_to(root).as_posix()
        block = f"\n--- {relative} ---\n{content}"
        excerpts.append(block)
        used += len(block)
    inventory = {
        "name": root.name,
        "root": str(root),
        "file_count": len(files),
        "extensions": dict(sorted(extensions.items(), key=lambda item: item[1], reverse=True)[:12]),
        "entry_candidates": [path.relative_to(root).as_posix() for path in files if path.suffix.lower() in _entry_suffixes][:80],
        "sample_files": [path.relative_to(root).as_posix() for path in files[:120]],
    }
    return inventory, "".join(excerpts)


def _heuristic_analysis(inventory: dict[str, Any], preferred_type: str) -> dict[str, Any]:
    entries = inventory.get("entry_candidates", [])
    candidates = []
    for entry in entries[:12]:
        name = Path(entry).stem.replace("_", "-")
        lowered = entry.lower()
        categories = []
        keyword_tags = {
            "rename": "批量改名", "convert": "格式转换", "clean": "数据清洗", "download": "下载同步",
            "export": "导入导出", "import": "导入导出", "annot": "标注处理", "image": "图像处理",
            "train": "训练辅助", "eval": "评估统计", "deploy": "部署运维", "debug": "调试诊断",
        }
        for keyword, tag in keyword_tags.items():
            if keyword in lowered and tag not in categories:
                categories.append(tag)
        candidates.append({
            "name": name,
            "type": preferred_type if preferred_type != "auto" else "脚本",
            "summary": f"待 AI 分析：{entry}",
            "categories": categories or ["自动化编排"],
            "entrypoints": [entry],
            "runtime": "待识别",
            "invocation": "待适配",
            "inputs": [],
            "outputs": [],
            "parameters": [],
            "dependencies": [],
            "confidence": 0.2,
            "evidence": [entry],
        })
    return {
        "project_name": inventory.get("name", "未命名项目"),
        "project_summary": "已完成目录清单扫描；配置 OpenRouter 后可进行语义分析和能力拆分。",
        "project_kind": "脚本集合" if len(candidates) > 1 else "单一能力",
        "capabilities": candidates,
    }


def _extract_json(content: str) -> dict[str, Any]:
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < start:
        raise ValueError("AI 未返回可解析的 JSON")
    return json.loads(content[start : end + 1])


def _normalize_analysis(analysis: dict[str, Any]) -> dict[str, Any]:
    used: dict[str, int] = {}
    normalized = []
    for index, candidate in enumerate(analysis.get("capabilities", []), start=1):
        base = re.sub(r"[^a-z0-9-]+", "-", str(candidate.get("name") or f"capability-{index}").lower().replace("_", "-")).strip("-")
        base = base or f"capability-{index}"
        used[base] = used.get(base, 0) + 1
        name = base if used[base] == 1 else f"{base}-{used[base]}"
        capability_type = candidate.get("type") if candidate.get("type") in CAPABILITY_TAXONOMY else "脚本"
        categories = list(dict.fromkeys(str(tag).strip() for tag in candidate.get("categories", []) if str(tag).strip()))[:4]
        normalized.append({**candidate, "name": name, "type": capability_type, "categories": categories or [CAPABILITY_TAXONOMY[capability_type][0]]})
    return {**analysis, "capabilities": normalized}


def _analyze_with_llm(inventory: dict[str, Any], excerpts: str, payload: CapabilityAnalyzeRequest) -> dict[str, Any]:
    store_settings = _read_store().get("ai", {})
    provider = store_settings.get("provider", "openrouter")
    api_key = store_settings.get("api_key") or os.getenv("DEEPSEEK_API_KEY" if provider == "deepseek" else "OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_NOT_CONFIGURED")
    preset = PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["openrouter"])
    provider_name = "DeepSeek" if provider == "deepseek" else "OpenRouter"
    base_url = store_settings.get("base_url", preset["base_url"]).rstrip("/")
    model = store_settings.get("model", preset["model"])
    schema = {
        "project_name": "string",
        "project_summary": "string",
        "project_kind": "单一工具|脚本集合|模型项目|服务|混合项目",
        "capabilities": [{
            "name": "stable-kebab-case-id", "type": "模型|算法|脚本|工具|服务", "categories": ["该类型下的功能标签，可多选"],
            "summary": "string", "entrypoints": ["path or endpoint"], "runtime": "string",
            "invocation": "CLI|Python|HTTP|进程|库调用|其他", "inputs": ["string"], "outputs": ["string"],
            "parameters": ["string"], "dependencies": ["string"], "confidence": 0.0, "evidence": ["file paths"],
        }],
    }
    prompt = (
        "你是视觉工程平台的能力接入分析器。仓库可能是一个工具/服务，也可能包含多个相互独立的脚本。"
        "必须依据入口、README、依赖和代码证据拆分真实可调度能力；不要把每个辅助文件都当成能力。"
        "只返回 JSON，不要 Markdown。能力类型只能是 模型、算法、脚本、工具、服务。\n"
        f"用户偏好类型: {payload.preferred_type}。不要给整个项目指定统一分组，必须逐项分类。\n"
        f"分类词表: {json.dumps(CAPABILITY_TAXONOMY, ensure_ascii=False)}。优先使用词表，可在证据充分时补充新标签；每项 1-4 个标签。\n"
        f"输出结构: {json.dumps(schema, ensure_ascii=False)}\n"
        f"目录清单: {json.dumps(inventory, ensure_ascii=False)}\n"
        f"文件摘要:{excerpts}"
    )
    request_data = json.dumps({
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": "Return strict JSON for software capability cataloging."},
            {"role": "user", "content": prompt},
        ],
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=request_data,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "X-Title": "VisPraxis"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")[:800]
        raise ValueError(f"{provider_name} 请求失败 ({error.code}): {detail}") from error
    return _extract_json(body["choices"][0]["message"]["content"])


def analyze_capability_source(payload: CapabilityAnalyzeRequest) -> dict[str, Any]:
    if payload.source_type != "local":
        return {
            "analysis_mode": "pending-adapter",
            "inventory": {"name": payload.location, "file_count": 0, "extensions": {}, "entry_candidates": []},
            "analysis": {"project_name": payload.location, "project_summary": "该来源适配器将在下一阶段接入抓取与解析。", "project_kind": "待识别", "capabilities": []},
            "ai": get_ai_settings(),
        }
    inventory, excerpts = _scan_local(payload.location)
    try:
        analysis = _normalize_analysis(_analyze_with_llm(inventory, excerpts, payload))
        mode = get_ai_settings()["provider"]
    except RuntimeError as error:
        if str(error) != "OPENROUTER_NOT_CONFIGURED":
            raise
        analysis = _normalize_analysis(_heuristic_analysis(inventory, payload.preferred_type))
        mode = "inventory-only"
    return {"analysis_mode": mode, "inventory": inventory, "analysis": analysis, "ai": get_ai_settings()}


def import_capabilities(payload: CapabilityImportRequest) -> dict[str, Any]:
    data = _read_store()
    records = data.setdefault("capabilities", [])
    created = []
    reused = []
    for capability in payload.capabilities:
        existing = next((item for item in records if item.get("source_location") == payload.location and item.get("name") == capability.get("name")), None)
        if existing:
            if existing.get("status") != "published":
                existing.update(capability)
                existing["project_summary"] = payload.project_summary
                if existing.get("status") == "deleted":
                    existing["status"] = "draft"
            reused.append(existing)
            continue
        record = {
            "id": f"cap-{uuid4().hex[:12]}",
            **capability,
            "source_type": payload.source_type,
            "source_location": payload.location,
            "project_summary": payload.project_summary,
            "status": "draft",
        }
        records.append(record)
        created.append(record)
    _write_store(data)
    return {"created": created, "reused": reused, "count": len(created), "reused_count": len(reused)}


def list_capabilities() -> list[dict[str, Any]]:
    data = _read_store()
    records = data.get("capabilities", [])
    changed = False
    legacy_statuses = {"待适配": "draft", "适配中": "draft", "可用": "published", "已发布": "published", "停用": "disabled"}
    for record in records:
        if record.get("status") in legacy_statuses:
            record["status"] = legacy_statuses[record["status"]]
            changed = True
    if changed:
        _write_store(data)
    return records


def update_capability(capability_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
    data = _read_store()
    record = next((item for item in data.get("capabilities", []) if item.get("id") == capability_id), None)
    if not record:
        return None
    record.update(changes)
    _write_store(data)
    return record


def delete_capability(capability_id: str) -> bool:
    data = _read_store()
    records = data.get("capabilities", [])
    record = next((item for item in records if item.get("id") == capability_id), None)
    if not record:
        return False
    record["status"] = "deleted"
    _write_store(data)
    return True

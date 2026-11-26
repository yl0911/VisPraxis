from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
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


class CapabilityBatchStatusUpdate(BaseModel):
    capability_ids: list[str] = Field(min_length=1)
    status: str = Field(pattern="^(draft|published|disabled|deleted)$")


class ToolSetUpdate(BaseModel):
    capability_ids: list[str] = Field(default_factory=list)


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


def _representative_hierarchy_paths(path_counts: dict[str, int], limit: int = 120) -> list[tuple[str, int]]:
    normalized = {path.replace("\\", "/").strip("/"): count for path, count in path_counts.items() if path.strip("/\\")}
    if len(normalized) <= limit:
        return sorted(normalized.items(), key=lambda item: (-item[1], item[0]))
    selected: dict[str, int] = {}
    buckets: dict[str, list[tuple[str, int]]] = {}
    for path, count in normalized.items():
        bucket = "/".join(path.split("/")[:2])
        buckets.setdefault(bucket, []).append((path, count))
    for items in buckets.values():
        best = sorted(items, key=lambda item: (-item[1], len(item[0].split("/")), item[0]))[0]
        selected[best[0]] = best[1]
        if len(selected) >= limit:
            break
    priority = sorted(
        normalized.items(),
        key=lambda item: (
            not bool(re.search(r"(^|/)(?:v?\d[\w.-]*|unknown|all)(?:/|$)", item[0], re.I)),
            -item[1], len(item[0].split("/")), item[0],
        ),
    )
    for path, count in priority:
        if len(selected) >= limit:
            break
        selected.setdefault(path, count)
    return list(selected.items())


def analyze_data_hierarchy(source_name: str, directory_counts: dict[str, int], examples: dict[str, str] | None = None, file_samples: list[dict[str, str]] | None = None) -> dict[str, Any]:
    settings = _read_store().get("ai", {})
    provider = settings.get("provider", "openrouter")
    api_key = settings.get("api_key") or os.getenv("DEEPSEEK_API_KEY" if provider == "deepseek" else "OPENROUTER_API_KEY", "")
    if not api_key:
        raise ValueError("尚未配置 AI 服务，请先在系统设置中配置 OpenRouter 或 DeepSeek")
    preset = PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["openrouter"])
    provider_name = "DeepSeek" if provider == "deepseek" else "OpenRouter"
    base_url = settings.get("base_url", preset["base_url"]).rstrip("/")
    model = settings.get("model", preset["model"])
    schema = {
        "summary": "string",
        "datasets": [{
            "path_prefix": "图像所在目录，相对于数据源根目录",
            "category": "标准大类",
            "branch": "标准分支",
            "version": "标准版本",
            "confidence": 0.0,
            "reason": "string",
        }],
        "association_rules": {
            "content_directories": ["只填写输入中出现的、用于分开放置主图或小图的目录名"],
            "suffix_markers": ["小图文件名在数字前的字面标记，例如 _icon、_crop；只能以点、下划线或横线开头"],
            "literal_suffixes": ["不带数字的小图后缀，例如 _bg、_mask；只能以点、下划线或横线开头"],
        },
    }
    representative_paths = _representative_hierarchy_paths(directory_counts)
    prompt_paths = [{"path": path, "image_count": count} for path, count in representative_paths]
    prompt = (
        "你是视觉数据目录治理助手。一个数据源可能混合多套目录规范。请逐个判断给出的图像目录属于哪个标准数据集，"
        "输出大类、分支、版本。大图、小图、images、annotations、train、test、unsolved 等通常是版本下的内容或状态目录，"
        "不能误判为大类/分支/版本。输入是本地统计后的代表目录及图像数量，不包含图像或标注文档内容。"
        "相同数据集的不同内容目录可以输出多条映射。path_prefix 必须原样使用输入目录，"
        "不能虚构目录。只返回严格 JSON，不要 Markdown。\n"
        f"数据源: {source_name}\n"
        f"人工示例（可能为空）: {json.dumps(examples or {}, ensure_ascii=False)}\n"
        f"输出结构: {json.dumps(schema, ensure_ascii=False)}\n"
        f"代表目录摘要（最多 120 条）: {json.dumps(prompt_paths, ensure_ascii=False)}\n"
        f"文件命名样本（最多 60 条，只用于归纳组合规则）: {json.dumps((file_samples or [])[:60], ensure_ascii=False)}"
    )
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps({
            "model": model, "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "Return strict JSON for visual dataset hierarchy mapping."},
                {"role": "user", "content": prompt},
            ],
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "X-Title": "VisPraxis"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")[:800]
        raise ValueError(f"{provider_name} 请求失败 ({error.code}): {detail}") from error
    except urllib.error.URLError as error:
        raise ValueError(f"无法连接 {provider_name}: {error.reason}") from error
    result = _extract_json(body["choices"][0]["message"]["content"])
    allowed = {path for path, _ in representative_paths}
    mappings = []
    for item in result.get("datasets", []):
        prefix = str(item.get("path_prefix", "")).replace("\\", "/").strip("/")
        category = str(item.get("category", "")).replace("\\", "/").strip("/").split("/")[-1]
        branch = str(item.get("branch", "")).replace("\\", "/").strip("/").split("/")[-1]
        version = str(item.get("version", "")).replace("\\", "/").strip("/").split("/")[-1]
        if prefix in allowed and category and branch and version:
            mappings.append({
                "path_prefix": prefix, "category": category, "branch": branch, "version": version,
                "confidence": max(0.0, min(1.0, float(item.get("confidence", 0)))),
                "reason": str(item.get("reason", ""))[:300],
            })
    if not mappings:
        raise ValueError("AI 未返回可用的目录映射")
    raw_rules = result.get("association_rules", {})
    observed_directories = {path.split("/")[-1].lower() for path in directory_counts}
    content_directories = [
        str(item).strip().lower() for item in raw_rules.get("content_directories", [])
        if str(item).strip().lower() in observed_directories
    ]
    suffix_markers = [
        str(item).strip() for item in raw_rules.get("suffix_markers", [])
        if re.fullmatch(r"[._-][A-Za-z_-]{0,20}", str(item).strip())
    ]
    literal_suffixes = [
        str(item).strip() for item in raw_rules.get("literal_suffixes", [])
        if re.fullmatch(r"[._-][A-Za-z0-9_-]{1,24}", str(item).strip())
    ]
    return {
        "summary": str(result.get("summary", "")), "mappings": mappings, "provider": provider, "model": model,
        "input_directory_count": len(directory_counts), "prompt_directory_count": len(representative_paths),
        "input_image_count": sum(directory_counts.values()), "truncated": len(directory_counts) > len(representative_paths),
        "association_rules": {
            "content_directories": list(dict.fromkeys(content_directories)),
            "suffix_markers": list(dict.fromkeys(suffix_markers)),
            "literal_suffixes": list(dict.fromkeys(literal_suffixes)),
        },
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
    launch_names = {"main.py", "__main__.py", "app.py", "server.py", "cli.py", "run.py", "manage.py", "index.js", "index.ts", "cli.js", "cli.ts"}
    launch_candidates = [
        path.relative_to(root).as_posix()
        for path in files
        if path.name.lower() in launch_names
        or any(part.lower() in {"bin", "cli"} for part in path.relative_to(root).parts[:-1])
    ][:40]
    inventory = {
        "name": root.name,
        "root": str(root),
        "file_count": len(files),
        "extensions": dict(sorted(extensions.items(), key=lambda item: item[1], reverse=True)[:12]),
        "entry_candidates": [path.relative_to(root).as_posix() for path in files if path.suffix.lower() in _entry_suffixes][:80],
        "launch_candidates": launch_candidates,
        "sample_files": [path.relative_to(root).as_posix() for path in files[:120]],
    }
    return inventory, "".join(excerpts)


def _github_repository(location: str) -> tuple[str, str, str]:
    parsed = urllib.parse.urlparse(location.strip())
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in {"github.com", "www.github.com"}:
        raise ValueError("请输入标准 GitHub 仓库地址，例如 https://github.com/owner/repository")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2:
        raise ValueError("GitHub 地址必须指向仓库根目录，不能使用文件、分支或子目录链接")
    owner, repository = parts
    repository = repository.removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repository):
        raise ValueError("GitHub 仓库地址格式无效")
    return owner, repository, f"https://github.com/{owner}/{repository}"


def _github_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "VisPraxis-Capability-Scanner/0.2"},
    )


def _scan_github(location: str) -> tuple[dict[str, Any], str]:
    owner, repository, canonical_url = _github_repository(location)
    api_root = f"https://api.github.com/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository)}"
    try:
        with urllib.request.urlopen(_github_request(api_root), timeout=30) as response:
            metadata = json.loads(response.read().decode("utf-8"))
        default_branch = metadata.get("default_branch") or "main"
        archive_url = f"{api_root}/zipball/{urllib.parse.quote(default_branch, safe='')}"
        with tempfile.TemporaryDirectory(prefix="vispraxis-github-") as directory:
            temporary_root = Path(directory)
            archive_path = temporary_root / "repository.zip"
            downloaded = 0
            with urllib.request.urlopen(_github_request(archive_url), timeout=60) as response, archive_path.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    downloaded += len(chunk)
                    if downloaded > 100 * 1024 * 1024:
                        raise ValueError("GitHub 仓库快照超过 100 MB 扫描限制")
                    output.write(chunk)
            extract_root = temporary_root / "source"
            extract_root.mkdir()
            resolved_extract_root = extract_root.resolve()
            with zipfile.ZipFile(archive_path) as archive:
                for member in archive.infolist():
                    target = (resolved_extract_root / member.filename).resolve()
                    if not target.is_relative_to(resolved_extract_root):
                        raise ValueError("GitHub 仓库快照包含无效路径")
                    archive.extract(member, extract_root)
            roots = [item for item in extract_root.iterdir() if item.is_dir()]
            source_root = roots[0] if len(roots) == 1 else extract_root
            inventory, excerpts = _scan_local(str(source_root))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise ValueError("GitHub 仓库不存在、不是公开仓库，或当前无权访问") from error
        if error.code == 403:
            raise ValueError("GitHub API 请求受限，请稍后重试") from error
        raise ValueError(f"GitHub 返回错误状态 {error.code}") from error
    except urllib.error.URLError as error:
        raise ValueError(f"无法连接 GitHub: {error.reason}") from error
    except zipfile.BadZipFile as error:
        raise ValueError("GitHub 返回的仓库快照无效") from error
    inventory.update({"name": f"{owner}/{repository}", "root": canonical_url, "default_branch": default_branch})
    return inventory, excerpts


def _heuristic_analysis(inventory: dict[str, Any], preferred_type: str, split_mode: str = "auto") -> dict[str, Any]:
    all_entries = inventory.get("entry_candidates", [])
    launch_entries = inventory.get("launch_candidates", [])
    if split_mode == "collection":
        entries = all_entries[:12]
        project_kind = "能力集合"
    elif split_mode == "client":
        entries = (launch_entries or all_entries)[:2]
        project_kind = "服务客户端"
    elif split_mode == "project" or launch_entries:
        entries = (launch_entries or all_entries)[:1]
        project_kind = "单一项目"
    else:
        entries = all_entries[:12]
        project_kind = "能力集合" if len(entries) > 1 else "单一项目"
    candidates = []
    for entry in entries:
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
        "project_kind": project_kind,
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
    split_policies = {
        "auto": "先判定仓库形态。只有多个入口能够独立安装、调用和产生独立结果时才拆分；否则按单一项目或客户端整体录入。",
        "collection": "这是能力集合。按可独立调用的脚本、CLI 或子包拆分，但辅助模块、测试、示例和文档不能单独成项。",
        "project": "这是单一项目。最多输出 1-3 项顶层能力，只使用主启动文件、CLI、服务入口或公开库入口，不按内部模块和文档拆分。",
        "client": "这是服务客户端或 SDK。整体输出 1 项客户端能力；可补充 1 项独立 CLI，但禁止按 API 方法、示例、文档页面拆分。",
    }
    schema = {
        "project_name": "string",
        "project_summary": "string",
        "project_kind": "单一项目|能力集合|模型项目|服务|服务客户端|混合项目",
        "capabilities": [{
            "name": "stable-kebab-case-id", "type": "模型|算法|脚本|工具|服务", "categories": ["该类型下的功能标签，可多选"],
            "summary": "string", "entrypoints": ["path or endpoint"], "runtime": "string",
            "invocation": "CLI|Python|HTTP|进程|库调用|其他", "inputs": ["string"], "outputs": ["string"],
            "parameters": ["string"], "dependencies": ["string"], "confidence": 0.0, "evidence": ["file paths"],
        }],
    }
    prompt = (
        "你是视觉工程平台的能力接入分析器。必须先判断仓库是能力集合、单一项目、服务客户端、模型项目还是服务。"
        "能力必须能被流程独立调用。测试、示例、普通文档、配置片段、辅助模块和内部类只能作为证据，绝不能单独成为能力。"
        "对于单一项目或服务客户端，优先读取 launch_candidates、包清单中的 CLI scripts、主入口和 README 的启动命令，不要遍历式拆分全部文档或源文件。"
        "只返回 JSON，不要 Markdown。能力类型只能是 模型、算法、脚本、工具、服务。\n"
        f"拆分策略: {split_policies.get(payload.group, split_policies['auto'])}\n"
        f"用户偏好类型: {payload.preferred_type}。每项能力仍需独立分类。\n"
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
    if payload.source_type == "local":
        inventory, excerpts = _scan_local(payload.location)
    elif payload.source_type == "github":
        inventory, excerpts = _scan_github(payload.location)
    else:
        return {
            "analysis_mode": "pending-adapter",
            "inventory": {"name": payload.location, "file_count": 0, "extensions": {}, "entry_candidates": []},
            "analysis": {"project_name": payload.location, "project_summary": "该来源适配器将在下一阶段接入抓取与解析。", "project_kind": "待识别", "capabilities": []},
            "ai": get_ai_settings(),
        }
    try:
        analysis = _normalize_analysis(_analyze_with_llm(inventory, excerpts, payload))
        mode = get_ai_settings()["provider"]
    except RuntimeError as error:
        if str(error) != "OPENROUTER_NOT_CONFIGURED":
            raise
        analysis = _normalize_analysis(_heuristic_analysis(inventory, payload.preferred_type, payload.group))
        mode = "inventory-only"
    return {"analysis_mode": mode, "inventory": inventory, "analysis": analysis, "ai": get_ai_settings()}


def import_capabilities(payload: CapabilityImportRequest) -> dict[str, Any]:
    data = _read_store()
    records = data.setdefault("capabilities", [])
    created = []
    reused = []
    source_location = _github_repository(payload.location)[2] if payload.source_type == "github" else payload.location
    for capability in payload.capabilities:
        existing = next((item for item in records if item.get("source_location") == source_location and item.get("name") == capability.get("name")), None)
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
            "source_location": source_location,
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


def list_tool_set() -> list[dict[str, Any]]:
    data = _read_store()
    capability_ids = list(dict.fromkeys(data.get("tool_set", [])))
    records = {
        item.get("id"): item
        for item in data.get("capabilities", [])
        if item.get("status") != "deleted"
    }
    valid_ids = [capability_id for capability_id in capability_ids if capability_id in records]
    if valid_ids != capability_ids:
        data["tool_set"] = valid_ids
        _write_store(data)
    return [records[capability_id] for capability_id in valid_ids]


def add_tool_set_capabilities(capability_ids: list[str]) -> dict[str, Any]:
    data = _read_store()
    published = {
        item.get("id"): item
        for item in data.get("capabilities", [])
        if item.get("status") == "published"
    }
    requested = list(dict.fromkeys(capability_ids))
    invalid = [capability_id for capability_id in requested if capability_id not in published]
    if invalid:
        raise ValueError(f"能力不存在或尚未发布: {', '.join(invalid)}")
    current = list(dict.fromkeys(data.get("tool_set", [])))
    added = [capability_id for capability_id in requested if capability_id not in current]
    data["tool_set"] = [*current, *added]
    _write_store(data)
    return {"items": list_tool_set(), "added_count": len(added)}


def remove_tool_set_capabilities(capability_ids: list[str]) -> dict[str, Any]:
    data = _read_store()
    removed_ids = set(capability_ids)
    current = list(dict.fromkeys(data.get("tool_set", [])))
    remaining = [capability_id for capability_id in current if capability_id not in removed_ids]
    data["tool_set"] = remaining
    _write_store(data)
    return {"items": list_tool_set(), "removed_count": len(current) - len(remaining)}


def update_capability(capability_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
    with _lock:
        data = _read_store()
        record = next((item for item in data.get("capabilities", []) if item.get("id") == capability_id), None)
        if not record:
            return None
        record.update(changes)
        if record.get("status") == "deleted":
            data["tool_set"] = [item for item in data.get("tool_set", []) if item != capability_id]
        _write_store(data)
        return record


def update_capability_status_batch(capability_ids: list[str], next_status: str) -> dict[str, Any]:
    with _lock:
        data = _read_store()
        requested = list(dict.fromkeys(capability_ids))
        records = {item.get("id"): item for item in data.get("capabilities", [])}
        missing = [capability_id for capability_id in requested if capability_id not in records]
        if missing:
            raise ValueError(f"能力不存在: {', '.join(missing)}")
        for capability_id in requested:
            records[capability_id]["status"] = next_status
        if next_status == "deleted":
            removed_ids = set(requested)
            data["tool_set"] = [item for item in data.get("tool_set", []) if item not in removed_ids]
        _write_store(data)
        return {"updated_count": len(requested), "items": [records[capability_id] for capability_id in requested]}


def delete_capability(capability_id: str) -> bool:
    data = _read_store()
    records = data.get("capabilities", [])
    record = next((item for item in records if item.get("id") == capability_id), None)
    if not record:
        return False
    record["status"] = "deleted"
    data["tool_set"] = [item for item in data.get("tool_set", []) if item != capability_id]
    _write_store(data)
    return True

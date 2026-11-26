import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  Box,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Cloud,
  Database,
  Download,
  Eraser,
  Eye,
  FileCheck2,
  FileInput,
  Folder,
  FolderTree,
  GitBranch,
  Grid2X2,
  HardDrive,
  ImageIcon,
  Import,
  LayoutDashboard,
  Link,
  List,
  LockKeyhole,
  PackageCheck,
  PanelLeftClose,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Scissors,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  TableProperties,
  TestTube2,
  Trash2,
  WandSparkles,
  Workflow,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  DashboardSummary,
  DataSource,
  ImageRecord,
  PredictionStatus,
} from "@vispraxis/contracts";

interface Payload {
  summary: DashboardSummary;
  sources: DataSource[];
  images: ImageRecord[];
}
type View = "overview" | "preprocess" | "solutions" | "models" | "postprocess";
const taskNames = {
  localization: "检测",
  segmentation: "切割",
  matching: "分类",
  analysis: "分析",
};
const nav = [
  ["overview", "数据总览", LayoutDashboard],
  ["preprocess", "数据中心", ImageIcon],
  ["solutions", "策略中心", TestTube2],
  ["models", "能力中心", Boxes],
] as const;
const subNav: Record<View, string[]> = {
  overview: ["运行总览", "图像巡检", "数据链路", "来源分析"],
  preprocess: ["数据管理", "数据源", "数据同步", "数据集", "标注/编辑", "工具集"],
  solutions: ["方案库", "新数据评估", "提示词", "实验记录"],
  models: ["能力列表", "接入与适配", "版本与配置", "调度记录"],
  postprocess: ["结果资产", "人工复核", "收纳规则", "导出任务"],
};
const viewDescriptions: Record<View, string> = {
  overview: "平台数据、处理产出与运行状态",
  preprocess: "数据来源、标准化信息与处理资产",
  solutions: "数据处理策略与评估方案",
  models: "模型、算法、脚本、工具与服务",
  postprocess: "处理结果、复核与导出任务",
};
const solutions = [
  [
    "产线 B 表面缺陷检测",
    "检测",
    "v2.4.1",
    "YOLOv11-seg",
    "生产图像归档",
    "98.2%",
    "运行中",
  ],
  [
    "零件边界精细切割",
    "切割",
    "v1.8.3",
    "SAM 2 + Refiner",
    "专家案例目录",
    "95.7%",
    "运行中",
  ],
  [
    "异常样本自动聚类",
    "聚类",
    "v0.9.6",
    "DINOv2 + HDBSCAN",
    "生产实时流",
    "91.3%",
    "评估中",
  ],
];

export function App() {
  const [data, setData] = useState<Payload>();
  const [view, setView] = useState<View>("overview");
  const [subPage, setSubPage] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<PredictionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v: Payload) => {
        setData(v);
        setSelectedId(v.images[0]?.id);
      })
      .catch(() => setNotice("数据加载失败"));
  }, []);
  const images = useMemo(
    () =>
      data?.images.filter(
        (x) =>
          (filter === "all" || x.prediction === filter) &&
          (!search ||
            [x.filename, x.sourceName, ...x.problemTags]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())),
      ) ?? [],
    [data, filter, search],
  );
  async function review(status: "verified" | "incorrect" | "captured") {
    if (!data || !selectedId) return;
    const r = await fetch(`/api/images/${selectedId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const item = (await r.json()) as ImageRecord;
    setData({
      ...data,
      images: data.images.map((x) => (x.id === item.id ? item : x)),
    });
    setNotice(
      status === "captured"
        ? "已收纳到案例库，可用于新方案评估"
        : "复核结果已记录",
    );
  }
  if (!data)
    return (
      <main className="loading">
        <RefreshCw className="spin" />
        正在连接视觉数据中枢
      </main>
    );
  const current = nav.find((x) => x[0] === view)!;
  const selected = data.images.find((x) => x.id === selectedId) ?? images[0];
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <b>VP</b>
          {!collapsed && (
            <span>
              <strong>视抉</strong>
              <small>VISPRAXIS</small>
            </span>
          )}
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              className={view === id ? "active" : ""}
              onClick={() => {
                setSettingsOpen(false);
                setView(id);
                setSubPage(0);
              }}
              key={id}
              title={label}
            >
              <Icon size={18} />
              {!collapsed && label}
            </button>
          ))}
        </nav>
        <footer>
          <button className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
            {!collapsed && "系统设置"}
          </button>
          <button onClick={() => setCollapsed((v) => !v)}>
            <PanelLeftClose size={18} />
            {!collapsed && "收起侧栏"}
          </button>
        </footer>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{settingsOpen ? "系统设置" : current[1]}</h1>
            <p>{settingsOpen ? "平台存储、AI 接入与运行参数" : viewDescriptions[view]}</p>
          </div>
        </header>
        {!settingsOpen && <nav className="subnav">
          {subNav[view].map((label, i) => (
            <button
              className={subPage === i ? "active" : ""}
              onClick={() => setSubPage(i)}
              key={label}
            >
              {label}
            </button>
          ))}
        </nav>}
        {settingsOpen ? <SystemSettings /> : <>
        {view === "overview" &&
          (subPage === 1 ? (
            <Preprocess
              images={images}
              selected={selected}
              filter={filter}
              search={search}
              setFilter={setFilter}
              setSearch={setSearch}
              select={setSelectedId}
              review={review}
            />
          ) : subPage === 0 ? (
            <Overview
              data={data}
              go={(v) => {
                setView(v);
                setSubPage(v === "preprocess" ? 1 : 0);
              }}
              openImages={() => setSubPage(1)}
            />
          ) : (
            <Reserved title={subNav[view][subPage]} />
          ))}
        {view === "preprocess" && <ImageDataCenter page={subPage} />}
        {view === "solutions" &&
          (subPage < 2 ? (
            <Solutions />
          ) : (
            <Reserved title={subNav[view][subPage]} />
          ))}
        {view === "models" &&
          (subPage < 2 ? (
            <CapabilityCenter page={subPage} />
          ) : (
            <Reserved title={subNav[view][subPage]} />
          ))}
        {view === "postprocess" &&
          (subPage === 0 ? (
            <Postprocess />
          ) : (
            <Reserved title={subNav[view][subPage]} />
          ))}
        </>}
      </main>
      {notice && (
        <div className="toast">
          <CircleCheck size={16} />
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  go,
  openImages,
}: {
  data: Payload;
  go: (v: View) => void;
  openImages: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState({
    trend: true,
    risks: true,
    lines: true,
    outcome: true,
  });
  const toggle = (key: keyof typeof widgets) =>
    setWidgets((v) => ({ ...v, [key]: !v[key] }));
  void go;
  return (
    <div className="business-screen">
      <section className="business-hero">
        <div className="hero-copy">
          <span className="hero-status">
            <i />
            数据与处理任务运行稳定
          </span>
          <h2>
            图像数据处理正常，
            <br />
            <b>仅 1 项需要关注</b>
          </h2>
          <p>
            当前已完成 82% 的处理队列。一个数据分支的切割结果通过率略有下降，
            建议检查数据分布与能力版本。
          </p>
          <div>
            <button className="btn hero-primary" onClick={openImages}>
              <Eye size={15} />
              查看待处理事项
            </button>
            <button
              className="btn hero-edit"
              onClick={() => setEditing((v) => !v)}
            >
              <Settings size={15} />
              {editing ? "完成编辑" : "编辑大屏"}
            </button>
          </div>
        </div>
        <div className="goal-ring">
          <div>
            <strong>
              82<small>%</small>
            </strong>
            <span>处理队列</span>
          </div>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="51" />
            <circle className="progress" cx="60" cy="60" r="51" />
          </svg>
          <p>
            <b>1,204</b> / 1,460 张
          </p>
        </div>
        <div className="hero-kpis">
          <article>
            <span>处理成功率</span>
            <strong>{data.summary.successRate}%</strong>
            <em>↑ 0.6% 较上一周期</em>
          </article>
          <article>
            <span>自动处理耗时</span>
            <strong>
              18.6<small>h</small>
            </strong>
            <em>包含标注、切割与索引</em>
          </article>
          <article>
            <span>待复核数据</span>
            <strong className="danger">17</strong>
            <em>4 项需要优先处理</em>
          </article>
        </div>
      </section>
      {editing && (
        <section className="widget-editor">
          <span>
            <Settings size={15} />
            <b>选择大屏内容</b>
            <small>点击开关即可调整展示模块</small>
          </span>
          {Object.entries({
            trend: "处理趋势",
            risks: "待关注项",
            lines: "数据分支",
            outcome: "平台产出",
          }).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={widgets[key as keyof typeof widgets]}
                onChange={() => toggle(key as keyof typeof widgets)}
              />
              <i />
              {label}
            </label>
          ))}
        </section>
      )}
      <div className="business-grid">
        {widgets.trend && (
          <section className="business-card trend-card">
            <header>
              <span>
                <small>处理队列进度</small>
                <h3>图像处理趋势</h3>
              </span>
              <div>
                <button className="active">今日</button>
                <button>本周</button>
                <button>本月</button>
              </div>
            </header>
            <div className="trend-total">
              <strong>1,204</strong>
              <span>已处理图像</span>
              <em>较上一周期 +8.2%</em>
            </div>
            <div className="line-chart">
              <svg viewBox="0 0 700 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#67b98a" stopOpacity=".28" />
                    <stop offset="1" stopColor="#67b98a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  className="area"
                  d="M0,150 C60,145 70,125 125,130 S205,92 260,103 S350,68 410,75 S500,42 550,55 S640,22 700,30 L700,180 L0,180Z"
                />
                <path
                  className="line"
                  d="M0,150 C60,145 70,125 125,130 S205,92 260,103 S350,68 410,75 S500,42 550,55 S640,22 700,30"
                />
              </svg>
              <div>
                {["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"].map(
                  (x) => (
                    <span key={x}>{x}</span>
                  ),
                )}
              </div>
            </div>
          </section>
        )}
        {widgets.risks && (
          <section className="business-card risk-card">
            <header>
              <span>
                <small>优先处理</small>
                <h3>待关注项</h3>
              </span>
              <button onClick={openImages}>
                查看全部 <ChevronRight size={13} />
              </button>
            </header>
            <article className="risk-main">
              <i>
                <CircleAlert size={19} />
              </i>
              <span>
                <b>切割结果通过率下降</b>
                <small>click_the_two_matching_shapes · 12 张图像</small>
              </span>
              <em>需关注</em>
            </article>
            <div className="risk-list">
              <button onClick={openImages}>
                <span>低置信度待复核</span>
                <b>18</b>
              </button>
              <button>
                <span>数据分布轻微漂移</span>
                <b>1</b>
              </button>
              <button>
                <span>超时处理任务</span>
                <b>0</b>
              </button>
            </div>
          </section>
        )}
        {widgets.lines && (
          <section className="business-card lines-card">
            <header>
              <span>
                <small>数据资产</small>
                <h3>数据分支状态</h3>
              </span>
              <button>
                查看对比 <ChevronRight size={13} />
              </button>
            </header>
            <div className="line-table">
              <div className="line-row head">
                <span>分支</span>
                <span>处理进度</span>
                <span>通过率</span>
                <span>趋势</span>
              </div>
              {[
                ["matching_shapes", 92, 98.7, "+1.2%"],
                ["geometry_click", 82, 96.4, "-0.8%"],
                ["shape_detection", 76, 97.9, "+0.4%"],
              ].map((x, i) => (
                <div className="line-row" key={String(x[0])}>
                  <span>
                    <i className={`line-badge l${i}`}>
                      {String(x[0]).slice(0, 1).toUpperCase()}
                    </i>
                    <b>{x[0]}</b>
                  </span>
                  <span>
                    <i className="mini-progress">
                      <b style={{ width: `${x[1]}%` }} />
                    </i>
                    <small>{x[1]}%</small>
                  </span>
                  <strong>{x[2]}%</strong>
                  <em className={String(x[3]).startsWith("-") ? "down" : ""}>
                    {x[3]}
                  </em>
                </div>
              ))}
            </div>
          </section>
        )}
        {widgets.outcome && (
          <section className="business-card outcome-card">
            <header>
              <span>
                <small>平台累计</small>
                <h3>数据与能力产出</h3>
              </span>
            </header>
            <div>
              <article>
                <i>
                  <Activity size={17} />
                </i>
                <span>
                  <strong>
                    382<small>h</small>
                  </strong>
                  <em>自动处理任务</em>
                </span>
              </article>
              <article>
                <i>
                  <FileCheck2 size={17} />
                </i>
                <span>
                  <strong>24,680</strong>
                  <em>已标准化图像</em>
                </span>
              </article>
              <article>
                <i>
                  <Archive size={17} />
                </i>
                <span>
                  <strong>438</strong>
                  <em>可复用数据模板</em>
                </span>
              </article>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

type ManagedSource = {
  id: string;
  name: string;
  type: "local" | "oss" | "minio" | "redis" | "mongodb";
  endpoint: string;
  status: "healthy" | "warning" | "offline" | "unknown";
  image_count: number;
  asset_count: number;
  last_sync_at: string | null;
  options?: { status_paths?: string[] };
};

const llmPresets = {
  openrouter: { base_url: "https://openrouter.ai/api/v1", model: "openrouter/auto" },
  deepseek: { base_url: "https://api.deepseek.com", model: "deepseek-flash" },
};

function SystemSettings() {
  const [storage, setStorage] = useState({ type: "local", endpoint: "", hierarchy_template: "{category}/{branch}/{version}" });
  const [ai, setAi] = useState({ provider: "openrouter", base_url: "https://openrouter.ai/api/v1", model: "openrouter/auto", configured: false });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState<"storage" | "ai" | "">("");
  const [message, setMessage] = useState("");
  const [aiTest, setAiTest] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/storage"), fetch("/api/capabilities/ai-settings")]).then(async ([storageResponse, aiResponse]) => {
      if (storageResponse.ok) setStorage(await storageResponse.json());
      if (aiResponse.ok) setAi(await aiResponse.json());
    }).catch(() => setMessage("系统配置读取失败"));
  }, []);

  async function saveStorage() {
    setSaving("storage"); setMessage("");
    const response = await fetch("/api/storage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(storage) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setStorage(body); setMessage("存储配置已保存"); } else setMessage(body.detail || "存储配置保存失败");
    setSaving("");
  }

  async function saveAi() {
    setSaving("ai"); setMessage(""); setAiTest(null);
    const response = await fetch("/api/capabilities/ai-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ai, api_key: apiKey }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setAi(body); setApiKey(""); setMessage("AI 接入配置已保存"); } else setMessage(body.detail || "AI 配置保存失败");
    setSaving("");
  }

  async function testAi() {
    setSaving("ai"); setAiTest(null);
    const response = await fetch("/api/capabilities/ai-settings/test", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setAiTest({ ok: true, text: `连接成功 · ${body.resolved_model} · ${body.latency_ms} ms` });
    else setAiTest({ ok: false, text: body.detail || "OpenRouter 连接测试失败" });
    setSaving("");
  }

  return <div className="system-settings-page">
    {message && <div className="settings-message"><CircleCheck size={14} />{message}</div>}
    <section className="settings-section">
      <header><i><HardDrive size={18} /></i><span><small>数据与产出</small><h2>受管存储</h2><p>标准图像、XML 标注和处理产出的统一写入位置。</p></span></header>
      <div className="settings-form-grid">
        <label><span>存储类型</span><select value={storage.type} onChange={(event) => setStorage((current) => ({ ...current, type: event.target.value }))}><option value="local">本地目录</option></select></label>
        <label className="wide"><span>存储目录</span><input value={storage.endpoint} onChange={(event) => setStorage((current) => ({ ...current, endpoint: event.target.value }))} placeholder="D:\\VisPraxis\\managed-data" /></label>
        <label className="wide"><span>层级模板</span><input value={storage.hierarchy_template} onChange={(event) => setStorage((current) => ({ ...current, hierarchy_template: event.target.value }))} /></label>
      </div>
      <footer><span><CircleAlert size={13} />修改后仅影响新的标准化与处理产出，不移动原始数据。</span><button className="btn primary" disabled={!storage.endpoint.trim() || saving === "storage"} onClick={saveStorage}>{saving === "storage" ? "保存中..." : "保存存储配置"}</button></footer>
    </section>
    <section className="settings-section">
      <header><i><WandSparkles size={18} /></i><span><small>AI 基础设施</small><h2>LLM 接入</h2><p>能力分析、代码总结和适配建议统一使用此配置。</p></span><em className={ai.configured ? "configured" : ""}>{ai.configured ? "已配置" : "未配置"}</em></header>
      <div className="settings-form-grid ai-grid">
        <label><span>提供商</span><select value={ai.provider} onChange={(event) => { const provider = event.target.value as keyof typeof llmPresets; setAi((current) => ({ ...current, provider, ...llmPresets[provider] })); setAiTest(null); }}><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option></select></label>
        <label className="wide"><span>Base URL</span><input value={ai.base_url} onChange={(event) => setAi((current) => ({ ...current, base_url: event.target.value }))} /></label>
        <label><span>模型</span>{ai.provider === "deepseek" ? <select value={ai.model} onChange={(event) => setAi((current) => ({ ...current, model: event.target.value }))}><option value="deepseek-flash">deepseek-flash</option><option value="deepseek-v4-pro">deepseek-v4-pro</option></select> : <input value={ai.model} onChange={(event) => setAi((current) => ({ ...current, model: event.target.value }))} placeholder="openrouter/auto" />}</label>
        <label className="wide"><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={ai.configured ? "已安全保存；留空不修改" : "sk-or-v1-..."} /></label>
      </div>
      {aiTest && <div className={`ai-test-result ${aiTest.ok ? "ok" : "error"}`}>{aiTest.ok ? <CircleCheck size={13} /> : <CircleAlert size={13} />}{aiTest.text}</div>}
      <footer><span><LockKeyhole size={13} />Key 不会在页面回显，能力中心只读取配置状态。</span><div><button className="btn" disabled={!ai.configured || saving === "ai"} onClick={testAi}>测试连接</button><button className="btn primary" disabled={saving === "ai"} onClick={saveAi}>{saving === "ai" ? "处理中..." : "保存 AI 配置"}</button></div></footer>
    </section>
  </div>;
}

function DataManagement() {
  type StandardCategory = { name: string; count: number; branches: { name: string; count: number; versions: { name: string; count: number }[] }[] };
  const [addOpen, setAddOpen] = useState(false);
  const [sourceType, setSourceType] = useState<ManagedSource["type"]>("local");
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [storagePath, setStoragePath] = useState("D:\\VisPraxis\\managed-data");
  const [standardCategories, setStandardCategories] = useState<StandardCategory[]>([]);
  const [searchSource, setSearchSource] = useState("");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [collection, setCollection] = useState("");
  const [credentialProfile, setCredentialProfile] = useState("");
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryPath, setDirectoryPath] = useState("");
  const [directoryParent, setDirectoryParent] = useState<string | null>(null);
  const [directoryEntries, setDirectoryEntries] = useState<
    { name: string; path: string }[]
  >([]);
  const [directoryRoots, setDirectoryRoots] = useState<string[]>([]);
  const [directoryError, setDirectoryError] = useState("");
  const sourceTypes = [
    { id: "local" as const, label: "本地目录", Icon: Folder },
    { id: "oss" as const, label: "OSS", Icon: Cloud },
    { id: "minio" as const, label: "MinIO", Icon: Server },
    { id: "redis" as const, label: "Redis", Icon: Radio },
    { id: "mongodb" as const, label: "MongoDB", Icon: Database },
  ];
  const typeInfo = Object.fromEntries(
    sourceTypes.map((item) => [item.id, item]),
  ) as Record<ManagedSource["type"], (typeof sourceTypes)[number]>;

  async function loadSources() {
    const [sourceResponse, storageResponse, hierarchyResponse] = await Promise.all([
      fetch("/api/data-sources"),
      fetch("/api/storage"),
      fetch("/api/storage/hierarchy"),
    ]);
    if (sourceResponse.ok) setSources(await sourceResponse.json());
    if (storageResponse.ok) {
      const storage = (await storageResponse.json()) as { endpoint: string };
      setStoragePath(storage.endpoint);
    }
    if (hierarchyResponse.ok) setStandardCategories((await hierarchyResponse.json()).categories || []);
  }
  useEffect(() => {
    loadSources().catch(() => setMessage("无法读取数据源，请检查 API 服务"));
  }, []);

  async function browseDirectory(path?: string) {
    setDirectoryError("");
    if (!path) {
      const response = await fetch("/api/filesystem/roots");
      if (!response.ok) {
        setDirectoryError("无法读取磁盘列表");
        return;
      }
      const result = (await response.json()) as { items: string[] };
      setDirectoryRoots(result.items);
      setDirectoryPath("");
      setDirectoryParent(null);
      setDirectoryEntries([]);
      return;
    }
    const response = await fetch(
      `/api/filesystem/directories?path=${encodeURIComponent(path)}`,
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDirectoryError(result.detail || "无法读取目录");
      return;
    }
    setDirectoryPath(result.path);
    setDirectoryParent(result.parent);
    setDirectoryEntries(result.items);
  }

  async function openDirectoryBrowser() {
    setDirectoryOpen(true);
    await browseDirectory(endpoint || undefined);
  }

  async function saveSource() {
    if (!name.trim() || !endpoint.trim()) {
      setMessage("请填写数据源名称和连接地址");
      return;
    }
    setBusy("create");
    const response = await fetch("/api/data-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        type: sourceType,
        endpoint: endpoint.trim(),
        read_only: true,
        options: {
          ...(bucket && { bucket }),
          ...(prefix && { prefix }),
          ...(collection && { collection }),
          ...(credentialProfile && { credential_profile: credentialProfile }),
        },
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setMessage(error.detail || "数据源保存失败");
      setBusy(undefined);
      return;
    }
    setAddOpen(false);
    setName("");
    setEndpoint("");
    setBucket("");
    setPrefix("");
    setCollection("");
    setCredentialProfile("");
    setMessage("数据源已注册，原始数据未被复制或修改");
    await loadSources();
    setBusy(undefined);
  }

  async function syncSource(source: ManagedSource) {
    setBusy(source.id);
    setMessage("");
    const response = await fetch(`/api/data-sources/${source.id}/sync`, {
      method: "POST",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result.detail || "同步失败");
    else {
      setMessage(`索引完成：${result.asset_count} 个图像资产`);
      await loadSources();
    }
    setBusy(undefined);
  }

  async function deleteSource(source: ManagedSource) {
    if (!window.confirm(`删除数据源“${source.name}”及其索引？原目录和标准资产不会被删除。`)) return;
    setBusy(source.id);
    setMessage("");
    const response = await fetch(`/api/data-sources/${source.id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.detail || "删除数据源失败");
    } else {
      setMessage("数据源及其索引已删除；原目录和标准资产保持不变");
      await loadSources();
    }
    setBusy(undefined);
  }

  const filteredSources = sources.filter((source) =>
    `${source.name} ${source.endpoint} ${source.type}`
      .toLowerCase()
      .includes(searchSource.toLowerCase()),
  );
  const actionLabel = (type: ManagedSource["type"]) =>
    type === "local" ? "建立索引" : type === "oss" || type === "minio" ? "同步" : "读取";
  const statusLabel = (source: ManagedSource) => {
    if (!source.last_sync_at) return "待同步";
    if (source.status === "offline") return "不可访问";
    if (source.status === "warning") return "需要检查";
    return source.type === "local" ? "已索引" : "已同步";
  };
  return (
    <div className="stack">
      <section className="management-hero">
        <div>
          <small>数据中心入口</small>
          <h2>统一管理原始数据与标准数据</h2>
          <p>
            数据源以索引关联为主，人工标注 XML 可在图像旁原位维护；整理后的核心资产写入标准目录。
          </p>
        </div>
        <button className="btn primary" onClick={() => setAddOpen(true)}>
          <Plus size={14} />
          添加数据源
        </button>
      </section>
      <section className="data-boundary">
        <article>
          <i>
            <LockKeyhole size={18} />
          </i>
          <span>
            <small>原始数据源 · 索引接入</small>
            <strong>本地目录 / OSS / MinIO / Redis / MongoDB</strong>
            <em>读取文件、对象或图像链接；本地图像允许维护同名 XML</em>
          </span>
        </article>
        <ArrowRight size={18} />
        <article>
          <i>
            <TableProperties size={18} />
          </i>
          <span>
            <small>平台管理信息</small>
            <strong>索引、映射、版本、配置、处理记录</strong>
            <em>记录数据如何被理解、使用和处理</em>
          </span>
        </article>
        <ArrowRight size={18} />
        <article>
          <i>
            <HardDrive size={18} />
          </i>
          <span>
            <small>标准数据存储</small>
            <strong>{storagePath}</strong>
            <em>当前使用本地目录，后续可扩展其他存储</em>
          </span>
        </article>
      </section>
      <section className="management-layout">
        <main className="source-registry">
          <header>
            <span>
              <small>来源连接</small>
              <h3>数据源</h3>
            </span>
            <div>
              <label>
                <Search size={14} />
                <input
                  placeholder="搜索数据源"
                  value={searchSource}
                  onChange={(event) => setSearchSource(event.target.value)}
                />
              </label>
              <button className="btn" onClick={() => loadSources()}>
                <RefreshCw size={13} />
                刷新列表
              </button>
            </div>
          </header>
          {message && <div className="source-message">{message}</div>}
          {filteredSources.length === 0 && (
            <div className="source-empty">
              <Database size={20} />
              <b>还没有注册数据源</b>
              <span>添加只保存连接和映射配置，不会导入原始数据。</span>
            </div>
          )}
          {filteredSources.map((source, i) => {
            const Icon = typeInfo[source.type].Icon;
            return (
            <article key={source.id}>
              <i className={`registry-icon r${i}`}>
                <Icon size={17} />
              </i>
              <span>
                <strong>{source.name}</strong>
                <small>{source.endpoint}</small>
                <em>
                  {source.asset_count
                    ? `${source.asset_count.toLocaleString()} 个已关联资产`
                    : "仅保存连接配置 · 原数据只读"}
                </em>
              </span>
              <b>{typeInfo[source.type].label}</b>
              <div>
                <i className={busy === source.id ? "syncing" : ""} />
                {busy === source.id ? "处理中" : statusLabel(source)}
              </div>
              <div className="source-actions">
                <button disabled={Boolean(busy)} title={actionLabel(source.type)} onClick={() => syncSource(source)}><RefreshCw size={13} /></button>
                <button disabled={Boolean(busy)} className="danger" title="删除数据源" onClick={() => deleteSource(source)}><Trash2 size={13} /></button>
              </div>
            </article>
          )})}
        </main>
        <aside className="storage-panel">
          <header>
            <small>受管存储</small>
            <h3>标准数据位置</h3>
          </header>
          <div className="storage-main">
            <i>
              <HardDrive size={20} />
            </i>
            <span>
              <strong>本地标准数据目录</strong>
              <code>{storagePath}</code>
            </span>
            <em>默认</em>
          </div>
          <dl>
            <div>
              <dt>存储内容</dt>
              <dd>标准图像、标注与处理产出</dd>
            </div>
            <div>
              <dt>目录规则</dt>
              <dd>大类 / 分支 / 版本</dd>
            </div>
            <div>
              <dt>占用空间</dt>
              <dd>70.4 GB / 200 GB</dd>
            </div>
          </dl>
          <div className="storage-meter">
            <i>
              <b style={{ width: "35%" }} />
            </i>
            <span>35%</span>
          </div>
          <div className="storage-settings-note"><Settings size={12} />在系统设置中修改存储位置</div>
          <footer>
            <CircleAlert size={13} />
            <span>
              这里只存储标准化或处理后的数据，原始数据仍保留在来源中。
            </span>
          </footer>
        </aside>
      </section>
      <section className="source-registry dataset-registry">
        <header><span><small>核心标准目录</small><h3>数据集</h3></span><div><button className="btn" onClick={() => loadSources()}><RefreshCw size={13} />刷新数据集</button></div></header>
        {!standardCategories.length && <div className="source-empty"><Archive size={20} /><b>还没有标准数据集</b><span>完成数据同步后，将按类型、分支和版本在这里登记。</span></div>}
        {standardCategories.map((item, index) => {
          const versionCount = new Set(item.branches.flatMap((branch) => branch.versions.map((version) => version.name))).size;
          return <article key={item.name}>
            <i className={`registry-icon r${index % 5}`}><Archive size={17} /></i>
            <span><strong>{item.name}</strong><small>{storagePath}\{item.name}</small><em>标准目录中的整合数据，不依赖原数据源记录</em></span>
            <b>{item.branches.length} 个分支</b>
            <div><i />{item.count.toLocaleString()} 组</div>
            <div>{versionCount} 个版本</div>
          </article>;
        })}
      </section>
      {addOpen && (
        <div className="import-backdrop" onMouseDown={() => setAddOpen(false)}>
          <section
            className="source-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <span>
                <small>只读接入</small>
                <h2>添加数据源</h2>
                <p>相同连接位置会复用已有记录，避免重复来源。</p>
              </span>
              <button onClick={() => setAddOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="source-types">
              {sourceTypes.map(({ id, label, Icon }) => (
                <button
                  className={sourceType === id ? "active" : ""}
                  onClick={() => {
                    setSourceType(id);
                    setEndpoint("");
                  }}
                  key={id}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="source-form">
              <label>
                <span>数据源名称</span>
                <input
                  placeholder="例如：几何图像样本库"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <span>
                  {sourceType === "local"
                    ? "本地目录"
                    : sourceType === "redis" || sourceType === "mongodb"
                      ? "连接地址"
                      : "服务地址"}
                </span>
                <div>
                  <input
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    placeholder={
                      sourceType === "local"
                        ? "D:\\data\\images"
                        : sourceType === "redis"
                          ? "redis://127.0.0.1:6379/0"
                          : sourceType === "mongodb"
                            ? "mongodb://127.0.0.1:27017/database"
                            : "https://对象存储服务地址"
                    }
                  />
                  {sourceType === "local" && (
                    <button
                      type="button"
                      className="btn"
                      onClick={openDirectoryBrowser}
                    >
                      <Folder size={13} />
                      浏览
                    </button>
                  )}
                </div>
              </label>
              {(sourceType === "oss" || sourceType === "minio") && (
                <>
                  <label>
                    <span>Bucket</span>
                    <input
                      value={bucket}
                      onChange={(event) => setBucket(event.target.value)}
                      placeholder="图像所在 Bucket"
                    />
                  </label>
                  <label>
                    <span>对象前缀（可选）</span>
                    <input
                      value={prefix}
                      onChange={(event) => setPrefix(event.target.value)}
                      placeholder="例如 raw/geometry/"
                    />
                  </label>
                  <label>
                    <span>凭证配置标识（可选）</span>
                    <input
                      value={credentialProfile}
                      onChange={(event) => setCredentialProfile(event.target.value)}
                      placeholder="引用服务端凭证，不在页面保存密钥"
                    />
                  </label>
                </>
              )}
              {(sourceType === "redis" || sourceType === "mongodb") && (
                <label>
                  <span>{sourceType === "redis" ? "键匹配规则" : "Collection"}</span>
                  <input
                    value={collection}
                    onChange={(event) => setCollection(event.target.value)}
                    placeholder={sourceType === "redis" ? "例如 vision:*" : "例如 image_records"}
                  />
                </label>
              )}
              <label className="readonly-check">
                <input type="checkbox" defaultChecked />
                <span>
                  <b>索引接入</b>
                  <small>不移动图像；人工标注可维护同目录 XML</small>
                </span>
              </label>
            </div>
            <footer>
              <button className="btn" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={busy === "create"}
                onClick={saveSource}
              >
                {busy === "create" ? "保存中..." : "保存数据源"}
              </button>
            </footer>
          </section>
          {directoryOpen && (
            <section
              className="directory-dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <span>
                  <small>服务端文件系统</small>
                  <h2>选择本地目录</h2>
                  <p>{directoryPath || "选择磁盘"}</p>
                </span>
                <button type="button" onClick={() => setDirectoryOpen(false)}>
                  <X size={16} />
                </button>
              </header>
              <div className="directory-toolbar">
                <button
                  type="button"
                  className="btn"
                  disabled={!directoryPath}
                  onClick={() => browseDirectory()}
                >
                  磁盘
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!directoryParent}
                  onClick={() => directoryParent && browseDirectory(directoryParent)}
                >
                  <ChevronLeft size={13} />
                  上一级
                </button>
                <code>{directoryPath || "此电脑"}</code>
              </div>
              {directoryError && <div className="directory-error">{directoryError}</div>}
              <div className="directory-list">
                {!directoryPath &&
                  directoryRoots.map((root) => (
                    <button type="button" key={root} onClick={() => browseDirectory(root)}>
                      <HardDrive size={17} />
                      <span>{root}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                {directoryPath && directoryEntries.length === 0 && (
                  <div className="directory-empty">当前目录没有子文件夹</div>
                )}
                {directoryEntries.map((entry) => (
                  <button type="button" key={entry.path} onClick={() => browseDirectory(entry.path)}>
                    <Folder size={17} />
                    <span>{entry.name}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              <footer>
                <span>仅选择目录，不会上传或修改其中的文件。</span>
                <button type="button" className="btn" onClick={() => setDirectoryOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!directoryPath}
                  onClick={() => {
                    setEndpoint(directoryPath);
                    setDirectoryOpen(false);
                  }}
                >
                  选择此目录
                </button>
              </footer>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ManagedStorageBrowser({ assets, total, annotationCount, selectedId, onSelect, onRefresh, storagePath }: {
  assets: IndexedAsset[];
  total: number;
  annotationCount: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  storagePath: string;
}) {
  type StorageHierarchy = { image_count: number; group_count: number; annotation_count: number; categories: { name: string; count: number; branches: { name: string; count: number; versions: { name: string; count: number }[] }[] }[] };
  const [hierarchy, setHierarchy] = useState<StorageHierarchy | null>(null);
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState("");
  const [version, setVersion] = useState("");
  const [search, setSearch] = useState("");
  const [strategy, setStrategy] = useState<"primary" | "groups" | "annotated">("primary");
  const [page, setPage] = useState(0);
  const [displayAssets, setDisplayAssets] = useState(assets);
  const [displayTotal, setDisplayTotal] = useState(total);
  const [branchGroups, setBranchGroups] = useState<{ branch: string; total: number; items: IndexedAsset[] }[]>([]);
  const [versionGroups, setVersionGroups] = useState<{ version: string; total: number; items: IndexedAsset[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [previewLimit, setPreviewLimit] = useState(8);
  const browserRef = useRef<HTMLElement>(null);
  const pageSize = 36;
  const contentUrl = (path: string) => `/api/storage/content?path=${encodeURIComponent(path)}`;
  const categoryInfo = hierarchy?.categories.find((item) => item.name === category);
  const branchInfo = categoryInfo?.branches.find((item) => item.name === branch);
  const visibleAssets = category && !branch ? branchGroups.flatMap((group) => group.items) : branch && !version ? versionGroups.flatMap((group) => group.items) : displayAssets;
  const selected = visibleAssets.find((asset) => asset.id === selectedId) || visibleAssets[0];
  useEffect(() => {
    Object.assign(managedDataViewSession, { category, branch, version, selectedAssetId: selected?.id || "" });
  }, [category, branch, version, selected?.id]);

  async function refreshHierarchy(force = false) {
    const response = await fetch(`/api/storage/hierarchy${force ? "?refresh=true" : ""}`);
    if (response.ok) setHierarchy(await response.json());
  }

  useEffect(() => { refreshHierarchy(); }, [storagePath]);
  useEffect(() => {
    const browser = browserRef.current;
    if (!browser) return;
    const updatePreviewLimit = () => {
      const availableWidth = Math.max(168, browser.clientWidth - 328);
      const columns = Math.max(1, Math.min(20, Math.floor((availableWidth + 10) / 178)));
      setPreviewLimit(columns);
    };
    updatePreviewLimit();
    const observer = new ResizeObserver(updatePreviewLimit);
    observer.observe(browser);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!category) {
      setDisplayAssets([]); setBranchGroups([]); setVersionGroups([]); setDisplayTotal(0);
      onSelect(""); setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    let url: string;
    if (category && !branch) {
      const params = new URLSearchParams({ category, limit_per_branch: String(previewLimit) });
      if (search) params.set("search", search);
      if (strategy === "annotated") params.set("annotated_only", "true");
      url = `/api/storage/branch-previews?${params}`;
    } else if (branch && !version) {
      const params = new URLSearchParams({ category, branch, limit_per_version: String(previewLimit) });
      if (search) params.set("search", search);
      if (strategy === "annotated") params.set("annotated_only", "true");
      url = `/api/storage/version-previews?${params}`;
    } else {
      const params = new URLSearchParams({ skip: String(page * pageSize), limit: String(pageSize) });
      if (category) params.set("category", category);
      if (branch) params.set("branch", branch);
      if (version) params.set("version", version);
      if (search) params.set("search", search);
      if (strategy === "annotated") params.set("annotated_only", "true");
      url = `/api/storage/assets?${params}`;
    }
    fetch(url, { signal: controller.signal }).then((response) => response.json()).then((result) => {
      if (category && !branch) {
        setBranchGroups(result.items || []); setVersionGroups([]); setDisplayAssets([]);
        setDisplayTotal((result.items || []).reduce((sum: number, group: { total: number }) => sum + group.total, 0));
        const items = (result.items || []).flatMap((group: { items: IndexedAsset[] }) => group.items);
        onSelect(items[0]?.id || "");
      } else if (branch && !version) {
        setVersionGroups(result.items || []); setBranchGroups([]); setDisplayAssets([]);
        setDisplayTotal((result.items || []).reduce((sum: number, group: { total: number }) => sum + group.total, 0));
        const items = (result.items || []).flatMap((group: { items: IndexedAsset[] }) => group.items);
        onSelect(items[0]?.id || "");
      } else {
        setDisplayAssets(result.items || []); setDisplayTotal(result.total || 0); setBranchGroups([]); setVersionGroups([]);
        onSelect((result.items || [])[0]?.id || "");
      }
    }).catch((error) => { if (error.name !== "AbortError") setDisplayAssets([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, branch, version, search, strategy, page, storagePath, refreshSequence, previewLimit]);

  const annotationColor = (label: string) => ["#e34f62", "#238bcb", "#dc8a16", "#6f55c7", "#1c9772"][Math.abs(Number.parseInt(label, 10) || 0) % 5];
  const annotationBoxes = (asset: IndexedAsset) => asset.xml?.image_width && asset.xml.image_height ? (asset.xml.objects || []).map((object) => ({
    ...object,
    left: (object.xmin / asset.xml!.image_width!) * 100,
    top: (object.ymin / asset.xml!.image_height!) * 100,
    width: ((object.xmax - object.xmin) / asset.xml!.image_width!) * 100,
    height: ((object.ymax - object.ymin) / asset.xml!.image_height!) * 100,
  })) : [];
  const assetCard = (asset: IndexedAsset) => <button className={`${selected?.id === asset.id ? "selected" : ""} ${strategy === "groups" ? "group-card" : ""} ${strategy === "annotated" ? "annotated-card" : ""}`.trim()} onClick={() => onSelect(asset.id)} key={asset.id}>
    <div className="asset-card-visual" style={strategy === "annotated" && asset.xml?.image_width && asset.xml.image_height ? { aspectRatio: `${asset.xml.image_width} / ${asset.xml.image_height}` } : undefined}>
      {strategy === "groups" ? <div className="group-card-preview"><div className="group-primary"><img src={contentUrl(asset.relative_path)} loading="lazy" /><span>主图</span></div><div className="group-companions">{asset.companion_images.slice(0, 3).map((path, index) => <img src={contentUrl(path)} loading="lazy" alt={`关联小图 ${index + 1}`} key={path} />)}{!asset.companion_images.length && <small>无关联小图</small>}{asset.companion_images.length > 3 && <b>+{asset.companion_images.length - 3}</b>}</div></div> : <><img src={contentUrl(asset.relative_path)} loading="lazy" /><span>{strategy === "annotated" ? "标注预览" : "原图"}</span>{strategy === "annotated" && <div className="card-annotations">{annotationBoxes(asset).map((box) => <i className="card-annotation-box" style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, borderColor: annotationColor(box.label), color: annotationColor(box.label) }} key={box.id}><b>{box.label}</b></i>)}</div>}</>}
      {asset.xml && <em>{strategy === "annotated" ? `${asset.xml.object_count} 个目标` : "XML"}</em>}
    </div>
    <strong>{asset.filename}</strong><small>{asset.companion_images.length} 张小图 · {asset.xml ? `${asset.xml.object_count} 个目标` : "未标注"}</small>
  </button>;

  return <section className="managed-browser" ref={browserRef}>
    <header>
      <span><small>核心标准目录</small><h3>标准图像与标注文档</h3><p>{storagePath}</p></span>
      <div><em>{hierarchy?.group_count ?? total} 个数据组</em><em>{hierarchy?.annotation_count ?? annotationCount} 份 XML</em><button className="btn" onClick={async () => { onRefresh(); await refreshHierarchy(true); setRefreshSequence((value) => value + 1); }}><RefreshCw size={13} />刷新</button></div>
    </header>
    <div className="managed-toolbar">
      <label><span>类型</span><SearchableSelect ariaLabel="标准目录类型" value={category} placeholder="全部类型" emptyLabel="全部类型" options={(hierarchy?.categories || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})` }))} onChange={(value) => { setCategory(value); setBranch(""); setVersion(""); setPage(0); }} /></label>
      <label><span>分支</span><SearchableSelect ariaLabel="标准目录分支" value={branch} disabled={!category} placeholder={category ? "全部分支" : "请先选择类型"} emptyLabel="全部分支" options={(categoryInfo?.branches || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})` }))} onChange={(value) => { setBranch(value); setVersion(""); setPage(0); }} /></label>
      <label><span>版本</span><SearchableSelect ariaLabel="标准目录版本" value={version} disabled={!branch} placeholder={branch ? "全部版本" : "请先选择分支"} emptyLabel="全部版本" options={(branchInfo?.versions || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})` }))} onChange={(value) => { setVersion(value); setPage(0); }} /></label>
      <label className="managed-search"><span>搜索当前标准层级</span><div><Search size={13} /><input disabled={!category} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={category ? "文件名或标准路径" : "请先选择类型"} /></div></label>
    </div>
    <section className="display-policy managed-display-policy">
      <span><small>数据展示策略</small><b>原数据为主，关联信息随主图展示</b></span>
      <div>{[["primary", "原图"], ["groups", "数据组"], ["annotated", "标注"]].map(([id, label]) => <button className={strategy === id ? "active" : ""} onClick={() => { setStrategy(id as typeof strategy); setPage(0); }} key={id}>{label}</button>)}</div>
      <p>{strategy === "primary" && "仅按正常顺序浏览主图，关联信息保留在详情中。"}{strategy === "groups" && "以主图为一组，在卡片内组合展示关联小图。"}{strategy === "annotated" && "仅展示存在 XML 的主图，并直接叠加目标框与类别。"}</p>
    </section>
    {!category ? <div className="managed-empty"><Archive size={22} /><b>先选择标准数据类型</b><span>未选择时不读取、不展示标准目录中的图像。</span></div> : !loading && !visibleAssets.length ? <div className="managed-empty"><Archive size={22} /><b>当前标准层级暂无图像</b><span>同步后的标准资产会按类型、分支和版本统一展示。</span></div> : <div className="managed-browser-body">
      <div className={(category && !branch) || (branch && !version) ? "managed-groups" : "managed-grid"}>
        {loading && <div className="browser-loading"><RefreshCw className="spin" />正在读取标准目录</div>}
        {!loading && category && !branch && branchGroups.map((group) => <section className="managed-group" key={group.branch}><header><span><small>分支</small><b>{group.branch}</b><em>{group.total} 个数据组 · 当前预览 {group.items.length} 组</em></span><button onClick={() => setBranch(group.branch)}>进入分支 <ChevronRight size={13} /></button></header><div className="managed-grid">{group.items.map(assetCard)}</div></section>)}
        {!loading && branch && !version && versionGroups.map((group) => <section className="managed-group" key={group.version}><header><span><small>版本</small><b>{group.version}</b><em>{group.total} 个数据组 · 当前预览 {group.items.length} 组</em></span><button onClick={() => setVersion(group.version)}>查看全部 <ChevronRight size={13} /></button></header><div className="managed-grid">{group.items.map(assetCard)}</div></section>)}
        {!loading && version && displayAssets.map(assetCard)}
      </div>
      <aside>
        {selected && <><div className="managed-preview"><img src={contentUrl(selected.relative_path)} /></div><h4>{selected.filename}</h4><dl>
          <div><dt>标准路径</dt><dd>{selected.relative_path}</dd></div>
          <div><dt>分类层级</dt><dd>{selected.hierarchy.join(" / ") || "根级"}</dd></div>
          <div><dt>XML 标注</dt><dd>{selected.xml ? `${selected.xml.object_count} 个目标` : "暂无标注"}</dd></div>
          <div><dt>类别</dt><dd>{selected.xml ? Object.keys(selected.xml.classes).join("、") || "无目标" : "—"}</dd></div>
        </dl>{selected.companion_images.length > 0 && <div className="managed-companions"><b>关联小图 · {selected.companion_images.length}</b><div>{selected.companion_images.map((path) => <img src={contentUrl(path)} title={path} key={path} />)}</div></div>}<p><CircleCheck size={12} />资产按标准相对路径唯一管理，不依赖原数据源记录。</p></>}
      </aside>
    </div>}
    {version && displayTotal > pageSize && <footer className="managed-pagination"><span>共 {displayTotal} 个标准数据组</span><div><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={13} /></button><b>{page + 1}</b><button disabled={(page + 1) * pageSize >= displayTotal} onClick={() => setPage((value) => value + 1)}><ChevronRight size={13} /></button></div></footer>}
  </section>;
}

function DatasetManagement() {
  const [storagePath, setStoragePath] = useState("D:\\VisPraxis\\managed-data");
  const [selectedId, setSelectedId] = useState("");
  async function loadStorage() {
    const response = await fetch("/api/storage");
    if (response.ok) setStoragePath((await response.json()).endpoint);
  }
  useEffect(() => { loadStorage(); }, []);
  return <div className="stack dataset-management-page">
    <section className="source-bar dataset-management-bar">
      <div><i><Archive size={18} /></i><span><small>所有标准数据</small><strong>数据集管理</strong><code>{storagePath}</code></span></div>
      <div className="source-stats"><span><b>类型</b><small>标准大类</small></span><span><b>分支</b><small>具体任务</small></span><span><b>版本</b><small>标准版本</small></span></div>
    </section>
    <ManagedStorageBrowser assets={[]} total={0} annotationCount={0} selectedId={selectedId} onSelect={setSelectedId} onRefresh={loadStorage} storagePath={storagePath} />
  </div>;
}

function ImageDataCenter({ page }: { page: number }) {
  const visitedPages = useRef(new Set<number>());
  visitedPages.current.add(page);
  const persistentPages = [
    DataManagement,
    IndexedImageBrowser,
    ImportExport,
    DatasetManagement,
    ManualAnnotation,
    ToolLibrary,
  ];

  return <div className="data-center-pages">
    {persistentPages.map((Page, index) => visitedPages.current.has(index) && (
      <div className="data-center-tab-panel" hidden={page !== index} key={index}>
        {index === 4 ? <ManualAnnotation active={page === 4} /> : <Page />}
      </div>
    ))}
  </div>;
}

function LegacyImageDataCenter({ page }: { page: number }) {
  const [selected, setSelected] = useState(0);
  const samples = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    original: `/samples/geometry-matching/${i}.jpg`,
    name: `${i}.jpg`,
    objects: i % 3 === 0 ? 2 : 3,
  }));
  if (page === 0) return <DataManagement />;
  if (page === 2) return <ImportExport />;
  if (page === 3) return <DatasetManagement />;
  if (page === 4) return <ManualAnnotation />;
  if (page === 5) return <ToolLibrary />;
  if (page === 1) return <IndexedImageBrowser />;
  const item = samples[selected];
  return (
    <div className="data-center-page">
      <section className="source-bar">
        <div>
          <i>
            <Folder size={18} />
          </i>
          <span>
            <small>当前本地数据源</small>
            <strong>visionengine_geometry</strong>
            <code>D:\yl\desktop\test\visionengine\visionengine_geometry</code>
          </span>
        </div>
        <div className="source-stats">
          <span>
            <b>visionengine_geometry</b>
            <small>大类</small>
          </span>
          <span>
            <b>click_the_two_matching_shapes</b>
            <small>分支</small>
          </span>
          <span>
            <b>20261109</b>
            <small>版本</small>
          </span>
        </div>
        <button className="btn">
          <Settings size={14} />
          配置数据源
        </button>
      </section>
      <section className="browser-toolbar">
        <div className="path-crumb">
          <FolderTree size={15} />
          <span>visionengine_geometry</span>
          <ChevronRight size={12} />
          <span>click_the_two_matching_shapes</span>
          <ChevronRight size={12} />
          <b>20261109</b>
        </div>
        <label>
          <Search size={14} />
          <input placeholder="搜索文件名、任务或样本 ID" />
        </label>
        <div className="view-switch">
          <button className="active" title="缩略图">
            <Grid2X2 size={15} />
          </button>
          <button title="列表">
            <List size={15} />
          </button>
        </div>
      </section>
      <div className="asset-layout">
        <section className="asset-grid">
          {samples.map((s, i) => (
            <button
              className={selected === i ? "selected" : ""}
              onClick={() => setSelected(i)}
              key={s.id}
            >
              <div>
                <img src={s.original} />
                <span>大图</span>
                {selected === i && (
                  <i>
                    <Check size={12} />
                  </i>
                )}
              </div>
              <strong>{s.name}</strong>
              <small>大图 + XML · {s.objects} 个目标</small>
            </button>
          ))}
        </section>
        <aside className="asset-inspector">
          <header>
            <span>
              <small>样本详情</small>
              <h3>{item.name}</h3>
            </span>
            <button>
              <X size={15} />
            </button>
          </header>
          <div className="asset-preview">
            <img src={item.original} />
          </div>
          <dl>
            <div>
              <dt>组合类型</dt>
              <dd>
                <span className="role-tag">大图 + XML</span>
              </dd>
            </div>
            <div>
              <dt>大类 / 分支</dt>
              <dd>geometry / matching_shapes</dd>
            </div>
            <div>
              <dt>参考标注</dt>
              <dd>{item.id}.xml · 已处理数据</dd>
            </div>
            <div>
              <dt>目标规则</dt>
              <dd>0 = 普通目标 · 1 = 关键目标</dd>
            </div>
            <div>
              <dt>标准化状态</dt>
              <dd className="ok">
                <CircleCheck size={12} />
                主体与标注已关联
              </dd>
            </div>
          </dl>
          <div className="paired-preview xml-preview">
            <span>
              <small>XML 解析结果</small>
              <b>{item.id}.xml</b>
            </span>
            <code>
              class 0 · {item.objects - 1}
              <br />
              class 1 · 1
            </code>
          </div>
          <footer>
            <button className="btn">查看原文件</button>
            <button className="btn primary">加入处理</button>
          </footer>
        </aside>
      </div>
      <section className="pagination">
        <span>第 1–8 项，当前批次共 28 个样本</span>
        <div>
          <button disabled>
            <ChevronLeft size={14} />
          </button>
          <button className="active">1</button>
          <button>2</button>
          <button>3</button>
          <button>4</button>
          <button>
            <ChevronRight size={14} />
          </button>
        </div>
        <select defaultValue="8">
          <option>8 条 / 页</option>
          <option>24 条 / 页</option>
        </select>
      </section>
      <DatasetInfo />
    </div>
  );
}

type IndexedAsset = {
  id: string;
  source_id: string;
  relative_path: string;
  filename: string;
  size_bytes: number;
  modified_at: string;
  group_key: string;
  role: "primary" | "companion";
  primary_relative_path: string | null;
  hierarchy: string[];
  companion_images: string[];
  xml: null | {
    path: string;
    object_count: number;
    classes: Record<string, number>;
    image_width?: number | null;
    image_height?: number | null;
    objects?: { id: string; label: string; xmin: number; ymin: number; xmax: number; ymax: number }[];
  };
};

type DataViewSession = {
  sourceId: string;
  category: string;
  branch: string;
  version: string;
  statuses: string[];
  selectedAssetId: string;
  strategy: "primary" | "groups" | "annotated";
  search: string;
  page: number;
};

const dataViewSession: DataViewSession = {
  sourceId: "",
  category: "",
  branch: "",
  version: "",
  statuses: [],
  selectedAssetId: "",
  strategy: "primary",
  search: "",
  page: 0,
};

const managedDataViewSession = { category: "", branch: "", version: "", selectedAssetId: "" };

type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled = false,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => options.filter((option) =>
    !normalizedQuery || `${option.label} ${option.keywords || ""}`.toLowerCase().includes(normalizedQuery),
  ), [options, normalizedQuery]);
  const optionLimit = normalizedQuery ? 80 : 40;
  const visibleOptions = filteredOptions.slice(0, optionLimit);
  const displayValue = open ? query : selectedOption?.label || "";

  function select(nextValue: string) {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  }

  useEffect(() => {
    if (disabled) { setOpen(false); setQuery(""); }
  }, [disabled]);

  function openAndFocus() {
    if (disabled) return;
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div
      className={`filter-select ${open ? "open" : ""} ${className}`.trim()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          openAndFocus();
        }
      }}
    >
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setQuery(""); setOpen(false); inputRef.current?.blur(); }
          if (event.key === "Enter" && filteredOptions.length === 1) { event.preventDefault(); select(filteredOptions[0].value); }
        }}
        onBlur={() => window.setTimeout(() => { setQuery(""); setOpen(false); }, 120)}
      />
      <button
        type="button"
        className="filter-select-toggle"
        aria-label={`${ariaLabel}选项`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (open) { setQuery(""); setOpen(false); inputRef.current?.blur(); } else openAndFocus(); }}
      ><ChevronRight className="filter-select-chevron" size={13} /></button>
      {open && <div className="filter-select-menu" role="listbox">
        {emptyLabel && !normalizedQuery && <button type="button" className={!value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => select("")}><span>{emptyLabel}</span>{!value && <Check size={12} />}</button>}
        {visibleOptions.map((option) => <button type="button" className={option.value === value ? "selected" : ""} role="option" aria-selected={option.value === value} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => select(option.value)}><span>{option.label}</span>{option.value === value && <Check size={12} />}</button>)}
        {filteredOptions.length > visibleOptions.length && <small className="filter-select-more">还有 {filteredOptions.length - visibleOptions.length} 项，请输入关键词缩小范围</small>}
        {!filteredOptions.length && <small>没有匹配项</small>}
      </div>}
    </div>
  );
}

function IndexedImageBrowser() {
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [sourceId, setSourceId] = useState(dataViewSession.sourceId);
  const [category, setCategory] = useState(dataViewSession.category);
  const [branch, setBranch] = useState(dataViewSession.branch);
  const [version, setVersion] = useState(dataViewSession.version);
  const [hierarchyInfo, setHierarchyInfo] = useState<{ type: string; branches: { name: string; count: number; versions: { name: string; count: number }[] }[]; categories?: { name: string; count: number; branches: { name: string; count: number; versions: { name: string; count: number }[] }[] }[]; status_paths: string[]; examples: { type?: string; branch?: string; version?: string }; directory_paths: string[]; dataset_mappings?: unknown[]; hierarchy_analysis?: { summary?: string; provider?: string } } | null>(null);
  const [examples, setExamples] = useState({ type: "", branch: "", version: "" });
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...dataViewSession.statuses]);
  const [statusDraft, setStatusDraft] = useState("");
  const [branchGroups, setBranchGroups] = useState<{ branch: string; total: number; items: IndexedAsset[] }[]>([]);
  const [versionGroups, setVersionGroups] = useState<{ version: string; total: number; items: IndexedAsset[] }[]>([]);
  const [assets, setAssets] = useState<IndexedAsset[]>([]);
  const [selectedId, setSelectedId] = useState(dataViewSession.selectedAssetId);
  const [inspectorPreviewPath, setInspectorPreviewPath] = useState("");
  const [strategy, setStrategy] = useState<"primary" | "groups" | "annotated">(dataViewSession.strategy);
  const [search, setSearch] = useState(dataViewSession.search);
  const [page, setPage] = useState(dataViewSession.page);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzingHierarchy, setAnalyzingHierarchy] = useState(false);
  const [hierarchyMessage, setHierarchyMessage] = useState("");
  const pageSize = 48;

  useEffect(() => {
    Object.assign(dataViewSession, { sourceId, category, branch, version, statuses: [...selectedStatuses], selectedAssetId: selectedId, strategy, search, page });
  }, [sourceId, category, branch, version, selectedStatuses, selectedId, strategy, search, page]);

  useEffect(() => {
    fetch("/api/data-sources")
      .then((response) => response.json())
      .then((items: ManagedSource[]) => {
        const indexed = items.filter((item) => item.asset_count > 0);
        setSources(indexed);
        if (sourceId && !indexed.some((item) => item.id === sourceId)) {
          setSourceId("");
          setCategory("");
          setBranch("");
          setVersion("");
          setSelectedStatuses([]);
        }
      });
  }, [sourceId]);

  useEffect(() => {
    setHierarchyInfo(null);
    setHierarchyMessage("");
    setExamples({ type: "", branch: "", version: "" });
    if (!sourceId) { setAssets([]); setVersionGroups([]); return; }
    const controller = new AbortController();
    fetch(`/api/data-sources/${sourceId}/hierarchy`, { signal: controller.signal }).then((response) => response.json()).then((result) => {
      setHierarchyInfo(result);
      setExamples({ type: result.examples?.type || result.type, branch: result.examples?.branch || "", version: result.examples?.version || "" });
    }).catch((error) => { if (error.name !== "AbortError") setHierarchyInfo(null); });
    return () => controller.abort();
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId || (category && !branch) || (branch && !version)) { setAssets([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ skip: String(page * pageSize), limit: String(pageSize) });
    if (category) params.set("category", category);
    if (branch) params.set("branch", branch);
    if (version) params.set("version", version);
    if (search) params.set("search", search);
    selectedStatuses.forEach((path) => params.append("status_path", path));
    fetch(`/api/data-sources/${sourceId}/assets?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { items: IndexedAsset[]; total: number }) => {
        setAssets(result.items);
        setTotal(result.total);
        setSelectedId((current) =>
          result.items.some((item) => item.id === current) ? current : result.items[0]?.id || "",
        );
      })
      .catch((error) => { if (error.name !== "AbortError") setAssets([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sourceId, category, branch, version, page, search, selectedStatuses]);

  useEffect(() => {
    if (!sourceId || !category || branch || !hierarchyInfo) { setBranchGroups([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ category, limit_per_branch: "10" });
    if (search) params.set("search", search);
    selectedStatuses.forEach((path) => params.append("status_path", path));
    fetch(`/api/data-sources/${sourceId}/branch-previews?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { items: { branch: string; total: number; items: IndexedAsset[] }[] }) => {
        const groups = result.items || [];
        setBranchGroups(groups.filter((group) => group.total > 0));
        const groupedItems = groups.flatMap((group) => group.items);
        setSelectedId((current) => groupedItems.some((item) => item.id === current) ? current : groupedItems[0]?.id || "");
        setTotal(groups.reduce((sum, group) => sum + group.total, 0));
      }).catch((error) => { if (error.name !== "AbortError") setBranchGroups([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sourceId, category, branch, hierarchyInfo, search, selectedStatuses]);

  useEffect(() => {
    if (!sourceId || !branch || version || !hierarchyInfo) { setVersionGroups([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ branch, limit_per_version: "10" });
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    selectedStatuses.forEach((path) => params.append("status_path", path));
    fetch(`/api/data-sources/${sourceId}/version-previews?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { items: { version: string; total: number; items: IndexedAsset[] }[] }) => {
      const groups = result.items;
      setVersionGroups(groups.filter((group) => group.total > 0));
      const groupedItems = groups.flatMap((group) => group.items);
      setSelectedId((current) => groupedItems.some((item) => item.id === current) ? current : groupedItems[0]?.id || "");
      setTotal(groups.reduce((sum, group) => sum + group.total, 0));
    }).catch((error) => { if (error.name !== "AbortError") setVersionGroups([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sourceId, category, branch, version, hierarchyInfo, search, selectedStatuses]);

  const source = sources.find((item) => item.id === sourceId);
  const isCompanion = (asset: IndexedAsset) =>
    asset.role === "companion" || /_[0-9]+\.[^.]+$/i.test(asset.filename);
  const applyStrategy = (items: IndexedAsset[]) => items.filter((asset) => {
    if (strategy === "annotated") return Boolean(asset.xml) && !isCompanion(asset);
    return !isCompanion(asset);
  });
  const visibleAssets = applyStrategy(assets);
  const groupedBranchVisible = branchGroups.map((group) => ({ ...group, items: applyStrategy(group.items) }));
  const groupedVisible = versionGroups.map((group) => ({ ...group, items: applyStrategy(group.items) }));
  const allVisible = category && !branch
    ? groupedBranchVisible.flatMap((group) => group.items)
    : branch && !version ? groupedVisible.flatMap((group) => group.items) : visibleAssets;
  const selected = allVisible.find((item) => item.id === selectedId) || allVisible[0];
  useEffect(() => { setInspectorPreviewPath(""); }, [selected?.id]);
  const strategyLabel = { primary: "原图", groups: "数据组", annotated: "标注图像" }[strategy];
  const contentUrl = (asset: IndexedAsset) =>
    `/api/data-sources/${asset.source_id}/assets/${asset.id}/content`;
  const relatedContentUrl = (asset: IndexedAsset, relativePath: string) =>
    `/api/data-sources/${asset.source_id}/content?path=${encodeURIComponent(relativePath)}`;
  const hierarchy = selected?.hierarchy || [];
  const combination = selected
    ? `${selected.companion_images.length ? `大图 + ${selected.companion_images.length} 张小图` : "只有大图"}${selected.xml ? " + XML" : ""}`
    : "—";
  const categoryInfo = hierarchyInfo?.categories?.find((item) => item.name === category);
  const availableBranches = categoryInfo?.branches || hierarchyInfo?.branches || [];
  const branchInfo = availableBranches.find((item) => item.name === branch);
  async function saveHierarchy(paths = hierarchyInfo?.status_paths || []) {
    await fetch(`/api/data-sources/${sourceId}/hierarchy-config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type_example: examples.type, branch_example: examples.branch, version_example: examples.version, status_paths: paths }) });
    setHierarchyInfo((current) => current ? { ...current, status_paths: paths } : current);
    setSelectedStatuses((current) => current.filter((path) => paths.includes(path)));
  }
  async function analyzeHierarchy() {
    setAnalyzingHierarchy(true); setHierarchyMessage("");
    const response = await fetch(`/api/data-sources/${sourceId}/hierarchy/analyze`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setHierarchyMessage(body.detail || "AI 目录分析失败");
    else {
      const refreshed = await fetch(`/api/data-sources/${sourceId}/hierarchy`).then((result) => result.json());
      setHierarchyInfo(refreshed); setCategory(""); setBranch(""); setVersion(""); setPage(0);
      setHierarchyMessage(`AI 已识别 ${body.dataset_count} 个标准数据集，共生成 ${body.mappings.length} 条目录映射 · ${body.input_image_count} 张图像归并为 ${body.input_directory_count} 个目录，实际送审 ${body.prompt_directory_count} 条`);
    }
    setAnalyzingHierarchy(false);
  }
  const annotationColor = (label: string) => ["#e34f62", "#238bcb", "#dc8a16", "#6f55c7", "#1c9772"][Math.abs(Number.parseInt(label, 10) || 0) % 5];
  const annotationBoxes = (asset: IndexedAsset) => asset.xml?.image_width && asset.xml.image_height
    ? (asset.xml.objects || []).map((object) => ({
      ...object,
      left: (object.xmin / asset.xml!.image_width!) * 100,
      top: (object.ymin / asset.xml!.image_height!) * 100,
      width: ((object.xmax - object.xmin) / asset.xml!.image_width!) * 100,
      height: ((object.ymax - object.ymin) / asset.xml!.image_height!) * 100,
    }))
    : [];
  const annotationAspectRatio = (asset: IndexedAsset) =>
    asset.xml?.image_width && asset.xml.image_height
      ? `${asset.xml.image_width} / ${asset.xml.image_height}`
      : undefined;
  const assetCard = (asset: IndexedAsset) => (
    <button className={`${selected?.id === asset.id ? "selected" : ""} ${strategy === "groups" ? "group-card" : ""} ${strategy === "annotated" ? "annotated-card" : ""}`.trim()} onClick={() => setSelectedId(asset.id)} key={asset.id}>
      <div className="asset-card-visual" style={strategy === "annotated" ? { aspectRatio: annotationAspectRatio(asset) } : undefined}>
        {strategy === "groups" ? <div className="group-card-preview">
          <div className="group-primary"><img src={contentUrl(asset)} loading="lazy" /><span>主图</span></div>
          <div className="group-companions">
            {asset.companion_images.slice(0, 3).map((path, index) => <img src={relatedContentUrl(asset, path)} loading="lazy" alt={`关联小图 ${index + 1}`} key={path} />)}
            {!asset.companion_images.length && <small>无关联小图</small>}
            {asset.companion_images.length > 3 && <b>+{asset.companion_images.length - 3}</b>}
          </div>
        </div> : <>
          <img src={contentUrl(asset)} loading="lazy" />
          <span>{strategy === "annotated" ? "标注预览" : "原图"}</span>
          {strategy === "annotated" && <div className="card-annotations">{annotationBoxes(asset).map((box) => <i className="card-annotation-box" style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, borderColor: annotationColor(box.label), color: annotationColor(box.label) }} key={box.id}><b>{box.label}</b></i>)}</div>}
        </>}
        {asset.xml && <em>{strategy === "annotated" ? `${asset.xml.object_count} 个目标` : "XML"}</em>}{selected?.id === asset.id && <i className="asset-selected"><Check size={12} /></i>}
      </div>
      <strong>{asset.filename}</strong><small>{asset.companion_images.length} 张小图 · {asset.xml ? `${asset.xml.object_count} 个目标` : "未标注"}</small>
    </button>
  );

  return (
    <div className="data-center-page indexed-browser">
      <section className="source-bar">
        <div>
          <i><Folder size={18} /></i>
          <span>
            <small>类型 / 数据集</small><strong>{hierarchyInfo?.type || "尚未选择"}</strong>
            <code>{source?.endpoint || "选择类型后才读取和展示数据"}</code>
          </span>
        </div>
        <div className="source-stats">
          <span><b>{source?.asset_count.toLocaleString() || 0}</b><small>索引资产</small></span>
          <span><b>{allVisible.length}</b><small>当前可见</small></span>
          <span><b>{assets.filter((item) => item.xml).length}</b><small>当前页 XML</small></span>
        </div>
        <SearchableSelect
          className="source-picker"
          ariaLabel="类型 / 数据集"
          value={sourceId}
          placeholder="选择或输入类型 / 数据集"
          options={sources.map((item) => ({ value: item.id, label: item.name, keywords: item.endpoint }))}
          onChange={(nextValue) => { setHierarchyInfo(null); setHierarchyMessage(""); setSourceId(nextValue); setCategory(""); setBranch(""); setVersion(""); setSelectedStatuses([]); setPage(0); }}
        />
      </section>
      {sourceId && hierarchyInfo && <section className="hierarchy-examples">
        <header><span><small>AI 层级分析</small><b>允许同一数据源包含多套类型 / 分支 / 版本规范</b></span><button className="btn" disabled={analyzingHierarchy} onClick={analyzeHierarchy}><WandSparkles size={13} />{analyzingHierarchy ? "分析中..." : "AI 分析目录"}</button></header>
        {hierarchyMessage && <div className="hierarchy-ai-message">{hierarchyMessage}</div>}
        {hierarchyInfo.hierarchy_analysis?.summary && <div className="hierarchy-ai-summary"><CircleCheck size={13} />{hierarchyInfo.hierarchy_analysis.summary}</div>}
        {(["type", "branch", "version"] as const).map((key) => <label key={key}><span>{{ type: "类型示例", branch: "分支示例", version: "版本示例" }[key]}</span><select value={examples[key]} onChange={(event) => setExamples((current) => ({ ...current, [key]: event.target.value }))}><option value="">请选择目录</option>{hierarchyInfo.directory_paths.map((path) => <option value={path} key={`${key}-${path}`}>\{path.replaceAll("/", "\\")}</option>)}</select></label>)}
        <button className="btn primary" disabled={!examples.type || !examples.branch || !examples.version} onClick={() => saveHierarchy()}>保存层级示例</button>
      </section>}
      {sourceId && <section className="hierarchy-control">
        <label className="searchable-select"><span>类型</span><SearchableSelect ariaLabel="类型" value={category} placeholder="全部类型，可输入筛选" emptyLabel="全部类型" options={(hierarchyInfo?.categories || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})`, keywords: item.name }))} onChange={(nextValue) => { setCategory(nextValue); setBranch(""); setVersion(""); setPage(0); }} /></label>
        <label className="searchable-select"><span>分支</span><SearchableSelect ariaLabel="分支" value={branch} disabled={Boolean(hierarchyInfo?.categories?.length) && !category} placeholder={category || !hierarchyInfo?.categories?.length ? "全部分支，可输入筛选" : "请先选择类型"} emptyLabel="全部分支" options={availableBranches.map((item) => ({ value: item.name, label: `${item.name} (${item.count})`, keywords: item.name }))} onChange={(nextValue) => { setBranch(nextValue); setVersion(""); setPage(0); }} /></label>
        <label className="searchable-select"><span>版本</span><SearchableSelect ariaLabel="版本" value={version} disabled={!branch} placeholder={branch ? "全部版本，可输入筛选" : "请先选择分支"} emptyLabel="全部版本" options={(branchInfo?.versions || []).map((item) => ({ value: item.name, label: `${item.name} (${item.count})`, keywords: item.name }))} onChange={(nextValue) => { setVersion(nextValue); setPage(0); }} /></label>
        <div className="status-filter"><span>状态（勾选后只看对应内容）</span><div>{hierarchyInfo?.status_paths.length ? hierarchyInfo.status_paths.map((path) => <label key={path}><input type="checkbox" checked={selectedStatuses.includes(path)} onChange={() => setSelectedStatuses((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path])} /><b>{path}</b><button title="删除状态" onClick={() => saveHierarchy(hierarchyInfo.status_paths.filter((item) => item !== path))}>×</button></label>) : <small>尚未添加状态</small>}</div></div>
        <div className="status-add"><input value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} placeholder="例如 unsolved、test、train" /><button className="btn" disabled={!statusDraft.trim()} onClick={() => { const status = statusDraft.trim().replace(/[\\/]/g, ""); if (status && hierarchyInfo) saveHierarchy([...new Set([...hierarchyInfo.status_paths, status])]); setStatusDraft(""); }}>添加状态</button></div>
      </section>}
      <section className="display-policy">
        <span>
          <small>数据展示策略</small>
          <b>原数据为主，关联信息随主图展示</b>
        </span>
        <div>
          {[
            ["primary", "原图"],
            ["groups", "数据组"],
            ["annotated", "标注"],
          ].map(([id, label]) => (
            <button className={strategy === id ? "active" : ""} onClick={() => { setStrategy(id as typeof strategy); setSearch(""); setPage(0); }} key={id}>
              {label}
            </button>
          ))}
        </div>
        <p>
          {strategy === "primary" && "仅按正常顺序浏览主图，关联信息保留在详情中。"}
          {strategy === "groups" && "以主图为一组，在卡片内组合展示关联小图。"}
          {strategy === "annotated" && "仅展示存在 XML 的主图，并直接叠加目标框与类别。"}
        </p>
      </section>
      <section className="browser-toolbar">
        <div className="path-crumb">
          <FolderTree size={15} />
          <span>{category || hierarchyInfo?.type || "类型"}</span>{branch && <span className="crumb-part"><ChevronRight size={12} /> {branch}</span>}{version && <span className="crumb-part"><ChevronRight size={12} /> {version}</span>}
        </div>
        <label><Search size={14} /><input aria-label={`筛选${strategyLabel}名称`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={`输入名称筛选${strategyLabel}`} /></label>
      </section>
      {!sourceId ? (
        <section className="browser-empty"><ImageIcon size={24} /><b>先选择类型 / 数据集</b><span>未选择时不读取、不展示任何图像。</span></section>
      ) : (
        <div className="asset-layout">
          <section className={(category && !branch) || (branch && !version) ? "version-groups" : "asset-grid"}>
            {loading && <div className="browser-loading"><RefreshCw className="spin" />正在读取索引</div>}
            {!loading && allVisible.length === 0 && <div className="browser-loading">当前层级和状态条件下没有图像</div>}
            {!loading && category && !branch && groupedBranchVisible.map((group) => <section className="version-row branch-row" key={group.branch}><header><span><small>分支</small><b>{group.branch}</b><em>{group.total} 个数据组 · 展示前 {Math.min(10, group.items.length)} 个</em></span><button onClick={() => { setBranch(group.branch); setVersion(""); setPage(0); }}>进入分支 <ChevronRight size={13} /></button></header><div className="asset-grid">{group.items.map(assetCard)}</div></section>)}
            {!loading && branch && !version && groupedVisible.map((group) => <section className="version-row" key={group.version}><header><span><small>版本</small><b>{group.version}</b><em>{group.total} 个数据组 · 展示前 {Math.min(10, group.items.length)} 个</em></span><button onClick={() => { setVersion(group.version); setPage(0); }}>查看全部 <ChevronRight size={13} /></button></header><div className="asset-grid">{group.items.map(assetCard)}</div></section>)}
            {!loading && ((!category && !branch) || version) && visibleAssets.map(assetCard)}
          </section>
          <aside className="asset-inspector">
            <header><span><small>{inspectorPreviewPath ? "关联小图预览" : "原图与关联信息"}</small><h3>{inspectorPreviewPath.split(/[\\/]/).pop() || selected?.filename || "未选择"}</h3></span>{inspectorPreviewPath && <button title="返回原图" onClick={() => setInspectorPreviewPath("")}><ImageIcon size={15} /></button>}</header>
            {selected && <>
              <div className="asset-preview"><img src={inspectorPreviewPath ? relatedContentUrl(selected, inspectorPreviewPath) : contentUrl(selected)} /></div>
              <dl>
                <div><dt>组合类型</dt><dd><span className="role-tag">{combination}</span></dd></div>
                <div><dt>目录层级</dt><dd>{selected.hierarchy.join(" / ") || "根目录"}</dd></div>
                <div><dt>文件大小</dt><dd>{(selected.size_bytes / 1024).toFixed(1)} KB</dd></div>
                <div><dt>XML 标注</dt><dd>{selected.xml ? `${selected.xml.path} · ${selected.xml.object_count} 个目标` : "无"}</dd></div>
                <div><dt>关联状态</dt><dd className="ok"><CircleCheck size={12} />索引只读关联</dd></div>
              </dl>
              {selected.companion_images.length > 0 && <section className="inspector-companions">
                <header><span><small>数据组参考</small><b>关联小图</b></span><em>{selected.companion_images.length}</em></header>
                <div>{selected.companion_images.map((path, index) => <button className={inspectorPreviewPath === path ? "selected" : ""} title={path} onClick={() => setInspectorPreviewPath(path)} key={path}>
                  <img src={relatedContentUrl(selected, path)} loading="lazy" alt={`关联小图 ${index + 1}`} />
                  <span><b>小图 {index + 1}</b><small>{path.split(/[\\/]/).pop()}</small></span>
                </button>)}</div>
              </section>}
              {selected.xml && <div className="paired-preview xml-preview"><span><small>XML 类别统计</small><b>{selected.xml.path}</b></span><code>{Object.entries(selected.xml.classes).map(([key, value]) => `${key}: ${value}`).join(" · ")}</code></div>}
            </>}
          </aside>
        </div>
      )}
      {(!category || version) && sourceId && <section className="pagination">
        <span>第 {total ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, total)} 项，共 {total.toLocaleString()} 个索引资产</span>
        <div>
          <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={14} /></button>
          <button className="active">{page + 1}</button>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></button>
        </div>
      </section>}
    </div>
  );
}

function DatasetInfo() {
  return (
    <section className="dataset-info">
      <header>
        <span>
          <small>图像信息</small>
          <h2>目录与样本结构</h2>
        </span>
        <em>自动识别 · 只读</em>
      </header>
      <div className="hierarchy-strip">
        <span>
          <small>大类</small>
          <b>visionengine_geometry</b>
        </span>
        <ChevronRight size={14} />
        <span>
          <small>分支</small>
          <b>click_the_two_matching_shapes</b>
        </span>
        <ChevronRight size={14} />
        <span>
          <small>版本</small>
          <b>20261109</b>
        </span>
      </div>
      <div className="info-summary">
        <article>
          <small>层级结构</small>
          <strong>大类 / 分支 / 版本</strong>
          <span>目录即版本边界</span>
        </article>
        <article>
          <small>当前版本</small>
          <strong>20261109</strong>
          <span>分支下可并存多个版本</span>
        </article>
        <article>
          <small>样本组合</small>
          <strong>C 型 · 大图 + XML</strong>
          <span>小图允许 0 至多张</span>
        </article>
        <article>
          <small>处理状态</small>
          <strong>已标注</strong>
          <span>XML 表示已处理</span>
        </article>
      </div>
      <div className="info-body">
        <div>
          <h3>组合识别规则</h3>
          <p>
            <b>A</b> 只有大图
          </p>
          <p>
            <b>B</b> 大图 + 小图 × N
          </p>
          <p className="active">
            <b>C</b> 大图 + XML + 小图 × N
          </p>
        </div>
        <div>
          <h3>XML 目标语义</h3>
          <p>
            <b>0</b> 普通目标；缺失时取数量最多的类别
          </p>
          <p>
            <b>1</b> 关键目标；缺失时取数量最少的类别
          </p>
          <p>
            <b>bbox</b> 使用 Pascal VOC 坐标
          </p>
        </div>
        <div>
          <h3>当前版本统计</h3>
          <p>
            <b>28</b> 张大图
          </p>
          <p>
            <b>28</b> 个 XML 标注
          </p>
          <p>
            <b>0</b> 张关联小图 · 0 个异常
          </p>
        </div>
      </div>
    </section>
  );
}

function ManualAnnotation({ active = true }: { active?: boolean }) {
  type AnnotationRect = { id: string; label: number; x: number; y: number; width: number; height: number };
  const [index, setIndex] = useState(0);
  const [annotationAssets, setAnnotationAssets] = useState<IndexedAsset[]>([]);
  const [annotationCategory, setAnnotationCategory] = useState(managedDataViewSession.category);
  const [annotationBranch, setAnnotationBranch] = useState(managedDataViewSession.branch);
  const [annotationVersion, setAnnotationVersion] = useState(managedDataViewSession.version);
  const [annotationHierarchy, setAnnotationHierarchy] = useState<{ categories: { name: string; branches: { name: string; versions: { name: string }[] }[] }[] } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [modelMode, setModelMode] = useState<"none" | "general" | "professional">("none");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editedBoxes, setEditedBoxes] = useState<Record<number, AnnotationRect[]>>({});
  const [savedSamples, setSavedSamples] = useState<number[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [draftBox, setDraftBox] = useState<AnnotationRect | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizeBoxId, setResizeBoxId] = useState("");
  const [hiddenBoxes, setHiddenBoxes] = useState<Record<number, string[]>>({});
  const [lastLabel, setLastLabel] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const currentAsset = annotationAssets[index];
  const sourceBoxes = useMemo<AnnotationRect[]>(() => {
    const xml = currentAsset?.xml;
    const width = xml?.image_width || 0;
    const height = xml?.image_height || 0;
    if (!xml || !width || !height) return [];
    return (xml.objects || []).map((object) => ({
      id: object.id,
      label: Number.parseInt(object.label, 10) || 0,
      x: (object.xmin / width) * 100,
      y: (object.ymin / height) * 100,
      width: ((object.xmax - object.xmin) / width) * 100,
      height: ((object.ymax - object.ymin) / height) * 100,
    }));
  }, [currentAsset]);
  const hasSourceXml = Boolean(currentAsset?.xml);
  const boxes = editedBoxes[index] ?? (hasSourceXml ? sourceBoxes : []);
  const hiddenBoxIds = hiddenBoxes[index] || [];
  const objectCount = boxes.length;
  const hasXml = hasSourceXml || savedSamples.includes(index);
  const modelConfigured = modelMode !== "none";
  const modelLabel = modelMode === "professional"
    ? "geometry-matching-v2"
    : modelMode === "general"
      ? "通用视觉检测模型"
      : "未配置模型";
  const annotationCategoryInfo = annotationHierarchy?.categories.find((item) => item.name === annotationCategory);
  const annotationBranches = annotationCategoryInfo?.branches || [];
  const branchVersions = annotationBranches.find((item) => item.name === annotationBranch)?.versions || [];
  const labelColors = ["#36c979", "#f2a93b", "#3b9eea", "#e45c90", "#9b72e8", "#e16c45", "#42b7b0", "#d4c13b"];
  const boxColor = (label: number) => labelColors[Math.abs(label) % labelColors.length];
  const classOptions = [0, 1];

  useEffect(() => {
    if (!active) return;
    const inherited = managedDataViewSession;
    setAnnotationCategory(inherited.category);
    setAnnotationBranch(inherited.branch);
    setAnnotationVersion(inherited.version);
    const inheritedIndex = annotationAssets.findIndex((asset) => asset.id === inherited.selectedAssetId);
    if (inheritedIndex >= 0) setIndex(inheritedIndex);
  }, [active]);

  useEffect(() => {
    fetch("/api/storage/hierarchy").then((response) => response.json()).then(setAnnotationHierarchy);
  }, []);

  useEffect(() => {
    if (!annotationCategory) { setAnnotationAssets([]); setIndex(0); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "200" });
    params.set("category", annotationCategory);
    if (annotationBranch) params.set("branch", annotationBranch);
    if (annotationVersion) params.set("version", annotationVersion);
    fetch(`/api/storage/assets?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { items: IndexedAsset[] }) => {
        const primaryAssets = result.items;
        setAnnotationAssets(primaryAssets);
        const inheritedAssetId = managedDataViewSession.selectedAssetId;
        const synchronizedIndex = primaryAssets.findIndex((asset) => asset.id === inheritedAssetId);
        setIndex(synchronizedIndex >= 0 ? synchronizedIndex : 0);
        setEditedBoxes({});
        setSavedSamples([]);
      }).catch((error) => { if (error.name !== "AbortError") setAnnotationAssets([]); });
    return () => controller.abort();
  }, [annotationCategory, annotationBranch, annotationVersion]);

  useEffect(() => {
    setSelectedBoxId("");
  }, [index]);

  function addManualObject() {
    const next: AnnotationRect = { id: `box-${Date.now()}`, label: lastLabel, x: 32, y: 30, width: 24, height: 24 };
    setEditedBoxes((current) => ({ ...current, [index]: [...boxes, next] }));
    setSelectedBoxId(next.id);
  }

  function pointInStage(event: React.PointerEvent) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)) };
  }

  function beginDraw(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".bbox")) return;
    const point = pointInStage(event);
    stageRef.current?.setPointerCapture(event.pointerId);
    setSelectedBoxId("");
    setDrawStart(point);
    setDraftBox({ id: `box-${Date.now()}`, label: lastLabel, x: point.x, y: point.y, width: 0, height: 0 });
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const point = pointInStage(event);
    if (resizeBoxId) {
      setEditedBoxes((current) => ({ ...current, [index]: boxes.map((box) => box.id === resizeBoxId ? { ...box, width: Math.max(2, Math.min(100 - box.x, point.x - box.x)), height: Math.max(2, Math.min(100 - box.y, point.y - box.y)) } : box) }));
      return;
    }
    if (dragState) {
      setEditedBoxes((current) => ({ ...current, [index]: boxes.map((box) => box.id === dragState.id ? { ...box, x: Math.max(0, Math.min(100 - box.width, point.x - dragState.offsetX)), y: Math.max(0, Math.min(100 - box.height, point.y - dragState.offsetY)) } : box) }));
      return;
    }
    if (!draftBox || !drawStart) return;
    setDraftBox((current) => current ? { ...current, x: Math.min(drawStart.x, point.x), y: Math.min(drawStart.y, point.y), width: Math.abs(point.x - drawStart.x), height: Math.abs(point.y - drawStart.y) } : null);
  }

  function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
    stageRef.current?.releasePointerCapture(event.pointerId);
    if (draftBox && draftBox.width > 2 && draftBox.height > 2) {
      setEditedBoxes((current) => ({ ...current, [index]: [...boxes, draftBox] }));
      setSelectedBoxId(draftBox.id);
    }
    setDraftBox(null);
    setDrawStart(null);
    setDragState(null);
    setResizeBoxId("");
  }

  function beginMove(event: React.PointerEvent, box: AnnotationRect) {
    event.stopPropagation();
    const point = pointInStage(event);
    stageRef.current?.setPointerCapture(event.pointerId);
    setSelectedBoxId(box.id);
    setDragState({ id: box.id, offsetX: point.x - box.x, offsetY: point.y - box.y });
  }

  function beginResize(event: React.PointerEvent, box: AnnotationRect) {
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    setSelectedBoxId(box.id);
    setResizeBoxId(box.id);
  }

  function updateBoxLabel(boxId: string, label: number) {
    setEditedBoxes((current) => ({
      ...current,
      [index]: boxes.map((box) => box.id === boxId ? { ...box, label } : box),
    }));
    setLastLabel(label);
    setSelectedBoxId(boxId);
  }

  function toggleBoxVisibility(boxId: string) {
    setHiddenBoxes((current) => {
      const hidden = current[index] || [];
      return { ...current, [index]: hidden.includes(boxId) ? hidden.filter((id) => id !== boxId) : [...hidden, boxId] };
    });
    if (selectedBoxId === boxId) setSelectedBoxId("");
  }

  function toggleAllBoxes() {
    setHiddenBoxes((current) => ({ ...current, [index]: hiddenBoxIds.length ? [] : boxes.map((box) => box.id) }));
    setSelectedBoxId("");
  }

  function undoCurrentChanges() {
    setEditedBoxes((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    if (!hasSourceXml) {
      setSavedSamples((current) => current.filter((sampleIndex) => sampleIndex !== index));
    }
    setSelectedBoxId("");
    setDraftBox(null);
    setDrawStart(null);
    setHiddenBoxes((current) => ({ ...current, [index]: [] }));
  }

  async function saveAndNext() {
    if (!currentAsset) return;
    const dimensions = currentAsset.xml?.image_width && currentAsset.xml?.image_height
      ? { width: currentAsset.xml.image_width, height: currentAsset.xml.image_height }
      : imageDimensions[currentAsset.id];
    if (!dimensions) {
      setSaveState("error");
      setSaveMessage("尚未读取到图像尺寸");
      return;
    }
    setSaveState("saving");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/storage/assets/${currentAsset.id}/annotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_width: dimensions.width, image_height: dimensions.height, objects: boxes.map((box) => ({ label: String(box.label), x: box.x, y: box.y, width: box.width, height: box.height })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "保存失败");
      setSavedSamples((current) => current.includes(index) ? current : [...current, index]);
      if (boxes.length) setLastLabel(boxes[boxes.length - 1].label);
      setSaveState("saved");
      setSaveMessage(`已保存 ${result.object_count} 个目标`);
      setIndex((value) => annotationAssets.length ? (value + 1) % annotationAssets.length : 0);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "保存失败");
    }
  }
  return (
    <div className={`annotation-page ${annotationCategory ? "" : "unselected"}`.trim()}>
      <section className="annotation-dataset-bar">
        <label><span>标准数据类型</span><select value={annotationCategory} onChange={(event) => { setAnnotationCategory(event.target.value); setAnnotationBranch(""); setAnnotationVersion(""); }}><option value="">请选择标准数据类型</option>{annotationHierarchy?.categories.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
        <label><span>分支</span><select value={annotationBranch} disabled={!annotationCategory} onChange={(event) => { setAnnotationBranch(event.target.value); setAnnotationVersion(""); }}><option value="">全部分支</option>{annotationBranches.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
        <label><span>版本</span><select value={annotationVersion} disabled={!annotationBranch} onChange={(event) => setAnnotationVersion(event.target.value)}><option value="">全部版本</option>{branchVersions.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
        <div className="annotation-statuses"><span>数据范围</span><div><small>标准目录 · 类型 / 分支 / 版本</small></div></div>
        <div className="zoom-control"><span>画布缩放</span><div><button title="缩小" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}><ZoomOut size={14} /></button><input type="range" min="50" max="200" value={Math.round(zoom * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} /><b>{Math.round(zoom * 100)}%</b><button title="放大" onClick={() => setZoom((value) => Math.min(2, value + 0.1))}><ZoomIn size={14} /></button></div></div>
      </section>
      <section className="annotation-unselected"><ImageIcon size={24} /><b>尚未选择标注内容</b><span>请先在数据集管理中选择标准数据，或在上方主动选择标准数据类型。</span></section>
      <section className="annotation-toolbar">
        <div>
          <button className="btn">
            <ChevronLeft size={14} />
          </button>
          <span>
            <small>当前样本</small>
            <strong>{currentAsset?.filename || "加载中..."}</strong>
            <em>{annotationAssets.length ? `${index + 1} / ${annotationAssets.length}` : "0 / 0"}</em>
          </span>
          <button className="btn" disabled={!annotationAssets.length} onClick={() => { if (boxes.length) setLastLabel(boxes[boxes.length - 1].label); setIndex((v) => (v + 1) % annotationAssets.length); }}>
            下一张 <ChevronRight size={14} />
          </button>
        </div>
        <div className="auto-status">
          <label>
            <input
              type="checkbox"
              checked={autoEnabled}
              disabled={!modelConfigured}
              onChange={(e) => setAutoEnabled(e.target.checked)}
            />
            <i />
            <span>
              <b>{modelConfigured ? "缺失 XML 时自动预标注" : "简单标注模式"}</b>
              <small>{modelConfigured ? "切换下一张时检查，每张仅调用一次" : "未配置模型，仅提供人工框选和 XML 保存"}</small>
            </span>
          </label>
          <button className="btn" onClick={() => setConfigOpen((v) => !v)}>
            <Settings size={14} />
            方案配置
          </button>
        </div>
      </section>
      <section className="annotation-schemes">
        <article>
          <i>
            <TableProperties size={16} />
          </i>
          <span>
            <small>通用标注方案</small>
            <strong>几何目标 · VOC 标准</strong>
            <em>类别、字段、快捷键与输出格式</em>
          </span>
          <button>
            编辑规则 <ChevronRight size={13} />
          </button>
        </article>
        <article>
          <i>
            <WandSparkles size={16} />
          </i>
          <span>
            <small>自动预标注方案</small>
            <strong>{modelLabel}</strong>
            <em>{modelConfigured ? "引用能力中心，仅在此处调度" : "不调用模型或服务"}</em>
          </span>
          <button onClick={() => setConfigOpen(true)}>
            {modelConfigured ? "更换能力" : "配置模型"} <ChevronRight size={13} />
          </button>
        </article>
      </section>
      {configOpen && (
        <section className="auto-config">
          <button className={modelMode === "none" ? "selected" : ""} onClick={() => { setModelMode("none"); setAutoEnabled(false); }}>
            <small>无模型</small><strong>简单标注</strong><span>人工添加和调整目标，保存标准 XML</span>
          </button>
          <button className={modelMode === "general" ? "selected" : ""} onClick={() => setModelMode("general")}>
            <small>通用模型</small><strong>通用视觉检测模型</strong><span>提供候选框，人工确认类别和位置</span>
          </button>
          <button className={modelMode === "professional" ? "selected" : ""} onClick={() => setModelMode("professional")}>
            <small>专业模型</small><strong>geometry-matching-v2</strong><span>针对当前数据分支的专业预标注</span>
          </button>
          <button className="btn primary" onClick={() => setConfigOpen(false)}>保存方案</button>
        </section>
      )}
      <div className="annotation-workspace">
        <aside>
          <h3>样本队列</h3>
          <small className="annotation-queue-scope">{[annotationCategory, annotationBranch, annotationVersion].filter(Boolean).join(" / ")}</small>
          {annotationAssets.map((asset, i) => (
            <button
              className={index === i ? "active" : ""}
              onClick={() => { if (boxes.length) setLastLabel(boxes[boxes.length - 1].label); setIndex(i); setSaveState("idle"); setSaveMessage(""); }}
              key={asset.id}
            >
              <img src={`/api/storage/content?path=${encodeURIComponent(asset.relative_path)}`} />
              <span>
                <b>{asset.filename}</b>
                <small>{asset.xml || savedSamples.includes(i) ? `XML · ${editedBoxes[i]?.length ?? asset.xml?.object_count ?? 0} 个目标` : (editedBoxes[i]?.length ? `编辑中 · ${editedBoxes[i].length} 个目标` : "未标注")}</small>
              </span>
              <i className={!asset.xml && !savedSamples.includes(i) ? "missing" : ""}>
                {!asset.xml && !savedSamples.includes(i) ? (
                  <CircleAlert size={13} />
                ) : (
                  <CircleCheck size={13} />
                )}
              </i>
            </button>
          ))}
        </aside>
        <main>
          <div className="annotation-canvas">
            <div className="annotation-primary">
              <div className="annotation-stage" ref={stageRef} style={{ transform: `scale(${zoom})` }} onPointerDown={beginDraw} onPointerMove={movePointer} onPointerUp={finishPointer}>
                {currentAsset && <img src={`/api/storage/content?path=${encodeURIComponent(currentAsset.relative_path)}`} draggable={false} onLoad={(event) => { const assetId = currentAsset.id; const width = event.currentTarget.naturalWidth; const height = event.currentTarget.naturalHeight; setImageDimensions((current) => ({ ...current, [assetId]: { width, height } })); }} />}
                {boxes.filter((box) => !hiddenBoxIds.includes(box.id)).map((box) => <span className={`bbox ${selectedBoxId === box.id ? "selected" : ""}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, "--box-color": boxColor(box.label) } as React.CSSProperties} onPointerDown={(event) => beginMove(event, box)} key={box.id}><b>{box.label}</b>{selectedBoxId === box.id && <i className="resize-handle" onPointerDown={(event) => beginResize(event, box)} />}</span>)}
                {draftBox && <span className="bbox draft" style={{ left: `${draftBox.x}%`, top: `${draftBox.y}%`, width: `${draftBox.width}%`, height: `${draftBox.height}%` }} />}
              </div>
              {objectCount === 0 && (
                <div className="no-annotation">
                  <CircleAlert size={18} />
                  <strong>{currentAsset ? `未找到 ${currentAsset.filename.replace(/\.[^.]+$/, ".xml")}` : "正在读取标注数据"}</strong>
                  <span>{modelConfigured ? (autoEnabled ? `将调用 ${modelLabel} 生成候选标注` : "自动预标注已关闭，可直接人工标注") : "当前为简单标注，不调用任何模型或服务"}</span>
                  <button className="btn primary" onClick={modelConfigured ? () => setEditedBoxes((current) => ({ ...current, [index]: sourceBoxes })) : addManualObject}>
                    {modelConfigured ? <Play size={13} /> : <Plus size={13} />}{modelConfigured ? "立即预标注" : "添加第一个目标"}
                  </button>
                </div>
              )}
            </div>
            <aside className="annotation-references">
              <header><span><small>数据组参考</small><b>关联小图</b></span><em>{currentAsset?.companion_images.length || 0}</em></header>
              {currentAsset?.companion_images.length ? <div>
                {currentAsset.companion_images.map((path, referenceIndex) => <figure key={path}>
                  <img src={`/api/storage/content?path=${encodeURIComponent(path)}`} alt={`关联参考 ${referenceIndex + 1}`} />
                  <figcaption><span>参考 {referenceIndex + 1}</span><small>{path.split(/[\\/]/).pop()}</small></figcaption>
                </figure>)}
              </div> : <p>当前主图没有关联小图</p>}
            </aside>
            <span className="canvas-hint">在图像上拖拽创建目标框 · 拖动已有框调整位置</span>
          </div>
          <footer>
            <span className={saveState === "error" ? "save-error" : ""}>
              {saveMessage ? (
                <>{saveState === "error" ? <CircleAlert size={13} /> : <CircleCheck size={13} />}{saveMessage}</>
              ) : hasXml ? (
                <>
                  <CircleCheck size={13} />
                  已加载 Pascal VOC XML
                </>
              ) : (
                <>
                  <CircleAlert size={13} />
                  {saveMessage || (objectCount > 0 ? `${objectCount} 个目标尚未保存` : "等待人工添加目标")}
                </>
              )}
            </span>
            <div>
              <button className="btn" disabled={!editedBoxes[index] && !savedSamples.includes(index)} onClick={undoCurrentChanges}>撤销修改</button>
              <button className="btn primary" disabled={saveState === "saving" || (!hasXml && objectCount === 0)} onClick={saveAndNext}>{saveState === "saving" ? "保存中..." : "保存并下一张"}</button>
            </div>
          </footer>
        </main>
        <aside className="object-panel">
          <header>
            <span><h3>目标列表</h3><label className="object-visibility-all"><input type="checkbox" checked={boxes.length > 0 && hiddenBoxIds.length === 0} onChange={toggleAllBoxes} />{hiddenBoxIds.length ? `显示全部 (${boxes.length - hiddenBoxIds.length}/${boxes.length})` : `全部显示 (${boxes.length})`}</label></span>
            <button onClick={addManualObject} title="添加目标">
              <Plus size={13} />
            </button>
          </header>
          {objectCount > 0 ? (
            <div className="object-list">
              {boxes.map((box, objectIndex) => <article className={selectedBoxId === box.id ? "selected" : ""} onClick={() => setSelectedBoxId(box.id)} key={box.id}>
                <label className="object-visible" title="显示或隐藏此目标"><input type="checkbox" checked={!hiddenBoxIds.includes(box.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleBoxVisibility(box.id)} /><i style={{ background: `${boxColor(box.label)}22`, color: boxColor(box.label) }}>{box.label}</i></label>
                <span><select aria-label={`目标 ${objectIndex + 1} 类型`} value={box.label} onClick={(event) => event.stopPropagation()} onChange={(event) => updateBoxLabel(box.id, Number(event.target.value))}>{classOptions.map((label) => <option value={label} key={label}>{label}</option>)}</select><small>bbox · {box.width.toFixed(0)} × {box.height.toFixed(0)}%</small></span>
                <button onClick={(event) => { event.stopPropagation(); setEditedBoxes((current) => ({ ...current, [index]: boxes.filter((item) => item.id !== box.id) })); if (selectedBoxId === box.id) setSelectedBoxId(""); }} title={`删除目标 ${objectIndex + 1}`}><X size={12} /></button>
              </article>)}
            </div>
          ) : (
            <div className="empty-objects">暂无目标</div>
          )}
          <section>
            <h4>标注规则</h4>
            <p>
              <b>0</b> 默认 / 普通目标
            </p>
            <p>
              <b>1</b> 关键目标
            </p>
            <p>保存格式：Pascal VOC XML</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ToolLibrary() {
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<"github" | "local" | "docs">(
    "github",
  );
  const tools = [
    [
      "批量改名",
      "按序号、前缀、日期或自定义规则重命名",
      FileInput,
      "脚本",
      "内置",
    ],
    [
      "图像去重",
      "基于文件哈希、感知哈希或视觉向量去重",
      Boxes,
      "脚本 + 模型",
      "内置",
    ],
    [
      "批量剪切",
      "按固定区域、XML bbox 或检测结果裁剪",
      Scissors,
      "脚本",
      "内置",
    ],
    [
      "批量自动标注",
      "调用本地模型、脚本或服务处理整个数据集",
      WandSparkles,
      "模型调度",
      "已配置",
    ],
    [
      "智能去背景",
      "批量抠图并输出透明背景或指定底色",
      Eraser,
      "本地模型",
      "可安装",
    ],
    ["格式转换", "JPG、PNG、WebP 与标注格式互转", RefreshCw, "脚本", "内置"],
    [
      "外部工具链接",
      "挂接已有程序、页面或流水线入口",
      Link,
      "工具链接",
      "2 个",
    ],
    [
      "自定义处理器",
      "登记命令、参数协议和输入输出约定",
      Workflow,
      "扩展接口",
      "新建",
    ],
  ] as const;
  if (tools.length > 0) return <FavoriteTools />;
  return (
    <div className="stack">
      <section className="tool-hero">
        <div>
          <small>批量处理能力</small>
          <h2>图像工具库</h2>
          <p>
            统一登记通用脚本、工具链接、本地模型和服务调度方式，对选定数据集执行批量处理。
          </p>
        </div>
        <button className="btn primary" onClick={() => setImportOpen(true)}>
          <Plus size={14} />
          导入工具
        </button>
      </section>
      <section className="tool-filter">
        <div>
          <button className="active">全部工具</button>
          <button>脚本</button>
          <button>模型调度</button>
          <button>外部链接</button>
        </div>
        <label>
          <Search size={14} />
          <input placeholder="搜索工具名称或能力" />
        </label>
      </section>
      <div className="tool-grid">
        {tools.map(([name, desc, Icon, type, state], i) => (
          <article key={name}>
            <header>
              <i className={`tool-icon t${i}`}>
                <Icon size={18} />
              </i>
              <em>{state}</em>
            </header>
            <h3>{name}</h3>
            <p>{desc}</p>
            <footer>
              <span>{type}</span>
              <button>
                配置并运行 <ChevronRight size={13} />
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="panel batch-jobs">
        <Head title="最近批量任务" sub="工具执行记录与产出" action="查看全部" />
        <div className="job-row head">
          <span>任务</span>
          <span>使用工具</span>
          <span>数据量</span>
          <span>状态</span>
          <span>产出</span>
        </div>
        <div className="job-row">
          <span>
            <i className="job-dot" />
            <b>几何样本 XML 解析</b>
          </span>
          <span>批量自动标注</span>
          <span>28</span>
          <span>已完成</span>
          <strong>28 XML</strong>
        </div>
        <div className="job-row">
          <span>
            <i className="job-dot j1" />
            <b>相似样本清理</b>
          </span>
          <span>图像去重</span>
          <span>1,284</span>
          <span>运行中</span>
          <strong>67%</strong>
        </div>
      </section>
      {importOpen && (
        <div
          className="import-backdrop"
          onMouseDown={() => setImportOpen(false)}
        >
          <section
            className="tool-import"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <span>
                <small>扩展工具库</small>
                <h2>导入工具</h2>
                <p>选择一种来源，系统将解析工具能力、入口和运行要求。</p>
              </span>
              <button onClick={() => setImportOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="import-types">
              <button
                className={importType === "github" ? "active" : ""}
                onClick={() => setImportType("github")}
              >
                <GitBranch size={18} />
                <span>
                  <b>GitHub 仓库</b>
                  <small>从代码仓库解析脚本与说明</small>
                </span>
              </button>
              <button
                className={importType === "local" ? "active" : ""}
                onClick={() => setImportType("local")}
              >
                <Folder size={18} />
                <span>
                  <b>本地目录</b>
                  <small>扫描已有脚本、模型和配置</small>
                </span>
              </button>
              <button
                className={importType === "docs" ? "active" : ""}
                onClick={() => setImportType("docs")}
              >
                <FileInput size={18} />
                <span>
                  <b>说明文档</b>
                  <small>根据文档登记外部工具或服务</small>
                </span>
              </button>
            </div>
            <div className="import-form">
              {importType === "github" && (
                <>
                  <label>
                    <span>仓库地址</span>
                    <input placeholder="https://github.com/owner/image-tool" />
                  </label>
                  <div className="form-row">
                    <label>
                      <span>分支或版本</span>
                      <input placeholder="main / v1.0.0" />
                    </label>
                    <label>
                      <span>入口目录</span>
                      <input placeholder="tools/（可选）" />
                    </label>
                  </div>
                  <div className="parse-hint">
                    <GitBranch size={15} />
                    <span>
                      <b>将自动解析</b>
                      <small>
                        README、依赖文件、可执行脚本、模型配置和许可证
                      </small>
                    </span>
                  </div>
                </>
              )}
              {importType === "local" && (
                <>
                  <label>
                    <span>本地目录</span>
                    <div className="path-input">
                      <input placeholder="D:\tools\image-processing" />
                      <button className="btn">选择目录</button>
                    </div>
                  </label>
                  <div className="parse-hint">
                    <Folder size={15} />
                    <span>
                      <b>只建立工具引用</b>
                      <small>
                        默认不移动原始文件，可选择复制到受管工具目录
                      </small>
                    </span>
                  </div>
                </>
              )}
              {importType === "docs" && (
                <>
                  <label>
                    <span>说明文档或链接</span>
                    <div className="path-input">
                      <input placeholder="本地 Markdown / PDF，或工具说明页 URL" />
                      <button className="btn">选择文件</button>
                    </div>
                  </label>
                  <label>
                    <span>工具类型</span>
                    <select>
                      <option>自动识别</option>
                      <option>外部服务</option>
                      <option>本地程序</option>
                      <option>操作说明</option>
                    </select>
                  </label>
                  <div className="parse-hint">
                    <FileInput size={15} />
                    <span>
                      <b>从说明中提取工具定义</b>
                      <small>名称、输入输出、参数、调用方式和使用限制</small>
                    </span>
                  </div>
                </>
              )}
            </div>
            <footer>
              <button className="btn" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button className="btn primary">解析并继续</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function FavoriteTools() {
  const [picker, setPicker] = useState(false);
  const [tools, setTools] = useState<StoredCapability[]>([]);
  const [published, setPublished] = useState<StoredCapability[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerIds, setPickerIds] = useState<string[]>([]);
  const [pickerType, setPickerType] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const available = published.filter((item) => !tools.some((tool) => tool.id === item.id));
  const pickerTypes = [...new Set(available.map((item) => item.type))].sort();
  const normalizedPickerSearch = pickerSearch.trim().toLowerCase();
  const filteredAvailable = available.filter((item) =>
    (!pickerType || item.type === pickerType)
    && (!normalizedPickerSearch || `${item.name} ${item.id} ${item.type} ${item.summary || ""} ${(item.categories || []).join(" ")}`.toLowerCase().includes(normalizedPickerSearch)),
  );
  const pickerGroups = (pickerType ? [pickerType] : pickerTypes).map((type) => ({ type, items: filteredAvailable.filter((item) => item.type === type) })).filter((group) => group.items.length);
  const iconFor = (type: string) => ({ 模型: WandSparkles, 算法: Boxes, 脚本: FileInput, 工具: Workflow, 服务: Server }[type] || Workflow);
  async function loadToolSet() {
    setLoading(true);
    const [toolResponse, capabilityResponse] = await Promise.all([fetch("/api/tool-set"), fetch("/api/capabilities")]);
    if (!toolResponse.ok || !capabilityResponse.ok) {
      setMessage("工具集或能力中心读取失败");
      setLoading(false);
      return;
    }
    const toolResult = await toolResponse.json() as { items: StoredCapability[] };
    const capabilities = await capabilityResponse.json() as StoredCapability[];
    setTools(toolResult.items);
    setPublished(capabilities.filter((item) => item.status === "published"));
    setSelectedIds((current) => current.filter((id) => toolResult.items.some((item) => item.id === id)));
    setLoading(false);
  }
  useEffect(() => { loadToolSet(); }, []);
  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  async function removeSelected() {
    if (!selectedIds.length || !window.confirm(`从工具集移除选中的 ${selectedIds.length} 项？能力中心内容不会受影响。`)) return;
    const response = await fetch("/api/tool-set", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capability_ids: selectedIds }) });
    const result = await response.json().catch(() => ({})) as { items?: StoredCapability[]; removed_count?: number; detail?: string };
    if (!response.ok) { setMessage(result.detail || "工具移除失败"); return; }
    setTools(result.items || []);
    setMessage(`已从工具集移除 ${result.removed_count || 0} 项，能力中心内容保持不变`);
    setSelectedIds([]);
  }
  async function addPicked() {
    const response = await fetch("/api/tool-set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capability_ids: pickerIds }) });
    const result = await response.json().catch(() => ({})) as { items?: StoredCapability[]; added_count?: number; detail?: string };
    if (!response.ok) { setMessage(result.detail || "工具添加失败"); return; }
    setTools(result.items || []);
    setMessage(`已从能力中心添加 ${result.added_count || 0} 项工具引用`);
    setPickerIds([]);
    setPicker(false);
  }
  function togglePickerGroup(ids: string[]) {
    const allSelected = ids.every((id) => pickerIds.includes(id));
    setPickerIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }
  return (
    <div className="stack">
      <section className="tool-hero">
        <div>
          <small>流程与 Agent 可用能力</small>
          <h2>工具集</h2>
          <p>
            工具由流程或 llm_agent 选择调用；此处仅管理引用，删除不会影响能力中心内容。
          </p>
        </div>
        <button className="btn primary" onClick={() => { setPickerType(""); setPickerSearch(""); setPicker(true); }}><Plus size={14} />从能力中心添加</button>
      </section>
      {message && <div className="source-message"><CircleCheck size={13} />{message}</div>}
      <section className="favorite-note">
        <div className="tool-set-actions">
          {!!tools.length && <label className="tool-select-all"><input type="checkbox" checked={selectedIds.length === tools.length} ref={(input) => { if (input) input.indeterminate = selectedIds.length > 0 && selectedIds.length < tools.length; }} onChange={() => setSelectedIds(selectedIds.length === tools.length ? [] : tools.map((item) => item.id))} /><span>{selectedIds.length === tools.length ? "取消全选" : "全选"}</span></label>}
          {!!selectedIds.length && <button className="btn" onClick={removeSelected}><Trash2 size={13} />删除所选 ({selectedIds.length})</button>}
        </div>
        <div className="tool-set-summary">
          <Archive size={15} />
          <span>
            <b>{tools.length} 个工具 · 已选择 {selectedIds.length} 个</b>
            <small>底层版本与适配由能力中心统一维护，这里只保存项目引用和默认参数。</small>
          </span>
        </div>
      </section>
      {loading && <section className="browser-empty"><RefreshCw className="spin" /><b>正在读取工具集</b></section>}
      {!loading && !tools.length && <section className="browser-empty"><Workflow size={24} /><b>工具集为空</b><span>从能力中心添加已发布能力后，可供流程或 llm_agent 选择。</span></section>}
      <div className="capability-grid tool-set-capability-grid">
        {tools.map((tool, i) => {
          const Icon = iconFor(tool.type);
          const typeClass = capabilityTypeClass[tool.type] || "other";
          return (
          <article className={`capability-card type-${typeClass} ${selectedIds.includes(tool.id) ? "selected" : ""}`} onClick={() => toggleSelected(tool.id)} key={tool.id}>
            <header>
              <i className={`cap-icon type-${typeClass}`}>
                <Icon size={18} />
              </i>
              <span className={`cap-type-badge type-${typeClass}`}>{tool.type}</span>
              <label title="选择工具" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(tool.id)} onChange={() => toggleSelected(tool.id)} /></label>
            </header>
            <h3>{tool.name}</h3>
            <code>{tool.invocation || "待配置调用方式"}</code>
            <p>{tool.summary || tool.project_summary || "能力中心未填写说明"}</p>
            <div className="candidate-tags">{tool.categories?.map((tag) => <em key={tag} style={categoryTagStyle(tag)}>{tag}</em>)}</div>
            <footer>
              <span>{tool.status === "published" ? "已发布" : "已停用"}</span>
              <em>供流程 / llm_agent 选择</em>
            </footer>
          </article>
        )})}
      </div>
      {picker && <div className="import-backdrop" onMouseDown={() => setPicker(false)}>
        <section className="cap-picker" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <span><small>能力中心</small><h2>添加到工具集</h2><p>选择能力引用到工具集，不复制或修改能力中心内容。</p></span>
            <button onClick={() => setPicker(false)}><X size={16} /></button>
          </header>
          <div className="cap-picker-filters">
            <label><span>分类</span><select value={pickerType} onChange={(event) => setPickerType(event.target.value)}><option value="">全部分类 ({available.length})</option>{pickerTypes.map((type) => <option value={type} key={type}>{type} ({available.filter((item) => item.type === type).length})</option>)}</select></label>
            <label><span>检索</span><div><Search size={13} /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="名称、ID、说明或标签" /></div></label>
          </div>
          <section className="cap-picker-list">
            {pickerGroups.map((group) => { const ids = group.items.map((item) => item.id); const allSelected = ids.every((id) => pickerIds.includes(id)); return <section className="cap-picker-group" key={group.type}>
              <header><label><input type="checkbox" checked={allSelected} ref={(input) => { if (input) input.indeterminate = !allSelected && ids.some((id) => pickerIds.includes(id)); }} onChange={() => togglePickerGroup(ids)} /><b>{group.type}</b><em>{group.items.length}</em></label></header>
              {group.items.map(({ id, name, type, summary }) => <article key={id}>
                <input type="checkbox" checked={pickerIds.includes(id)} onChange={() => setPickerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
                <span><b>{name}</b><small>{id} · {type}{summary ? ` · ${summary}` : ""}</small></span><em>已发布</em>
              </article>)}
            </section>; })}
            {!available.length && <div className="directory-empty">能力中心中的可用工具已全部加入</div>}
            {!!available.length && !filteredAvailable.length && <div className="directory-empty">没有匹配的已发布能力</div>}
          </section>
          <footer>
            <button className="btn" onClick={() => setPicker(false)}>取消</button>
            <button className="btn primary" disabled={!pickerIds.length} onClick={addPicked}>添加所选 ({pickerIds.length})</button>
          </footer>
        </section>
      </div>}
    </div>
  );
}

function ImportExport() {
  type SyncDataset = { category: string; branch: string; version: string; group_count: number; file_count: number; image_count: number; annotation_count: number };
  type SyncResult = { source_id: string; dataset_count: number; copied: number; updated: number; skipped: number; annotations: number; groups: number; companions: number; renamed_groups: number; storage_path: string };
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [datasets, setDatasets] = useState<SyncDataset[]>([]);
  const [datasetKey, setDatasetKey] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Array<SyncResult & { source_name: string; dataset: string; time: string }>>([]);
  useEffect(() => {
    fetch("/api/data-sources").then((response) => response.json()).then((items: ManagedSource[]) => {
      const localSources = items.filter((item) => item.type === "local");
      setSources(localSources);
      setSourceId((current) => current || localSources[0]?.id || "");
    }).catch(() => setMessage("无法读取数据源"));
  }, []);
  useEffect(() => {
    setDatasetKey(""); setOverwrite(false); setDatasets([]);
    if (!sourceId) return;
    fetch(`/api/data-sources/${sourceId}/datasets`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "无法读取数据集");
      setDatasets(body.items || []);
    }).catch((error) => setMessage(error.message));
  }, [sourceId]);
  const selectedDataset = datasets.find((item) => JSON.stringify([item.category, item.branch, item.version]) === datasetKey);
  async function analyzeSyncHierarchy() {
    if (!sourceId) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/data-sources/${sourceId}/hierarchy/analyze`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(body.detail || "AI 目录分析失败");
    else {
      const refreshed = await fetch(`/api/data-sources/${sourceId}/datasets`).then((result) => result.json());
      setDatasets(refreshed.items || []); setDatasetKey(""); setOverwrite(false);
      setMessage(`AI 已识别 ${body.dataset_count} 个标准数据集；${body.input_image_count} 张图像归并为 ${body.input_directory_count} 个目录，实际送审 ${body.prompt_directory_count} 条`);
    }
    setBusy(false);
  }
  async function synchronize() {
    if (!sourceId) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/data-sources/${sourceId}/storage-sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: selectedDataset ? { category: selectedDataset.category, branch: selectedDataset.branch, version: selectedDataset.version } : null, overwrite }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(body.detail || "数据同步失败");
    else {
      const sourceName = sources.find((item) => item.id === sourceId)?.name || sourceId;
      const dataset = selectedDataset ? `${selectedDataset.category} / ${selectedDataset.branch} / ${selectedDataset.version}` : "全部数据集";
      setHistory((current) => [{ ...body, source_name: sourceName, dataset, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }, ...current]);
      setMessage(`同步完成：${body.groups} 个数据组，新增 ${body.copied}，更新 ${body.updated}，跳过重复 ${body.skipped}${body.renamed_groups ? `；${body.renamed_groups} 个重名组已安全改名` : ""}`);
    }
    setBusy(false);
  }
  return (
    <div className="stack">
      <section className="sync-workspace">
        <header><span><small>标准目录录入</small><h2>数据同步</h2><p>AI 可识别同一来源中的多套目录规范，再按“大类 / 分支 / 版本”同步。</p></span><div className="sync-head-actions"><button className="btn" disabled={!sourceId || busy} onClick={analyzeSyncHierarchy}><WandSparkles size={14} />AI 分析目录</button><i><RefreshCw size={22} /></i></div></header>
        <div className="sync-form">
          <label><span>数据源</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">选择本地数据源</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select><small>来源目录保持只读，图像和同名 XML 会录入标准目录。</small></label>
          <ArrowRight size={18} />
          <label><span>同步范围</span><select value={datasetKey} onChange={(event) => { setDatasetKey(event.target.value); setOverwrite(false); }} disabled={!sourceId}><option value="">全部数据集（仅新增）</option>{datasets.map((item) => { const key = JSON.stringify([item.category, item.branch, item.version]); return <option value={key} key={key}>{item.category} / {item.branch} / {item.version} · {item.group_count} 组 / {item.file_count} 文件</option>; })}</select><small>{datasets.length ? `识别到 ${datasets.length} 个标准数据集` : "请先在数据管理中为来源建立索引"}</small></label>
          <ArrowRight size={18} />
          <div className="sync-target"><span>标准目录</span><b>大类 / 分支 / 版本</b><small>版本以下目录会被消除，文件直接汇总录入。</small></div>
        </div>
        <footer>
          <label className={!selectedDataset ? "disabled" : ""}><input type="checkbox" checked={overwrite} disabled={!selectedDataset} onChange={(event) => setOverwrite(event.target.checked)} /><span><b>覆盖同步更新</b><small>{selectedDataset ? "只更新当前选中的单个数据集" : "选择单个数据集后才可启用"}</small></span></label>
          <span><CircleAlert size={14} />默认遇到标准目录中的同名文件会跳过，不覆盖已有图像或标注。</span>
          <button className="btn primary" disabled={!sourceId || busy} onClick={synchronize}>{busy ? <><RefreshCw className="spin" size={14} />同步中...</> : <><RefreshCw size={14} />开始同步</>}</button>
        </footer>
      </section>
      {message && <div className="source-message"><CircleCheck size={13} />{message}</div>}
      <section className="panel">
        <Head title="本次同步记录" sub="当前页面执行的数据集录入结果" />
        <div className="job-row head">
          <span>数据源</span>
          <span>数据集</span>
          <span>新增 / 更新</span>
          <span>跳过重复</span>
          <span>时间</span>
        </div>
        {history.map((item, index) => <div className="job-row" key={`${item.time}-${index}`}><span><i className="job-dot" /><b>{item.source_name}</b></span><span>{item.dataset}</span><span>{item.copied} / {item.updated}</span><span>{item.skipped}</span><strong>{item.time}</strong></div>)}
        {!history.length && <div className="sync-empty"><RefreshCw size={18} /><span>尚未执行同步</span></div>}
      </section>
    </div>
  );
}

function CapabilityCenter({ page }: { page: number }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<CapabilitySource>("github");
  if (page === 0) return <CapabilityGallery />;
  if (page === 1)
    return (
      <div className="stack">
        <section className="capability-intro">
          <div>
            <small>统一接入</small>
            <h2>能力接入与适配</h2>
            <p>
              从代码、目录或文档建立能力定义，并配置统一的输入、输出、参数和运行协议。
            </p>
          </div>
          <button className="btn primary" onClick={() => setOpen(true)}>
            <Plus size={14} />
            接入能力
          </button>
        </section>
        <section className="adapter-flow">
          <article>
            <i>1</i>
            <h3>导入来源</h3>
            <p>GitHub、本地目录或说明文档</p>
          </article>
          <ArrowRight />
          <article>
            <i>2</i>
            <h3>识别能力</h3>
            <p>模型、算法、脚本、工具或服务</p>
          </article>
          <ArrowRight />
          <article>
            <i>3</i>
            <h3>配置适配</h3>
            <p>输入输出、参数、环境与调用方式</p>
          </article>
          <ArrowRight />
          <article>
            <i>4</i>
            <h3>验证发布</h3>
            <p>测试后提供给业务页面调度</p>
          </article>
        </section>
        <CapabilityDraftReview refresh={open} />
        {open && (
          <CapabilityImport
            source={source}
            setSource={setSource}
            close={() => setOpen(false)}
          />
        )}
      </div>
    );
  return <Reserved title="能力配置" />;
}

function CapabilityDraftReview({ refresh }: { refresh: boolean }) {
  const [records, setRecords] = useState<StoredCapability[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StoredCapability["status"]>("draft");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const load = () => fetch("/api/capabilities").then((response) => response.json()).then((items: StoredCapability[]) => setRecords(items));
  useEffect(() => { load(); }, [refresh]);
  async function publishApproved() {
    setBusy(true);
    const response = await fetch("/api/capabilities/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capability_ids: approved, status: "published" }) });
    if (response.ok) setApproved([]);
    await load(); setBusy(false);
  }
  async function remove(id: string) {
    if (!window.confirm("确定将这项能力移入已删除？之后仍可恢复。")) return;
    await fetch(`/api/capabilities/${id}`, { method: "DELETE" });
    setApproved((current) => current.filter((item) => item !== id)); await load();
  }
  async function changeStatus(id: string, status: StoredCapability["status"]) {
    setBusy(true);
    await fetch(`/api/capabilities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setApproved((current) => current.filter((item) => item !== id)); await load(); setBusy(false);
  }
  const statusMeta: Record<StoredCapability["status"], { label: string; empty: string }> = {
    draft: { label: "未审核", empty: "暂无未审核能力" }, published: { label: "已发布", empty: "暂无已发布能力" }, disabled: { label: "已停用", empty: "暂无已停用能力" }, deleted: { label: "已删除", empty: "暂无已删除能力" },
  };
  const capabilityTypeOrder = ["模型", "算法", "脚本", "工具", "服务"];
  const visible = records
    .filter((item) => item.status === statusFilter && `${item.name} ${item.type} ${item.summary} ${(item.categories || []).join(" ")} ${item.source_location}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => {
      const leftIndex = capabilityTypeOrder.indexOf(left.type);
      const rightIndex = capabilityTypeOrder.indexOf(right.type);
      return (leftIndex < 0 ? capabilityTypeOrder.length : leftIndex) - (rightIndex < 0 ? capabilityTypeOrder.length : rightIndex);
    });
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageItems = visible.slice(page * pageSize, (page + 1) * pageSize);
  const pageGroups = pageItems.reduce<Array<{ type: string; items: StoredCapability[] }>>((groups, item) => {
    const group = groups.find((entry) => entry.type === item.type);
    if (group) group.items.push(item);
    else groups.push({ type: item.type, items: [item] });
    return groups;
  }, []);
  const pageIds = pageItems.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => approved.includes(id)).length;
  const allPageApproved = pageIds.length > 0 && selectedOnPage === pageIds.length;
  useEffect(() => { if (page >= pageCount) setPage(pageCount - 1); }, [page, pageCount]);
  function toggleAllOnPage() {
    setApproved((current) => allPageApproved ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]);
  }
  return <section className="panel capability-review-panel">
    <header className="review-head"><span><small>人工审核与发布</small><h3>能力审核清单</h3><p>未审核能力不会被业务调用；删除只进入回收状态，可随时恢复。</p></span>{statusFilter === "draft" && <button className="btn primary" disabled={!approved.length || busy} onClick={publishApproved}>{busy ? "发布中..." : `发布所选 (${approved.length})`}</button>}</header>
    <div className="review-controls"><div>{(Object.keys(statusMeta) as StoredCapability["status"][]).map((status) => <button className={statusFilter === status ? "active" : ""} onClick={() => { setStatusFilter(status); setApproved([]); setPage(0); }} key={status}>{statusMeta[status].label} {records.filter((item) => item.status === status).length}</button>)}</div><span className="review-visible-count">显示 {visible.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, visible.length)} / {visible.length} 项</span><label><Search size={13} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="检索名称、类型、标签、来源或摘要" /></label></div>
    <div className="cap-review-row head"><span>{statusFilter === "draft" ? <label className="review-select-all"><input type="checkbox" checked={allPageApproved} ref={(input) => { if (input) input.indeterminate = selectedOnPage > 0 && !allPageApproved; }} disabled={!pageItems.length} onChange={toggleAllOnPage} />全选本页</label> : "状态"}</span><span>能力</span><span>分类标签</span><span>来源</span><span>操作</span></div>
    {pageGroups.map((group) => <div className="cap-review-group" key={group.type}>
      <div className={`cap-review-group-head type-${capabilityTypeClass[group.type] || "other"}`}><span>{group.type}</span><small>本页 {group.items.length} 项 · 共 {visible.filter((item) => item.type === group.type).length} 项</small></div>
      {group.items.map((item) => <div className="cap-review-row" key={item.id}><label>{statusFilter === "draft" ? <input type="checkbox" checked={approved.includes(item.id)} onChange={() => setApproved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /> : <i className={`status-dot ${item.status}`} />}</label><span><b>{item.name}</b><small>{item.type} · {item.invocation || "待配置"}</small></span><div>{item.categories?.map((tag) => <em key={tag} style={categoryTagStyle(tag)}>{tag}</em>)}</div><span><b>{item.source_type}</b><small title={item.source_location}>{item.source_location}</small></span><div className="review-actions">{item.status === "published" && <><button title="撤回为未审核" onClick={() => changeStatus(item.id, "draft")}><Archive size={12} /></button><button title="停用能力" onClick={() => changeStatus(item.id, "disabled")}><XCircle size={12} /></button></>}{item.status === "disabled" && <button title="重新发布" onClick={() => changeStatus(item.id, "published")}><Play size={12} /></button>}{item.status === "deleted" ? <button title="恢复到未审核" onClick={() => changeStatus(item.id, "draft")}><RefreshCw size={12} /></button> : <button title="移入已删除" onClick={() => remove(item.id)}><X size={13} /></button>}</div></div>)}
    </div>)}
    {!visible.length && <div className="capability-empty"><Workflow size={22} /><b>{statusMeta[statusFilter].empty}</b><span>{query ? "没有匹配当前检索条件的能力。" : statusFilter === "draft" ? "接入来源并完成 AI 分析后，先保存到这里等待审核。" : "该状态下还没有能力记录。"}</span></div>}
    {!!visible.length && <div className="review-pagination"><span>第 {page + 1} / {pageCount} 页</span><div><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={13} /></button><button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight size={13} /></button></div></div>}
  </section>;
}
function CapabilityGallery() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoredCapability | null>(null);
  const [source, setSource] = useState<CapabilitySource>("github");
  const [records, setRecords] = useState<StoredCapability[]>([]);
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState(4);
  const capabilityGroupsRef = useRef<HTMLDivElement>(null);
  const load = () => fetch("/api/capabilities").then((response) => response.json()).then((items: StoredCapability[]) => setRecords(items.filter((item) => item.status === "published" || item.status === "disabled")));
  useEffect(() => { load(); }, [open]);
  useEffect(() => {
    const container = capabilityGroupsRef.current;
    if (!container) return;
    const update = () => setPreviewCount(Math.max(1, Math.floor((container.clientWidth + 12) / 282)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [filter, records.length]);
  const published = records.filter((item) => (filter === "全部" || item.type === filter) && `${item.name} ${item.summary} ${(item.categories || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const capabilityTypes = ["模型", "算法", "脚本", "工具", "服务"];
  const iconFor = (type: string) => ({ 模型: WandSparkles, 算法: Boxes, 脚本: FileInput, 工具: Settings, 服务: Server }[type] || Workflow);
  async function remove(id: string) { if (!window.confirm("确定将这个能力移入已删除？之后可在审核清单中恢复。")) return; await fetch(`/api/capabilities/${id}`, { method: "DELETE" }); await load(); }
  const capabilityCard = (item: StoredCapability) => { const Icon = iconFor(item.type); const typeClass = capabilityTypeClass[item.type] || "other"; return (
    <article className={`capability-card type-${typeClass}`} key={item.id}>
      <header><i className={`cap-icon type-${typeClass}`}><Icon size={18} /></i><span className={`cap-type-badge type-${typeClass}`}>{item.type}</span><button title="删除能力" onClick={() => remove(item.id)}><X size={13} /></button></header>
      <h3>{item.name}</h3><code>{item.invocation || "待配置调用方式"}</code><p>{item.summary}</p>
      <div className="candidate-tags">{item.categories?.map((tag) => <em key={tag} style={categoryTagStyle(tag)}>{tag}</em>)}</div>
      <footer><span>{item.status === "published" ? "已发布" : "已停用"}</span><button onClick={() => setEditing(item)}>编辑配置 <ChevronRight size={13} /></button></footer>
    </article>
  ); };
  return (
    <div className="stack">
      <section className="capability-intro">
        <div>
          <small>统一能力管控</small>
          <h2>全部能力</h2>
          <p>
            集中配置模型、算法、脚本、工具与服务；业务页面从这里引用和调度。
          </p>
        </div>
        <button className="btn primary" onClick={() => setOpen(true)}>
          <Plus size={14} />
          接入能力
        </button>
      </section>
      <section className="cap-gallery-toolbar">
        <div>
          {["全部", "模型", "算法", "脚本", "工具", "服务"].map((type) => <button className={filter === type ? "active" : ""} onClick={() => setFilter(type)} key={type}>{type} {type === "全部" ? records.length : records.filter((item) => item.type === type).length}</button>)}
        </div>
        <label>
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索能力名称、用途或标签" />
        </label>
      </section>
      {filter === "全部" && published.length > 0 ? <div className="capability-groups" ref={capabilityGroupsRef}>
        {capabilityTypes.map((type) => { const items = published.filter((item) => item.type === type); if (!items.length) return null; const expanded = expandedTypes.includes(type); const visibleItems = expanded ? items : items.slice(0, previewCount); const typeClass = capabilityTypeClass[type] || "other"; return <section className={`capability-group type-${typeClass}`} key={type}>
          <header><span><i className={`cap-icon type-${typeClass}`}>{(() => { const Icon = iconFor(type); return <Icon size={17} />; })()}</i><span><small>能力分类</small><h2>{type}</h2></span><em>{items.length} 项</em></span>{items.length > previewCount && <button className="btn" onClick={() => setExpandedTypes((current) => expanded ? current.filter((item) => item !== type) : [...current, type])}>{expanded ? "收起" : `展开其余 ${items.length - previewCount} 项`}<ChevronRight className={expanded ? "expanded" : ""} size={14} /></button>}</header>
          <div className="capability-grid">{visibleItems.map(capabilityCard)}</div>
        </section>; })}
      </div> : <div className="capability-grid">{published.map(capabilityCard)}{!published.length && <div className="capability-empty"><Boxes size={22} /><b>暂无匹配能力</b><span>先接入来源并在“接入与适配”中审核发布，或调整当前筛选条件。</span></div>}</div>}
      {open && (
        <CapabilityImport
          source={source}
          setSource={setSource}
          close={() => setOpen(false)}
        />
      )}
      {editing && <CapabilityEditor item={editing} close={() => setEditing(null)} saved={async () => { setEditing(null); await load(); }} />}
    </div>
  );
}

function CapabilityEditor({ item, close, saved }: { item: StoredCapability; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: item.name,
    type: item.type,
    summary: item.summary || "",
    invocation: item.invocation || "",
    runtime: item.runtime || "",
    categories: (item.categories || []).join("，"),
    entrypoints: (item.entrypoints || []).join("\n"),
    inputs: (item.inputs || []).join("\n"),
    outputs: (item.outputs || []).join("\n"),
    parameters: (item.parameters || []).join("\n"),
    dependencies: (item.dependencies || []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = (value: string) => value.split(/[，,\n]/).map((part) => part.trim()).filter(Boolean);
  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function save() {
    if (!form.name.trim()) { setError("能力名称不能为空"); return; }
    setBusy(true); setError("");
    const response = await fetch(`/api/capabilities/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(), type: form.type, summary: form.summary.trim(), invocation: form.invocation.trim(), runtime: form.runtime.trim(),
        categories: list(form.categories), entrypoints: list(form.entrypoints), inputs: list(form.inputs), outputs: list(form.outputs), parameters: list(form.parameters), dependencies: list(form.dependencies),
      }),
    });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.detail || "保存失败"); setBusy(false); return; }
    await saved();
  }
  return <div className="import-backdrop" onMouseDown={close}>
    <section className="capability-editor" onMouseDown={(event) => event.stopPropagation()}>
      <header><span><small>能力配置</small><h2>编辑能力</h2><p>修改能力定义与调度元数据，来源关系保持不变。</p></span><button onClick={close}><X size={16} /></button></header>
      <div className="capability-editor-body">
        <div className="capability-editor-grid">
          <label><span>能力名称</span><input value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
          <label><span>能力类型</span><select value={form.type} onChange={(event) => change("type", event.target.value)}>{["模型", "算法", "脚本", "工具", "服务"].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>调用方式</span><input value={form.invocation} onChange={(event) => change("invocation", event.target.value)} placeholder="CLI、Python、HTTP API..." /></label>
          <label><span>运行环境</span><input value={form.runtime} onChange={(event) => change("runtime", event.target.value)} placeholder="Python 3.12、Node.js..." /></label>
        </div>
        <label><span>能力说明</span><textarea value={form.summary} onChange={(event) => change("summary", event.target.value)} rows={3} /></label>
        <label><span>分类标签</span><input value={form.categories} onChange={(event) => change("categories", event.target.value)} placeholder="使用逗号分隔，例如：图像处理，数据清洗" /></label>
        <div className="capability-editor-grid detail-fields">
          <label><span>入口文件</span><textarea value={form.entrypoints} onChange={(event) => change("entrypoints", event.target.value)} rows={3} placeholder="每行一项" /></label>
          <label><span>依赖</span><textarea value={form.dependencies} onChange={(event) => change("dependencies", event.target.value)} rows={3} placeholder="每行一项" /></label>
          <label><span>输入</span><textarea value={form.inputs} onChange={(event) => change("inputs", event.target.value)} rows={3} placeholder="每行一项" /></label>
          <label><span>输出</span><textarea value={form.outputs} onChange={(event) => change("outputs", event.target.value)} rows={3} placeholder="每行一项" /></label>
          <label><span>参数</span><textarea value={form.parameters} onChange={(event) => change("parameters", event.target.value)} rows={3} placeholder="每行一项" /></label>
          <div className="capability-source-readonly"><span>接入来源</span><b>{item.source_type}</b><code title={item.source_location}>{item.source_location}</code><small>来源标识只读，重新接入时用于识别同一能力。</small></div>
        </div>
        {error && <div className="capability-editor-error"><CircleAlert size={14} />{error}</div>}
      </div>
      <footer><button className="btn" onClick={close}>取消</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "保存中..." : "保存修改"}</button></footer>
    </section>
  </div>;
}

type CapabilitySource = "github" | "local" | "docs" | "service";
const capabilityTypeClass: Record<string, string> = { 模型: "model", 算法: "algorithm", 脚本: "script", 工具: "tool", 服务: "service" };
const categoryPalette = [
  { background: "#e8f2eb", color: "#286b47", borderColor: "#cfe1d5" },
  { background: "#e9f0f8", color: "#38688f", borderColor: "#cedcea" },
  { background: "#fff1df", color: "#98601d", borderColor: "#eed8ba" },
  { background: "#f0eaf6", color: "#70528a", borderColor: "#ded0ea" },
  { background: "#f9e9ec", color: "#9a4e5e", borderColor: "#ebced5" },
  { background: "#e6f3f2", color: "#28716d", borderColor: "#c8e2df" },
];
function categoryTagStyle(label: string): React.CSSProperties {
  let hash = 0;
  for (const character of label) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return categoryPalette[Math.abs(hash) % categoryPalette.length];
}
type CapabilityCandidate = {
  name: string;
  type: string;
  summary: string;
  categories?: string[];
  entrypoints?: string[];
  runtime?: string;
  invocation?: string;
  inputs?: string[];
  outputs?: string[];
  parameters?: string[];
  dependencies?: string[];
  confidence?: number;
  evidence?: string[];
};
type StoredCapability = CapabilityCandidate & {
  id: string;
  status: "draft" | "published" | "disabled" | "deleted";
  source_type: CapabilitySource;
  source_location: string;
  project_summary?: string;
};

function CapabilityImport({
  source,
  setSource,
  close,
}: {
  source: CapabilitySource;
  setSource: (v: CapabilitySource) => void;
  close: () => void;
}) {
  const [location, setLocation] = useState("");
  const [preferredType, setPreferredType] = useState("auto");
  const [splitMode, setSplitMode] = useState("auto");
  const [aiSettings, setAiSettings] = useState({ provider: "openrouter", base_url: "https://openrouter.ai/api/v1", model: "openrouter/auto", configured: false });
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<null | { analysis_mode: string; inventory: { name: string; file_count: number; extensions: Record<string, number>; entry_candidates: string[] }; analysis: { project_name: string; project_summary: string; project_kind: string; capabilities: CapabilityCandidate[] } }>(null);
  const [imported, setImported] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryPath, setDirectoryPath] = useState("");
  const [directoryParent, setDirectoryParent] = useState<string | null>(null);
  const [directoryRoots, setDirectoryRoots] = useState<string[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<{ name: string; path: string }[]>([]);

  useEffect(() => {
    fetch("/api/capabilities/ai-settings").then((response) => response.json()).then(setAiSettings);
    fetch("/api/capabilities/taxonomy").then((response) => response.json()).then(setTaxonomy);
  }, []);

  async function analyzeSource() {
    setBusy(true);
    setError("");
    setResult(null);
    setImported(false);
    try {
      const response = await fetch("/api/capabilities/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_type: source, location: location.trim(), preferred_type: preferredType, group: splitMode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "来源分析失败");
      setResult(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "来源分析失败");
    } finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/capabilities/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_type: source, location, project_summary: result.analysis.project_summary, capabilities: result.analysis.capabilities }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "能力录入失败");
      setImported(true);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "能力录入失败");
    } finally { setBusy(false); }
  }

  async function browseCapabilityDirectory(path?: string) {
    if (!path) {
      const response = await fetch("/api/filesystem/roots");
      const body = await response.json();
      setDirectoryRoots(body.items || []); setDirectoryPath(""); setDirectoryParent(null); setDirectoryEntries([]); setDirectoryOpen(true); return;
    }
    const response = await fetch(`/api/filesystem/directories?path=${encodeURIComponent(path)}`);
    const body = await response.json();
    if (!response.ok) { setError(body.detail || "目录读取失败"); return; }
    setDirectoryPath(body.path); setDirectoryParent(body.parent); setDirectoryEntries(body.items || []); setDirectoryOpen(true);
  }

  const sourceMeta: Record<CapabilitySource, { title: string; hint: string; placeholder: string; icon: typeof GitBranch }> = {
    github: { title: "GitHub 仓库", hint: "识别单一项目或脚本集合", placeholder: "https://github.com/owner/repository", icon: GitBranch },
    local: { title: "本地目录", hint: "扫描已有程序、模型和配置", placeholder: "D:\\capabilities\\image-tool", icon: Folder },
    docs: { title: "说明文档", hint: "从文档提取服务或工具协议", placeholder: "Markdown、PDF 或文档 URL", icon: FileInput },
    service: { title: "服务地址", hint: "分析 API、MCP 或常驻服务", placeholder: "https://service.example.com/openapi.json", icon: Server },
  };
  return (
    <div className="import-backdrop" onMouseDown={close}>
      <section className="tool-import capability-import" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span>
            <small>能力中心</small>
            <h2>接入新能力</h2>
            <p>AI 分析来源内容，拆分真实能力；确认后再进入统一协议适配。</p>
          </span>
          <button onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="capability-import-status"><span><i className={aiSettings.configured ? "ready" : ""} />{aiSettings.provider === "deepseek" ? "DeepSeek" : "OpenRouter"} {aiSettings.configured ? "已配置" : "未配置"}<small>{aiSettings.model}</small></span><em>请在系统设置中维护 LLM 与 Key</em></div>
        <div className="import-types capability-source-types">
          {(Object.keys(sourceMeta) as CapabilitySource[]).map((sourceId) => { const meta = sourceMeta[sourceId]; const Icon = meta.icon; return <button className={source === sourceId ? "active" : ""} onClick={() => { setSource(sourceId); setResult(null); setError(""); }} key={sourceId}><Icon size={18} /><span><b>{meta.title}</b><small>{meta.hint}</small></span></button>; })}
        </div>
        <div className="import-form">
          <label>
            <span>{sourceMeta[source].title}</span>
            <div className="path-input">
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={sourceMeta[source].placeholder} />
              {source === "local" && <button className="btn" onClick={() => browseCapabilityDirectory(location || undefined)}><FolderTree size={13} />查看目录</button>}
            </div>
          </label>
          <div className="form-row">
            <label>
              <span>能力类型</span>
              <select value={preferredType} onChange={(event) => setPreferredType(event.target.value)}>
                <option value="auto">自动识别</option><option>模型</option><option>算法</option><option>脚本</option><option>工具</option><option>服务</option>
              </select>
            </label>
            <label>
              <span>拆分方式</span>
              <select value={splitMode} onChange={(event) => setSplitMode(event.target.value)}>
                <option value="auto">自动判断仓库形态</option><option value="collection">能力集合 · 逐项识别</option><option value="project">单一项目 · 主入口</option><option value="client">服务客户端 / SDK</option>
              </select>
            </label>
          </div>
          <div className="auto-category-note"><WandSparkles size={14} /><span><b>入口优先分析</b><small>启动文件、CLI 和公开服务入口优先；测试、示例与普通文档只作为证据</small></span></div>
          {!result && <div className="parse-hint">
            <Workflow size={15} />
            <span>
              <b>AI 将先判断项目边界，再拆分能力</b>
              <small>分析入口、依赖、输入输出、参数及调用方式，并保留代码证据</small>
            </span>
          </div>}
        </div>
        {error && <div className="capability-import-error"><CircleAlert size={14} />{error}</div>}
        {result && <section className="capability-analysis-result"><header><span><small>{result.analysis.project_kind} · {result.analysis_mode}</small><h3>{result.analysis.project_name}</h3><p>{result.analysis.project_summary}</p></span><em>{result.inventory.file_count} 个文件</em></header><div>{result.analysis.capabilities.length ? result.analysis.capabilities.map((candidate) => <article key={candidate.name}><label><span><b>{candidate.name}</b><small>{candidate.type} · {candidate.invocation || "待适配"} · 置信度 {Math.round((candidate.confidence || 0) * 100)}%</small></span></label><div className="candidate-tags">{candidate.categories?.map((category) => <em key={category} style={categoryTagStyle(category)}>{category}</em>)}</div><p>{candidate.summary}</p><code>{candidate.entrypoints?.join(" · ") || "尚未识别入口"}</code></article>) : <div className="analysis-empty">当前来源适配器尚未抓取内容</div>}</div>{imported && <footer><CircleCheck size={14} />已保存 {result.analysis.capabilities.length} 项预备能力，请到“接入与适配”审核发布</footer>}</section>}
        {!result && Object.keys(taxonomy).length > 0 && <details className="capability-taxonomy"><summary>查看自动分类标签词表</summary><div>{Object.entries(taxonomy).map(([type, tags]) => <section key={type}><b>{type}</b><span>{tags.map((tag) => <em key={tag}>{tag}</em>)}</span></section>)}</div></details>}
        <footer>
          <button className="btn" onClick={close}>
            取消
          </button>
          {!result ? <button className="btn primary" disabled={!location.trim() || busy} onClick={analyzeSource}>{busy ? "分析中..." : aiSettings.configured ? "AI 分析来源" : "扫描来源"}</button> : <button className="btn primary" disabled={!result.analysis.capabilities.length || busy || imported} onClick={confirmImport}>{busy ? "保存中..." : "保存到预备清单"}</button>}
        </footer>
        {directoryOpen && <div className="cap-directory-browser"><header><span><small>本地目录</small><b>{directoryPath || "此电脑"}</b></span><button onClick={() => setDirectoryOpen(false)}><X size={14} /></button></header><nav><button className="btn" disabled={!directoryParent} onClick={() => directoryParent && browseCapabilityDirectory(directoryParent)}><ChevronLeft size={13} />上一级</button><button className="btn" onClick={() => browseCapabilityDirectory()}><HardDrive size={13} />磁盘</button></nav><div>{!directoryPath ? directoryRoots.map((root) => <button onClick={() => browseCapabilityDirectory(root)} key={root}><HardDrive size={14} /><span>{root}</span><ChevronRight size={13} /></button>) : directoryEntries.length ? directoryEntries.map((entry) => <button onClick={() => browseCapabilityDirectory(entry.path)} key={entry.path}><Folder size={14} /><span>{entry.name}</span><ChevronRight size={13} /></button>) : <p>当前目录没有子目录</p>}</div><footer><code>{directoryPath || "请选择目录"}</code><button className="btn primary" disabled={!directoryPath} onClick={() => { setLocation(directoryPath); setDirectoryOpen(false); }}>选择此目录</button></footer></div>}
      </section>
    </div>
  );
}

function StandardEditor() {
  const combos = [
    ["A", "只有大图", "未处理原始样本", "image"],
    ["B", "大图 + 小图 × N", "主体与多张参考图", "image + refs[]"],
    [
      "C",
      "大图 + XML + 小图 × N",
      "已处理、带目标语义",
      "image + annotation + refs[]",
    ],
  ];
  return (
    <div className="stack">
      <section className="standard-intro">
        <div>
          <span>数据组合标准化</span>
          <h2>先识别样本组合，再解析目录语义</h2>
          <p>
            原始文件不迁移，通过可配置规则统一大图、小图、XML
            标注以及算法模型的大小类层级。
          </p>
        </div>
        <button className="btn primary">
          <Plus size={14} />
          新建组合规则
        </button>
      </section>
      <section className="combo-section">
        <header>
          <span>
            <small>第一步</small>
            <h3>样本组合识别</h3>
          </span>
          <em>当前命中 C 型</em>
        </header>
        <div>
          {combos.map((c, i) => (
            <article className={i === 2 ? "active" : ""} key={c[0]}>
              <i>{c[0]}</i>
              <span>
                <strong>{c[1]}</strong>
                <small>{c[2]}</small>
                <code>{c[3]}</code>
              </span>
              {i === 2 && (
                <b>
                  <Check size={11} />
                  已匹配
                </b>
              )}
            </article>
          ))}
        </div>
        <footer>
          <CircleAlert size={13} />
          <span>
            XML 表示样本已被人工或自动化方案处理；小图允许为 0 到多张。
          </span>
        </footer>
      </section>
      <section className="mapping-workspace">
        <aside>
          <h3>目录语义</h3>
          <div className="tree">
            <span>
              <FolderTree size={14} />
              visionengine_geometry
            </span>
            <span className="tree-meaning">算法 / 模型大类</span>
            <span className="indent active">
              <Folder size={14} />
              click_the_two_matching...
            </span>
            <span className="tree-meaning indent">小类分支</span>
            <span className="indent2">
              <Folder size={13} />
              20261109
            </span>
            <span className="file indent2">0.jpg · 大图</span>
            <span className="file indent2">0.xml · 标注</span>
            <span className="more indent2">+ 54 个文件</span>
          </div>
          <button>
            <Plus size={13} />
            添加目录语义
          </button>
        </aside>
        <main>
          <header>
            <span>
              <small>当前映射规则</small>
              <h3>几何匹配 C 型数据 v1</h3>
            </span>
            <em>草稿已保存</em>
          </header>
          <div className="schema-flow">
            <article>
              <i>1</i>
              <span>
                <small>层级解析</small>
                <strong>识别大类与分支小类</strong>
                <code>{`{model_family}/{branch}`}</code>
              </span>
            </article>
            <ArrowRight />
            <article>
              <i>2</i>
              <span>
                <small>组合解析</small>
                <strong>主体、标注与可选小图</strong>
                <code>large + xml + small[]</code>
              </span>
            </article>
            <ArrowRight />
            <article>
              <i>3</i>
              <span>
                <small>目标解析</small>
                <strong>0 普通 / 1 关键 + 兜底</strong>
                <code>default / key_target</code>
              </span>
            </article>
          </div>
          <h4>字段映射与兜底规则</h4>
          <div className="field-table">
            <div>
              <span>标准字段</span>
              <span>来源规则</span>
              <span>数据类型</span>
              <span>示例</span>
            </div>
            <div>
              <b>model_family</b>
              <code>数据源目录名</code>
              <span>enum</span>
              <em>visionengine_geometry</em>
            </div>
            <div>
              <b>branch</b>
              <code>一级子目录名</code>
              <span>enum</span>
              <em>click_the_two_matching_shapes</em>
            </div>
            <div>
              <b>large_image</b>
              <code>样本主体 JPG</code>
              <span>image</span>
              <em>0.jpg · 330×330</em>
            </div>
            <div>
              <b>small_images</b>
              <code>关联小图，允许缺省</code>
              <span>image[]</span>
              <em>0…N 张</em>
            </div>
            <div>
              <b>default_targets</b>
              <code>XML name=0；缺失时取最多类</code>
              <span>object[]</span>
              <em>普通目标</em>
            </div>
            <div>
              <b>key_targets</b>
              <code>XML name=1；缺失时取最少类</code>
              <span>object[]</span>
              <em>关键目标</em>
            </div>
          </div>
          <footer>
            <span>
              <CircleCheck size={14} />
              已识别 C 型组合：28 个大图、28 个 XML、0 张小图
            </span>
            <button className="btn primary">验证并应用模板</button>
          </footer>
        </main>
      </section>
    </div>
  );
}

function DataProcessing() {
  const actions = [
    ["人工标注", "查看、修改或补充样本标签", "TableProperties", "进入标注"],
    ["自动化处理", "切割、检测、分类、聚类与生成", "Workflow", "选择方案"],
    ["导入与导出", "按标准模板导入或输出数据集", "Import", "管理任务"],
    [
      "目录快速拓展",
      "复制当前结构，创建同类数据目录",
      "FolderTree",
      "创建目录",
    ],
    ["数据模板编辑", "新增、查询、修改或删除标准样本", "Database", "编辑模板"],
  ];
  return (
    <div className="stack">
      <section className="processing-head">
        <div>
          <small>已选择数据</small>
          <h2>20261109 · 28 个参考型样本</h2>
          <p>click_the_two_matching_shapes · image + Pascal VOC</p>
        </div>
        <button className="btn">
          更换数据范围 <ChevronRight size={13} />
        </button>
      </section>
      <div className="processing-grid">
        {actions.map(([title, desc, , action], i) => {
          const Icon = [
            TableProperties,
            Workflow,
            Import,
            FolderTree,
            Database,
          ][i];
          return (
            <article key={title}>
              <header>
                <i className={`process-icon p${i}`}>
                  <Icon size={19} />
                </i>
                <span>{i < 3 ? "可用" : "预留"}</span>
              </header>
              <h3>{title}</h3>
              <p>{desc}</p>
              <button>
                {action}
                <ChevronRight size={13} />
              </button>
            </article>
          );
        })}
      </div>
      <section className="panel recent-jobs">
        <Head
          title="最近处理任务"
          sub="查看当前数据集的处理与产出记录"
          action="全部记录"
        />
        <div className="job-row head">
          <span>任务</span>
          <span>处理方案</span>
          <span>数据量</span>
          <span>状态</span>
          <span>产出</span>
        </div>
        {[
          [
            "几何对象标注解析",
            "voc-geometry v1.0",
            "28",
            "已完成",
            "67 个对象",
          ],
          ["相似形状检测", "shape-matching v2.2", "28", "运行中", "已完成 72%"],
          ["VOC 数据集导出", "参考型模板", "28", "等待中", "—"],
        ].map((j, i) => (
          <div className="job-row" key={j[0]}>
            <span>
              <i className={`job-dot j${i}`} />
              <b>{j[0]}</b>
            </span>
            <span>{j[1]}</span>
            <span>{j[2]}</span>
            <span>{j[3]}</span>
            <strong>{j[4]}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}

function TaskCatalog({ openWorkbench }: { openWorkbench: () => void }) {
  const tasks = [
    [
      "目标检测",
      "定位目标并输出边界框与置信度",
      "YOLOv11 · 4 套经验配置",
      "生产中",
      "286 / 今日",
    ],
    [
      "图像分类",
      "按业务标签进行单标签或多标签判断",
      "ConvNeXt · 3 套经验配置",
      "生产中",
      "184 / 今日",
    ],
    [
      "智能聚类",
      "提取视觉特征并发现未知样本簇",
      "DINOv2 · 2 套经验配置",
      "评估中",
      "92 / 今日",
    ],
    [
      "精细切割",
      "生成像素级掩码与边界结果",
      "SAM 2 · 5 套经验配置",
      "生产中",
      "318 / 今日",
    ],
    [
      "样本生成",
      "基于条件与提示词生成补充样本",
      "Flux · 1 套经验配置",
      "规划中",
      "尚未运行",
    ],
    [
      "自动标注",
      "结合视觉模型生成标签与描述",
      "Qwen-VL · 3 套经验配置",
      "试运行",
      "76 / 今日",
    ],
  ];
  return (
    <div className="stack">
      <section className="catalog-intro">
        <span>
          <small>预处理能力</small>
          <h2>按任务类型独立配置和运行</h2>
          <p>每类任务拥有自己的模型、参数、经验配置与运行记录，互不干扰。</p>
        </span>
        <button className="btn primary">
          <Plus size={14} />
          创建处理任务
        </button>
      </section>
      <div className="task-grid">
        {tasks.map((t, i) => (
          <article key={t[0]}>
            <header>
              <i className={`task-icon t${i}`}>
                <BarChart3 size={18} />
              </i>
              <em
                className={
                  t[3] === "规划中"
                    ? "muted"
                    : t[3] === "评估中"
                      ? "testing"
                      : ""
                }
              >
                {t[3]}
              </em>
            </header>
            <h3>{t[0]}</h3>
            <p>{t[1]}</p>
            <div>
              <small>推荐处理链</small>
              <strong>{t[2]}</strong>
            </div>
            <footer>
              <span>{t[4]}</span>
              <button onClick={i === 0 || i === 3 ? openWorkbench : undefined}>
                {t[3] === "规划中" ? "查看规划" : "进入任务"}
                <ChevronRight size={13} />
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function Reserved({ title }: { title: string }) {
  return (
    <div className="stack">
      <section className="reserved">
        <i>
          <Plus size={22} />
        </i>
        <small>扩展页面</small>
        <h2>{title}</h2>
        <p>
          页面结构已经预留，后续可按实际业务流程逐步接入数据、配置项和操作能力。
        </p>
        <div>
          <span>页面权限</span>
          <span>数据接口</span>
          <span>筛选与视图</span>
          <span>操作记录</span>
        </div>
      </section>
    </div>
  );
}

function Preprocess(p: {
  images: ImageRecord[];
  selected?: ImageRecord;
  filter: PredictionStatus | "all";
  search: string;
  setFilter: (x: PredictionStatus | "all") => void;
  setSearch: (x: string) => void;
  select: (x: string) => void;
  review: (x: "verified" | "incorrect" | "captured") => void;
}) {
  return (
    <div className="stack">
      <div className="tabs">
        {[
          "全部任务 12",
          "检测 4",
          "分类 3",
          "聚类 2",
          "切割 2",
          "生成 1",
          "标注 3",
        ].map((x, i) => (
          <button className={i ? "" : "active"} key={x}>
            {x}
          </button>
        ))}
      </div>
      <section className="workbench">
        <div className="stream">
          <Head
            title="图像处理流"
            sub={`${p.images.length} 条结果 · 最近 1 小时`}
            action="配置处理链"
          />
          <div className="filters">
            <div>
              {(["all", "failure", "success"] as const).map((x) => (
                <button
                  className={p.filter === x ? "active" : ""}
                  onClick={() => p.setFilter(x)}
                  key={x}
                >
                  {x === "all" ? "全部" : x === "failure" ? "失败" : "成功"}
                </button>
              ))}
            </div>
            <label>
              <Search size={14} />
              <input
                value={p.search}
                onChange={(e) => p.setSearch(e.target.value)}
                placeholder="文件、来源或标签"
              />
            </label>
          </div>
          <div className="images">
            {p.images.map((x) => (
              <button
                className={p.selected?.id === x.id ? "selected" : ""}
                onClick={() => p.select(x.id)}
                key={x.id}
              >
                <div>
                  <img src={x.imageUrl} />
                  <b className={x.prediction}>
                    <Check size={10} />
                    {x.prediction === "success" ? "通过" : "失败"}
                  </b>
                  <em>{Math.round(x.confidence * 100)}%</em>
                </div>
                <strong>
                  {taskNames[x.taskType]} · {x.filename}
                </strong>
                <small>{x.sourceName}</small>
              </button>
            ))}
          </div>
        </div>
        {p.selected && (
          <aside className="inspector">
            <Head title={p.selected.filename} sub="结果检查" />
            <div className="preview">
              <img src={p.selected.imageUrl} />
              <span>目标 A · {Math.round(p.selected.confidence * 100)}%</span>
            </div>
            <div className="reviews">
              <button onClick={() => p.review("verified")}>
                <CircleCheck />
                结果正确
              </button>
              <button onClick={() => p.review("incorrect")}>
                <XCircle />
                结果错误
              </button>
              <button onClick={() => p.review("captured")}>
                <Archive />
                收纳结果
              </button>
            </div>
            <div className="details">
              <h3>执行信息</h3>
              <dl>
                <div>
                  <dt>任务类型</dt>
                  <dd>{taskNames[p.selected.taskType]}</dd>
                </div>
                <div>
                  <dt>配置方案</dt>
                  <dd>{p.selected.modelVersion}</dd>
                </div>
                <div>
                  <dt>置信度</dt>
                  <dd>{(p.selected.confidence * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>耗时</dt>
                  <dd>{p.selected.latencyMs} ms</dd>
                </div>
              </dl>
              <h3>问题标签</h3>
              <p>
                {p.selected.problemTags.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </p>
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}

function Solutions() {
  return (
    <div className="stack">
      <section className="decision-banner">
        <span>
          <i>
            <WandSparkles />
          </i>
          <b>
            有一批新数据需要评估？
            <small>
              先判断能否沿用历史方案，再决定继承配置或创建全新方案。
            </small>
          </b>
        </span>
        <button className="btn primary">
          <Play size={14} />
          开始新数据评估
        </button>
      </section>
      <section className="panel">
        <Head
          title="新数据决策路径"
          sub="系统基于数据分布、标签体系和目标任务给出建议"
        />
        <div className="decisions">
          <Decision
            no="01"
            title="沿用老方案"
            desc="数据分布与目标不变，直接复用已验证方案。"
            tags="同来源 · 同标签 · 低漂移"
          />
          <Decision
            no="02"
            title="老方案 + 新配置"
            desc="保留处理链与模型，调整阈值、提示词或输出。"
            tags="新批次 · 轻微漂移 · 参数微调"
            recommended
          />
          <Decision
            no="03"
            title="创建新方案"
            desc="任务、标签体系或数据域明显变化，从零设计。"
            tags="新任务 · 新数据域 · 新模型"
          />
        </div>
      </section>
      <section className="panel">
        <Head
          title="方案库"
          sub="提示词、数据需求、模型选择、分析与运行配置统一管理"
          action="查看版本历史"
        />
        <SolutionTable />
      </section>
    </div>
  );
}
function Decision({
  no,
  title,
  desc,
  tags,
  recommended,
}: {
  no: string;
  title: string;
  desc: string;
  tags: string;
  recommended?: boolean;
}) {
  return (
    <article className={recommended ? "recommended" : ""}>
      {recommended && <em>系统推荐</em>}
      <small>{no}</small>
      <h3>{title}</h3>
      <p>{desc}</p>
      <b>{tags}</b>
      <button>
        进入配置 <ArrowRight size={13} />
      </button>
    </article>
  );
}
function SolutionTable() {
  return (
    <div className="table">
      <div className="row th">
        <span>方案</span>
        <span>类型 / 模型</span>
        <span>通过率</span>
        <span>状态</span>
      </div>
      {solutions.map((s) => (
        <div className="row" key={s[0]}>
          <span>
            <strong>{s[0]}</strong>
            <small>
              {s[2]} · {s[4]}
            </small>
          </span>
          <span>
            <b>{s[1]}</b>
            <small>{s[3]}</small>
          </span>
          <span className="rate">{s[5]}</span>
          <span>● {s[6]}</span>
        </div>
      ))}
    </div>
  );
}

function Models() {
  const ms = [
    ["YOLOv11-seg", "目标检测 / 实例分割", "11.2.0", "production", "已部署"],
    ["SAM 2 + Edge Refiner", "语义切割", "2.1.4", "boundary-tuning", "已部署"],
    ["DINOv2 Embedder", "特征提取 / 聚类", "1.3.2", "cluster-v2", "评估中"],
    ["Qwen2.5-VL", "视觉理解 / 自动标注", "72B-AWQ", "prompt-lab", "待发布"],
  ];
  return (
    <div className="stack">
      <div className="model-summaries">
        <Summary
          icon={Boxes}
          label="已注册模型"
          value="14"
          note="4 个算法家族"
        />
        <Summary
          icon={Activity}
          label="生产中"
          value="8"
          note="关联 10 个方案"
          tone="green"
        />
        <Summary
          icon={GitBranch}
          label="评估分支"
          value="5"
          note="2 个待合并"
          tone="amber"
        />
      </div>
      <section className="panel">
        <Head
          title="算法与模型"
          sub="统一管理版本、运行配置和实验分支"
          action="注册模型"
        />
        <div className="models">
          {ms.map((m) => (
            <article key={m[0]}>
              <header>
                <i>
                  <Box />
                </i>
                <em>{m[4]}</em>
              </header>
              <h3>{m[0]}</h3>
              <p>{m[1]}</p>
              <dl>
                <div>
                  <dt>当前版本</dt>
                  <dd>{m[2]}</dd>
                </div>
                <div>
                  <dt>活动分支</dt>
                  <dd>{m[3]}</dd>
                </div>
                <div>
                  <dt>关联方案</dt>
                  <dd>3 个</dd>
                </div>
              </dl>
              <button>
                查看配置 <ChevronRight size={14} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function Postprocess() {
  const out = [
    ["缺陷掩码与标注", "自动化标注", "6,420", "18.6 GB", "可导出"],
    ["零件切割结果", "图像切割", "3,184", "42.1 GB", "已收纳"],
    ["合成缺陷样本", "数据生成", "860", "9.7 GB", "待复核"],
  ];
  return (
    <div className="stack">
      <div className="summaries">
        <Summary
          icon={CircleAlert}
          label="待复核"
          value="18"
          note="4 个高优先级"
          tone="amber"
        />
        <Summary
          icon={Archive}
          label="可复用数据"
          value="10,464"
          note="近 7 日 +1,286"
        />
        <Summary
          icon={Download}
          label="今日导出"
          value="326"
          note="3 个导出任务"
          tone="green"
        />
        <Summary
          icon={Database}
          label="存储占用"
          value="70.4 GB"
          note="配额使用 35%"
        />
      </div>
      <section className="panel">
        <Head
          title="处理结果"
          sub="算法产出的标注、切割和生成数据，可继续导出或收纳复用"
          action="批量操作"
        />
        <div className="outputs">
          {out.map((o, i) => (
            <article key={o[0]}>
              <div>
                <img
                  src={`https://images.unsplash.com/${["photo-1531297484001-80022131f5a1", "photo-1581092918056-0c4c3acd3789", "photo-1562408590-e32931084e23"][i]}?auto=format&fit=crop&w=600&q=75`}
                />
                <span>{o[1]}</span>
              </div>
              <h3>{o[0]}</h3>
              <p>
                {o[2]} 个文件 · {o[3]}
              </p>
              <small>● {o[4]}</small>
              <footer>
                <button className="btn">
                  <Archive size={13} />
                  收纳
                </button>
                <button className="btn">
                  <Download size={13} />
                  导出
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function Summary({
  icon: Icon,
  label,
  value,
  note,
  tone = "",
}: {
  icon: typeof ImageIcon;
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className="summary">
      <i className={tone}>
        <Icon size={18} />
      </i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </span>
    </article>
  );
}
function Head({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: string;
}) {
  return (
    <div className="head">
      <span>
        <h2>{title}</h2>
        <p>{sub}</p>
      </span>
      {action && (
        <button>
          {action}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

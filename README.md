# VisPraxis

> AI-powered visual data management platform for dataset organization, annotation, capability integration, and automated image processing workflows.

VisPraxis（视抉）是一个面向图像数据处理的管理平台。项目以数据中心和能力中心为核心，用于关联只读原始数据、建立统一的数据层级、浏览与标注图像，并集中管理模型、算法、脚本、工具和服务。

当前版本处于功能建设阶段，重点打通本地数据源、图像索引、VOC XML 标注和 AI 辅助能力接入。界面中仍有部分规划页面和演示数据，详见[当前完成度](#当前完成度)。

## 核心设计

- **数据源原位标注**：数据源以关联和索引为主；人工标注 XML 与对应图像同目录、同名保存。
- **标准数据独立存储**：数据同步按已识别的数据组整合主图、伴随图与 XML，并按“类型 / 分支 / 版本”写入受管存储。
- **AI 辅助数据层级**：使用“类型 / 分支 / 版本”描述数据集；AI 可分析同一来源中的多套目录规范和组合规则，状态路径作为可选筛选条件。
- **能力统一管控**：模型、算法、脚本、工具和服务都由能力中心接入、审核、发布和编辑。
- **业务页面只做调度**：标注预处理和工具集引用已发布能力，不重复维护能力定义。

## 当前完成度

| 模块 | 状态 | 当前能力 |
| --- | --- | --- |
| 数据总览 | 演示 | 页面框架与演示指标，尚未完全接入真实统计 |
| 数据管理 | 可用 | 数据源增删改查、本地目录选择、连接检查、只读注册 |
| 本地目录同步 | 可用 | 递归扫描图片与 XML，支持同目录及跨 images/icon/bg/xml 等目录建立数据组关系 |
| OSS / MinIO / Redis / MongoDB 数据源 | 部分实现 | 可保存连接配置；真实连接、同步和图像代理适配器尚未启用 |
| 图像浏览 | 可用 | 类型、分支、版本和状态筛选；原图、数据组和标注预览；名称检索 |
| 数据层级配置 | 可用 | AI 或手工示例识别类型、分支、版本；支持多套规范和多个状态路径 |
| 人工标注 | 可用 | 数据组参考、框选、缩放、类别编辑、目标筛选、撤销与 VOC XML 保存 |
| 自动预标注 | 预留 | 界面和能力调度方向已确定，专业模型与通用模型调用尚待接入 |
| 工具集 | 部分实现 | 为流程和 llm_agent 提供能力引用，支持单选、多选和项目级移除 |
| 数据同步 | 可用 | 默认增量且不覆盖；选择单个数据集后可覆盖更新，按数据组写入标准目录 |
| 能力中心 | 可用 | GitHub 与本地目录分析、能力审核发布、分类展示和项目工具集引用 |
| AI 能力分析 | 可用 | 支持 OpenRouter 和 DeepSeek，将来源拆分为候选能力并自动分类 |
| 能力审核与发布 | 可用 | 未审核、已发布、已停用、已删除状态；批量发布、检索、恢复 |
| 能力编辑 | 可用 | 修改名称、类型、说明、标签、调用方式、运行环境、输入输出和依赖 |
| 策略中心 | 规划中 | 当前主要为页面框架，等待数据中心和能力中心产出后继续完善 |

## 数据组织约定

平台不强制原始目录完全标准化，而是通过 AI 分析或手工示例识别三个核心层级：

```text
类型 / [状态或冗余目录] / 分支 / [状态或冗余目录] / 版本 / [状态目录]
```

例如：

```text
visionengine_geometry/
└── click_the_two_matching_shapes/
    ├── 20261109/
    ├── 20261111/
    └── unsolved/
```

- **类型**：数据集或能力大类。
- **分支**：具体任务或场景。
- **版本**：通常使用 8 位日期，也允许类型、分支和版本指向同一路径以兼容简单数据集。
- **状态路径**：如 `train`、`test`、`unsolved`、`failed`、`reviewed`，用于只查看匹配状态的数据。
- **冗余目录**：未被选为核心层级或状态的中间目录，不参与标准层级展示。

### 图像组识别

本地扫描器当前支持以下组合：

1. 单张主图。
2. 主图和多张伴随图，支持 `主图名_数字`、`_icon数字`、`_bg` 等规则。
3. 跨 `images/imgs`、`icon`、`bg`、`xml/annotations/labels` 等平级目录组合主图、伴随图和 VOC XML。
4. AI 从受限的目录与文件名样本中补充内容目录角色和后缀规则；图像及 XML 内容不会发送给 LLM。

图像浏览以主图为核心；“数据组”模式汇总伴随图，“标注”模式在原图坐标系上渲染 XML 框。

### 标准数据同步

- 默认同步全部已识别数据集，仅新增文件，遇到同名文件时跳过。
- 只有选择单个“类型 / 分支 / 版本”数据集后才能启用覆盖更新。
- 同步以主图组为入口，将跨目录关联的 `bg`、`icon`、XML 等文件汇总到同一标准版本目录。
- 原来源目录保持不变；人工标注仍保存到原图旁的同名 XML。

## 技术架构

```text
React 19 + TypeScript + Vite
              │ /api proxy
              ▼
       FastAPI + Pydantic
              │
      ┌───────┴────────┐
      │                │
Local JSON       MongoDB（可选）
      │
本地数据源 + 本地受管存储
```

| 层级 | 技术 |
| --- | --- |
| Web | React 19、TypeScript、Vite、Lucide Icons |
| API | Python、FastAPI、Pydantic、Uvicorn |
| 默认持久化 | 本地 JSON |
| 可选持久化 | MongoDB |
| 标注格式 | Pascal VOC XML |
| AI 接入 | OpenAI-compatible Chat Completions；当前提供 OpenRouter、DeepSeek 配置 |

## 项目结构

```text
VisPraxis/
├── apps/
│   ├── api/                  # FastAPI 服务、扫描器、仓储和能力分析
│   │   ├── app/
│   │   └── data/             # 本地运行数据，已加入 .gitignore
│   └── web/                  # React 单页应用
├── packages/
│   └── contracts/            # 前端共享 TypeScript 类型
├── docs/
│   └── API.md                # API 索引和示例
├── package.json              # npm workspace 与统一脚本
└── README.md
```

## 本地开发

### 环境要求

- Node.js 20+
- npm 10+
- Python 3.11+

### 安装

```powershell
npm install
python -m pip install -r apps/api/requirements.txt
```

### 启动

```powershell
npm run dev
```

启动后可访问：

- Web：<http://127.0.0.1:5173/>
- API：<http://127.0.0.1:4101/>
- OpenAPI：<http://127.0.0.1:4101/docs>
- 健康检查：<http://127.0.0.1:4101/health>

前端开发服务器会将 `/api` 请求代理到 `127.0.0.1:4101`。

### 构建与检查

```powershell
npm run build
npm run typecheck
```

## 持久化配置

默认使用本地 JSON，不需要预先安装数据库：

- 数据源、资产索引和存储设置：`apps/api/data/catalog.json`
- AI 设置和能力记录：`apps/api/data/capabilities.json`

`apps/api/data/` 已被 Git 忽略。当前 API Key 会保存在本机能力配置文件中，仅适用于本地开发环境，请勿提交或共享该文件。

可通过环境变量切换数据目录或 MongoDB：

| 环境变量 | 作用 | 默认值 |
| --- | --- | --- |
| `VISPRAXIS_DATA_FILE` | 数据目录 JSON 文件路径 | `apps/api/data/catalog.json` |
| `VISPRAXIS_MONGODB_URI` | 设置后启用 MongoDB 仓储 | 未设置 |
| `VISPRAXIS_MONGODB_DATABASE` | MongoDB 数据库名 | `vispraxis` |

```powershell
$env:VISPRAXIS_MONGODB_URI = "mongodb://127.0.0.1:27017"
$env:VISPRAXIS_MONGODB_DATABASE = "vispraxis"
npm run dev
```

MongoDB 只保存来源定义、映射、扫描索引、XML 摘要、处理元数据和存储配置；原始图片仍保留在源端。

## AI 能力接入

在“系统设置 → AI 基础设施”中配置 LLM 提供方、Base URL、模型和 API Key。当前流程为：

1. 从 GitHub、本地目录、说明文档或服务地址创建接入任务。
2. 扫描来源中的入口、依赖和说明内容。
3. 使用 LLM 判断项目边界，拆分模型、算法、脚本、工具或服务。
4. 将分析结果保存到未审核清单。
5. 人工检查后发布，发布能力才允许被其他模块调度。

目前 GitHub 仓库和本地目录的扫描、AI 分析链路最完整；远程文档抓取和服务协议解析仍需继续实现。GitHub 分析会读取仓库归档并优先识别启动文件、CLI、包入口与服务入口，不会把全部文档拆成独立能力。

## API

接口按以下领域划分：

- `/api/data-sources`：数据源注册、连接检查、同步、层级配置和资产查询。
- `/api/storage`：标准数据受管存储配置。
- `/api/capabilities`：能力分析、导入、审核、编辑和删除状态。
- `/api/filesystem`：本地目录选择器。
- `/api/dashboard`：当前总览兼容接口。

完整接口说明见 [docs/API.md](docs/API.md)，运行环境中的准确请求模型以 FastAPI OpenAPI 页面为准。

## 当前限制

- 仅本地目录支持真实扫描和文件读取，远程数据源当前只保存配置。
- GitHub 来源支持公开仓库归档分析；私有仓库认证和远程文档抓取尚未实现。
- 工具集、自动预标注和策略执行器尚未形成完整后端任务系统。
- 数据总览仍包含演示指标，不能作为生产统计依据。
- 当前没有用户、权限、审计和密钥加密机制，不适合直接暴露到公网。
- 本地扫描为同步执行，大规模目录后续需要改造成后台任务和增量索引。

## 下一阶段

1. 完善能力版本、配置适配和统一调用协议。
2. 将已发布能力接入人工标注预标注与工具集。
3. 增加任务队列、运行日志、取消和失败重试。
4. 实现 OSS、MinIO、Redis 和 MongoDB 数据源适配器。
5. 用真实资产和任务统计替换数据总览演示数据。
6. 增加自动化测试、鉴权、密钥加密与部署配置。

## 命名约定

- 产品和文档名称：`VisPraxis`
- GitHub 仓库、Python 包和命令：`vispraxis`
- npm workspace：`@vispraxis/*`
- 环境变量前缀：`VISPRAXIS_`

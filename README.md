# VisPraxis

> AI-powered visual data management platform for dataset organization, annotation, capability integration, and automated image processing workflows.

VisPraxis（视抉）是一个面向图像数据处理的管理平台。项目以数据中心和能力中心为核心，用于关联只读原始数据、建立统一的数据层级、浏览与标注图像，并集中管理模型、算法、脚本、工具和服务。

当前版本处于功能建设阶段，重点打通本地数据源、图像索引、VOC XML 标注和 AI 辅助能力接入。界面中仍有部分规划页面和演示数据，详见[当前完成度](#当前完成度)。

## 核心设计

- **原始数据只读**：数据源以关联和索引为主，不直接修改源目录。
- **标准数据独立存储**：人工标注和后续处理产出写入受管存储目录。
- **统一数据层级**：使用“类型 / 分支 / 版本”描述数据集，状态路径作为可选筛选条件。
- **能力统一管控**：模型、算法、脚本、工具和服务都由能力中心接入、审核、发布和编辑。
- **业务页面只做调度**：标注预处理和批量工具引用已发布能力，不重复维护能力定义。

## 当前完成度

| 模块 | 状态 | 当前能力 |
| --- | --- | --- |
| 数据总览 | 演示 | 页面框架与演示指标，尚未完全接入真实统计 |
| 数据管理 | 可用 | 数据源增删改查、本地目录选择、连接检查、只读注册 |
| 本地目录同步 | 可用 | 递归扫描图片与 XML，建立资产索引和图像组关系 |
| OSS / MinIO / Redis / MongoDB 数据源 | 部分实现 | 可保存连接配置；真实连接、同步和图像代理适配器尚未启用 |
| 图像浏览 | 可用 | 类型、分支、版本和状态筛选；原图、数据组和标注预览；名称检索 |
| 数据层级配置 | 可用 | 通过示例路径记录类型、分支、版本，支持配置多个状态路径 |
| 人工标注 | 可用 | 数据组参考、框选、缩放、类别编辑、目标筛选、撤销与 VOC XML 保存 |
| 自动预标注 | 预留 | 界面和能力调度方向已确定，专业模型与通用模型调用尚待接入 |
| 批量工具 | 部分实现 | 能力选择与工具库界面；实际批处理执行器尚待实现 |
| 能力中心 | 可用 | GitHub、本地目录、文档和服务来源入口；本地目录分析可用 |
| AI 能力分析 | 可用 | 支持 OpenRouter 和 DeepSeek，将来源拆分为候选能力并自动分类 |
| 能力审核与发布 | 可用 | 未审核、已发布、已停用、已删除状态；批量发布、检索、恢复 |
| 能力编辑 | 可用 | 修改名称、类型、说明、标签、调用方式、运行环境、输入输出和依赖 |
| 策略中心 | 规划中 | 当前主要为页面框架，等待数据中心和能力中心产出后继续完善 |

## 数据组织约定

平台不强制原始目录完全标准化，而是通过示例路径识别三个核心层级：

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
2. 主图和多张伴随小图，小图默认使用 `主图名_数字` 命名。
3. 主图、同名 VOC XML 和可选伴随小图。

图像浏览以主图为核心；“数据组”模式汇总伴随图，“标注”模式在原图坐标系上渲染 XML 框。

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
只读原始目录 + 本地受管存储
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

目前本地目录扫描和 AI 分析链路最完整；GitHub 拉取、远程文档抓取和服务协议解析仍需继续实现。

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
- 能力来源分析暂不负责克隆 GitHub 仓库或下载远程文档。
- 批量工具、自动预标注和策略执行器尚未形成完整后端任务系统。
- 数据总览仍包含演示指标，不能作为生产统计依据。
- 当前没有用户、权限、审计和密钥加密机制，不适合直接暴露到公网。
- 本地扫描为同步执行，大规模目录后续需要改造成后台任务和增量索引。

## 下一阶段

1. 完善能力版本、配置适配和统一调用协议。
2. 将已发布能力接入人工标注预标注与批量工具。
3. 增加任务队列、运行日志、取消和失败重试。
4. 实现 OSS、MinIO、Redis 和 MongoDB 数据源适配器。
5. 用真实资产和任务统计替换数据总览演示数据。
6. 增加自动化测试、鉴权、密钥加密与部署配置。

## 命名约定

- 产品和文档名称：`VisPraxis`
- GitHub 仓库、Python 包和命令：`vispraxis`
- npm workspace：`@vispraxis/*`
- 环境变量前缀：`VISPRAXIS_`

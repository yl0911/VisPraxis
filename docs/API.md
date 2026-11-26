# VisPraxis API

VisPraxis API 基于 FastAPI，开发环境默认监听 `http://127.0.0.1:4101`。可通过以下地址查看运行时生成的完整 OpenAPI 文档：

- Swagger UI：`/docs`
- OpenAPI JSON：`/openapi.json`
- 健康检查：`GET /health`

本文档描述当前版本的接口分组和行为边界，具体字段约束以 OpenAPI 为准。

## 数据源

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/data-sources` | 获取全部数据源 |
| `POST` | `/api/data-sources` | 注册只读数据源 |
| `GET` | `/api/data-sources/{source_id}` | 获取单个数据源 |
| `PATCH` | `/api/data-sources/{source_id}` | 修改名称、地址、说明或连接选项 |
| `DELETE` | `/api/data-sources/{source_id}` | 删除数据源及其索引 |
| `POST` | `/api/data-sources/{source_id}/test` | 检查来源连接 |
| `POST` | `/api/data-sources/{source_id}/scan` | 扫描并重建本地资产索引 |
| `POST` | `/api/data-sources/{source_id}/sync` | 与 `scan` 使用相同的当前同步实现 |
| `GET` | `/api/data-sources/{source_id}/assets` | 分页查询图像资产 |
| `GET` | `/api/data-sources/{source_id}/hierarchy` | 获取分支、版本和路径候选 |
| `PUT` | `/api/data-sources/{source_id}/hierarchy-config` | 保存层级示例和状态路径 |
| `POST` | `/api/data-sources/{source_id}/hierarchy/analyze` | 使用 LLM 分析层级和数据组匹配规则，并重新索引 |
| `GET` | `/api/data-sources/{source_id}/datasets` | 获取已识别的标准数据集 |
| `GET` | `/api/data-sources/{source_id}/branch-previews` | 单次获取类型下各分支的主图数据组预览 |
| `GET` | `/api/data-sources/{source_id}/version-previews` | 单次获取分支下各版本的主图数据组预览 |
| `POST` | `/api/data-sources/{source_id}/storage-sync` | 按数据组同步到标准目录 |
| `GET` | `/api/data-sources/{source_id}/content` | 按相对路径读取本地图像 |
| `GET` | `/api/data-sources/{source_id}/assets/{asset_id}/content` | 读取指定资产图像 |
| `POST` | `/api/data-sources/{source_id}/assets/{asset_id}/annotation` | 在原图同目录保存同名 VOC XML 标注 |

兼容别名 `/api/sources` 仍然存在，但新代码应使用 `/api/data-sources`。

### 注册本地目录

```http
POST /api/data-sources
Content-Type: application/json

{
  "name": "geometry dataset",
  "type": "local",
  "endpoint": "D:\\datasets\\visionengine_geometry",
  "description": "Geometry image dataset",
  "read_only": true,
  "options": {}
}
```

原始来源必须为只读。`type` 当前接受 `local`、`oss`、`minio`、`redis` 和 `mongodb`。只有 `local` 已实现真实连接检查、扫描和图像读取；其他类型保存配置后会返回适配器尚未启用。

### 扫描本地目录

```http
POST /api/data-sources/{source_id}/scan?include_assets=false
```

扫描器会递归处理常见图片格式和 `.xml` 文件，生成稳定的资产 ID、层级、主图/伴随图关系及 XML 摘要。主图、`icon/bg` 等伴随图和 XML 可以位于同一版本的不同内容目录。每次扫描会替换该来源已有索引，但不会修改源文件。

### 查询资产

```http
GET /api/data-sources/{source_id}/assets?skip=0&limit=50&branch=branch_name&version=20261111&status_path=train&search=image_name
```

| 参数 | 说明 |
| --- | --- |
| `skip` | 起始偏移，默认 `0` |
| `limit` | 每页数量，范围 `1-200`，默认 `50` |
| `category` | 类型筛选 |
| `branch` | 分支筛选 |
| `version` | 版本筛选 |
| `status_path` | 可重复传递的状态路径筛选 |
| `search` | 文件名或目录关键字 |

### 保存标注

标注坐标使用相对图像尺寸的百分比，服务端保存为 Pascal VOC 像素坐标：

```http
POST /api/data-sources/{source_id}/assets/{asset_id}/annotation
Content-Type: application/json

{
  "image_width": 1280,
  "image_height": 720,
  "objects": [
    {
      "label": "0",
      "x": 12.5,
      "y": 20.0,
      "width": 18.0,
      "height": 24.0
    }
  ]
}
```

XML 输出位置为：

```text
{原图所在目录}/{原图文件名，扩展名替换为 .xml}
```

该接口保留直接维护数据源配套 XML 的能力。当前产品中的“标注/编辑”主流程使用核心标准目录接口，在完成数据同步后维护标准图像旁的 XML。

## 层级配置

```http
PUT /api/data-sources/{source_id}/hierarchy-config
Content-Type: application/json

{
  "type_example": "visionengine_geometry",
  "branch_example": "visionengine_geometry/click_the_two_matching_shapes",
  "version_example": "visionengine_geometry/click_the_two_matching_shapes/20261111",
  "status_paths": [
    "click_the_two_matching_shapes/train",
    "click_the_two_matching_shapes/unsolved"
  ]
}
```

示例路径用于统一解释原始目录，不会移动或重命名源文件。未被选为类型、分支、版本或状态的中间路径按冗余目录处理。

### AI 层级与组合规则分析

`POST /api/data-sources/{source_id}/hierarchy/analyze` 会在本地先归并目录和文件名模式，再调用已配置的 OpenAI-compatible LLM：

- 同一目录即使包含大量图像，也只形成一条“目录 + 图像数量”摘要。
- 最多发送 120 条代表目录和 60 条文件名样本。
- 不发送图像、XML 内容或文件二进制。
- 返回类型、分支、版本映射，以及内容目录角色和伴随图后缀规则。
- 所选数据源根目录是层级边界；来源或产品父目录不会被追加为标准层级。
- AI 不能创建缺少真实目录依据的语义大类或版本；无版本目录时统一使用 `unknown`。
- 规则经过目录约束和白名单校验后保存，并自动重新索引数据源。

层级接口和两个预览接口中的 `count`、`total` 均表示主图数据组数量，不包含伴随图。`branch-previews` 需要 `category`，`version-previews` 需要 `branch`，并都支持 `status_path`、`search` 和每组预览上限参数。

### 同步到标准目录

```http
POST /api/data-sources/{source_id}/storage-sync
Content-Type: application/json

{
  "dataset": {
    "category": "drag",
    "branch": "complement",
    "version": "20251013"
  },
  "overwrite": false
}
```

`dataset` 为空时同步全部数据集且只能增量写入；`overwrite=true` 必须指定单个数据集。同步以主图组为单位，把跨目录关联的主图、伴随图和 XML 汇总到标准版本目录。版本以下原目录被消除后若存在同名主图，服务端会按原相对路径生成稳定短标识，并让该组伴随图与 XML 共享新主干名，防止不同任务之间发生覆盖。响应同时返回 `groups`、`companions` 和 `renamed_groups` 等统计字段。

## 受管存储

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/storage` | 获取标准数据存储配置 |
| `PUT` | `/api/storage` | 修改导入导出及处理产出的标准数据存储配置 |
| `GET` | `/api/storage/hierarchy` | 获取全部标准数据的类型、分支、版本和数据组统计；`refresh=true` 强制重扫 |
| `GET` | `/api/storage/assets` | 按类型、分支、版本、检索词和标注状态分页浏览标准数据组 |
| `GET` | `/api/storage/branch-previews` | 获取指定标准类型下的分支分块预览 |
| `GET` | `/api/storage/version-previews` | 获取指定标准分支下的版本分块预览 |
| `GET` | `/api/storage/content?path=...` | 按标准目录相对路径读取图像 |
| `POST` | `/api/storage/assets/{asset_id}/annotation` | 在标准图像旁保存同名 Pascal VOC XML |

```http
PUT /api/storage
Content-Type: application/json

{
  "type": "local",
  "endpoint": "D:\\VisPraxis\\managed-data",
  "hierarchy_template": "{category}/{branch}/{version}"
}
```

标准目录首次访问会建立进程内扫描缓存，后续层级筛选和预览直接复用。数据同步、存储配置修改或 `refresh=true` 会使缓存失效。`assets`、`branch-previews` 和 `version-previews` 支持 `annotated_only=true`，用于“标注”展示策略在截取预览前过滤无 XML 数据组。

## 能力中心

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/capabilities` | 获取所有能力及状态 |
| `GET` | `/api/capabilities/taxonomy` | 获取能力类型与推荐分类词表 |
| `POST` | `/api/capabilities/analyze` | 扫描来源并使用可选 LLM 分析能力 |
| `POST` | `/api/capabilities/import` | 将分析结果保存为未审核能力 |
| `PATCH` | `/api/capabilities/status` | 原子批量更新能力状态 |
| `GET` | `/api/tool-set` | 获取工具集中的能力引用与实时能力卡片 |
| `POST` | `/api/tool-set` | 将已发布能力批量加入工具集 |
| `DELETE` | `/api/tool-set` | 批量移除工具集引用，不修改能力中心 |
| `PATCH` | `/api/capabilities/{capability_id}` | 修改能力字段或状态 |
| `DELETE` | `/api/capabilities/{capability_id}` | 软删除能力，将状态改为 `deleted` |

能力状态：

- `draft`：未审核，不允许业务模块调度。
- `published`：已发布，可供其他模块选择。
- `disabled`：已停用。
- `deleted`：软删除，可恢复到其他状态。

工具集的“从能力中心添加”界面只列出未引用的已发布能力，支持按能力类型分类、按名称/ID/说明/标签检索，以及分类全选和跨分类批量添加。

### 分析来源

```http
POST /api/capabilities/analyze
Content-Type: application/json

{
  "source_type": "local",
  "location": "D:\\code\\image-tools",
  "preferred_type": "auto",
  "group": "auto"
}
```

`source_type` 接受 `github`、`local`、`docs` 和 `service`。当前只有本地目录会扫描实际文件；其他来源类型保留接入定义，但抓取适配器尚未完成。

### 修改能力

所有字段均为可选，只更新请求中出现的字段：

```http
PATCH /api/capabilities/{capability_id}
Content-Type: application/json

{
  "name": "image-deduplication",
  "type": "脚本",
  "summary": "批量检测并清理重复图像。",
  "categories": ["图像处理", "数据清洗"],
  "runtime": "Python 3.11",
  "invocation": "CLI",
  "entrypoints": ["deduplicate.py"],
  "inputs": ["图像目录"],
  "outputs": ["去重结果"],
  "parameters": ["--input", "--threshold"],
  "dependencies": ["Pillow"],
  "status": "published"
}
```

## AI 设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/capabilities/ai-settings` | 获取脱敏后的当前配置 |
| `PUT` | `/api/capabilities/ai-settings` | 保存提供方、Base URL、模型和 API Key |
| `POST` | `/api/capabilities/ai-settings/test` | 测试当前 LLM 配置 |

当前实现使用 OpenAI-compatible `chat/completions` 协议，内置 OpenRouter 和 DeepSeek 配置入口。

## 本地目录浏览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/filesystem/roots` | 获取可访问磁盘根目录 |
| `GET` | `/api/filesystem/directories?path=...` | 获取指定目录的子目录 |

该接口用于本机开发环境的目录选择器。部署到远程服务器后，它浏览的是 API 服务所在机器的文件系统。

## 兼容与演示接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/dashboard` | 总览兼容数据，部分指标仍为演示值 |
| `PATCH` | `/api/images/{image_id}/review` | 旧版图像巡检状态接口 |

这些接口将随真实任务统计和统一资产模型完善而调整，不建议作为稳定集成协议。

## 常见状态码

| 状态码 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `201` | 资源创建成功 |
| `204` | 删除成功，无响应体 |
| `404` | 数据源、资产或能力不存在 |
| `422` | 参数、目录或连接配置无效 |
| `501` | 来源已注册，但对应适配器尚未实现 |

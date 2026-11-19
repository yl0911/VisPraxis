import fg from "fast-glob";
import { stat } from "node:fs/promises";
import type { DataSource, SourceType } from "@vispraxis/contracts";

export interface ConnectorTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataSourceConnector {
  readonly type: SourceType;
  test(source: DataSource): Promise<ConnectorTestResult>;
}

class SimulatedRemoteConnector implements DataSourceConnector {
  constructor(public readonly type: SourceType) {}

  async test(source: DataSource): Promise<ConnectorTestResult> {
    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 240));
    return {
      ok: source.status !== "offline",
      latencyMs: Math.round(performance.now() - startedAt),
      message: source.status === "warning" ? "连接成功，但响应时间偏高" : "连接成功，数据源可访问",
      details: { endpoint: source.endpoint, mode: "configuration-preview" }
    };
  }
}

class LocalConnector implements DataSourceConnector {
  readonly type = "local" as const;

  async test(source: DataSource): Promise<ConnectorTestResult> {
    const startedAt = performance.now();
    try {
      const info = await stat(source.endpoint);
      const files = info.isDirectory()
        ? await fg(["**/*.{jpg,jpeg,png,webp,bmp,tif,tiff}"], { cwd: source.endpoint, onlyFiles: true, deep: 3 })
        : [];
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - startedAt),
        message: `目录可访问，发现 ${files.length} 个图像文件`,
        details: { directory: source.endpoint, imageCount: files.length }
      };
    } catch {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        message: "演示路径尚未挂载，请在数据源设置中替换为实际目录"
      };
    }
  }
}

const connectors: Record<SourceType, DataSourceConnector> = {
  local: new LocalConnector(),
  oss: new SimulatedRemoteConnector("oss"),
  minio: new SimulatedRemoteConnector("minio"),
  redis: new SimulatedRemoteConnector("redis"),
  mongodb: new SimulatedRemoteConnector("mongodb")
};

export function getConnector(type: SourceType): DataSourceConnector {
  return connectors[type];
}

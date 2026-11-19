import type { DashboardSummary, DataSource, ImageRecord } from "@vispraxis/contracts";

export const sources: DataSource[] = [
  {
    id: "src-redis-live",
    name: "生产实时流",
    type: "redis",
    status: "healthy",
    endpoint: "redis://production-cache/3",
    description: "最新生产成功、失败和低置信度图像",
    imageCount: 286,
    lastSyncAt: new Date(Date.now() - 18_000).toISOString(),
    latencyMs: 12,
    writable: false
  },
  {
    id: "src-minio-primary",
    name: "生产图像归档",
    type: "minio",
    status: "healthy",
    endpoint: "minio://vision-production/images",
    description: "生产原图、结果图和需要固化的案例",
    imageCount: 12840,
    lastSyncAt: new Date(Date.now() - 120_000).toISOString(),
    latencyMs: 48,
    writable: true
  },
  {
    id: "src-mongo-config",
    name: "算法配置中心",
    type: "mongodb",
    status: "warning",
    endpoint: "mongodb://config-cluster/vision",
    description: "设备、任务和现有算法方案配置",
    imageCount: 0,
    lastSyncAt: new Date(Date.now() - 3_600_000).toISOString(),
    latencyMs: 186,
    writable: false
  },
  {
    id: "src-local-curated",
    name: "专家案例目录",
    type: "local",
    status: "healthy",
    endpoint: "D:\\vision-data\\curated",
    description: "正确图像、Label 与已验证方案清单",
    imageCount: 438,
    lastSyncAt: new Date(Date.now() - 600_000).toISOString(),
    latencyMs: 4,
    writable: true
  }
];

const imageSeeds = [
  ["photo-1518709268805-4e9042af9f23", "定位", "localization", ["小目标", "复杂背景"]],
  ["photo-1531297484001-80022131f5a1", "切割", "segmentation", ["低对比度", "弱边界"]],
  ["photo-1581092918056-0c4c3acd3789", "匹配", "matching", ["反光", "旋转"]],
  ["photo-1562408590-e32931084e23", "分析", "analysis", ["纹理异常"]],
  ["photo-1531053326607-9d349096d887", "定位", "localization", ["遮挡", "低置信度"]],
  ["photo-1504917595217-d4dc5ebe6122", "切割", "segmentation", ["金属反光"]],
  ["photo-1586864387967-d02ef85d93e8", "匹配", "matching", ["重复纹理"]],
  ["photo-1563770660941-10a63607739c", "分析", "analysis", ["表面缺陷"]],
  ["photo-1518770660439-4636190af475", "定位", "localization", ["微小部件"]],
  ["photo-1581091226825-a6a2a5aee158", "切割", "segmentation", ["边界断裂"]],
  ["photo-1581092160607-ee22621dd758", "匹配", "matching", ["视角变化"]],
  ["photo-1580982330720-bd5e0fed108b", "分析", "analysis", ["颜色偏差"]]
] as const;

export const images: ImageRecord[] = imageSeeds.map((seed, index) => {
  const failure = [1, 4, 7, 9].includes(index);
  const source = index < 6 ? sources[0] : sources[1];
  return {
    id: `img-${String(index + 1).padStart(3, "0")}`,
    sourceId: source.id,
    sourceName: source.name,
    imageUrl: `https://images.unsplash.com/${seed[0]}?auto=format&fit=crop&w=1200&q=82`,
    filename: `line-b-${String(8400 + index)}.jpg`,
    capturedAt: new Date(Date.now() - index * 94_000).toISOString(),
    prediction: failure ? "failure" : "success",
    reviewStatus: index === 2 ? "verified" : index === 7 ? "captured" : "unreviewed",
    confidence: failure ? 0.42 + index * 0.018 : 0.91 + (index % 5) * 0.015,
    taskType: seed[2],
    problemTags: [...seed[3]],
    modelVersion: index % 3 === 0 ? "solution-2.4.1" : "solution-2.3.8",
    latencyMs: 74 + index * 11,
    width: 1920,
    height: 1080
  };
});

export function getSummary(): DashboardSummary {
  return {
    totalToday: 286,
    successRate: 96.4,
    needsReview: images.filter((image) => image.reviewStatus === "unreviewed" && image.prediction === "failure").length,
    capturedCases: images.filter((image) => image.reviewStatus === "captured").length + 28,
    averageLatencyMs: Math.round(images.reduce((sum, image) => sum + image.latencyMs, 0) / images.length)
  };
}

export type SourceType = "oss" | "minio" | "redis" | "mongodb" | "local";
export type SourceStatus = "healthy" | "warning" | "offline";
export type ReviewStatus = "unreviewed" | "verified" | "incorrect" | "captured";
export type PredictionStatus = "success" | "failure";

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  endpoint: string;
  description: string;
  imageCount: number;
  lastSyncAt: string;
  latencyMs?: number;
  writable: boolean;
}

export interface ImageRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  imageUrl: string;
  filename: string;
  capturedAt: string;
  prediction: PredictionStatus;
  reviewStatus: ReviewStatus;
  confidence: number;
  taskType: "localization" | "segmentation" | "matching" | "analysis";
  problemTags: string[];
  modelVersion: string;
  latencyMs: number;
  width: number;
  height: number;
}

export interface DashboardSummary {
  totalToday: number;
  successRate: number;
  needsReview: number;
  capturedCases: number;
  averageLatencyMs: number;
}

// Mirrors the Postgres enums defined in packages/db/src/schema.ts.
// Keep these in sync by hand — there are few enough of them that a codegen
// step would be more overhead than it saves.

export type Platform = "tiktok" | "shorts" | "reels";

export const PLATFORMS: Platform[] = ["tiktok", "shorts", "reels"];

export type SourceType = "youtube" | "twitch" | "upload";

export type ProjectStatus =
  | "pending"
  | "ingesting"
  | "ingested"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "cutting"
  | "completed"
  | "failed";

export type JobType = "ingest" | "transcribe" | "analyze" | "cut_caption";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type ClipStatus =
  | "candidate"
  | "approved"
  | "rejected"
  | "rendering"
  | "rendered"
  | "failed";

export type RenderStatus = "pending" | "rendering" | "rendered" | "failed";

export type CaptionPreset = "bold" | "minimal" | "karaoke";

/** Payload shape stored on jobs.payload, keyed by job type. */
export interface JobPayloadByType {
  ingest: Record<string, never>;
  transcribe: Record<string, never>;
  analyze: Record<string, never>;
  cut_caption: { clipId: string; platform: Platform };
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

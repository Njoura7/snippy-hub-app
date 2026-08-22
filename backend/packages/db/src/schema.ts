import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "ingesting",
  "ingested",
  "transcribing",
  "analyzing",
  "ready",
  "cutting",
  "completed",
  "failed",
]);

export const jobTypeEnum = pgEnum("job_type", ["ingest", "transcribe", "analyze", "cut_caption"]);

export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "completed", "failed"]);

export const clipStatusEnum = pgEnum("clip_status", [
  "candidate",
  "approved",
  "rejected",
  "rendering",
  "rendered",
  "failed",
]);

export const renderStatusEnum = pgEnum("render_status", ["pending", "rendering", "rendered", "failed"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 'youtube' | 'twitch' | 'upload'
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  originalFilename: text("original_filename"),
  // Key into whichever storage driver is active (local disk path or R2 object key) —
  // set once the ingest job completes.
  storageKey: text("storage_key"),
  title: text("title"),
  durationSeconds: integer("duration_seconds"),
  targetPlatforms: text("target_platforms")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  status: projectStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Split out from `projects` (rather than a jsonb column on it) so listing/polling
// projects stays cheap and never drags a large word-timestamp blob along.
export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  fullText: text("full_text").notNull(),
  // WordTimestamp[] from @cutroom/shared — [{ word, start, end, confidence }, ...]
  words: jsonb("words").notNull(),
  language: text("language"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Our queue. Claimed via `SELECT ... FOR UPDATE SKIP LOCKED` (see @cutroom/db
// queries) even though only one worker runs today — costs nothing now and means
// raising concurrency later needs no schema change.
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    // JobPayloadByType[type] from @cutroom/shared
    payload: jsonb("payload").notNull().default({}),
    result: jsonb("result"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jobs_poll_idx").on(table.status, table.runAfter)],
);

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  score: real("score").notNull(),
  hookText: text("hook_text").notNull(),
  // Open set from the LLM ('Story' / 'Lesson' / 'Tactic' / ...), not an enum.
  tag: text("tag").notNull(),
  // Single LLM-suggested emoji for the header caption overlay — nullable
  // since older rows (and the analyze providers) may not always produce one.
  emoji: text("emoji"),
  transcriptExcerpt: text("transcript_excerpt"),
  status: clipStatusEnum("status").notNull().default("candidate"),
  captionPreset: text("caption_preset").notNull().default("bold"),
  // { font?, color?, position?, size?, headerEnabled? } — see resolveCaptionStyle in
  // apps/worker/src/handlers/cutCaption.ts. headerEnabled defaults true when unset.
  captionStyleOverrides: jsonb("caption_style_overrides"),
  // References a track in the curated library (packages/pipeline/assets/music/manifest.json)
  // or a user-supplied storage key. Null = no background music.
  backgroundMusicKey: text("background_music_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per (clip, platform) — a clip renders one output per selected
// platform, each with its own status/storage key/error, so this can't
// collapse into a single column on `clips`.
export const clipRenders = pgTable(
  "clip_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    status: renderStatusEnum("status").notNull().default("pending"),
    storageKey: text("storage_key"),
    renderJobId: uuid("render_job_id").references(() => jobs.id),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clip_renders_clip_platform_idx").on(table.clipId, table.platform)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type ClipRender = typeof clipRenders.$inferSelect;
export type NewClipRender = typeof clipRenders.$inferInsert;

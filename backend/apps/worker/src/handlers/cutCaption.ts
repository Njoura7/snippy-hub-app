import { createReadStream } from "node:fs";
import { clipRenders, clips, projects, transcripts, type Db, type Job } from "@cutroom/db";
import { cutAndCaptionClip, type CaptionFont, type HeaderCaptionConfig, type ResolvedCaptionStyle } from "@cutroom/pipeline";
import type { StorageDriver } from "@cutroom/storage";
import { and, eq } from "drizzle-orm";
import type { WorkerConfig } from "../env.js";
import { resolveStorageTarget } from "../storageTarget.js";

type ColorName = "white" | "yellow" | "accent";
type Position = "top" | "middle" | "bottom";

interface CaptionStyleOverrides {
  font?: CaptionFont;
  color?: ColorName;
  position?: Position;
  size?: number;
  /** Show the persistent hook+emoji header caption. Defaults true when unset. */
  headerEnabled?: boolean;
}

const FONTS: CaptionFont[] = ["anton", "bebas", "poppins", "ubuntu"];
const COLOR_HEX: Record<ColorName, string> = { white: "#FFFFFF", yellow: "#FFDE00", accent: "#4F6FEA" };
const POSITIONS: Position[] = ["top", "middle", "bottom"];

// Mirrors the frontend's CAPTION_PRESETS defaults (clip.$clipId.tsx) — kept
// in sync by hand, same as the enum types shared with @cutroom/shared.
const PRESET_DEFAULTS: Record<string, { font: CaptionFont; color: ColorName; size: number }> = {
  bold: { font: "anton", color: "yellow", size: 36 },
  minimal: { font: "poppins", color: "white", size: 24 },
  karaoke: { font: "bebas", color: "accent", size: 30 },
};

// Mirrors the frontend's PLATFORM_VARIANTS default position.
const PLATFORM_DEFAULT_POSITION: Record<string, Position> = {
  tiktok: "bottom",
  shorts: "middle",
  reels: "top",
};

function resolveCaptionStyle(preset: string, platform: string, overridesRaw: unknown): ResolvedCaptionStyle {
  const defaults = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS["bold"]!;
  const o = (typeof overridesRaw === "object" && overridesRaw !== null ? overridesRaw : {}) as CaptionStyleOverrides;

  const font = o.font && FONTS.includes(o.font) ? o.font : defaults.font;
  const colorName = o.color && o.color in COLOR_HEX ? o.color : defaults.color;
  const position = o.position && POSITIONS.includes(o.position) ? o.position : (PLATFORM_DEFAULT_POSITION[platform] ?? "bottom");
  const size = typeof o.size === "number" && o.size > 0 ? o.size : defaults.size;

  return { font, colorHex: COLOR_HEX[colorName], position, size };
}

function resolveHeaderCaption(hookText: string, overridesRaw: unknown): HeaderCaptionConfig {
  const o = (typeof overridesRaw === "object" && overridesRaw !== null ? overridesRaw : {}) as CaptionStyleOverrides;
  return {
    enabled: o.headerEnabled ?? true,
    text: hookText,
  };
}

/** Handles job.type === "cut_caption": cuts, crops to 9:16, burns captions
 * for one (clip, platform), uploads the render, updates clip_renders.
 * Triggered per-clip by POST /clips/:id/export — never auto-chained. */
export async function handleCutCaptionJob(db: Db, storage: StorageDriver, config: WorkerConfig, job: Job) {
  const payload = job.payload as { clipId: string; platform: string };
  const { clipId, platform } = payload;

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) throw new Error(`Clip ${clipId} not found`);

  const project = await db.query.projects.findFirst({ where: eq(projects.id, clip.projectId) });
  if (!project?.storageKey) throw new Error(`Project ${clip.projectId} has no storageKey`);

  const transcript = await db.query.transcripts.findFirst({ where: eq(transcripts.projectId, project.id) });
  if (!transcript) throw new Error(`Project ${project.id} has no transcript`);

  await db
    .update(clipRenders)
    .set({ status: "rendering", updatedAt: new Date() })
    .where(and(eq(clipRenders.clipId, clipId), eq(clipRenders.platform, platform)));

  const sourceTarget = await resolveStorageTarget(storage, config, project.storageKey);
  const style = resolveCaptionStyle(clip.captionPreset, platform, clip.captionStyleOverrides);
  const header = resolveHeaderCaption(clip.hookText, clip.captionStyleOverrides);
  const words = transcript.words as { word: string; start: number; end: number }[];

  const rendered = await cutAndCaptionClip({
    sourceTarget,
    startMs: clip.startMs,
    endMs: clip.endMs,
    words,
    style,
    header,
    emoji: clip.emoji,
    backgroundMusicKey: clip.backgroundMusicKey,
    musicVolume: clip.musicVolume,
    voiceVolume: clip.voiceVolume,
  });

  try {
    const storageKey = `clips/${clipId}/${platform}.mp4`;
    await storage.put(storageKey, createReadStream(rendered.filePath), { contentType: "video/mp4" });

    await db
      .update(clipRenders)
      .set({ status: "rendered", storageKey, errorMessage: null, updatedAt: new Date() })
      .where(and(eq(clipRenders.clipId, clipId), eq(clipRenders.platform, platform)));
  } finally {
    await rendered.cleanup();
  }
}

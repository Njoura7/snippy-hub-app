import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WordTimestamp } from "@cutroom/shared";
import { buildAssSubtitles, type HeaderCaptionConfig, type ResolvedCaptionStyle } from "../clients/ass.js";
import { getEmojiImagePath } from "../clients/emojiLibrary.js";
import { renderVerticalClip } from "../clients/ffmpegRender.js";
import { probeVideoDimensions } from "../clients/ffprobe.js";
import { getMusicFilePath } from "../clients/musicLibrary.js";
import { computeSmartCropPlan } from "./smartCrop.js";

export interface CutCaptionInput {
  sourceTarget: string;
  startMs: number;
  endMs: number;
  /** Full transcript word timestamps (absolute, seconds) — sliced to the clip range here. */
  words: WordTimestamp[];
  style: ResolvedCaptionStyle;
  header: HeaderCaptionConfig;
  /** Must be one of emojiLibrary.ts's SUPPORTED_EMOJI, or null/undefined for no badge. */
  emoji?: string | null;
  /** Key into packages/pipeline/assets/music/manifest.json — see clients/musicLibrary.ts. */
  backgroundMusicKey?: string | null;
}

export interface CutCaptionResult {
  filePath: string;
  cleanup: () => Promise<void>;
}

/** Cuts, crops to 9:16 (re-centering per camera cut on the detected speaker
 * — see steps/smartCrop.ts), burns in captions + header, and optionally
 * mixes in background music for one clip. Caller is responsible for
 * uploading `filePath` to storage and calling `cleanup()`. */
export async function cutAndCaptionClip(input: CutCaptionInput): Promise<CutCaptionResult> {
  const workDir = await mkdtemp(path.join(tmpdir(), "cutroom-cut-"));
  const startSeconds = input.startMs / 1000;
  const endSeconds = input.endMs / 1000;
  const clipDuration = endSeconds - startSeconds;

  try {
    const { width: sourceWidth, height: sourceHeight } = await probeVideoDimensions(input.sourceTarget);
    // Even width required by libx264; matches the crop math the render step used to do inline.
    const cropWidth = Math.trunc(((sourceHeight * 9) / 16 / 2)) * 2;

    const cropPlan = await computeSmartCropPlan({
      sourceTarget: input.sourceTarget,
      clipStartSeconds: startSeconds,
      clipEndSeconds: endSeconds,
      sourceWidth,
      sourceHeight,
      cropWidth,
    });

    const clipWords = input.words
      .filter((w) => w.start >= startSeconds && w.start < endSeconds)
      .map((w) => ({ ...w, start: w.start - startSeconds, end: w.end - startSeconds }));

    const assPath = path.join(workDir, "captions.ass");
    await writeFile(assPath, buildAssSubtitles(clipWords, input.style, input.header, clipDuration), "utf-8");

    const musicFilePath = input.backgroundMusicKey ? await getMusicFilePath(input.backgroundMusicKey) : null;
    const emojiImagePath = input.header.enabled && input.emoji ? getEmojiImagePath(input.emoji) : null;

    const outputPath = path.join(workDir, "clip.mp4");
    await renderVerticalClip({
      sourceTarget: input.sourceTarget,
      startSeconds,
      endSeconds,
      cropWidth,
      cropPlan,
      assFilePath: assPath,
      outputPath,
      musicFilePath: musicFilePath ?? undefined,
      emojiImagePath: emojiImagePath ?? undefined,
    });

    return {
      filePath: outputPath,
      cleanup: () => rm(workDir, { recursive: true, force: true }),
    };
  } catch (err) {
    await rm(workDir, { recursive: true, force: true });
    throw err;
  }
}

import type { CropKeyframe } from "../steps/smartCrop.js";
import { runCommand } from "./processRunner.js";

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
// Background music mix level, relative to the (unmodified) speech track —
// deliberately quiet: "minimal and not distracting", the dialogue must stay
// dominant. No loudness normalization, so this is a rough heuristic, not a
// precise dB target.
const MUSIC_VOLUME = 0.12;
const MUSIC_FADE_SECONDS = 1;
// Emoji badge, top-left, fixed position — see clients/emojiLibrary.ts for
// why this is a real PNG composited in rather than an ASS text glyph.
const EMOJI_SIZE = 90;
const EMOJI_MARGIN = 50;

/** Escapes a path for use inside an ffmpeg filtergraph argument (colons and
 * backslashes are filter-syntax-significant). Our temp paths are generated
 * by mkdtemp so this is defensive, not load-bearing. */
function escapeForFilter(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Builds a step-function ffmpeg expression for crop's `x` from a per-scene
 * plan — e.g. two cuts becomes `if(lt(t,5.2),120,if(lt(t,12.8),340,180))`. A
 * single-segment plan (no cuts detected) just becomes a plain number. */
function buildCropXExpression(plan: CropKeyframe[]): string {
  let expr = String(plan[plan.length - 1]!.cropX);
  for (let i = plan.length - 2; i >= 0; i--) {
    expr = `if(lt(t,${plan[i + 1]!.startSeconds}),${plan[i]!.cropX},${expr})`;
  }
  return expr;
}

export interface RenderVerticalClipInput {
  /** Local path or http(s) URL — ffmpeg's `-i` accepts either. */
  sourceTarget: string;
  startSeconds: number;
  endSeconds: number;
  /** Crop window width in source-frame pixels — see smartCrop.ts. */
  cropWidth: number;
  /** Per-scene crop x-offsets — see computeSmartCropPlan in steps/smartCrop.ts. */
  cropPlan: CropKeyframe[];
  assFilePath: string;
  outputPath: string;
  /** Local file path to a background track — see clients/musicLibrary.ts. Omit for none. */
  musicFilePath?: string;
  /** Local file path to a curated emoji PNG — see clients/emojiLibrary.ts. Omit for none. */
  emojiImagePath?: string;
}

/**
 * Cuts [startSeconds, endSeconds) from the source, crops to 9:16 following
 * `cropPlan` (re-centering on the detected speaker at each camera cut rather
 * than a single fixed center crop), scales to 1080x1920, burns in the given
 * ASS subtitles, composites an emoji badge (top-left, if set), and mixes in
 * a low-volume background track (if set) — all in one ffmpeg pass. `-ss`
 * before `-i` (input seeking) so long source videos don't get fully decoded
 * just to reach the cut point.
 */
export async function renderVerticalClip(input: RenderVerticalClipInput): Promise<void> {
  const duration = input.endSeconds - input.startSeconds;
  if (duration <= 0) throw new Error(`Invalid clip range: ${input.startSeconds} -> ${input.endSeconds}`);

  const cropXExpr = buildCropXExpression(input.cropPlan);
  // lanczos for sharper downscaling than the default bilinear, then burn captions
  const videoChain = `crop=${input.cropWidth}:ih:x='${cropXExpr}':y=0,scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos,subtitles=${escapeForFilter(input.assFilePath)}`;

  const args = ["-y", "-ss", String(input.startSeconds), "-i", input.sourceTarget];

  let nextInputIndex = 1;
  let musicInputIndex: number | null = null;
  let emojiInputIndex: number | null = null;

  if (input.musicFilePath) {
    args.push("-stream_loop", "-1", "-i", input.musicFilePath);
    musicInputIndex = nextInputIndex++;
  }
  if (input.emojiImagePath) {
    // -loop 1: a static image is normally a single frame — this repeats it
    // for as long as the overlay filter below needs it.
    args.push("-loop", "1", "-i", input.emojiImagePath);
    emojiInputIndex = nextInputIndex++;
  }

  args.push("-t", String(duration));

  const filterParts = [`[0:v]${videoChain}[vbase]`];
  let videoOutLabel = "vbase";

  if (emojiInputIndex !== null) {
    filterParts.push(
      `[${emojiInputIndex}:v]scale=${EMOJI_SIZE}:${EMOJI_SIZE}[emoji]`,
      `[vbase][emoji]overlay=x=${EMOJI_MARGIN}:y=${EMOJI_MARGIN}:enable='between(t,0,${duration})'[vout]`,
    );
    videoOutLabel = "vout";
  }

  let audioMapArg = "0:a";
  if (musicInputIndex !== null) {
    const fadeOutStart = Math.max(0, duration - MUSIC_FADE_SECONDS);
    filterParts.push(
      `[${musicInputIndex}:a]atrim=0:${duration},volume=${MUSIC_VOLUME},afade=t=in:st=0:d=${MUSIC_FADE_SECONDS},afade=t=out:st=${fadeOutStart}:d=${MUSIC_FADE_SECONDS}[bg]`,
      // normalize=0 is load-bearing: amix's default (true) auto-scales *all*
      // inputs down to prevent clipping, which quietly turns down the speech
      // track too — measured directly (mean_volume -16.5dB without music vs
      // -22.5dB with, i.e. dialogue got quieter, not just "plus a bit of
      // music"). With normalize off, speech stays at its original level and
      // the already-attenuated (volume=${MUSIC_VOLUME}) music just adds on top.
      `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
    );
    audioMapArg = "[aout]";
  }

  args.push("-filter_complex", filterParts.join(";"), "-map", `[${videoOutLabel}]`, "-map", audioMapArg);

  args.push(
    "-c:v",
    "libx264",
    // Slower preset = better quality per bit at the same crf, not just smaller
    // files — worth it for local rendering where wall-clock time is cheap and
    // output quality is what's being optimized for.
    "-preset",
    "slow",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    input.outputPath,
  );

  await runCommand("ffmpeg", args);
}

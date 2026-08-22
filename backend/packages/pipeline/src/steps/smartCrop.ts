import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectFaceCenterFraction } from "../clients/opencv.js";
import { runCommand } from "../clients/processRunner.js";
import { detectSceneCuts } from "../clients/sceneDetect.js";

// Cap for detection-frame width, purely for speed on large sources — never
// actually upscale a smaller source to this. Downscaling *below* native
// resolution shrinks already-small faces (e.g. a two-person wide shot) below
// YuNet's confidence threshold — verified empirically on a 640x360 source
// where two real faces scored 0.90+ at native res but were missed after a
// naive downscale to 480. detectFaceCenterForFrame below always samples at
// min(this, sourceWidth).
const DETECTION_SAMPLE_MAX_WIDTH = 960;

export interface CropKeyframe {
  /** Seconds relative to the clip's own start (0 = clip start). */
  startSeconds: number;
  /** Pixel x-offset into the *source* frame for this segment's crop window. */
  cropX: number;
}

export interface SmartCropInput {
  sourceTarget: string;
  clipStartSeconds: number;
  clipEndSeconds: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Target crop width in source-frame pixels (from the 9:16 aspect calc). */
  cropWidth: number;
}

/**
 * Builds a per-scene crop plan: detects camera cuts within the clip, and for
 * each resulting segment, samples one frame and centers the crop on the
 * largest detected face. Segments with no detected face fall back to a
 * centered crop. This is what fixes "camera cuts to a wide shot and the
 * vertical crop shows empty background" — each segment gets re-centered.
 */
export async function computeSmartCropPlan(input: SmartCropInput): Promise<CropKeyframe[]> {
  const centerFallbackX = Math.round((input.sourceWidth - input.cropWidth) / 2);
  const clipDuration = input.clipEndSeconds - input.clipStartSeconds;

  const sceneCuts = await detectSceneCuts(input.sourceTarget, input.clipStartSeconds, input.clipEndSeconds);
  const boundaries = [...sceneCuts, clipDuration];

  const plan: CropKeyframe[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segmentStart = boundaries[i]!;
    const segmentEnd = boundaries[i + 1]!;
    // Sample a bit past the cut (not exactly on it) to avoid a transition/blur frame.
    const sampleOffset = Math.min(0.5, (segmentEnd - segmentStart) / 2);
    const sampleAbsoluteSeconds = input.clipStartSeconds + segmentStart + sampleOffset;

    let cropX = centerFallbackX;
    try {
      const faceCenterFraction = await detectFaceCenterForFrame(input.sourceTarget, sampleAbsoluteSeconds, input.sourceWidth, input.sourceHeight);
      if (faceCenterFraction !== null) {
        const desiredCenterX = faceCenterFraction * input.sourceWidth;
        cropX = Math.round(desiredCenterX - input.cropWidth / 2);
        cropX = Math.max(0, Math.min(input.sourceWidth - input.cropWidth, cropX));
      }
    } catch {
      // Detection failure for one segment shouldn't sink the whole clip — center-crop that segment.
    }

    plan.push({ startSeconds: segmentStart, cropX });
  }

  return plan;
}

async function detectFaceCenterForFrame(
  sourceTarget: string,
  absoluteSeconds: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<number | null> {
  const sampleWidth = Math.min(DETECTION_SAMPLE_MAX_WIDTH, sourceWidth);
  const sampleHeight = Math.round((sourceHeight / sourceWidth) * sampleWidth);
  const workDir = await mkdtemp(path.join(tmpdir(), "cutroom-crop-sample-"));

  try {
    const rawPath = path.join(workDir, "frame.rgb");
    await runCommand("ffmpeg", [
      "-y",
      "-ss",
      String(absoluteSeconds),
      "-i",
      sourceTarget,
      "-frames:v",
      "1",
      "-vf",
      `scale=${sampleWidth}:${sampleHeight}`,
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      rawPath,
    ]);

    const buffer = await readFile(rawPath);
    return detectFaceCenterFraction(buffer, sampleWidth, sampleHeight);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

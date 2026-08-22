import { runCommand } from "./processRunner.js";

/**
 * Reads duration from a local file path OR an http(s) URL — ffprobe's `-i`
 * accepts either transparently (R2 presigned GET URLs support HTTP range
 * requests, so this works without downloading the whole object first).
 */
export async function probeDurationSeconds(target: string): Promise<number | null> {
  const stdout = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    target,
  ]);

  const seconds = Number.parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

export async function probeVideoDimensions(target: string): Promise<{ width: number; height: number }> {
  const stdout = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=s=x:p=0",
    target,
  ]);

  const [width, height] = stdout.trim().split("x").map(Number);
  if (!width || !height) throw new Error(`Could not read video dimensions for ${target}`);
  return { width, height };
}

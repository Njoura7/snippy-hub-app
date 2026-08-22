import { spawn } from "node:child_process";

const SCENE_CHANGE_THRESHOLD = 0.4;
const EDGE_MARGIN_SECONDS = 0.5; // ignore cuts too close to the clip's own start/end

/**
 * Scene-cut timestamps (relative to `startSeconds`, always including 0 as
 * the first boundary) within [startSeconds, endSeconds) of `sourceTarget`.
 * Uses ffmpeg's own scene-change scoring — no new dependency. A source with
 * no real cuts in range just yields [0] (one scene, i.e. plain fallback).
 */
export async function detectSceneCuts(sourceTarget: string, startSeconds: number, endSeconds: number): Promise<number[]> {
  const duration = endSeconds - startSeconds;

  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-ss",
      String(startSeconds),
      "-i",
      sourceTarget,
      "-t",
      String(duration),
      "-vf",
      `select='gt(scene,${SCENE_CHANGE_THRESHOLD})',showinfo`,
      "-f",
      "null",
      "-",
    ]);
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    // Always resolve on close, even non-zero exit — whatever showinfo lines
    // made it to stderr before any failure are still usable, and a total
    // failure here just degrades to "one scene" (plain center-ish crop),
    // which the actual render step's own error handling will catch anyway.
    child.on("close", () => resolve(err));
  });

  const cuts = [...stderr.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => t > EDGE_MARGIN_SECONDS && t < duration - EDGE_MARGIN_SECONDS);

  return [0, ...cuts];
}

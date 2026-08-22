import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./processRunner.js";

export interface YtDlpDownloadResult {
  filePath: string;
  ext: string;
  title: string | null;
  durationSeconds: number | null;
}

export interface DownloadOptions {
  /** Path to a Netscape-format cookies.txt from a real, logged-in YouTube
   * session. Without this, YouTube's adaptive/HD formats 403 (they require a
   * PO token we can't mint) and every download is capped around 360p via the
   * android client's progressive-only stream — this is what unlocks real HD. */
  cookiesFilePath?: string;
}

/** Downloads `sourceUrl` into `workDir/source.<ext>` and reads back yt-dlp's own metadata sidecar. */
export async function downloadWithYtDlp(sourceUrl: string, workDir: string, options: DownloadOptions = {}): Promise<YtDlpDownloadResult> {
  const outputTemplate = path.join(workDir, "source.%(ext)s");

  if (options.cookiesFilePath) {
    try {
      await runCommand("yt-dlp", [
        "--no-playlist",
        "--write-info-json",
        "--no-progress",
        "--cookies",
        options.cookiesFilePath,
        // A real session's cookies satisfy YouTube's PO-token check, so the
        // full adaptive format ladder (up to 1080p here) is actually reachable.
        "-f",
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format",
        "mp4",
        "--output",
        outputTemplate,
        sourceUrl,
      ]);
      return readInfoJson(workDir);
    } catch (err) {
      console.warn(`[yt-dlp] HD attempt with cookies failed, falling back to android/360p: ${(err as Error).message.slice(0, 300)}`);
    }
  }

  await runCommand("yt-dlp", [
    "--no-playlist",
    "--write-info-json",
    "--no-progress",
    // YouTube's default (web) client increasingly requires a PO token and
    // 403s the actual media request without one (SABR streaming). The
    // android client still serves a progressive format that doesn't need
    // one — tested directly, reliably available, but capped around 360p
    // (sometimes lower) since that's the only progressive stream it offers.
    // Ignored for non-YouTube extractors (e.g. Twitch) since it's namespaced.
    "--extractor-args",
    "youtube:player_client=android",
    "--output",
    outputTemplate,
    sourceUrl,
  ]);

  return readInfoJson(workDir);
}

async function readInfoJson(workDir: string): Promise<YtDlpDownloadResult> {
  const infoPath = path.join(workDir, "source.info.json");
  const info = JSON.parse(await readFile(infoPath, "utf-8")) as {
    ext: string;
    title?: string;
    duration?: number;
  };

  return {
    filePath: path.join(workDir, `source.${info.ext}`),
    ext: info.ext,
    title: info.title ?? null,
    durationSeconds: typeof info.duration === "number" ? Math.round(info.duration) : null,
  };
}

import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StorageDriver } from "@cutroom/storage";
import { probeDurationSeconds } from "../clients/ffprobe.js";
import { downloadWithYtDlp } from "../clients/ytdlp.js";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
};

export interface IngestFromUrlInput {
  sourceUrl: string;
  /** e.g. `sources/<projectId>` — the step appends `/source.<ext>`. */
  storageKeyPrefix: string;
  /** See DownloadOptions in clients/ytdlp.ts — unlocks real HD instead of the ~360p android fallback. */
  cookiesFilePath?: string;
}

export interface IngestResult {
  storageKey: string;
  title: string | null;
  durationSeconds: number | null;
}

/**
 * Downloads a YouTube/Twitch URL via yt-dlp into a scratch temp dir, then
 * streams it into whichever storage driver is active. The temp dir is always
 * cleaned up — Railway's disk is ephemeral scratch space only, never durable
 * state (see README "Railway constraints").
 */
export async function ingestFromUrl(input: IngestFromUrlInput, storage: StorageDriver): Promise<IngestResult> {
  const workDir = await mkdtemp(path.join(tmpdir(), "cutroom-ingest-"));

  try {
    const downloaded = await downloadWithYtDlp(input.sourceUrl, workDir, { cookiesFilePath: input.cookiesFilePath });
    const durationSeconds = downloaded.durationSeconds ?? (await probeDurationSeconds(downloaded.filePath));
    const storageKey = `${input.storageKeyPrefix}/source.${downloaded.ext}`;

    await storage.put(storageKey, createReadStream(downloaded.filePath), {
      contentType: CONTENT_TYPE_BY_EXT[downloaded.ext] ?? "application/octet-stream",
    });

    return { storageKey, title: downloaded.title, durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * For uploads, the API already streamed the file straight into storage (see
 * apps/api/src/routes/projects.ts) — this step just measures duration.
 * `probeTarget` is either a local filesystem path or an http(s) URL;
 * ffprobe accepts both, so the caller (worker handler) resolves which one
 * applies for the active storage driver and the step itself stays driver-agnostic.
 */
export async function probeUploadedDuration(probeTarget: string): Promise<number | null> {
  return probeDurationSeconds(probeTarget);
}

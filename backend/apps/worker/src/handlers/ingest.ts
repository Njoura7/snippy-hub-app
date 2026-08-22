import { createJob, projects, type Db, type Job } from "@cutroom/db";
import { ingestFromUrl, probeUploadedDuration } from "@cutroom/pipeline";
import type { StorageDriver } from "@cutroom/storage";
import { eq } from "drizzle-orm";
import type { WorkerConfig } from "../env.js";
import { resolveStorageTarget } from "../storageTarget.js";

/**
 * Handles job.type === "ingest" for both source kinds:
 *  - youtube/twitch: download via yt-dlp then push to storage
 *  - upload: the API already streamed the file into storage — just probe duration
 * On success, chains straight into a "transcribe" job — see poller.ts dispatch.
 */
export async function handleIngestJob(db: Db, storage: StorageDriver, config: WorkerConfig, job: Job) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, job.projectId) });
  if (!project) throw new Error(`Project ${job.projectId} not found`);

  if (project.sourceType === "upload") {
    if (!project.storageKey) throw new Error(`Upload project ${project.id} is missing storageKey`);
    const probeTarget = await resolveStorageTarget(storage, config, project.storageKey);
    const durationSeconds = await probeUploadedDuration(probeTarget);

    await db
      .update(projects)
      .set({ durationSeconds, status: "transcribing", updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  } else {
    if (!project.sourceUrl) throw new Error(`Project ${project.id} is missing sourceUrl`);

    const result = await ingestFromUrl(
      {
        sourceUrl: project.sourceUrl,
        storageKeyPrefix: `sources/${project.id}`,
        cookiesFilePath: config.YTDLP_COOKIES_FILE,
      },
      storage,
    );

    await db
      .update(projects)
      .set({
        storageKey: result.storageKey,
        title: result.title,
        durationSeconds: result.durationSeconds,
        status: "transcribing",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id));
  }

  await createJob(db, { projectId: project.id, type: "transcribe", payload: {} });
}

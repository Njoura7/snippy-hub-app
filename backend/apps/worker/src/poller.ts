import { claimNextJob, clipRenders, completeJob, failJob, projects, type Db, type Job } from "@cutroom/db";
import type { StorageDriver } from "@cutroom/storage";
import { and, eq } from "drizzle-orm";
import type { WorkerConfig } from "./env.js";
import { handleAnalyzeJob } from "./handlers/analyze.js";
import { handleCutCaptionJob } from "./handlers/cutCaption.js";
import { handleIngestJob } from "./handlers/ingest.js";
import { handleTranscribeJob } from "./handlers/transcribe.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatch(job: Job, db: Db, storage: StorageDriver, config: WorkerConfig) {
  switch (job.type) {
    case "ingest":
      return handleIngestJob(db, storage, config, job);
    case "transcribe":
      return handleTranscribeJob(db, storage, config, job);
    case "analyze":
      return handleAnalyzeJob(db, config, job);
    case "cut_caption":
      return handleCutCaptionJob(db, storage, config, job);
    default:
      throw new Error(`No handler implemented for job type "${job.type satisfies never}"`);
  }
}

/** ingest/transcribe/analyze are project-blocking — a final failure fails the
 * whole project. cut_caption is per-clip and user-triggered — a final
 * failure only marks that one (clip, platform) render as failed. */
async function handleFinalFailure(db: Db, job: Job, message: string) {
  if (job.type === "cut_caption") {
    const payload = job.payload as { clipId: string; platform: string };
    await db
      .update(clipRenders)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(and(eq(clipRenders.clipId, payload.clipId), eq(clipRenders.platform, payload.platform)));
    return;
  }

  await db
    .update(projects)
    .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
    .where(eq(projects.id, job.projectId));
}

export async function runPollerLoop(db: Db, storage: StorageDriver, config: WorkerConfig) {
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

  console.log(`[worker ${config.WORKER_ID}] polling every ${config.POLL_INTERVAL_MS}ms`);

  while (!stopping) {
    const job = await claimNextJob(db, config.WORKER_ID);

    if (!job) {
      await sleep(config.POLL_INTERVAL_MS);
      continue;
    }

    console.log(`[worker ${config.WORKER_ID}] claimed job ${job.id} (${job.type}) for project ${job.projectId}`);

    try {
      await dispatch(job, db, storage, config);
      await completeJob(db, job.id);
      console.log(`[worker ${config.WORKER_ID}] completed job ${job.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { willRetry } = await failJob(db, job, message);
      console.error(`[worker ${config.WORKER_ID}] job ${job.id} failed (retry=${willRetry}): ${message}`);

      if (!willRetry) {
        await handleFinalFailure(db, job, message);
      }
    }
  }

  console.log(`[worker ${config.WORKER_ID}] shut down cleanly`);
}

import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { jobs, type NewJob } from "./schema.js";

export async function createJob(db: Db, values: NewJob) {
  const [job] = await db.insert(jobs).values(values).returning();
  return job;
}

/**
 * Atomically claims one pending, due job for this worker instance using
 * `FOR UPDATE SKIP LOCKED` — safe even with a single worker today, and means
 * bumping concurrency later needs no query changes.
 */
export async function claimNextJob(db: Db, workerId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE jobs
    SET status = 'processing', locked_at = now(), locked_by = ${workerId}, updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY run_after ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);

  const claimedId = rows[0]?.id;
  if (!claimedId) return undefined;

  return db.query.jobs.findFirst({ where: eq(jobs.id, claimedId) });
}

export async function completeJob(db: Db, jobId: string, result?: unknown) {
  await db
    .update(jobs)
    .set({ status: "completed", result: result ?? null, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/**
 * Marks a job failed. If it still has attempts left, reschedules it with
 * exponential backoff (30s, 60s, 120s, ...) instead of dead-ending it.
 */
export async function failJob(db: Db, job: { id: string; attempts: number; maxAttempts: number }, error: string) {
  const nextAttempts = job.attempts + 1;
  const willRetry = nextAttempts < job.maxAttempts;
  const backoffSeconds = 30 * 2 ** job.attempts;

  await db
    .update(jobs)
    .set({
      status: willRetry ? "pending" : "failed",
      attempts: nextAttempts,
      lastError: error,
      lockedAt: null,
      lockedBy: null,
      runAfter: willRetry ? sql`now() + make_interval(secs => ${backoffSeconds})` : sql`run_after`,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  return { willRetry };
}

import { createJob, projects, transcripts, type Db, type Job } from "@cutroom/db";
import { transcribeSource } from "@cutroom/pipeline";
import type { StorageDriver } from "@cutroom/storage";
import { eq } from "drizzle-orm";
import { resolveStorageTarget } from "../storageTarget.js";
import type { WorkerConfig } from "../env.js";

/** Handles job.type === "transcribe": extracts + transcribes audio via Groq,
 * stores the word-level transcript, then chains into an "analyze" job. */
export async function handleTranscribeJob(db: Db, storage: StorageDriver, config: WorkerConfig, job: Job) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, job.projectId) });
  if (!project) throw new Error(`Project ${job.projectId} not found`);
  if (!project.storageKey) throw new Error(`Project ${project.id} has no storageKey yet`);

  const sourceTarget = await resolveStorageTarget(storage, config, project.storageKey);
  const result = await transcribeSource({ sourceTarget, groqApiKey: config.GROQ_API_KEY });

  await db
    .insert(transcripts)
    .values({
      projectId: project.id,
      fullText: result.fullText,
      words: result.words,
      language: result.language,
    })
    .onConflictDoUpdate({
      target: transcripts.projectId,
      set: { fullText: result.fullText, words: result.words, language: result.language },
    });

  await db
    .update(projects)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  await createJob(db, { projectId: project.id, type: "analyze", payload: {} });
}

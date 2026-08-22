import { clips, projects, transcripts, type Db, type Job } from "@cutroom/db";
import { analyzeTranscript } from "@cutroom/pipeline";
import { eq } from "drizzle-orm";
import type { WorkerConfig } from "../env.js";

/** Handles job.type === "analyze": chunks the stored transcript, scores each
 * chunk with the active ANALYZE_PROVIDER (groq or anthropic), and inserts
 * the resulting clip candidates. */
export async function handleAnalyzeJob(db: Db, config: WorkerConfig, job: Job) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, job.projectId) });
  if (!project) throw new Error(`Project ${job.projectId} not found`);

  const transcript = await db.query.transcripts.findFirst({ where: eq(transcripts.projectId, project.id) });
  if (!transcript) throw new Error(`Project ${project.id} has no transcript yet`);

  const words = transcript.words as { word: string; start: number; end: number }[];
  const apiKey = config.ANALYZE_PROVIDER === "anthropic" ? config.ANTHROPIC_API_KEY : config.GROQ_API_KEY;
  const candidates = await analyzeTranscript(words, { provider: config.ANALYZE_PROVIDER, apiKey });

  if (candidates.length > 0) {
    await db.insert(clips).values(
      candidates.map((c) => ({
        projectId: project.id,
        startMs: Math.round(c.startSeconds * 1000),
        endMs: Math.round(c.endSeconds * 1000),
        score: c.score,
        hookText: c.hook,
        tag: c.tag,
        emoji: c.emoji,
        status: "candidate" as const,
      })),
    );
  }

  await db
    .update(projects)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(projects.id, project.id));
}

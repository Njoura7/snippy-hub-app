import { clipRenders, clips, createJob, type NewClip } from "@cutroom/db";
import { PLATFORMS, type Platform } from "@cutroom/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

const CLIP_STATUSES = ["candidate", "approved", "rejected", "rendering", "rendered", "failed"] as const;
const CAPTION_PRESETS = ["bold", "minimal", "karaoke"] as const;

interface UpdateClipBody {
  status?: (typeof CLIP_STATUSES)[number];
  hookText?: string;
  emoji?: string | null;
  captionPreset?: (typeof CAPTION_PRESETS)[number];
  captionStyleOverrides?: Record<string, unknown>;
  backgroundMusicKey?: string | null;
}

interface ExportClipBody {
  platform: Platform;
}

/**
 * Real clip rows for a project — always [] today, since nothing creates
 * clips until Step 3 (analyze) exists. The frontend falls back to mock
 * clips when this comes back empty rather than pretending analysis ran.
 */
export async function clipsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/projects/:id/clips", async (request) => {
    const rows = await app.db.query.clips.findMany({
      where: eq(clips.projectId, request.params.id),
      orderBy: (c, { desc }) => desc(c.score),
    });
    return { clips: rows };
  });

  app.get<{ Params: { id: string } }>("/clips/:id", async (request, reply) => {
    const clip = await app.db.query.clips.findFirst({ where: eq(clips.id, request.params.id) });
    if (!clip) return reply.code(404).send({ error: "clip not found" });

    const renders = await app.db.query.clipRenders.findMany({ where: eq(clipRenders.clipId, clip.id) });
    const rendersWithUrls = await Promise.all(
      renders.map(async (r) => ({
        ...r,
        url: r.status === "rendered" && r.storageKey ? await app.storage.getServableUrl(r.storageKey) : null,
      })),
    );

    return { clip, renders: rendersWithUrls };
  });

  app.patch<{ Params: { id: string }; Body: UpdateClipBody }>(
    "/clips/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            status: { type: "string", enum: CLIP_STATUSES },
            hookText: { type: "string", minLength: 1 },
            emoji: { type: ["string", "null"], maxLength: 8 },
            captionPreset: { type: "string", enum: CAPTION_PRESETS },
            captionStyleOverrides: { type: "object" },
            backgroundMusicKey: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const existing = await app.db.query.clips.findFirst({ where: eq(clips.id, request.params.id) });
      if (!existing) return reply.code(404).send({ error: "clip not found" });

      const patch: Partial<NewClip> = { updatedAt: new Date() };
      if (request.body.status !== undefined) patch.status = request.body.status;
      if (request.body.hookText !== undefined) patch.hookText = request.body.hookText;
      if (request.body.emoji !== undefined) patch.emoji = request.body.emoji;
      if (request.body.captionPreset !== undefined) patch.captionPreset = request.body.captionPreset;
      if (request.body.captionStyleOverrides !== undefined) patch.captionStyleOverrides = request.body.captionStyleOverrides;
      if (request.body.backgroundMusicKey !== undefined) patch.backgroundMusicKey = request.body.backgroundMusicKey;

      const [updated] = await app.db.update(clips).set(patch).where(eq(clips.id, existing.id)).returning();
      return { clip: updated };
    },
  );

  app.post<{ Params: { id: string }; Body: ExportClipBody }>(
    "/clips/:id/export",
    {
      schema: {
        body: {
          type: "object",
          required: ["platform"],
          properties: { platform: { type: "string", enum: PLATFORMS } },
        },
      },
    },
    async (request, reply) => {
      const clip = await app.db.query.clips.findFirst({ where: eq(clips.id, request.params.id) });
      if (!clip) return reply.code(404).send({ error: "clip not found" });

      const { platform } = request.body;

      const job = await createJob(app.db, {
        projectId: clip.projectId,
        type: "cut_caption",
        payload: { clipId: clip.id, platform },
      });
      if (!job) throw new Error("job insert returned no row");

      const [render] = await app.db
        .insert(clipRenders)
        .values({ clipId: clip.id, platform, status: "pending", renderJobId: job.id })
        .onConflictDoUpdate({
          target: [clipRenders.clipId, clipRenders.platform],
          set: { status: "pending", renderJobId: job.id, errorMessage: null, storageKey: null, updatedAt: new Date() },
        })
        .returning();

      return reply.code(202).send({ render });
    },
  );
}

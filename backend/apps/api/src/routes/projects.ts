import { createJob, jobs, projects } from "@cutroom/db";
import { PLATFORMS, type Platform } from "@cutroom/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import path from "node:path";

interface CreateProjectBody {
  sourceUrl: string;
  sourceType: "youtube" | "twitch";
  targetPlatforms?: Platform[];
}

export async function projectsRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateProjectBody }>(
    "/projects",
    {
      schema: {
        body: {
          type: "object",
          required: ["sourceUrl", "sourceType"],
          properties: {
            sourceUrl: { type: "string", minLength: 1 },
            sourceType: { type: "string", enum: ["youtube", "twitch"] },
            targetPlatforms: {
              type: "array",
              items: { type: "string", enum: PLATFORMS },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { sourceUrl, sourceType, targetPlatforms } = request.body;

      const [project] = await app.db
        .insert(projects)
        .values({
          sourceType,
          sourceUrl,
          targetPlatforms: targetPlatforms?.length ? targetPlatforms : ["tiktok"],
          status: "ingesting",
        })
        .returning();
      if (!project) throw new Error("project insert returned no row");

      await createJob(app.db, { projectId: project.id, type: "ingest", payload: {} });

      return reply.code(201).send({ project });
    },
  );

  app.post("/projects/upload", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "multipart field 'file' is required" });
    }

    // Send non-file fields *before* the file field in the multipart body —
    // busboy (which @fastify/multipart wraps) only has fields parsed so far
    // available at this point, since the file stream hasn't been consumed yet.
    const targetPlatformsRaw = data.fields.targetPlatforms;
    const targetPlatformsValue =
      targetPlatformsRaw && "value" in targetPlatformsRaw ? String(targetPlatformsRaw.value) : undefined;
    let targetPlatforms: Platform[] = ["tiktok"];
    if (targetPlatformsValue) {
      try {
        const parsed = JSON.parse(targetPlatformsValue);
        if (Array.isArray(parsed) && parsed.length > 0) targetPlatforms = parsed;
      } catch {
        return reply.code(400).send({ error: "targetPlatforms must be a JSON array string" });
      }
    }

    const [project] = await app.db
      .insert(projects)
      .values({
        sourceType: "upload",
        originalFilename: data.filename,
        targetPlatforms,
        status: "ingesting",
      })
      .returning();
    if (!project) throw new Error("project insert returned no row");

    const ext = path.extname(data.filename) || ".mp4";
    const storageKey = `sources/${project.id}/upload${ext}`;

    try {
      await app.storage.put(storageKey, data.file, { contentType: data.mimetype });
    } catch (err) {
      await app.db
        .update(projects)
        .set({ status: "failed", errorMessage: (err as Error).message, updatedAt: new Date() })
        .where(eq(projects.id, project.id));
      throw err;
    }

    const [updated] = await app.db
      .update(projects)
      .set({ storageKey, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();
    if (!updated) throw new Error("project update returned no row");

    await createJob(app.db, { projectId: project.id, type: "ingest", payload: {} });

    return reply.code(201).send({ project: updated });
  });

  app.get("/projects", async () => {
    const rows = await app.db.query.projects.findMany({ orderBy: desc(projects.createdAt) });
    return { projects: rows };
  });

  app.get<{ Params: { id: string } }>("/projects/:id", async (request, reply) => {
    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, request.params.id) });
    if (!project) return reply.code(404).send({ error: "project not found" });
    return { project };
  });

  app.get<{ Params: { id: string } }>("/projects/:id/jobs", async (request) => {
    const rows = await app.db.query.jobs.findMany({
      where: eq(jobs.projectId, request.params.id),
      orderBy: desc(jobs.createdAt),
    });
    return { jobs: rows };
  });

  // Frees the source video's disk space (the biggest file per project by
  // far) once you're done exporting clips from it — the project row,
  // transcript, and clips all stay intact, only re-exporting a NEW clip from
  // this project stops working after this (existing renders are unaffected,
  // they're independent files). Storage-driver agnostic: works the same for
  // local disk and R2.
  app.delete<{ Params: { id: string } }>("/projects/:id/source", async (request, reply) => {
    const project = await app.db.query.projects.findFirst({ where: eq(projects.id, request.params.id) });
    if (!project) return reply.code(404).send({ error: "project not found" });
    if (!project.storageKey) return reply.code(204).send();

    await app.storage.delete(project.storageKey);
    await app.db
      .update(projects)
      .set({ storageKey: null, updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    return reply.code(204).send();
  });
}

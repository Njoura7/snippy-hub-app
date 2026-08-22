import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { createDb } from "@cutroom/db";
import { createStorageDriver } from "@cutroom/storage";
import Fastify from "fastify";
import path from "node:path";
import type { AppConfig } from "./env.js";
import { clipsRoutes } from "./routes/clips.js";
import { emojiRoutes } from "./routes/emoji.js";
import { musicRoutes } from "./routes/music.js";
import { projectsRoutes } from "./routes/projects.js";
import "./types.js";

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: true });

  app.decorate("db", createDb(config.DATABASE_URL));
  app.decorate("storage", createStorageDriver(config));
  app.decorate("config", config);

  await app.register(cors, { origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(",") });
  await app.register(multipart, {
    limits: {
      // 8 GB — comfortably above the ~4-6GB source videos this needs to accept.
      fileSize: 8 * 1024 * 1024 * 1024,
    },
  });

  // Only relevant for STORAGE_DRIVER=local: serves downloaded/uploaded/rendered
  // files back out with Range support (needed for <video> scrubbing). The R2
  // driver hands out presigned URLs instead — see @cutroom/storage.
  if (config.STORAGE_DRIVER === "local") {
    await app.register(fastifyStatic, {
      root: path.resolve(config.LOCAL_STORAGE_PATH ?? "./.data/storage"),
      prefix: "/files/",
      decorateReply: false,
    });
  }

  app.get("/health", async () => ({ ok: true }));

  await app.register(projectsRoutes);
  await app.register(clipsRoutes);
  await app.register(musicRoutes);
  await app.register(emojiRoutes);

  return app;
}

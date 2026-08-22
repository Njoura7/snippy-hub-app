import type { Db } from "@cutroom/db";
import type { StorageDriver } from "@cutroom/storage";
import type { AppConfig } from "./env.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    storage: StorageDriver;
    config: AppConfig;
  }
}

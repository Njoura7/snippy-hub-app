import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StorageDriver } from "./types.js";

/**
 * Free, zero-setup driver for local dev and the "first video for $0" MVP path —
 * files live under LOCAL_STORAGE_PATH and are served back out by the API's
 * GET /files/:key route (see apps/api/src/routes/files.ts). Swap STORAGE_DRIVER
 * to "r2" for anything that needs to survive a container restart.
 */
export function createLocalStorageDriver(opts: { basePath: string; publicUrl: string }): StorageDriver {
  const resolvedBase = path.resolve(opts.basePath);

  function resolveKeyPath(key: string) {
    const resolved = path.resolve(resolvedBase, key);
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      throw new Error(`Refusing to access storage key outside base path: ${key}`);
    }
    return resolved;
  }

  return {
    async put(key, source) {
      const filePath = resolveKeyPath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(source, createWriteStream(filePath));
    },

    async getReadStream(key) {
      return createReadStream(resolveKeyPath(key)) as unknown as Readable;
    },

    async getServableUrl(key) {
      return `${opts.publicUrl.replace(/\/$/, "")}/files/${key}`;
    },

    async delete(key) {
      await rm(resolveKeyPath(key), { force: true });
    },
  };
}

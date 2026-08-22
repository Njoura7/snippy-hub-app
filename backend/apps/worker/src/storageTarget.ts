import type { StorageDriver, StorageEnv } from "@cutroom/storage";
import path from "node:path";

/**
 * ffmpeg/ffprobe accept a local path or an http(s) URL identically, so this
 * is the only place that needs to know which storage driver is active.
 */
export async function resolveStorageTarget(storage: StorageDriver, config: StorageEnv, storageKey: string) {
  if (config.STORAGE_DRIVER === "local") {
    return path.resolve(config.LOCAL_STORAGE_PATH ?? "./.data/storage", storageKey);
  }
  return storage.getServableUrl(storageKey);
}

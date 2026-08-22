import { createLocalStorageDriver } from "./local.js";
import { createR2StorageDriver } from "./r2.js";
import type { StorageDriver, StorageEnv } from "./types.js";

export * from "./types.js";

export function createStorageDriver(env: StorageEnv): StorageDriver {
  if (env.STORAGE_DRIVER === "local") {
    return createLocalStorageDriver({
      basePath: env.LOCAL_STORAGE_PATH ?? "./.data/storage",
      publicUrl: env.API_PUBLIC_URL ?? "http://localhost:3000",
    });
  }

  if (env.STORAGE_DRIVER === "r2") {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      throw new Error(
        "STORAGE_DRIVER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME",
      );
    }
    return createR2StorageDriver({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET_NAME,
    });
  }

  throw new Error(`Unknown STORAGE_DRIVER: ${env.STORAGE_DRIVER}`);
}

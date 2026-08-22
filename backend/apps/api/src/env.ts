import type { StorageEnv } from "@cutroom/storage";

export interface AppConfig extends StorageEnv {
  PORT: number;
  DATABASE_URL: string;
  API_PUBLIC_URL: string;
  CORS_ORIGIN: string;
}

export function loadEnv(): AppConfig {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing required env var: DATABASE_URL");
  }

  const port = Number(process.env.PORT ?? 3000);
  const storageDriver = (process.env.STORAGE_DRIVER ?? "local") as AppConfig["STORAGE_DRIVER"];

  return {
    PORT: port,
    DATABASE_URL: process.env.DATABASE_URL,
    API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? `http://localhost:${port}`,
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
    STORAGE_DRIVER: storageDriver,
    LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH ?? "./.data/storage",
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  };
}

import os from "node:os";
import type { AnalyzeProvider } from "@cutroom/pipeline";
import type { StorageEnv } from "@cutroom/storage";

export interface WorkerConfig extends StorageEnv {
  DATABASE_URL: string;
  WORKER_ID: string;
  POLL_INTERVAL_MS: number;
  GROQ_API_KEY: string;
  /** Only required when ANALYZE_PROVIDER=anthropic — empty string otherwise. */
  ANTHROPIC_API_KEY: string;
  ANALYZE_PROVIDER: AnalyzeProvider;
  /** Optional path to a cookies.txt — see README "Getting real HD downloads". */
  YTDLP_COOKIES_FILE?: string;
}

export function loadEnv(): WorkerConfig {
  const analyzeProvider = (process.env.ANALYZE_PROVIDER ?? "groq") as AnalyzeProvider;

  const required = ["DATABASE_URL", "GROQ_API_KEY"];
  if (analyzeProvider === "anthropic") required.push("ANTHROPIC_API_KEY");

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
  }

  const storageDriver = (process.env.STORAGE_DRIVER ?? "local") as WorkerConfig["STORAGE_DRIVER"];

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    WORKER_ID: process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`,
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS ?? 2000),
    GROQ_API_KEY: process.env.GROQ_API_KEY!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    ANALYZE_PROVIDER: analyzeProvider,
    YTDLP_COOKIES_FILE: process.env.YTDLP_COOKIES_FILE,
    STORAGE_DRIVER: storageDriver,
    LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH ?? "./.data/storage",
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  };
}

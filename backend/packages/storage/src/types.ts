import type { Readable } from "node:stream";

export interface StorageDriver {
  /** Writes `source` to `key`, streaming so multi-GB files never sit fully in memory. */
  put(key: string, source: Readable, opts?: { contentType?: string }): Promise<void>;
  getReadStream(key: string): Promise<Readable>;
  /** URL the frontend/API can hand back to a client to fetch this object directly. */
  getServableUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export type StorageDriverKind = "local" | "r2";

export interface StorageEnv {
  STORAGE_DRIVER: StorageDriverKind;
  /** local driver */
  LOCAL_STORAGE_PATH?: string;
  API_PUBLIC_URL?: string;
  /** r2 driver */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
}

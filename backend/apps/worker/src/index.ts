import { createDb } from "@cutroom/db";
import { createStorageDriver } from "@cutroom/storage";
import { loadEnv } from "./env.js";
import { runPollerLoop } from "./poller.js";

const config = loadEnv();
const db = createDb(config.DATABASE_URL);
const storage = createStorageDriver(config);

await runPollerLoop(db, storage, config);

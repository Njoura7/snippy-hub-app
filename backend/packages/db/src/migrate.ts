import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const migrationsFolder = path.resolve(fileURLToPath(import.meta.url), "../../drizzle");

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

console.log(`Applying migrations from ${migrationsFolder} ...`);
await migrate(db, { migrationsFolder });
await client.end();
console.log("Migrations applied.");

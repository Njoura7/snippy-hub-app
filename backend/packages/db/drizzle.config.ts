import { defineConfig } from "drizzle-kit";

// Only `migrate`/`push`/`studio` need a live DATABASE_URL — `generate` just
// diffs src/schema.ts against the migration snapshots in ./drizzle.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});

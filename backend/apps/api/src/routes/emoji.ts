import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// Same rationale as routes/music.ts: reads the manifest by path instead of
// importing @cutroom/pipeline, which the API image deliberately doesn't need.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "../../../../packages/pipeline/assets/emoji/manifest.json");

interface EmojiEntry {
  emoji: string;
  filename: string;
  label: string;
}

export async function emojiRoutes(app: FastifyInstance) {
  app.get("/emoji", async () => {
    const entries = JSON.parse(await readFile(MANIFEST_PATH, "utf-8")) as EmojiEntry[];
    return { emoji: entries.map((e) => ({ emoji: e.emoji, label: e.label })) };
  });
}

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// Not importing @cutroom/pipeline here on purpose — that package pulls in
// ffmpeg/yt-dlp/opencv-js, which the API image deliberately doesn't need.
// The manifest + mp3 files still land in the API image (its Dockerfile
// copies the whole packages/ tree for lockfile consistency), so this just
// reads them directly by path instead of importing pipeline's code.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = path.resolve(__dirname, "../../../../packages/pipeline/assets/music");
const MANIFEST_PATH = path.join(MUSIC_DIR, "manifest.json");

interface MusicTrack {
  key: string;
  title: string;
  mood: string;
  filename: string;
  license: string;
}

async function readManifest(): Promise<MusicTrack[]> {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf-8")) as MusicTrack[];
}

export async function musicRoutes(app: FastifyInstance) {
  app.get("/music", async () => {
    const tracks = await readManifest();
    return {
      tracks: tracks.map((t) => ({
        key: t.key,
        title: t.title,
        mood: t.mood,
        license: t.license,
        previewUrl: `${app.config.API_PUBLIC_URL}/music/${t.key}/preview.mp3`,
      })),
    };
  });

  app.get<{ Params: { key: string } }>("/music/:key/preview.mp3", async (request, reply) => {
    const tracks = await readManifest();
    const track = tracks.find((t) => t.key === request.params.key);
    if (!track) return reply.code(404).send({ error: "track not found" });

    reply.type("audio/mpeg");
    return reply.send(createReadStream(path.join(MUSIC_DIR, track.filename)));
  });
}

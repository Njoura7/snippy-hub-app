import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = path.resolve(__dirname, "../../assets/music");
const MANIFEST_PATH = path.join(MUSIC_DIR, "manifest.json");

export interface MusicTrack {
  key: string;
  title: string;
  mood: string;
  artist: string | null;
  filename: string;
  license: string;
}

let manifestCache: MusicTrack[] | null = null;

export async function listMusicTracks(): Promise<MusicTrack[]> {
  manifestCache ??= JSON.parse(await readFile(MANIFEST_PATH, "utf-8")) as MusicTrack[];
  return manifestCache;
}

/** Resolves a manifest key to its local file path — used by the render step
 * to actually mix the track in. Returns null for an unknown key. */
export async function getMusicFilePath(key: string): Promise<string | null> {
  const tracks = await listMusicTracks();
  const track = tracks.find((t) => t.key === key);
  return track ? path.join(MUSIC_DIR, track.filename) : null;
}

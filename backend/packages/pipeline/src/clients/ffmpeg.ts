import { readdir } from "node:fs/promises";
import path from "node:path";
import { probeDurationSeconds } from "./ffprobe.js";
import { runCommand } from "./processRunner.js";

// Keeps each chunk comfortably under Groq's 25MB free-tier request limit even
// for dense speech — mono 16kHz 32kbps MP3 is ~240KB/min, so 15 min ≈ 3.6MB.
const CHUNK_SECONDS = 900;

export interface AudioChunk {
  filePath: string;
  offsetSeconds: number;
}

/**
 * Extracts speech-optimized mono 16kHz 32kbps MP3 audio from `sourceTarget`
 * (local path or URL — ffmpeg accepts both) and splits it into ~15-minute
 * chunks, so a 1-2hr episode stays under Groq's per-request size limit.
 * Chunk durations come from ffprobe (not assumed) since segment splitting
 * aligns to keyframes and can land slightly off the requested length —
 * getting this wrong would drift every later chunk's word timestamps.
 */
export async function extractAudioChunks(sourceTarget: string, workDir: string): Promise<AudioChunk[]> {
  const pattern = path.join(workDir, "audio-%03d.mp3");

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    sourceTarget,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "32k",
    "-f",
    "segment",
    "-segment_time",
    String(CHUNK_SECONDS),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const files = (await readdir(workDir)).filter((f) => /^audio-\d+\.mp3$/.test(f)).sort();
  if (files.length === 0) throw new Error(`ffmpeg produced no audio chunks for ${sourceTarget}`);

  const chunks: AudioChunk[] = [];
  let offset = 0;
  for (const file of files) {
    const filePath = path.join(workDir, file);
    chunks.push({ filePath, offsetSeconds: offset });
    offset += (await probeDurationSeconds(filePath)) ?? CHUNK_SECONDS;
  }
  return chunks;
}

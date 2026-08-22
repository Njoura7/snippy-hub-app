import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WordTimestamp } from "@cutroom/shared";
import { extractAudioChunks } from "../clients/ffmpeg.js";
import { transcribeAudioFile } from "../clients/groq.js";

export interface TranscribeInput {
  /** Local filesystem path or http(s) URL — resolved by the caller from the active storage driver. */
  sourceTarget: string;
  groqApiKey: string;
}

export interface TranscribeResult {
  fullText: string;
  words: WordTimestamp[];
  language: string | null;
}

/** Extracts audio, chunks it for Groq's size limit, transcribes each chunk,
 * and merges word timestamps back into one continuous timeline. */
export async function transcribeSource(input: TranscribeInput): Promise<TranscribeResult> {
  const workDir = await mkdtemp(path.join(tmpdir(), "cutroom-transcribe-"));

  try {
    const chunks = await extractAudioChunks(input.sourceTarget, workDir);

    const textParts: string[] = [];
    const words: WordTimestamp[] = [];
    let language: string | null = null;

    for (const chunk of chunks) {
      const result = await transcribeAudioFile(chunk.filePath, input.groqApiKey);
      textParts.push(result.text.trim());
      language ??= result.language ?? null;
      for (const w of result.words ?? []) {
        words.push({ word: w.word, start: w.start + chunk.offsetSeconds, end: w.end + chunk.offsetSeconds });
      }
    }

    return { fullText: textParts.join(" "), words, language };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

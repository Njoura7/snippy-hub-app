import { readFile } from "node:fs/promises";
import path from "node:path";

export interface GroqWord {
  word: string;
  start: number;
  end: number;
}

interface GroqTranscriptionResponse {
  text: string;
  language?: string;
  words?: GroqWord[];
}

/** Groq's Whisper endpoint is OpenAI-compatible: https://console.groq.com/docs/speech-to-text */
export async function transcribeAudioFile(filePath: string, apiKey: string): Promise<GroqTranscriptionResponse> {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq transcription failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response.json() as Promise<GroqTranscriptionResponse>;
}

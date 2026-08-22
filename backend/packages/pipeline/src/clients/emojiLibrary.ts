import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMOJI_DIR = path.resolve(__dirname, "../../assets/emoji");
const MANIFEST_PATH = path.join(EMOJI_DIR, "manifest.json");

export interface EmojiEntry {
  emoji: string;
  filename: string;
  label: string;
}

/**
 * A closed set, not "any emoji" — libass/this ffmpeg build can't render
 * emoji glyphs at any real quality (tested: color fonts don't render at all,
 * monochrome bitmap fonts are visibly pixelated). Real PNGs (Twemoji,
 * CC-BY 4.0, via cdn.jsdelivr.net/gh/jdecked/twemoji) composited with
 * ffmpeg's overlay filter instead — crisp at any size, full color. The
 * tradeoff is the LLM (scoringPrompt.ts) and the frontend picker both have
 * to choose from exactly this set so every choice has a matching asset.
 * Loaded synchronously (not async) since scoringPrompt.ts needs SUPPORTED_EMOJI
 * available at module-init time to build the prompt string.
 */
const MANIFEST: EmojiEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as EmojiEntry[];

export const SUPPORTED_EMOJI = MANIFEST.map((e) => e.emoji);

/** Null for an emoji outside the curated set (e.g. hand-typed) — callers
 * should skip the overlay rather than guess, not fail the whole render. */
export function getEmojiImagePath(emoji: string): string | null {
  const entry = MANIFEST.find((e) => e.emoji === emoji);
  return entry ? path.join(EMOJI_DIR, entry.filename) : null;
}

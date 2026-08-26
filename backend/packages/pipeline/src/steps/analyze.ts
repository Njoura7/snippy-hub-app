import type { WordTimestamp } from "@cutroom/shared";
import { scoreTranscriptChunkAnthropic } from "../clients/anthropic.js";
import { SUPPORTED_EMOJI } from "../clients/emojiLibrary.js";
import { scoreTranscriptChunkGroq } from "../clients/groqChat.js";
import type { RawCandidate } from "../clients/scoringPrompt.js";

const CHUNK_SECONDS = 480; // 8 min per chunk sent to the model
const OVERLAP_SECONDS = 30; // so a moment straddling a chunk boundary isn't missed
const MIN_CLIP_SECONDS = 15;
const MAX_CLIP_SECONDS = 120;
const WORDS_PER_MARKER = 6; // how often a "[m:ss]" timestamp marker is inserted in the prompt
export const DEFAULT_MAX_CLIPS = 10;
// How far past the model's chosen end timestamp we'll look for a clean
// sentence boundary (next word ending in . ! or ?) before giving up and
// just using the word boundary — bounds how much a clip can grow beyond
// what the model asked for.
const SENTENCE_EXTENSION_LOOKAHEAD_SECONDS = 6;
const SENTENCE_END_RE = /[.!?]["')\]]?$/;

// Groq's free tier caps tokens-per-minute fairly tightly (e.g. 8000 TPM for
// gpt-oss-120b) — a long episode's chunk loop can burn through that in 1-2
// requests. Rather than let one 429 fail the whole analyze job (discarding
// however many chunks already succeeded), pace requests and retry
// rate-limited chunks with backoff. Anthropic's limits are much higher, so
// this only applies to the free provider.
const GROQ_INTER_CHUNK_DELAY_MS = 3000;
const RATE_LIMIT_BACKOFF_MS = [5000, 15000, 30000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && /429|rate.?limit/i.test(err.message);
}

export type AnalyzeProvider = "groq" | "anthropic";

export interface ClipCandidate {
  startSeconds: number;
  endSeconds: number;
  score: number;
  hook: string;
  tag: string;
  emoji: string | null;
}

/**
 * Same prompt/schema against either provider (see clients/scoringPrompt.ts):
 *  - "groq"      free — reuses GROQ_API_KEY, no extra signup
 *  - "anthropic" paid — needs Anthropic credits, generally sharper scoring/hooks
 * Swap via ANALYZE_PROVIDER, same pattern as STORAGE_DRIVER.
 */
export async function analyzeTranscript(
  words: WordTimestamp[],
  opts: { provider: AnalyzeProvider; apiKey: string; maxClips?: number; topicFilter?: string | null },
): Promise<ClipCandidate[]> {
  if (words.length === 0) return [];

  const scoreChunk = opts.provider === "anthropic" ? scoreTranscriptChunkAnthropic : scoreTranscriptChunkGroq;
  const maxClips = opts.maxClips && opts.maxClips > 0 ? opts.maxClips : DEFAULT_MAX_CLIPS;

  const totalDuration = words[words.length - 1]!.end;
  const candidates: ClipCandidate[] = [];
  let isFirstChunk = true;

  for (let chunkStart = 0; chunkStart < totalDuration; chunkStart += CHUNK_SECONDS - OVERLAP_SECONDS) {
    const chunkEnd = chunkStart + CHUNK_SECONDS;
    const chunkWords = words.filter((w) => w.start >= chunkStart && w.start < chunkEnd);
    if (chunkWords.length === 0) continue;

    if (opts.provider === "groq" && !isFirstChunk) await sleep(GROQ_INTER_CHUNK_DELAY_MS);
    isFirstChunk = false;

    const raw = await scoreChunkWithRateLimitRetry(scoreChunk, formatChunkForPrompt(chunkWords), opts.apiKey, opts.topicFilter);
    candidates.push(
      ...raw
        .map(toClipCandidate)
        .filter((c): c is ClipCandidate => c !== null)
        .map((c) => snapToWordBoundaries(c, words))
        // Defensive re-check — snapping can theoretically shrink a candidate
        // that was only barely above MIN_CLIP_SECONDS before adjustment.
        .filter((c) => c.endSeconds - c.startSeconds >= MIN_CLIP_SECONDS),
    );

    if (chunkEnd >= totalDuration) break;
  }

  return capToTopClips(dedupeOverlapping(candidates), maxClips);
}

/** Retries a single chunk on 429s with backoff; gives up on that one chunk
 * (rather than failing the whole analyze job) after exhausting backoff — a
 * gap in coverage beats losing every chunk already scored. */
async function scoreChunkWithRateLimitRetry(
  scoreChunk: (chunkText: string, apiKey: string, topicFilter?: string | null) => Promise<RawCandidate[]>,
  chunkText: string,
  apiKey: string,
  topicFilter?: string | null,
): Promise<RawCandidate[]> {
  const attempts = [0, ...RATE_LIMIT_BACKOFF_MS];
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i]! > 0) await sleep(attempts[i]!);
    try {
      return await scoreChunk(chunkText, apiKey, topicFilter);
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      const nextBackoff = attempts[i + 1];
      console.warn(
        nextBackoff !== undefined
          ? `[analyze] rate limited, retrying in ${nextBackoff}ms`
          : "[analyze] rate limited, out of retries — skipping this chunk",
      );
    }
  }
  return [];
}

function formatChunkForPrompt(words: WordTimestamp[]): string {
  const lines: string[] = [];
  let buffer: string[] = [];
  let markerTime = words[0]?.start ?? 0;

  words.forEach((w, i) => {
    if (i % WORDS_PER_MARKER === 0) {
      if (buffer.length) lines.push(`[${formatTimestamp(markerTime)}] ${buffer.join(" ")}`);
      buffer = [];
      markerTime = w.start;
    }
    buffer.push(w.word);
  });
  if (buffer.length) lines.push(`[${formatTimestamp(markerTime)}] ${buffer.join(" ")}`);

  return lines.join("\n");
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTimestamp(value: string): number | null {
  const match = /^(\d+):(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const [, m, s] = match;
  return Number(m) * 60 + Number(s);
}

function toClipCandidate(raw: RawCandidate): ClipCandidate | null {
  const startSeconds = parseTimestamp(raw.startTimestamp);
  const endSeconds = parseTimestamp(raw.endTimestamp);
  if (startSeconds === null || endSeconds === null) return null;

  const duration = endSeconds - startSeconds;
  if (duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) return null;

  // Defensive: the schema enum should stop a provider from returning
  // anything else, but free-tier models sometimes deviate — drop it rather
  // than store an emoji with no matching rendered asset.
  const trimmedEmoji = raw.emoji?.trim();
  const emoji = trimmedEmoji && SUPPORTED_EMOJI.includes(trimmedEmoji) ? trimmedEmoji : null;

  return {
    startSeconds,
    endSeconds,
    score: Math.max(0, Math.min(100, Math.round(raw.score))),
    hook: raw.hook.slice(0, 200),
    tag: raw.tag.slice(0, 40),
    emoji,
  };
}

/** The model only sees timestamp markers every WORDS_PER_MARKER words and
 * picks endTimestamp to whole-second precision, so its chosen boundaries
 * regularly land mid-word or mid-sentence. Snap start back to the start of
 * its containing word (never mid-word), and try to extend end forward to
 * the next sentence-ending punctuation within a bounded lookahead — falling
 * back to just the containing word's end if nothing clean is nearby. */
function snapToWordBoundaries(candidate: ClipCandidate, words: WordTimestamp[]): ClipCandidate {
  if (words.length === 0) return candidate;

  const startIdx = words.findIndex((w) => w.end > candidate.startSeconds);
  const snappedStart = words[startIdx === -1 ? words.length - 1 : startIdx]!.start;

  const endIdx = words.findIndex((w) => w.end >= candidate.endSeconds);
  const wordSnappedEndIdx = endIdx === -1 ? words.length - 1 : endIdx;
  const wordSnappedEnd = words[wordSnappedEndIdx]!.end;

  let extendedEndIdx = wordSnappedEndIdx;
  for (let i = wordSnappedEndIdx; i < words.length; i++) {
    const w = words[i]!;
    if (w.end - snappedStart > MAX_CLIP_SECONDS) break;
    if (w.end - wordSnappedEnd > SENTENCE_EXTENSION_LOOKAHEAD_SECONDS) break;
    extendedEndIdx = i;
    if (SENTENCE_END_RE.test(w.word)) break;
  }

  return { ...candidate, startSeconds: snappedStart, endSeconds: words[extendedEndIdx]!.end };
}

/** Keeps only the top `maxClips` by score — the model's per-chunk 0-4 cap
 * means a long episode with many chunks can still return 20+ candidates
 * overall, most of which aren't actually the best moments in the video. */
function capToTopClips(candidates: ClipCandidate[], maxClips: number): ClipCandidate[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxClips)
    .sort((a, b) => a.startSeconds - b.startSeconds);
}

/** Chunk overlap can produce near-duplicate candidates for the same moment —
 * greedy non-max-suppression by score, dropping anything >50% overlapping
 * with an already-accepted (higher-scoring) candidate. */
function dedupeOverlapping(candidates: ClipCandidate[]): ClipCandidate[] {
  const bySore = [...candidates].sort((a, b) => b.score - a.score);
  const accepted: ClipCandidate[] = [];

  for (const c of bySore) {
    const overlapsAccepted = accepted.some((a) => {
      const overlapStart = Math.max(a.startSeconds, c.startSeconds);
      const overlapEnd = Math.min(a.endSeconds, c.endSeconds);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const shorterDuration = Math.min(a.endSeconds - a.startSeconds, c.endSeconds - c.startSeconds);
      return overlap > shorterDuration * 0.5;
    });
    if (!overlapsAccepted) accepted.push(c);
  }

  return accepted.sort((a, b) => a.startSeconds - b.startSeconds);
}

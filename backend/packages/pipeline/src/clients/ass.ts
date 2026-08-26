import type { WordTimestamp } from "@cutroom/shared";

export type CaptionFont = "anton" | "bebas" | "poppins" | "ubuntu";

export interface ResolvedCaptionStyle {
  font: CaptionFont;
  /** Hex, e.g. "#FFFFFF" — already resolved from a color name by the caller. */
  colorHex: string;
  position: "top" | "middle" | "bottom";
  /** Matches the frontend's 16-48 preview-px slider — scaled up for a real 1080-wide render. */
  size: number;
}

export interface HeaderCaptionConfig {
  enabled: boolean;
  /** Usually the clip's hookText — this is the headline overlay, distinct from the spoken-word captions below. */
  text: string;
  /** Whether an emoji badge image will be composited alongside this header
   * (see ffmpegRender.ts) — shifts the header text right and left-aligns it
   * so the two sit inline as one headline instead of the badge floating over
   * independently-centered text. */
  hasEmoji?: boolean;
}

// Real bundled fonts (see assets/fonts/LICENSES.md), not generic
// substitutes — family names confirmed via `fc-list` in the built worker
// image, not assumed from filenames (static-weight Google Fonts files
// sometimes fold the weight into the family name, e.g. Poppins ExtraBold).
const FONT_MAP: Record<CaptionFont, string> = {
  anton: "Anton",
  bebas: "Bebas Neue",
  poppins: "Poppins ExtraBold",
  ubuntu: "Ubuntu",
};

const ALIGNMENT_MAP: Record<ResolvedCaptionStyle["position"], number> = {
  // ASS numpad-style alignment: 2 = bottom-center, 5 = middle-center, 8 = top-center
  bottom: 2,
  middle: 5,
  top: 8,
};

// The frontend's size slider is calibrated against a small (~300px-wide)
// preview thumbnail; real output is 1080px wide, hence the scale-up.
const PREVIEW_TO_RENDER_SCALE = 2.2;
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const MAX_WORDS_PER_LINE = 6;
const MAX_SECONDS_PER_LINE = 2.5;
const HEADER_FONT_SIZE = 58;
const HEADER_MARGIN_V = 90;

// Shared with ffmpegRender.ts (imported from here) so the emoji image
// overlay lines up pixel-for-pixel with where the header text box actually
// starts — two independently-tuned constants drift apart the moment either
// one changes, which is exactly how the emoji ended up floating over the
// text in the first place.
export const HEADER_EMOJI_SIZE = 76;
export const HEADER_EMOJI_LEFT = 60;
export const HEADER_EMOJI_TOP = HEADER_MARGIN_V;
// Text starts clear of the badge: left margin + badge width + a small gap.
const HEADER_MARGIN_L_WITH_EMOJI = HEADER_EMOJI_LEFT + HEADER_EMOJI_SIZE + 14;
const HEADER_MARGIN_L_DEFAULT = 60;

interface CaptionLine {
  text: string;
  start: number;
  end: number;
}

function groupWordsIntoLines(words: WordTimestamp[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let buffer: WordTimestamp[] = [];
  let lineStart = 0;

  for (const w of words) {
    if (buffer.length === 0) lineStart = w.start;
    buffer.push(w);
    const duration = w.end - lineStart;
    if (buffer.length >= MAX_WORDS_PER_LINE || duration >= MAX_SECONDS_PER_LINE) {
      lines.push({ text: buffer.map((x) => x.word).join(" ").trim(), start: lineStart, end: w.end });
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    lines.push({
      text: buffer.map((x) => x.word).join(" ").trim(),
      start: lineStart,
      end: buffer[buffer.length - 1]!.end,
    });
  }
  return lines;
}

function toAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/** "#RRGGBB" -> ASS's "&H00BBGGRR" (alpha-blue-green-red, hex). */
function hexToAssColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, " ");
}

/** Builds an ASS subtitle file: the spoken-word captions (from real word
 * timestamps) plus an optional persistent header caption (the clip's hook,
 * shown for the whole clip — distinct from the word-by-word captions,
 * always top-anchored regardless of `style.position` so the two don't
 * compete). The header's emoji is a separate image overlay, not ASS text —
 * see ffmpegRender.ts — since this ffmpeg/libass build can't render emoji
 * glyphs at any real quality. */
export function buildAssSubtitles(
  words: WordTimestamp[],
  style: ResolvedCaptionStyle,
  header: HeaderCaptionConfig,
  clipDurationSeconds: number,
): string {
  const lines = groupWordsIntoLines(words);
  const fontSize = Math.round(style.size * PREVIEW_TO_RENDER_SCALE);
  const alignment = ALIGNMENT_MAP[style.position];
  const marginV = style.position === "middle" ? Math.round(VIDEO_HEIGHT / 2 - fontSize) : 180;
  const outline = Math.max(2, Math.round(fontSize / 12));

  // Top-left + reserved margin when there's a badge to clear, so the emoji
  // and headline read as one line ("🚨 Kids are building...") instead of the
  // badge sitting on top of centered text. No emoji -> centered, as before.
  const headerHasEmoji = header.enabled && (header.hasEmoji ?? false);
  const headerAlignment = headerHasEmoji ? 7 : 8;
  const headerMarginL = headerHasEmoji ? HEADER_MARGIN_L_WITH_EMOJI : HEADER_MARGIN_L_DEFAULT;

  const scriptHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: ${VIDEO_WIDTH}
PlayResY: ${VIDEO_HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${FONT_MAP[style.font]},${fontSize},${hexToAssColor(style.colorHex)},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,${outline},1,${alignment},60,60,${marginV},1
Style: Header,${FONT_MAP.poppins},${HEADER_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,18,0,${headerAlignment},${headerMarginL},60,${HEADER_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const wordEvents = lines
    .map((l) => `Dialogue: 0,${toAssTime(l.start)},${toAssTime(l.end)},Default,,0,0,0,,${escapeAssText(l.text.toUpperCase())}`)
    .join("\n");

  const headerEvent = header.enabled
    ? `Dialogue: 0,${toAssTime(0)},${toAssTime(clipDurationSeconds)},Header,,0,0,0,,${escapeAssText(header.text)}\n`
    : "";

  return scriptHeader + headerEvent + wordEvents + "\n";
}

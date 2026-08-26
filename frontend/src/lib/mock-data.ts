export type Platform = "tiktok" | "shorts" | "reels";

export const PLATFORMS: { value: Platform; label: string; ratio: string }[] = [
  { value: "tiktok", label: "TikTok", ratio: "9:16" },
  { value: "shorts", label: "YouTube Shorts", ratio: "9:16" },
  { value: "reels", label: "Instagram Reels", ratio: "9:16" },
];

export const PROCESSING_STEPS = [
  "Transcribing",
  "Finding moments",
  "Cutting clips",
  "Captioning",
] as const;

export type Clip = {
  id: string;
  title: string;
  hook: string;
  duration: number;
  score: number;
  start: number;
  end: number;
  tone: string;
};

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
export type CaptionPreset = "bold" | "minimal" | "karaoke";

export const CAPTION_PRESETS: { value: CaptionPreset; label: string; hint: string }[] = [
  { value: "bold", label: "Bold pop", hint: "Heavy uppercase, punchy" },
  { value: "minimal", label: "Minimal", hint: "Light, unobtrusive" },
  { value: "karaoke", label: "Karaoke", hint: "Word-by-word highlight" },
];

export type CaptionFont = "anton" | "bebas" | "poppins" | "ubuntu";

// Same 4 fonts bundled in the worker image (backend/packages/pipeline/assets/fonts/)
// and loaded here via Google Fonts in __root.tsx — fontFamily/fontWeight is
// what actually makes the editor preview and dropdown look like the real
// render, not a generic system-font stand-in. Only the weight requested in
// __root.tsx's Google Fonts URL is loaded for each family, so fontWeight
// must match that exactly (400 default for Anton/Bebas — they're display
// faces with only one weight; 800/700 for Poppins/Ubuntu).
export const CAPTION_FONTS: { value: CaptionFont; label: string; fontFamily: string; fontWeight: number }[] = [
  { value: "anton", label: "Anton", fontFamily: "'Anton', sans-serif", fontWeight: 400 },
  { value: "bebas", label: "Bebas Neue", fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400 },
  { value: "poppins", label: "Poppins ExtraBold", fontFamily: "'Poppins', sans-serif", fontWeight: 800 },
  { value: "ubuntu", label: "Ubuntu", fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
];

export const CAPTION_FONT_STYLE: Record<CaptionFont, { fontFamily: string; fontWeight: number }> = Object.fromEntries(
  CAPTION_FONTS.map((f) => [f.value, { fontFamily: f.fontFamily, fontWeight: f.fontWeight }]),
) as Record<CaptionFont, { fontFamily: string; fontWeight: number }>;

export const SAFE_ZONES: Record<
  Platform,
  { label: string; iconColumnBottom: number; iconColumnHeight: number; captionBar: number }
> = {
  tiktok: { label: "TikTok safe zone", iconColumnBottom: 18, iconColumnHeight: 34, captionBar: 14 },
  shorts: { label: "Shorts safe zone", iconColumnBottom: 12, iconColumnHeight: 26, captionBar: 10 },
  reels: { label: "Reels safe zone", iconColumnBottom: 16, iconColumnHeight: 30, captionBar: 18 },
};

export const PLATFORM_VARIANTS: Record<Platform, { position: "top" | "middle" | "bottom"; note: string }> = {
  tiktok: { position: "bottom", note: "Captions raised above the icon column" },
  shorts: { position: "middle", note: "Center captions, tighter title bar" },
  reels: { position: "top", note: "Captions lifted clear of the caption bar" },
};


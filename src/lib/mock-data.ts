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

export const mockClips: Clip[] = [
  {
    id: "c1",
    title: "The 4am rule",
    hook: "Nobody tells you this about waking up at 4am",
    duration: 41,
    score: 94,
    start: 322,
    end: 363,
    tone: "Story",
  },
  {
    id: "c2",
    title: "Hiring mistake",
    hook: "I lost $180k hiring the wrong first employee",
    duration: 58,
    score: 88,
    start: 910,
    end: 968,
    tone: "Lesson",
  },
  {
    id: "c3",
    title: "One-line pitch",
    hook: "Your pitch should fit in a text message",
    duration: 27,
    score: 81,
    start: 1442,
    end: 1469,
    tone: "Tactic",
  },
  {
    id: "c4",
    title: "Burnout signal",
    hook: "Burnout doesn't start with exhaustion",
    duration: 63,
    score: 76,
    start: 2011,
    end: 2074,
    tone: "Insight",
  },
  {
    id: "c5",
    title: "Pricing flip",
    hook: "We doubled the price and sold more",
    duration: 35,
    score: 72,
    start: 2680,
    end: 2715,
    tone: "Tactic",
  },
  {
    id: "c6",
    title: "Cold email teardown",
    hook: "This cold email got a reply from a billionaire",
    duration: 49,
    score: 65,
    start: 3120,
    end: 3169,
    tone: "Teardown",
  },
];

export const mockProjects = [
  { id: "p1", name: "Founder podcast — ep. 112", clips: 6, createdAt: "2h ago", platform: "TikTok" },
  { id: "p2", name: "Twitch VOD — build stream", clips: 9, createdAt: "Yesterday", platform: "Reels" },
  { id: "p3", name: "Keynote: scaling to 1M", clips: 4, createdAt: "3 days ago", platform: "Shorts" },
];

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
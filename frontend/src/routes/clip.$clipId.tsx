import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TopNav } from "@/components/TopNav";
import { ClipThumb } from "@/components/ClipThumb";
import {
  formatDuration,
  CAPTION_FONTS,
  CAPTION_FONT_STYLE,
  CAPTION_PRESETS,
  PLATFORMS,
  PLATFORM_VARIANTS,
  type CaptionFont,
  type CaptionPreset,
  type Platform,
} from "@/lib/mock-data";
import { useSelectedPlatforms } from "@/lib/platform-store";
import {
  exportClip,
  getClip,
  listEmojiOptions,
  listMusicTracks,
  updateClip,
  type ApiClipRender,
  type EmojiOption,
  type MusicTrack,
} from "@/lib/api";

const title = "Clip editor — Cutroom";
const description =
  "Preview the vertical clip, tune caption style, edit the hook, and trim timing.";

export const Route = createFileRoute("/clip/$clipId")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: ClipEditor,
});

const CAPTION_COLORS = [
  { value: "white", label: "White" },
  { value: "yellow", label: "Yellow" },
  { value: "accent", label: "Accent" },
];

// Matches TRIM_ADJUST_MS in backend/apps/api/src/routes/clips.ts.
const TRIM_ADJUST_SECONDS = 20;

const PRESET_DEFAULTS: Record<CaptionPreset, { font: CaptionFont; color: string; size: number }> = {
  bold: { font: "anton", color: "yellow", size: 36 },
  minimal: { font: "poppins", color: "white", size: 24 },
  karaoke: { font: "bebas", color: "accent", size: 30 },
};

// Purely decorative trim-scrubber texture — not real waveform analysis, just
// a fixed, visually-plausible pattern (no audio processing exists to back a
// real one yet).
const TRIM_WAVEFORM_BARS = Array.from({ length: 96 }, (_, i) =>
  Math.round(24 + 62 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.19) + Math.sin(i * 0.31) * 0.4)),
);

/** Stable per-clip number (0..2^32) for ClipThumb's decorative background
 * variant — was previously an array index into mock data. */
function hashClipId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function ClipEditor() {
  const { clipId } = Route.useParams();
  const platforms = useSelectedPlatforms();
  const index = hashClipId(clipId);

  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [clipTitle, setClipTitle] = useState("");
  const [renders, setRenders] = useState<ApiClipRender[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [variant, setVariant] = useState<Platform>(platforms[0] ?? "tiktok");
  const active: Platform = platforms.includes(variant) ? variant : (platforms[0] ?? "tiktok");

  const [hook, setHook] = useState("");
  const [transcriptExcerpt, setTranscriptExcerpt] = useState<string | null>(null);
  const [emphasized, setEmphasized] = useState<number[]>([]);
  const [preset, setPreset] = useState<CaptionPreset>("minimal");
  const [font, setFont] = useState<CaptionFont>("poppins");
  const [color, setColor] = useState("white");
  const [position, setPosition] = useState<"top" | "middle" | "bottom">(
    PLATFORM_VARIANTS[active].position,
  );
  const [size, setSize] = useState([28]);
  const [safeZones, setSafeZones] = useState(true);
  const [range, setRange] = useState<number[]>([0, 0]);
  // Immutable snapshot of where analyze originally placed this clip — the
  // trim slider is bounded to +/-TRIM_ADJUST_SECONDS of this, not the
  // (possibly already-adjusted) current range, so repeated small trims can't
  // let a clip drift into content the analyzer never actually scored.
  const [analyzedRange, setAnalyzedRange] = useState<[number, number]>([0, 0]);

  // Header caption overlay (hook + emoji badge image, shown for the whole
  // clip — see packages/pipeline/src/clients/ass.ts + ffmpegRender.ts on the
  // backend) and background music.
  const [emoji, setEmoji] = useState("");
  const [headerEnabled, setHeaderEnabled] = useState(true);
  const [emojiOptions, setEmojiOptions] = useState<EmojiOption[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicKey, setMusicKey] = useState<string>("none");
  // 0-0.5 (fraction of full volume); 0.5-1.5 (fraction of the speaker's
  // original level, floored at 0.5 so dialogue can never be reduced past
  // half-volume) — see ffmpegRender.ts for the render-side clamp.
  const [musicVolume, setMusicVolume] = useState([0.12]);
  const [voiceVolume, setVoiceVolume] = useState([1]);
  // Compared against the active render's updatedAt to warn when what's
  // playing predates your latest edits — Export is a snapshot, not live.
  const [clipUpdatedAt, setClipUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    listMusicTracks()
      .then(setMusicTracks)
      .catch(() => {
        // Backend unreachable — music picker just stays empty (still shows "None").
      });
    listEmojiOptions()
      .then(setEmojiOptions)
      .catch(() => {
        // Backend unreachable — emoji picker just stays empty (still shows "None").
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getClip(clipId)
      .then(({ clip, renders: realRenders }) => {
        if (cancelled) return;
        setLoadStatus("ready");
        setClipTitle(clip.hookText);
        setHook(clip.hookText);
        setTranscriptExcerpt(clip.transcriptExcerpt);
        setRange([clip.startMs / 1000, clip.endMs / 1000]);
        setAnalyzedRange([
          (clip.analyzedStartMs ?? clip.startMs) / 1000,
          (clip.analyzedEndMs ?? clip.endMs) / 1000,
        ]);
        setRenders(realRenders);

        const p = (clip.captionPreset as CaptionPreset) ?? "minimal";
        setPreset(p);
        const overrides = clip.captionStyleOverrides ?? {};
        const defaults = PRESET_DEFAULTS[p] ?? PRESET_DEFAULTS.minimal;
        // Guards against stale values from before the font lineup changed
        // (old clips may still have "sans"/"mono"/"serif" saved).
        const validFont = CAPTION_FONTS.some((f) => f.value === overrides.font);
        setFont(validFont ? (overrides.font as CaptionFont) : defaults.font);
        setColor(overrides.color ?? defaults.color);
        setPosition(
          (overrides.position as "top" | "middle" | "bottom") ?? PLATFORM_VARIANTS[active].position,
        );
        setSize([overrides.size ?? defaults.size]);
        setHeaderEnabled(overrides.headerEnabled ?? true);
        setEmoji(clip.emoji ?? "");
        setMusicKey(clip.backgroundMusicKey ?? "none");
        setMusicVolume([clip.musicVolume ?? 0.12]);
        setVoiceVolume([clip.voiceVolume ?? 1]);
        setClipUpdatedAt(clip.updatedAt);
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  const words = hook.split(/\s+/).filter(Boolean);

  function applyPreset(p: CaptionPreset) {
    setPreset(p);
    const d = PRESET_DEFAULTS[p];
    setFont(d.font);
    setColor(d.color);
    setSize([d.size]);
  }

  function selectVariant(p: Platform) {
    setVariant(p);
    setPosition(PLATFORM_VARIANTS[p].position);
  }

  function currentSavePayload() {
    return {
      hookText: hook,
      emoji: emoji.trim() || null,
      captionPreset: preset,
      captionStyleOverrides: { font, color, position, size: size[0], headerEnabled },
      backgroundMusicKey: musicKey === "none" ? null : musicKey,
      musicVolume: musicVolume[0] ?? 0.12,
      voiceVolume: voiceVolume[0] ?? 1,
      startMs: Math.round((range[0] ?? 0) * 1000),
      endMs: Math.round((range[1] ?? 0) * 1000),
    };
  }

  async function handleSaveDraft() {
    setSaveState("saving");
    try {
      const updated = await updateClip(clipId, currentSavePayload());
      setClipUpdatedAt(updated.updatedAt);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("idle");
    }
  }

  async function handleExport() {
    setExportError(null);
    try {
      // Always save first — otherwise whatever's currently selected in the
      // editor (font, color, header, music, ...) isn't what actually renders,
      // since export reads the clip row on the server, not this local state.
      const updated = await updateClip(clipId, currentSavePayload());
      setClipUpdatedAt(updated.updatedAt);
      const render = await exportClip(clipId, active);
      setRenders((prev) => [...prev.filter((r) => r.platform !== active), render]);
      pollRender(active);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function pollRender(platform: Platform) {
    const interval = setInterval(async () => {
      try {
        const { renders: latest } = await getClip(clipId);
        setRenders(latest);
        const r = latest.find((x) => x.platform === platform);
        if (r && (r.status === "rendered" || r.status === "failed")) {
          clearInterval(interval);
          if (r.status === "failed") setExportError(r.errorMessage ?? "Render failed");
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }

  const activeRender = renders.find((r) => r.platform === active);
  const isRenderStale = !!(
    activeRender?.status === "rendered" &&
    clipUpdatedAt &&
    new Date(clipUpdatedAt).getTime() > new Date(activeRender.updatedAt).getTime()
  );

  // Matches the API's TRIM_ADJUST_MS (routes/clips.ts) — the slider's own
  // bounds, not just a client-side hint, since the server rejects anything
  // outside this anyway.
  const trimMin = Math.max(0, analyzedRange[0] - TRIM_ADJUST_SECONDS);
  const trimMax = analyzedRange[1] + TRIM_ADJUST_SECONDS;
  const span = trimMax - trimMin;
  const isTrimmed = range[0] !== analyzedRange[0] || range[1] !== analyzedRange[1];

  if (loadStatus === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-sm text-muted-foreground">Loading clip…</p>
        </main>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <Link to="/clips" className="text-xs text-muted-foreground underline">
            Back to clips
          </Link>
          <Card className="mt-6 flex flex-col items-center justify-center gap-1 border-dashed py-12 shadow-none">
            <p className="text-sm font-medium">Clip not found</p>
            <p className="text-xs text-muted-foreground">
              It may have been deleted, or the backend isn't reachable.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/clips" className="text-xs text-muted-foreground underline">
              Back to clips
            </Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{clipTitle}</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saveState === "saving"}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save draft"}
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={activeRender?.status === "rendering"}
            >
              {activeRender?.status === "rendering" ? "Rendering…" : "Export clip"}
            </Button>
          </div>
        </div>
        {exportError ? <p className="mt-2 text-xs text-destructive">{exportError}</p> : null}
        {isRenderStale ? (
          <p className="mt-2 rounded-md border border-dashed border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            You've changed settings since this was exported — the video below doesn't reflect them
            yet. Click <span className="font-medium text-foreground">Export clip</span> again to
            re-render.
          </p>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            {platforms.length > 1 ? (
              <div className="mb-3 flex gap-1 rounded-md bg-secondary p-1">
                {platforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => selectVariant(p)}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      p === active
                        ? "border border-border bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {PLATFORMS.find((x) => x.value === p)
                      ?.label.replace("YouTube ", "")
                      .replace("Instagram ", "")}
                  </button>
                ))}
              </div>
            ) : null}

            {activeRender?.status === "rendered" && activeRender.url ? (
              <video
                src={activeRender.url}
                controls
                className="mx-auto max-h-[320px] w-full rounded-md border border-border bg-black"
                style={{ aspectRatio: "9 / 16" }}
              />
            ) : (
              <ClipThumb
                index={index}
                label={hook}
                platform={active}
                showSafeZones={safeZones}
                preset={preset}
                color={color}
                font={font}
                position={position}
                size={size[0] ?? 28}
                emphasized={emphasized}
              />
            )}

            {activeRender?.status === "rendered" && activeRender.url ? (
              <a
                href={activeRender.url}
                download
                className="mt-3 block w-full rounded-md border border-border bg-card px-3 py-2 text-center text-xs font-medium hover:bg-secondary"
              >
                Download {PLATFORMS.find((x) => x.value === active)?.label}
              </a>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <Label htmlFor="safe-zones" className="text-xs text-muted-foreground">
                    Show safe zones
                  </Label>
                  <Switch id="safe-zones" checked={safeZones} onCheckedChange={setSafeZones} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{PLATFORM_VARIANTS[active].note}</span>
                  <span>{formatDuration((range[1] ?? 0) - (range[0] ?? 0))}</span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-6">
            <Card className="gap-4 p-5 shadow-none">
              <div className="space-y-2">
                <Label htmlFor="hook">Hook text</Label>
                <Input
                  id="hook"
                  value={hook}
                  onChange={(e) => {
                    setHook(e.target.value);
                    setEmphasized([]);
                  }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Tap words to emphasize them in the caption.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {words.map((word, i) => (
                    <button
                      key={`${word}-${i}`}
                      onClick={() =>
                        setEmphasized((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                        )
                      }
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        emphasized.includes(i)
                          ? "border-accent bg-accent-soft font-semibold text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="gap-5 p-5 shadow-none">
              <div>
                <h2 className="text-sm font-medium">Caption style</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {CAPTION_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => applyPreset(p.value)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${
                        preset === p.value
                          ? "border-foreground bg-secondary"
                          : "border-border bg-card hover:border-foreground/30"
                      }`}
                    >
                      <span className="block text-xs font-semibold">{p.label}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {p.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Font</Label>
                  <Select value={font} onValueChange={(v) => setFont(v as CaptionFont)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAPTION_FONTS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          <span style={{ fontFamily: f.fontFamily, fontWeight: f.fontWeight }}>{f.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Select value={color} onValueChange={setColor}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAPTION_COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={position}
                    onValueChange={(v) => v && setPosition(v as "top" | "middle" | "bottom")}
                    className="w-full"
                  >
                    <ToggleGroupItem value="top" className="flex-1 text-xs">
                      Top
                    </ToggleGroupItem>
                    <ToggleGroupItem value="middle" className="flex-1 text-xs">
                      Middle
                    </ToggleGroupItem>
                    <ToggleGroupItem value="bottom" className="flex-1 text-xs">
                      Bottom
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Size</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">{size[0]}px</span>
                  </div>
                  <Slider min={16} max={48} step={1} value={size} onValueChange={setSize} />
                </div>
              </div>
            </Card>

            <Card className="gap-4 p-5 shadow-none">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Header caption</h2>
                <Switch
                  checked={headerEnabled}
                  onCheckedChange={setHeaderEnabled}
                  aria-label="Show header caption"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A persistent headline at the top of the clip — your hook text plus a badge icon.
                Separate from the word-by-word captions below.
              </p>
              <Select
                value={emoji || "none"}
                onValueChange={(v) => setEmoji(v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full" disabled={!headerEnabled} aria-label="Header emoji badge">
                  <SelectValue placeholder="No badge" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No badge</SelectItem>
                  {emojiOptions.map((o) => (
                    <SelectItem key={o.emoji} value={o.emoji}>
                      {o.emoji} {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Mirrors the actual render: left-aligned badge + text on a dark
                  bar — see ass.ts's headerAlignment/headerMarginL and
                  ffmpegRender.ts's overlay x/y, which this is styled to match. */}
              <div
                className={`flex items-center gap-2 rounded-md bg-black/80 px-3 py-2.5 ${
                  headerEnabled ? "" : "opacity-40"
                }`}
              >
                {emoji ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10 text-xl leading-none">
                    {emoji}
                  </span>
                ) : null}
                <p className="min-w-0 flex-1 truncate text-sm text-white" style={CAPTION_FONT_STYLE.poppins}>
                  {hook}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Fixed set, on purpose — these render as crisp images in the export; typed emoji
                would render as a small pixelated glyph or not at all.
              </p>
            </Card>

            <Card className="gap-4 p-5 shadow-none">
              <h2 className="text-sm font-medium">Background music</h2>
              <p className="text-xs text-muted-foreground">
                Kept quiet under the dialogue on purpose — this is meant to add a little energy, not
                compete with the speaker.
              </p>
              <Select value={musicKey} onValueChange={setMusicKey}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {musicTracks.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {musicKey !== "none" && musicTracks.find((t) => t.key === musicKey) ? (
                <div>
                  <audio
                    controls
                    src={musicTracks.find((t) => t.key === musicKey)?.previewUrl}
                    className="h-9 w-full"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {musicTracks.find((t) => t.key === musicKey)?.artist
                      ? `${musicTracks.find((t) => t.key === musicKey)?.artist} — `
                      : ""}
                    {musicTracks.find((t) => t.key === musicKey)?.license}
                  </p>
                </div>
              ) : null}

              {musicKey !== "none" ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Music level</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round((musicVolume[0] ?? 0.12) * 100)}%
                    </span>
                  </div>
                  <div className="py-2">
                    <Slider min={0} max={0.5} step={0.01} value={musicVolume} onValueChange={setMusicVolume} />
                  </div>
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Dialogue volume</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Math.round((voiceVolume[0] ?? 1) * 100)}%
                  </span>
                </div>
                <div className="py-2">
                  <Slider min={0.5} max={1.5} step={0.05} value={voiceVolume} onValueChange={setVoiceVolume} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Floored at 50% so the speaker can never be turned down past intelligible.
                </p>
              </div>
            </Card>

            <Card className="gap-4 p-5 shadow-none">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Trim</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDuration(range[0] ?? 0)} — {formatDuration(range[1] ?? 0)}
                  </span>
                  {isTrimmed ? (
                    <button
                      onClick={() => setRange([analyzedRange[0], analyzedRange[1]])}
                      className="text-xs text-muted-foreground underline"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="py-2">
                <Slider
                  min={trimMin}
                  max={trimMax}
                  step={1}
                  value={range}
                  onValueChange={setRange}
                />
              </div>

              <div className="flex h-10 items-end gap-[2px] overflow-hidden rounded-md border border-border bg-secondary px-1 py-1">
                {TRIM_WAVEFORM_BARS.map((h, i) => {
                  const t = trimMin + (i / TRIM_WAVEFORM_BARS.length) * span;
                  const inRange = t >= (range[0] ?? 0) && t <= (range[1] ?? 0);
                  return (
                    <span
                      key={i}
                      className={`flex-1 rounded-[1px] ${inRange ? "bg-foreground" : "bg-foreground/20"}`}
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>

              <p className="line-clamp-2 text-xs italic text-muted-foreground">
                {transcriptExcerpt ?? "No transcript excerpt available for this clip."}
              </p>
              <p className="text-xs text-muted-foreground">
                Adjustable up to ±{TRIM_ADJUST_SECONDS}s from where analysis originally placed this
                clip — nudge either handle if it starts or ends mid-word. Save or Export to apply.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

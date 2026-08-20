import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  mockClips,
  formatDuration,
  CAPTION_PRESETS,
  PLATFORMS,
  PLATFORM_VARIANTS,
  mockWaveform,
  mockTranscript,
  type CaptionPreset,
  type Platform,
} from "@/lib/mock-data";
import { useSelectedPlatforms } from "@/lib/platform-store";

const title = "Clip editor — Cutroom";
const description = "Preview the vertical clip, tune caption style, edit the hook, and trim timing.";

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

const PRESET_DEFAULTS: Record<CaptionPreset, { font: string; color: string; size: number }> = {
  bold: { font: "sans", color: "yellow", size: 36 },
  minimal: { font: "sans", color: "white", size: 24 },
  karaoke: { font: "mono", color: "accent", size: 30 },
};

function ClipEditor() {
  const { clipId } = Route.useParams();
  const platforms = useSelectedPlatforms();
  const index = Math.max(
    0,
    mockClips.findIndex((c) => c.id === clipId),
  );
  const clip = mockClips[index]!;

  const [variant, setVariant] = useState<Platform>(platforms[0] ?? "tiktok");
  const active: Platform = platforms.includes(variant) ? variant : (platforms[0] ?? "tiktok");

  const [hook, setHook] = useState(clip.hook);
  const [emphasized, setEmphasized] = useState<number[]>([]);
  const [preset, setPreset] = useState<CaptionPreset>("minimal");
  const [font, setFont] = useState("sans");
  const [color, setColor] = useState("white");
  const [position, setPosition] = useState<"top" | "middle" | "bottom">(
    PLATFORM_VARIANTS[active].position,
  );
  const [size, setSize] = useState([28]);
  const [safeZones, setSafeZones] = useState(true);
  const [range, setRange] = useState<number[]>([clip.start, clip.end]);

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

  const trimMin = Math.max(0, clip.start - 60);
  const trimMax = clip.end + 60;
  const span = trimMax - trimMin;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/clips" className="text-xs text-muted-foreground underline">
              Back to clips
            </Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{clip.title}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Save draft
            </Button>
            <Button size="sm">Export clip</Button>
          </div>
        </div>

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
                    {PLATFORMS.find((x) => x.value === p)?.label
                      .replace("YouTube ", "")
                      .replace("Instagram ", "")}
                  </button>
                ))}
              </div>
            ) : null}

            <ClipThumb
              index={index}
              label={hook}
              platform={active}
              showSafeZones={safeZones}
              preset={preset}
              color={color}
              position={position}
              size={size[0] ?? 28}
              emphasized={emphasized}
            />

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
                  <Select value={font} onValueChange={setFont}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sans">Inter Tight</SelectItem>
                      <SelectItem value="mono">Mono</SelectItem>
                      <SelectItem value="serif">Editorial Serif</SelectItem>
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
                <h2 className="text-sm font-medium">Trim</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDuration(range[0] ?? 0)} — {formatDuration(range[1] ?? 0)}
                </span>
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
                {mockWaveform.map((h, i) => {
                  const t = trimMin + (i / mockWaveform.length) * span;
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

              <p className="line-clamp-2 text-xs italic text-muted-foreground">{mockTranscript}</p>
              <p className="text-xs text-muted-foreground">
                Drag either handle to adjust the start and end of the clip.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

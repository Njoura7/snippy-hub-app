import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { mockClips, formatDuration } from "@/lib/mock-data";

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

function ClipEditor() {
  const { clipId } = Route.useParams();
  const index = Math.max(
    0,
    mockClips.findIndex((c) => c.id === clipId),
  );
  const clip = mockClips[index]!;

  const [hook, setHook] = useState(clip.hook);
  const [font, setFont] = useState("sans");
  const [color, setColor] = useState("white");
  const [position, setPosition] = useState("bottom");
  const [size, setSize] = useState([28]);
  const [range, setRange] = useState<number[]>([clip.start, clip.end]);

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
            <ClipThumb index={index} label={hook} />
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Preview only — playback coming soon</span>
              <span>{formatDuration((range[1] ?? 0) - (range[0] ?? 0))}</span>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="gap-4 p-5 shadow-none">
              <div className="space-y-2">
                <Label htmlFor="hook">Hook text</Label>
                <Input id="hook" value={hook} onChange={(e) => setHook(e.target.value)} />
              </div>
            </Card>

            <Card className="gap-5 p-5 shadow-none">
              <h2 className="text-sm font-medium">Caption style</h2>
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
                    onValueChange={(v) => v && setPosition(v)}
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
                  min={Math.max(0, clip.start - 60)}
                  max={clip.end + 60}
                  step={1}
                  value={range}
                  onValueChange={setRange}
                />
              </div>
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
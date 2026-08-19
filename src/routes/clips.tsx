import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TopNav } from "@/components/TopNav";
import { ClipThumb } from "@/components/ClipThumb";
import { mockClips, formatDuration, type Clip } from "@/lib/mock-data";

const title = "Generated clips — Cutroom";
const description = "Review auto-generated vertical clips with hooks, captions, and scores.";

export const Route = createFileRoute("/clips")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Clips,
});

function Clips() {
  const [sort, setSort] = useState("score");
  const [clips, setClips] = useState<Clip[]>(mockClips);

  const sorted = useMemo(() => {
    const c = [...clips];
    if (sort === "score") c.sort((a, b) => b.score - a.score);
    if (sort === "duration-asc") c.sort((a, b) => a.duration - b.duration);
    if (sort === "duration-desc") c.sort((a, b) => b.duration - a.duration);
    return c;
  }, [clips, sort]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Founder podcast — ep. 112</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {clips.length} clips · 9:16 · TikTok
            </p>
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Highest score</SelectItem>
              <SelectItem value="duration-asc">Shortest first</SelectItem>
              <SelectItem value="duration-desc">Longest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              onHookChange={(hook) =>
                setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, hook } : c)))
              }
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ClipCard({
  clip,
  index,
  onHookChange,
}: {
  clip: Clip;
  index: number;
  onHookChange: (hook: string) => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden p-3 shadow-none">
      <ClipThumb index={index} label={clip.hook} />
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDuration(clip.duration)}</span>
          <span>{clip.tone}</span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Virality</span>
            <span className="font-medium tabular-nums">{clip.score}</span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-secondary">
            <div
              className="h-1 rounded-full bg-foreground"
              style={{ width: `${clip.score}%` }}
            />
          </div>
        </div>

        <input
          value={clip.hook}
          onChange={(e) => onHookChange(e.target.value)}
          aria-label="Suggested hook"
          className="w-full rounded-md border border-transparent bg-secondary px-2 py-1.5 text-sm outline-none transition-colors hover:border-border focus:border-accent focus:bg-card"
        />

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to="/clip/$clipId" params={{ clipId: clip.id }}>
              Preview
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="flex-1">
            <Link to="/clip/$clipId" params={{ clipId: clip.id }}>
              Captions
            </Link>
          </Button>
          <Button variant="ghost" size="sm">
            Download
          </Button>
        </div>
      </div>
    </Card>
  );
}
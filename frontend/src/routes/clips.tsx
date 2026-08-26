import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  formatDuration,
  PLATFORMS,
  PLATFORM_VARIANTS,
  type Clip,
  type Platform,
} from "@/lib/mock-data";
import { useSelectedPlatforms } from "@/lib/platform-store";
import { getProject, listProjectClips, type ApiClip, type ApiProject } from "@/lib/api";

const title = "Generated clips — Cutroom";
const description = "Review auto-generated vertical clips with hooks, captions, and scores.";

export const Route = createFileRoute("/clips")({
  validateSearch: (search: Record<string, unknown>): { projectId?: string } => {
    const projectId = typeof search["projectId"] === "string" ? (search["projectId"] as string) : undefined;
    return projectId ? { projectId } : {};
  },
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

function toDisplayClip(c: ApiClip): Clip {
  return {
    id: c.id,
    title: c.hookText,
    hook: c.hookText,
    duration: Math.round((c.endMs - c.startMs) / 1000),
    score: Math.round(c.score),
    start: Math.round(c.startMs / 1000),
    end: Math.round(c.endMs / 1000),
    tone: c.tag,
  };
}

function Clips() {
  const { projectId } = Route.useSearch();
  const [sort, setSort] = useState("score");
  const platforms = useSelectedPlatforms();
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipsLoaded, setClipsLoaded] = useState(false);
  const [project, setProject] = useState<ApiProject | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then(setProject)
      .catch(() => {
        // Backend unreachable — header falls back to "Untitled project" below.
      });
    listProjectClips(projectId)
      .then((real) => {
        setClips(real.map(toDisplayClip));
        setClipsLoaded(true);
      })
      .catch(() => {
        setClipsLoaded(true);
      });
  }, [projectId]);

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
            <h1 className="text-2xl font-semibold tracking-tight">
              {project?.title ?? project?.sourceUrl ?? project?.originalFilename ?? "Untitled project"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {clips.length} clips · 9:16 ·{" "}
              {platforms
                .map((p) => PLATFORMS.find((x) => x.value === p)?.label)
                .join(" · ")}
            </p>
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Highest score</SelectItem>
              <SelectItem value="duration-asc">Shortest first</SelectItem>
              <SelectItem value="duration-desc">Longest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {clipsLoaded && clips.length === 0 ? (
          <Card className="mt-10 flex flex-col items-center justify-center gap-1 border-dashed py-12 shadow-none">
            <p className="text-sm font-medium">No clips yet</p>
            <p className="text-xs text-muted-foreground">
              Still processing, or this project hasn't been analyzed yet.
            </p>
          </Card>
        ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              platforms={platforms}
              onHookChange={(hook) =>
                setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, hook } : c)))
              }
            />
          ))}
        </div>
        )}
      </main>
    </div>
  );
}

function ClipCard({
  clip,
  index,
  platforms,
  onHookChange,
}: {
  clip: Clip;
  index: number;
  platforms: Platform[];
  onHookChange: (hook: string) => void;
}) {
  const [variant, setVariant] = useState<Platform>(platforms[0] ?? "tiktok");
  const active = platforms.includes(variant) ? variant : (platforms[0] ?? "tiktok");
  const config = PLATFORM_VARIANTS[active];

  return (
    <Card className="gap-0 overflow-hidden p-3 shadow-none">
      {platforms.length > 1 ? (
        <div className="mb-3 flex gap-1 rounded-md bg-secondary p-1">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setVariant(p)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                p === active
                  ? "bg-card text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PLATFORMS.find((x) => x.value === p)?.label.replace("YouTube ", "").replace("Instagram ", "")}
            </button>
          ))}
        </div>
      ) : null}
      <ClipThumb
        index={index}
        label={clip.hook}
        className="mx-auto max-h-[320px]"
        platform={active}
        showSafeZones
        position={config.position}
      />
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDuration(clip.duration)}</span>
          <span>{clip.tone}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{config.note}</p>

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
          <Button asChild variant="ghost" size="sm">
            <Link to="/clip/$clipId" params={{ clipId: clip.id }}>
              Download
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
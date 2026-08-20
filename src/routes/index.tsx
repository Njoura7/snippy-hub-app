import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TopNav } from "@/components/TopNav";
import { PLATFORMS, mockProjects, type Platform } from "@/lib/mock-data";
import { useSelectedPlatforms, setSelectedPlatforms } from "@/lib/platform-store";

const title = "Cutroom — turn long videos into short clips";
const description =
  "Paste a YouTube or Twitch link and get vertical clips with captions, hooks, and a virality score.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const platforms = useSelectedPlatforms();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(true);

  const ready = url.trim().length > 0 || !!file;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">New project</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a long-form video link or upload a file. We'll return short vertical clips.
        </p>

        <div className="mt-10 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="h-11 flex-1"
              aria-label="Video URL"
            />
            <Button
              className="h-11 sm:w-40"
              disabled={!ready}
              onClick={() => navigate({ to: "/processing" })}
            >
              Generate clips
            </Button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              setFile(e.dataTransfer.files?.[0]?.name ?? "upload.mp4");
            }}
            className={`flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-sm transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "border-border bg-card"
            }`}
          >
            {file ? (
              <>
                <p className="font-medium">{file}</p>
                <button
                  className="mt-1 text-xs text-muted-foreground underline"
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Drag and drop a video file</p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, MOV up to 4 GB</p>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              <span className="text-sm text-muted-foreground">Target platforms</span>
              <p className="text-xs text-muted-foreground">
                Pick one or more — a single video generates a variant per platform.
              </p>
            </div>
            <ToggleGroup
              type="multiple"
              value={platforms}
              onValueChange={(v) => v.length && setSelectedPlatforms(v as Platform[])}
              variant="outline"
              size="sm"
            >
              {PLATFORMS.map((p) => (
                <ToggleGroupItem key={p.value} value={p.value} className="px-3 text-xs">
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <p className="text-xs text-muted-foreground">
            {platforms.length} platform{platforms.length === 1 ? "" : "s"} selected ·{" "}
            {platforms.length} variant{platforms.length === 1 ? "" : "s"} per clip
          </p>
        </div>

        <Separator className="my-14" />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent projects</h2>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setShowProjects((s) => !s)}
          >
            {showProjects ? "Preview empty state" : "Show mock data"}
          </button>
        </div>

        {showProjects ? (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {mockProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate({ to: "/clips" })}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.clips} clips · {p.platform}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{p.createdAt}</span>
              </button>
            ))}
          </div>
        ) : (
          <Card className="mt-4 flex flex-col items-center justify-center gap-1 border-dashed py-12 shadow-none">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">
              Your generated clip sets will show up here.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}

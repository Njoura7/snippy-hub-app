import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TopNav } from "@/components/TopNav";
import { PLATFORMS, type Platform } from "@/lib/mock-data";
import { useSelectedPlatforms, setSelectedPlatforms } from "@/lib/platform-store";
import {
  createProjectFromUpload,
  createProjectFromUrl,
  deleteProject,
  formatRelativeTime,
  guessSourceType,
  listProjects,
  type ApiProject,
} from "@/lib/api";

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
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realProjects, setRealProjects] = useState<ApiProject[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [maxClips, setMaxClips] = useState("10");
  const [topicFilter, setTopicFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refreshProjects() {
    listProjects()
      .then(setRealProjects)
      .catch(() => setRealProjects(null));
  }

  useEffect(refreshProjects, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This removes its clips, renders, and source video — it can't be undone.")) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteProject(id);
      setRealProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    } finally {
      setDeletingId(null);
    }
  }

  const ready = url.trim().length > 0 || !!file;

  async function handleGenerate() {
    setError(null);
    const parsedMaxClips = Number(maxClips);
    const effectiveMaxClips = Number.isFinite(parsedMaxClips) && parsedMaxClips > 0 ? Math.round(parsedMaxClips) : undefined;
    const effectiveTopicFilter = topicFilter.trim() || null;

    if (url.trim()) {
      const sourceType = guessSourceType(url.trim());
      if (!sourceType) {
        setError("Only YouTube and Twitch URLs are supported right now.");
        return;
      }
      setSubmitting(true);
      try {
        const project = await createProjectFromUrl({
          sourceUrl: url.trim(),
          sourceType,
          targetPlatforms: platforms,
          maxClips: effectiveMaxClips,
          topicFilter: effectiveTopicFilter,
        });
        navigate({ to: "/processing", search: { projectId: project.id } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setSubmitting(false);
      }
      return;
    }

    if (file) {
      setSubmitting(true);
      try {
        const project = await createProjectFromUpload({
          file,
          targetPlatforms: platforms,
          maxClips: effectiveMaxClips,
          topicFilter: effectiveTopicFilter,
        });
        navigate({ to: "/processing", search: { projectId: project.id } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setSubmitting(false);
      }
    }
  }

  const hasRealProjects = !!realProjects && realProjects.length > 0;

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
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://youtube.com/watch?v=..."
              className="h-11 flex-1"
              aria-label="Video URL"
              disabled={submitting}
            />
            <Button className="h-11 sm:w-40" disabled={!ready || submitting} onClick={handleGenerate}>
              {submitting ? "Starting…" : "Generate clips"}
            </Button>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) {
                setFile(picked);
                setError(null);
              }
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !submitting && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) {
                setFile(dropped);
                setError(null);
              }
            }}
            className={`flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-sm transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "border-border bg-card"
            } ${submitting ? "opacity-60" : "cursor-pointer"}`}
          >
            {file ? (
              <>
                <p className="font-medium">{file.name}</p>
                <button
                  className="mt-1 text-xs text-muted-foreground underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Drag and drop a video file, or click to browse</p>
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

          <div className="grid gap-4 pt-2 sm:grid-cols-[140px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="max-clips">Max clips</Label>
              <Input
                id="max-clips"
                type="number"
                min={1}
                max={30}
                value={maxClips}
                onChange={(e) => setMaxClips(e.target.value)}
                disabled={submitting}
              />
              <p className="text-[11px] text-muted-foreground">Top-scoring clips kept, per video.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-filter">Focus / requirements (optional)</Label>
              <Textarea
                id="topic-filter"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                placeholder='e.g. "Must show Anton and/or Lovable — don&apos;t clip parts that aren&apos;t about Lovable."'
                className="min-h-[38px] resize-none"
                disabled={submitting}
              />
              <p className="text-[11px] text-muted-foreground">
                A hard requirement, not just a preference — a moment that fails this gets rejected
                even if it'd otherwise be a great clip.
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-14" />

        <h2 className="text-sm font-medium">Recent projects</h2>

        {hasRealProjects ? (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {realProjects!.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: "/processing", search: { projectId: p.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ to: "/processing", search: { projectId: p.id } });
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.title ?? p.sourceUrl ?? p.originalFilename ?? "Untitled project"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.status} · {p.targetPlatforms.join(", ") || "tiktok"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(p.createdAt)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    disabled={deletingId === p.id}
                    aria-label="Delete project"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
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

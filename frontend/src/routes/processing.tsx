import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { TopNav } from "@/components/TopNav";
import { PROCESSING_STEPS } from "@/lib/mock-data";
import { getProject, type ApiProject } from "@/lib/api";

const title = "Processing your video — Cutroom";
const description = "Transcribing, finding moments, cutting clips, and captioning your video.";

export const Route = createFileRoute("/processing")({
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
  component: Processing,
});

function Processing() {
  const { projectId } = Route.useSearch();
  return projectId ? <RealProcessing projectId={projectId} /> : <MockProcessing />;
}

// Real steps only — cut/caption is a per-clip export triggered later from
// the clip editor, not part of initial generation, so it's not listed here.
const REAL_STEPS = ["Downloading", "Transcribing", "Finding moments"] as const;

function stepIndexForStatus(status: ApiProject["status"]): number {
  switch (status) {
    case "pending":
    case "ingesting":
      return 0;
    case "transcribing":
      return 1;
    case "analyzing":
      return 2;
    default:
      return REAL_STEPS.length; // ready/completed — all steps done
  }
}

/** Polls a real project's status through its actual lifecycle (ingest ->
 * transcribe -> analyze) and hands off to /clips once status is "ready". */
function RealProcessing({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [project, setProject] = useState<ApiProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const p = await getProject(projectId);
        if (cancelled) return;
        setProject(p);

        if (p.status === "ready" || p.status === "completed") {
          navigate({ to: "/clips", search: { projectId } });
          return;
        }
        if (p.status === "failed") return;

        timer = setTimeout(poll, 1500);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, navigate]);

  if (error) {
    return (
      <StatusScreen heading="Couldn't check status">
        <p className="mt-2 text-sm text-destructive">{error}</p>
      </StatusScreen>
    );
  }

  if (project?.status === "failed") {
    return (
      <StatusScreen heading="Something failed">
        <p className="mt-2 text-sm text-destructive">{project.errorMessage ?? "Unknown error"}</p>
      </StatusScreen>
    );
  }

  const step = project ? stepIndexForStatus(project.status) : 0;
  const uploadLabel = project?.sourceType === "upload" ? "Uploading" : "Downloading";
  const stepLabels = [uploadLabel, ...REAL_STEPS.slice(1)];
  const pct = Math.round(((step + 0.5) / REAL_STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-6 py-28">
        <h1 className="text-lg font-semibold tracking-tight">Generating clips</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project?.title ?? project?.sourceUrl ?? project?.originalFilename ?? "Your video"}
        </p>

        <Progress value={pct} className="mt-8 h-1" />

        <ol className="mt-8 space-y-3">
          {stepLabels.map((stepLabel, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={stepLabel} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    done ? "bg-foreground" : active ? "animate-pulse bg-accent" : "bg-border"
                  }`}
                />
                <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{stepLabel}</span>
                {done ? (
                  <span className="ml-auto text-xs text-muted-foreground">done</span>
                ) : active ? (
                  <span className="ml-auto text-xs text-muted-foreground">working</span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <p className="mt-8 text-xs text-muted-foreground">
          A long episode's transcribe + analyze can take several minutes on the free Groq tier —
          this keeps polling, no need to refresh.
        </p>
      </main>
    </div>
  );
}

function StatusScreen({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-6 py-28">
        <h1 className="text-lg font-semibold tracking-tight">{heading}</h1>
        {children}
        <Link to="/" className="mt-6 inline-block text-xs text-muted-foreground underline">
          Back to home
        </Link>
      </main>
    </div>
  );
}

/** No projectId in the URL (e.g. a direct link) — falls back to the original
 * simulated demo timer so the route still works standalone. */
function MockProcessing() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= PROCESSING_STEPS.length) return s;
        return s + 1;
      });
    }, 1400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (step >= PROCESSING_STEPS.length) {
      const t = setTimeout(() => navigate({ to: "/clips" }), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step, navigate]);

  const pct = Math.round((step / PROCESSING_STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-6 py-28">
        <h1 className="text-lg font-semibold tracking-tight">Generating clips</h1>
        <p className="mt-1 text-sm text-muted-foreground">Founder podcast — ep. 112</p>

        <Progress value={pct} className="mt-8 h-1" />

        <ol className="mt-8 space-y-3">
          {PROCESSING_STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    done ? "bg-foreground" : active ? "animate-pulse bg-accent" : "bg-border"
                  }`}
                />
                <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                  {label}
                </span>
                {done ? (
                  <span className="ml-auto text-xs text-muted-foreground">done</span>
                ) : active ? (
                  <span className="ml-auto text-xs text-muted-foreground">working</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}

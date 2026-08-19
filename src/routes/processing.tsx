import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { TopNav } from "@/components/TopNav";
import { PROCESSING_STEPS } from "@/lib/mock-data";

const title = "Processing your video — Cutroom";
const description = "Transcribing, finding moments, cutting clips, and captioning your video.";

export const Route = createFileRoute("/processing")({
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
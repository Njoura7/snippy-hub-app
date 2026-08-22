import type { Platform } from "./mock-data";

const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:3000";

export type ProjectStatus =
  | "pending"
  | "ingesting"
  | "ingested"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "cutting"
  | "completed"
  | "failed";

export interface ApiProject {
  id: string;
  sourceType: "youtube" | "twitch" | "upload";
  sourceUrl: string | null;
  originalFilename: string | null;
  storageKey: string | null;
  title: string | null;
  durationSeconds: number | null;
  targetPlatforms: Platform[];
  status: ProjectStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiClip {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  score: number;
  hookText: string;
  tag: string;
  emoji: string | null;
  transcriptExcerpt: string | null;
  status: string;
  captionPreset: string;
  captionStyleOverrides: {
    font?: string;
    color?: string;
    position?: string;
    size?: number;
    headerEnabled?: boolean;
  } | null;
  backgroundMusicKey: string | null;
  updatedAt: string;
}

export interface MusicTrack {
  key: string;
  title: string;
  mood: string;
  license: string;
  previewUrl: string;
}

export interface EmojiOption {
  emoji: string;
  label: string;
}

export interface ApiClipRender {
  id: string;
  clipId: string;
  platform: Platform;
  status: "pending" | "rendering" | "rendered" | "failed";
  storageKey: string | null;
  errorMessage: string | null;
  url: string | null;
  updatedAt: string;
}

export class ApiUnreachableError extends Error {
  constructor() {
    super(
      `Can't reach the backend at ${API_BASE_URL} — is it running? (docker compose up -d api worker)`,
    );
    this.name = "ApiUnreachableError";
  }
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiUnreachableError();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(
      response.status,
      body.error ?? `Request failed with ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export function createProjectFromUrl(input: {
  sourceUrl: string;
  sourceType: "youtube" | "twitch";
  targetPlatforms: Platform[];
}) {
  return request<{ project: ApiProject }>("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => r.project);
}

export function createProjectFromUpload(input: { file: File; targetPlatforms: Platform[] }) {
  const form = new FormData();
  // targetPlatforms must precede file — the API only has fields sent before
  // the file part available at the time it reads the upload stream.
  form.append("targetPlatforms", JSON.stringify(input.targetPlatforms));
  form.append("file", input.file);

  return request<{ project: ApiProject }>("/projects/upload", {
    method: "POST",
    body: form,
  }).then((r) => r.project);
}

export function listProjects() {
  return request<{ projects: ApiProject[] }>("/projects").then((r) => r.projects);
}

export function getProject(id: string) {
  return request<{ project: ApiProject }>(`/projects/${id}`).then((r) => r.project);
}

export function listProjectClips(id: string) {
  return request<{ clips: ApiClip[] }>(`/projects/${id}/clips`).then((r) => r.clips);
}

export function getClip(id: string) {
  return request<{ clip: ApiClip; renders: ApiClipRender[] }>(`/clips/${id}`);
}

export function updateClip(
  id: string,
  patch: Partial<{
    status: string;
    hookText: string;
    emoji: string | null;
    captionPreset: string;
    captionStyleOverrides: Record<string, unknown>;
    backgroundMusicKey: string | null;
  }>,
) {
  return request<{ clip: ApiClip }>(`/clips/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => r.clip);
}

export function exportClip(id: string, platform: Platform) {
  return request<{ render: ApiClipRender }>(`/clips/${id}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  }).then((r) => r.render);
}

export function listMusicTracks() {
  return request<{ tracks: MusicTrack[] }>("/music").then((r) => r.tracks);
}

export function listEmojiOptions() {
  return request<{ emoji: EmojiOption[] }>("/emoji").then((r) => r.emoji);
}

export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function guessSourceType(url: string): "youtube" | "twitch" | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "youtube";
    if (host === "twitch.tv" || host === "clips.twitch.tv") return "twitch";
    return null;
  } catch {
    return null;
  }
}

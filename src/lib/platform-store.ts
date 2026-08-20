import { useSyncExternalStore } from "react";
import type { Platform } from "./mock-data";

let selected: Platform[] = ["tiktok"];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setSelectedPlatforms(next: Platform[]) {
  selected = next.length > 0 ? next : ["tiktok"];
  emit();
}

export function togglePlatform(p: Platform) {
  setSelectedPlatforms(
    selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p],
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return selected;
}

export function useSelectedPlatforms() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

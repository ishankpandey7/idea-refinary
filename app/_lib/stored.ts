"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage as an external store React can subscribe to.
 *
 * The obvious way to read localStorage in a client component is to set state
 * from a mount effect, and every page here used to do that. It costs a second
 * render on every load, and worse, two components reading the same key do not
 * agree — the checker read the saved list during render without subscribing,
 * so its "N kept" count could sit there stale after a save.
 *
 * useSyncExternalStore fixes both: one subscription, one value, and the server
 * snapshot keeps hydration honest instead of flashing the fallback.
 */

const listeners = new Set<() => void>();

/** Parsed once per key so getSnapshot can return a stable value. */
const cache = new Map<string, string>();

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  // Another tab wrote. Drop what we cached for that key and let React re-read.
  if (event.key === null) cache.clear();
  else cache.delete(event.key);
  emit();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function read(key: string, fallback: string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let value = fallback;
  try {
    value = window.localStorage.getItem(key) ?? fallback;
  } catch {
    // Storage blocked. The fallback is cached too, so this is asked once.
  }
  cache.set(key, value);
  return value;
}

/**
 * Imperative read, for callers outside a component. Shares the cache with
 * useStored so a blocked write still reads back the value that is on screen.
 */
export function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return read(key, fallback);
}

/** Writes, caches and notifies every subscriber in this tab. */
export function writeStored(key: string, value: string): void {
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted. The in-memory cache still holds it for this visit, so
    // the UI stays consistent even when storage is refused.
  }
  emit();
}

/**
 * Reads one key, re-rendering whenever it changes — including from another
 * component, or another tab.
 *
 * `fallback` is what the server renders and what a blocked or empty store
 * gives back, so it must be the same on both sides of hydration.
 */
export function useStored(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const set = useCallback((next: string) => writeStored(key, next), [key]);
  return [value, set];
}

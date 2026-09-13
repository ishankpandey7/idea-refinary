"use client";

import { useMemo } from "react";
import type { SourceResult } from "@/types/source-result";
import { readStored, useStored, writeStored } from "./stored";

export type Idea = {
  id: string;
  query: string;
  savedAt: string;
  results: SourceResult[];
};

const KEY = "idea-refinery:ideas";
const EMPTY = "[]";

export function resultKey(r: SourceResult): string {
  return `${r.sourceId}:${r.externalId}`;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function parse(raw: string): Idea[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as Idea[]) : [];
  } catch {
    return [];
  }
}

export function readIdeas(): Idea[] {
  return parse(readStored(KEY, EMPTY));
}

function writeIdeas(ideas: Idea[]): Idea[] {
  writeStored(KEY, JSON.stringify(ideas));
  return ideas;
}

/**
 * The signed-out store, as something React can subscribe to.
 *
 * Every component that shows saved work reads this, so a Keep on the checker
 * updates its own count, the header link and /my-ideas in the same render —
 * which the old read-during-render version did not do.
 */
export function useLocalIdeas(): Idea[] {
  const [raw] = useStored(KEY, EMPTY);
  // Keyed on the raw string so the array identity is stable between writes.
  return useMemo(() => parse(raw), [raw]);
}

/** Adds a result to the project for `query`, creating it if needed. */
export function saveResult(query: string, result: SourceResult): Idea[] {
  const q = query.trim();
  if (!q) return readIdeas();

  const ideas = readIdeas();
  let idea = ideas.find((i) => i.query === q);

  if (!idea) {
    idea = {
      id: newId(),
      query: q,
      savedAt: new Date().toISOString(),
      results: [],
    };
    ideas.unshift(idea);
  }
  if (!idea.results.some((r) => resultKey(r) === resultKey(result))) {
    idea.results.push(result);
  }
  return writeIdeas(ideas);
}

/** Removes one result. A project left with nothing in it is dropped too. */
export function removeResult(ideaId: string, key: string): Idea[] {
  const ideas = readIdeas()
    .map((i) =>
      i.id === ideaId
        ? { ...i, results: i.results.filter((r) => resultKey(r) !== key) }
        : i,
    )
    .filter((i) => i.results.length > 0);
  return writeIdeas(ideas);
}

export function removeIdea(ideaId: string): Idea[] {
  return writeIdeas(readIdeas().filter((i) => i.id !== ideaId));
}

export function keysFor(ideas: Idea[], query: string): Set<string> {
  const q = query.trim();
  const idea = ideas.find((i) => i.query === q);
  return new Set(idea ? idea.results.map(resultKey) : []);
}

export function savedKeysFor(query: string): Set<string> {
  return keysFor(readIdeas(), query);
}

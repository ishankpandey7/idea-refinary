import type { SourceResult } from "@/types/source-result";

export type Idea = {
  id: string;
  query: string;
  savedAt: string;
  results: SourceResult[];
};

const KEY = "idea-refinery:ideas";

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

export function readIdeas(): Idea[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Idea[]) : [];
  } catch {
    return [];
  }
}

function writeIdeas(ideas: Idea[]): Idea[] {
  if (typeof window === "undefined") return ideas;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ideas));
  } catch {
    // Quota or a browser that blocks storage - keep the in-memory list.
  }
  return ideas;
}

/** Adds a result to the idea for `query`, creating that idea if needed. */
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

/** Removes one result. An idea left with no results is dropped too. */
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

export function savedKeysFor(query: string): Set<string> {
  const q = query.trim();
  const idea = readIdeas().find((i) => i.query === q);
  return new Set(idea ? idea.results.map(resultKey) : []);
}

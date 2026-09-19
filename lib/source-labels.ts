/**
 * What each source is called, in the words a reader would recognise.
 *
 * Deliberately separate from the adapter registry. `lib/credits.ts`,
 * ResultCard and PrintSheet all run in the browser, and importing the
 * registry to read one string would pull all four adapters — and their fetch
 * code — into the client bundle. The adapters take their own `label` from
 * here, so a source is still named in exactly one place.
 *
 * Without this the raw `sourceId` leaked into things people hand to other
 * people: a PDF licence report for a client that reads "Source: gutendex".
 */
export const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  openverse: "Openverse",
  gutendex: "Project Gutenberg",
  wikimedia: "Wikimedia Commons",
};

/** Falls back to the id, which is better than an empty cell. */
export function sourceLabel(sourceId: string): string {
  return SOURCE_LABELS[sourceId] ?? sourceId;
}

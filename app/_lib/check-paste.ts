"use client";

import type { SourceResult } from "@/types/source-result";
import { encodeAsserted } from "@/lib/asserted";
import { extractLinks, normaliseUrl, recheckUrl } from "@/lib/links";
import type { ProjectList } from "./project-list";
import { readStored, useStored, writeStored } from "./stored";
import { USAGE_KEY } from "./usage";

/**
 * The material box on the checker, reachable from anywhere.
 *
 * Search exists because a source you cannot use needs replacing, and until
 * now that was a one-way door: the checker sent you to /search, you found
 * something, and there was no way back into the check you were in the middle
 * of. A button that promises a replacement and then cannot deliver one is
 * worse than no button.
 *
 * So the paste box is the shared thing. Search appends to it, the checker
 * reads it, and the check stays exactly what it always was — a list of links
 * anyone can see, edit and share.
 */
export const PASTE_KEY = "idea-refinery:check-paste";
export const PROJECT_KEY = "idea-refinery:check-project";
export const ASSERTED_KEY = "idea-refinery:asserted";

export function useCheckPaste(): [string, (value: string) => void] {
  return useStored(PASTE_KEY, "");
}

/**
 * The address the checker can read this result back from.
 *
 * Openverse is the one that needs it: its canonicalUrl is the foreign landing
 * page, correct for attribution and unreadable for a check.
 */
export function checkUrlFor(r: SourceResult): string {
  return recheckUrl(r) ?? r.canonicalUrl;
}

/** Is this result already in the check? Matched on the normalised address. */
export function inCheck(paste: string, r: SourceResult): boolean {
  const url = checkUrlFor(r).trim();
  if (!url) return false;

  const wanted = normaliseUrl(url);
  return extractLinks(paste).some((link) => normaliseUrl(link) === wanted);
}

/**
 * Folds a shared check's links into the box without emptying it first.
 *
 * Replacing was fine while the box was the only place links came from. It
 * stopped being fine the moment /search could add one: press Back from a
 * search and the browser returns you to the check's own older address, whose
 * link list is a link short — and overwriting would throw away the
 * replacement you just went to find, silently, which is the exact failure
 * this product exists to prevent.
 */
export function mergeIntoCheck(links: string[]): void {
  const paste = readStored(PASTE_KEY, "");
  const have = new Set(extractLinks(paste).map(normaliseUrl));

  const missing = links.filter((link) => !have.has(normaliseUrl(link)));
  if (missing.length === 0) return;

  const body = paste.replace(/\s+$/, "");
  const added = missing.join("\n");
  writeStored(PASTE_KEY, body ? `${body}\n${added}` : added);
}

/**
 * Adds one result to the check. Returns false when it was already there.
 *
 * Imperative rather than a hook because the caller is a click handler on a
 * card, and reading through the same store the checker subscribes to means
 * both pages agree without either knowing about the other.
 */
export function addToCheck(r: SourceResult): boolean {
  const url = checkUrlFor(r).trim();
  if (!url) return false;

  const paste = readStored(PASTE_KEY, "");
  if (inCheck(paste, r)) return false;

  const body = paste.replace(/\s+$/, "");
  writeStored(PASTE_KEY, body ? `${body}\n${url}` : url);
  return true;
}

/**
 * Loads a saved project back into the checker, replacing what is there.
 *
 * Replacing, not merging: reopening project B while project A is in the box
 * is a switch somebody asked for, and folding the two together would hand
 * them a report about neither. The merge in the arrival path is for the
 * other case — the same check, one link newer.
 *
 * The caller navigates to /?run=1 afterwards. The material is deliberately
 * not in that URL: the box has just been set on purpose, and a link full of
 * links would merge a second copy straight back in.
 */
export function loadIntoChecker(title: string, list: ProjectList): void {
  writeStored(PROJECT_KEY, title);
  writeStored(PASTE_KEY, list.paste);
  writeStored(ASSERTED_KEY, encodeAsserted(list.asserted));
  writeStored(USAGE_KEY, JSON.stringify(list.usage));
}

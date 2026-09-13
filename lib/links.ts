/**
 * Pulling links out of whatever got pasted.
 *
 * Deliberately free of adapter imports: the checker page counts links as you
 * type, and dragging the whole source registry into the browser bundle to do
 * it would be silly.
 */

/** More than this in one paste is a spreadsheet, not a project. */
export const MAX_LINKS = 40;
export const MAX_TEXT = 20_000;

const URL_RE = /\bhttps?:\/\/[^\s<>"'`\\]+/gi;
const BARE_DOI_RE = /\b10\.\d{4,9}\/[^\s<>"'`\\]+/gi;

const TRAILING = ".,;:!?>'\"";

/**
 * Trailing punctuation belongs to the sentence, not the link — except when the
 * link genuinely ends in a bracket, which Commons file names do all the time
 * ("File:Cat_(black).jpg"). Counting the brackets tells the two apart.
 */
function trimTrailing(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s.at(-1);
    if (!last) return s;

    if (last === ")" || last === "]") {
      const open = last === ")" ? "(" : "[";
      const opens = s.split(open).length - 1;
      const closes = s.split(last).length - 1;
      if (closes <= opens) return s;
    } else if (!TRAILING.includes(last)) {
      return s;
    }
    s = s.slice(0, -1);
  }
}

/**
 * Accepts a credits block, a spreadsheet column, a chat log — anything with
 * links in it. Lines without a link are simply not links; the UI says so
 * rather than inventing rows for them.
 */
export function extractLinks(text: string): string[] {
  const body = text.slice(0, MAX_TEXT);
  const found: string[] = [];

  const urls = body.match(URL_RE) ?? [];
  for (const u of urls) found.push(trimTrailing(u));

  // Bare DOIs only from what is left, so the "10.x/y" inside a doi.org link
  // is not counted a second time.
  const remainder = urls.reduce((acc, u) => acc.replace(u, " "), body);
  for (const d of remainder.match(BARE_DOI_RE) ?? []) {
    found.push(trimTrailing(d));
  }

  const seen = new Set<string>();
  return found.filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

/**
 * A bare DOI and a scheme-less host are both things people paste. Anything
 * else that is not a URL stays not a URL — this never invents a host.
 */
export function toUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;

  const withScheme = /^10\.\d{4,9}\//.test(s)
    ? `https://doi.org/${s}`
    : /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(s)
      ? `https://${s}`
      : s;

  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Host without www, path without a trailing slash, lowercased.
 *
 * The one rule for deciding that two links are the same asset — used by the
 * checker to collapse twins, and by the by-hand form to notice that a source
 * already answered for a link someone is about to describe themselves.
 */
export function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

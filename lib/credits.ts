import type { SourceResult } from "@/types/source-result";
import { termsFor, verdictFor, worst, type Usage, type Level } from "./licence-rules";

/**
 * Builds the credits people are legally obliged to publish.
 *
 * Every attribution line here is the string the provider supplied, verbatim.
 * Nothing is composed, paraphrased or filled in — a credit we invented would
 * be worse than no credit at all, and the adapter contract says the same
 * thing about snippets for the same reason.
 */
export type CreditsFormat = "text" | "markdown" | "csv";

/**
 * The address the checker can read this row back from.
 *
 * Matters because credits are not just an output — "re-check the project
 * before the next release" means pasting this list back in, and every URL in
 * it has to survive that trip. Three of the four sources already do:
 * canonicalUrl is the Commons file page, the OpenAlex work, the Gutenberg
 * ebook. Openverse is the exception — its canonicalUrl is the foreign landing
 * page (Flickr, and others), which is correct for attribution and unreadable
 * for a re-check, so the Openverse record's own address is carried alongside
 * it rather than replacing it.
 *
 * Derived from externalId, which for Openverse is the record uuid. This is a
 * URL shape, not a lookup, which is why it can live here rather than in the
 * resolver — but the shape has to keep matching what that resolver's
 * identify() accepts.
 */
function recheckUrl(r: SourceResult): string | null {
  if (r.sourceId !== "openverse" || !r.externalId) return null;
  const url = `https://openverse.org/image/${r.externalId}`;
  return url === r.canonicalUrl ? null : url;
}

export type CreditsInput = {
  title: string;
  results: SourceResult[];
  usage: Usage;
};

export type Tally = {
  total: number;
  clear: number;
  caution: number;
  verify: number;
  blocked: number;
  level: Level;
};

export function tally(results: SourceResult[], usage: Usage): Tally {
  const counts = { clear: 0, caution: 0, verify: 0, blocked: 0 };
  const levels: Level[] = [];

  for (const r of results) {
    const { level } = verdictFor(r.licence.spdx, usage);
    counts[level] += 1;
    levels.push(level);
  }

  return { total: results.length, ...counts, level: worst(levels) };
}

function usageLine(usage: Usage): string {
  const parts = [
    usage.commercial ? "commercial use" : "non-commercial use",
    usage.modify ? "adapted or edited" : "used unmodified",
  ];
  return parts.join(", ");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCredits(
  input: CreditsInput,
  format: CreditsFormat,
): string {
  const { title, results, usage } = input;

  if (format === "csv") {
    const head = [
      "title",
      "source",
      "licence",
      "commercial_ok",
      "modify_ok",
      "credit_required",
      "share_alike",
      "url",
      "recheck_url",
      "attribution",
    ];
    const rows = results.map((r) => {
      const t = termsFor(r.licence.spdx);
      return [
        csvCell(r.title),
        csvCell(r.sourceId),
        csvCell(r.licence.spdx),
        t.ambiguous ? csvCell("unstated") : String(t.commercial),
        t.ambiguous ? csvCell("unstated") : String(t.modify),
        String(t.attribution),
        String(t.shareAlike),
        csvCell(r.canonicalUrl),
        csvCell(recheckUrl(r) ?? r.canonicalUrl),
        csvCell(r.licence.attribution),
      ].join(",");
    });
    return [head.join(","), ...rows].join("\n");
  }

  const counts = tally(results, usage);
  const md = format === "markdown";
  const out: string[] = [];

  out.push(md ? `# Credits — ${title}` : `CREDITS — ${title}`);
  out.push("");
  out.push(
    `${counts.total} source${counts.total === 1 ? "" : "s"}, checked for ${usageLine(usage)}.`,
  );
  if (counts.blocked > 0 || counts.verify > 0) {
    const problems: string[] = [];
    if (counts.blocked > 0) problems.push(`${counts.blocked} not usable`);
    if (counts.verify > 0) problems.push(`${counts.verify} needs checking`);
    out.push(problems.join(", ") + ".");
  }
  out.push("");

  results.forEach((r, i) => {
    const { level } = verdictFor(r.licence.spdx, usage);
    const flag =
      level === "blocked"
        ? " [NOT USABLE]"
        : level === "verify"
          ? " [CHECK LICENCE]"
          : level === "caution"
            ? " [SHARE-ALIKE]"
            : "";

    const recheck = recheckUrl(r);

    if (md) {
      out.push(`${i + 1}. **${r.title}** — \`${r.licence.spdx}\`${flag}`);
      out.push(`   ${r.licence.attribution}`);
      out.push(`   <${r.canonicalUrl}>`);
      if (recheck) out.push(`   checked via <${recheck}>`);
    } else {
      out.push(`${i + 1}. ${r.title} — ${r.licence.spdx}${flag}`);
      out.push(`   ${r.licence.attribution}`);
      out.push(`   ${r.canonicalUrl}`);
      if (recheck) out.push(`   checked via ${recheck}`);
    }
    out.push("");
  });

  out.push(
    md
      ? "_Licence tags are as published by each source. Paste this file back into Idea Craft to re-check it. This is a compliance aid, not legal advice._"
      : "Licence tags are as published by each source. Paste this file back into Idea Craft to re-check it. This is a compliance aid, not legal advice.",
  );
  return out.join("\n");
}

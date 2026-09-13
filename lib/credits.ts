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

    if (md) {
      out.push(`${i + 1}. **${r.title}** — \`${r.licence.spdx}\`${flag}`);
      out.push(`   ${r.licence.attribution}`);
      out.push(`   <${r.canonicalUrl}>`);
    } else {
      out.push(`${i + 1}. ${r.title} — ${r.licence.spdx}${flag}`);
      out.push(`   ${r.licence.attribution}`);
      out.push(`   ${r.canonicalUrl}`);
    }
    out.push("");
  });

  out.push(
    md
      ? "_Licence tags are as published by each source. This is a compliance aid, not legal advice._"
      : "Licence tags are as published by each source. This is a compliance aid, not legal advice.",
  );
  return out.join("\n");
}

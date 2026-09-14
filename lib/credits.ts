import type { SourceResult } from "@/types/source-result";
import { recheckUrl } from "./links";
import { termsFor, worst, type Terms, type Usage, type Level } from "./licence-rules";
import {
  isAsserted,
  licenceLabel,
  pickFor,
  assertedOf,
  verdictForResult,
} from "./asserted";

/**
 * Builds the credits people are legally obliged to publish.
 *
 * Every attribution line here is the string the provider supplied, verbatim.
 * Nothing is composed, paraphrased or filled in — a credit we invented would
 * be worse than no credit at all, and the adapter contract says the same
 * thing about snippets for the same reason.
 */
export type CreditsFormat = "text" | "markdown" | "csv";

/** Marks a line nobody but the person using it has vouched for. */
const MARK = "[YOUR OWN ENTRY]";

export type CreditsInput = {
  title: string;
  results: SourceResult[];
  usage: Usage;
  /**
   * The address this exact check reopens at.
   *
   * "Paste this file back before the next release" was true while every row
   * was a link. Entries someone added by hand are not links and would not
   * survive that trip, so where a share link exists it is the way back, and
   * where it does not the promise is narrowed to the links.
   */
  shareUrl?: string;
};

export type Tally = {
  total: number;
  clear: number;
  caution: number;
  verify: number;
  blocked: number;
  /** Rows whose licence came from the person, not from a source. */
  asserted: number;
  level: Level;
};

/** What a row permits — the person's own answer where there is one. */
function termsOf(r: SourceResult): Terms {
  const a = assertedOf(r);
  return a ? pickFor(a).terms : termsFor(r.licence.spdx);
}

export function tally(results: SourceResult[], usage: Usage): Tally {
  const counts = { clear: 0, caution: 0, verify: 0, blocked: 0 };
  const levels: Level[] = [];
  let asserted = 0;

  for (const r of results) {
    const { level } = verdictForResult(r, usage);
    counts[level] += 1;
    levels.push(level);
    if (isAsserted(r)) asserted += 1;
  }

  return { total: results.length, ...counts, asserted, level: worst(levels) };
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
  const { title, results, usage, shareUrl } = input;

  if (format === "csv") {
    const head = [
      "title",
      "source",
      "checked_by",
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
      const t = termsOf(r);
      return [
        csvCell(r.title),
        csvCell(r.sourceId),
        csvCell(isAsserted(r) ? "you" : "idea craft"),
        csvCell(licenceLabel(r)),
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
  // Said up front, not in a footnote. A reader who takes this list to a
  // lawyer or an app store needs to know which lines Idea Craft read and
  // which ones it was told.
  if (counts.asserted > 0) {
    out.push(
      `${counts.asserted} of these ${counts.asserted === 1 ? "is" : "are"} marked ${MARK} — the licence there is as you stated it, not as Idea Craft read it.`,
    );
  }
  out.push("");

  results.forEach((r, i) => {
    const { level } = verdictForResult(r, usage);
    const flag =
      level === "blocked"
        ? " [NOT USABLE]"
        : level === "verify"
          ? " [CHECK LICENCE]"
          : level === "caution"
            ? " [SHARE-ALIKE]"
            : "";

    const mine = isAsserted(r) ? ` ${MARK}` : "";
    const recheck = recheckUrl(r);
    const credit = r.licence.attribution || "(no credit line given)";
    const licence = licenceLabel(r);

    if (md) {
      out.push(`${i + 1}. **${r.title}** — \`${licence}\`${flag}${mine}`);
      out.push(`   ${credit}`);
      if (r.canonicalUrl) out.push(`   <${r.canonicalUrl}>`);
      if (recheck) out.push(`   checked via <${recheck}>`);
    } else {
      out.push(`${i + 1}. ${r.title} — ${licence}${flag}${mine}`);
      out.push(`   ${credit}`);
      if (r.canonicalUrl) out.push(`   ${r.canonicalUrl}`);
      if (recheck) out.push(`   checked via ${recheck}`);
    }
    out.push("");
  });

  // The footer is the only place a reader is promised where these lines came
  // from, so it has to change when some of them came from the reader.
  const footer =
    "Licence tags are as published by each source" +
    (counts.asserted > 0
      ? `, except the ${MARK} lines, which are as you stated them`
      : "") +
    ". This is a compliance aid, not legal advice.";

  const recheck = shareUrl
    ? `Re-check this project, entries of your own included: ${shareUrl}`
    : counts.asserted > 0
      ? `Paste this file back into Idea Craft to re-check the links in it. The ${MARK} lines are not links and will not come back that way.`
      : "Paste this file back into Idea Craft to re-check it.";

  out.push(md ? `_${footer}_` : footer);
  out.push("");
  out.push(recheck);
  return out.join("\n");
}

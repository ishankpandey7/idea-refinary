import type { SourceResult } from "@/types/source-result";
import type { Usage } from "@/lib/licence-rules";
import { buildCredits } from "@/lib/credits";

/**
 * What comes out, shown before you put anything in.
 *
 * Someone landing here cold sees a large empty box and has to guess what it
 * is for. The honest fix is not a diagram of the pipeline — it is the thing
 * they are actually here for, in the shape they will receive it.
 *
 * Rendered through the real buildCredits, from two real records, so the
 * preview can never drift from the file people download. Both rows are
 * public facts published by the source named in them; nothing here is
 * invented, for the same reason nothing anywhere else in this app is.
 */
const SAMPLE: SourceResult[] = [
  {
    sourceId: "openverse",
    externalId: "bcefaf9d-d07b-4fc0-b652-98344a3a2a4c",
    canonicalUrl: "https://www.flickr.com/photos/29468339@N02/2775233719",
    title: "Orange sunset",
    authors: ["@Doug88888"],
    publishedAt: null,
    mediaType: "image",
    licence: {
      spdx: "CC-BY-NC-SA",
      url: "https://creativecommons.org/licenses/by-nc-sa/2.0/",
      assertedBy: "openverse",
      attribution:
        '"Orange sunset" by @Doug88888 is licensed under CC BY-NC-SA 2.0.',
    },
    snippet: null,
    thumbnailUrl: null,
    raw: null,
  },
  {
    sourceId: "wikimedia",
    externalId: "43894484",
    canonicalUrl:
      "https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg",
    title: "The Earth seen from Apollo 17.jpg",
    authors: ["NASA/Apollo 17 crew"],
    publishedAt: null,
    mediaType: "image",
    licence: {
      spdx: "PD",
      url: null,
      assertedBy: "wikimedia",
      attribution: "NASA/Apollo 17 crew — The Earth seen from Apollo 17.jpg",
    },
    snippet: null,
    thumbnailUrl: null,
    raw: null,
  },
];

/**
 * The trailing line of a credits file with no share link. Split on the line
 * itself rather than on the wording of the branch above it: the previous
 * split looked for "Re-check this project", which is the *shareUrl* branch
 * and never fires here, so it silently matched nothing and the preview told
 * a stranger to paste back a file they do not have.
 */
const RECHECK_LINE = "\nPaste this file back";

/**
 * Built per call, against the project name and intent that are actually on
 * screen. Frozen at "Indie game / commercial / edited" it contradicted the
 * questions 300px above it — and pressing Yes or No changed nothing, which
 * is the only way a stranger can work out what those questions do.
 */
export function sampleCredits(title: string, usage: Usage): string {
  return buildCredits({ title, results: SAMPLE, usage }, "text").split(
    RECHECK_LINE,
  )[0];
}

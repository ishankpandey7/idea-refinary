# Idea Craft

The credits you owe, written for you — and a record of what you owe them for.

Paste the links to everything in your project. Each one is resolved against
the source that published it, its licence is normalised to an SPDX enum, and
that enum is judged against what you said you were doing with the material —
commercial or not, edited or not. Anything no source can answer for, you
state yourself. Out comes the attribution you are obliged to publish (text,
Markdown, CSV or a PDF report), a verdict per item (clear / conditions /
check / not usable), and a list that stays with the project so the next
release re-checks in one click. Search is the secondary path, for when you
need more material than you already have.

Everything works signed out. Sign-in only keeps things.

## Stack
Next.js App Router · TypeScript · Tailwind · Supabase · Vercel.
Saved projects live in Postgres, reached from the browser with the anon key
and guarded entirely by RLS. There is no server-side data layer.
No new dependencies without asking first.

## Sources
openalex (research) · openverse + wikimedia (art) · gutendex (writing)

New sources are allowed. A source qualifies only if all four hold:
- It answers anonymously. No API key, no token, no account, no paid tier.
  `OPENALEX_MAILTO` is the one exception and only buys the polite pool.
- It publishes a licence as data. A lookup that returns a licence field, not
  a page you have to read or a pattern you have to assume.
- It can answer a batch, or a batch of one is cheap enough not to matter.
- Adding it does not weaken any rule below.

A source that needs a key does not go in. The whole product works with no
secrets and no account, and that is worth more than the coverage.

Whatever the four sources cannot reach, the person states themselves
(`lib/asserted.ts`) — judged the same way, labelled as theirs everywhere.

## Frozen — never modify without asking
types/source-result.ts
lib/core/*

## Adapter rules
- export search(query: string): Promise<SourceResult[]>
- Never throw. Catch everything, log "[sourceId] reason", return [].
- Source-specific fields go in `raw`. Never add top-level fields.
- Licence maps to the Spdx enum. Use "UNKNOWN" rather than guessing.
- snippet is provider-supplied text ONLY. Never generate or summarise.

## Resolver rules
Each adapter also exports `resolver: Resolver` (lib/resolve-types.ts).
- identify(url) returns this source's lookup key, or null. No network.
- resolveBatch never throws and answers for every key it was given.
- Reuse the adapter's own toResult / mapLicence. One licence map per source.
- Distinguish notfound (the source answered) from unreachable (it did not).
  Never report an unreachable source as "no record".
- A link we cannot resolve is reported as unresolved. Never infer a licence
  from a URL, a host or a file name. This one has no exceptions: a table
  mapping hosts to licences is a guess with a straight face.

## Verdict rules
- `verdictForResult` (lib/asserted.ts) is the only verdict call the UI uses.
  `verdictFor` judges a tag and cannot see a licence somebody stated.
- A licence permissive on paper whose small print decides the answer never
  reads "clear" — floor it with `atLeast`.
- Anything the person stated is labelled as theirs in every place it
  surfaces: card, counts, credits file, CSV column, printed report.

## Data rules
- Every table is RLS-protected. Access to an idea means a row in
  idea_members for (idea.id, auth.uid()) — nothing else grants it.
- Membership is checked through the is_idea_member() security-definer
  function. A policy that queries idea_members directly recurses.
- Never ship the service_role key. Anything NEXT_PUBLIC_ is public.
- Schema changes go in supabase/migrations as a new numbered file, and the
  client falls back to the old shape until someone runs it — a deploy
  reaches users before a migration does.

## Out of scope — do not build
payments · teams/orgs · realtime presence · server-side rendering of
results · tests beyond smoke tests

## How to respond
Write code, not prose. No preamble, no summary.
If genuinely ambiguous, ask one question instead of guessing.

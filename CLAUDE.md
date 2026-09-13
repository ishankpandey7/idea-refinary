# Idea Craft

A licence checker for open-licence material, with search attached.

Paste the links to what you are using; each one is resolved against the
source that published it, its licence is normalised to an SPDX enum, and
that enum is judged against what you said you were doing with the material
— commercial or not, edited or not. Out comes a verdict per source
(clear / conditions / check / not usable) and the credits you owe, as
text, Markdown or CSV. Search is the secondary path, for when you need
more material than you already have.

Everything works signed out. Sign-in only keeps things.

## Stack
Next.js App Router · TypeScript · Tailwind · Supabase · Vercel.
Saved ideas live in Postgres, reached from the browser with the anon key
and guarded entirely by RLS. There is no server-side data layer.
No new dependencies without asking first.

## Sources — only these four
openalex (research) · openverse + wikimedia (art) · gutendex (writing)
All work anonymously. No API token needed.
`OPENALEX_MAILTO` is optional and only buys the polite pool.

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
  from a URL, a host or a file name.

## Data rules
- Every table is RLS-protected. Access to an idea means a row in
  idea_members for (idea.id, auth.uid()) — nothing else grants it.
- Membership is checked through the is_idea_member() security-definer
  function. A policy that queries idea_members directly recurses.
- Never ship the service_role key. Anything NEXT_PUBLIC_ is public.
- Schema changes go in supabase/migrations as a new numbered file.

## Out of scope — do not build
payments · teams/orgs · realtime presence · server-side rendering of
results · tests beyond smoke tests

## How to respond
Write code, not prose. No preamble, no summary.
If genuinely ambiguous, ask one question instead of guessing.

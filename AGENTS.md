# Idea Craft

Federated open-licence search + idea workspace. One query fans out to
source APIs; results are normalised, deduped, licence-tagged and shown
as outbound deep links. We never host content.

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

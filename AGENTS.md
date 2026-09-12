# Idea Refinery

Federated open-licence search + idea workspace. One query fans out to
source APIs; results are normalised, deduped, licence-tagged and shown
as outbound deep links. We never host content.

## Stack
Next.js App Router · TypeScript · Tailwind · Vercel.
NO DATABASE. Saved ideas live in browser localStorage.
No new dependencies without asking first.

## Sources — only these three
openalex (research) · openverse (art) · gutendex+datamuse (writing)
Openverse works anonymously. No API token needed.

## Frozen — never modify without asking
types/source-result.ts
lib/core/*

## Adapter rules
- export search(query: string): Promise<SourceResult[]>
- Never throw. Catch everything, log "[sourceId] reason", return [].
- Source-specific fields go in `raw`. Never add top-level fields.
- Licence maps to the Spdx enum. Use "UNKNOWN" rather than guessing.
- snippet is provider-supplied text ONLY. Never generate or summarise.

## Out of scope — do not build
auth · accounts · database · migrations · policy APIs · collaboration ·
tests beyond smoke tests

## How to respond
Write code, not prose. No preamble, no summary.
If genuinely ambiguous, ask one question instead of guessing.

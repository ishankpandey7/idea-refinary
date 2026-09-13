# Setup

## Files
- `CLAUDE.md` — project rules for Claude Code: stack, sources, frozen files, scope.
- `AGENTS.md` — same rules, for agents that read AGENTS.md instead.
- `types/source-result.ts` — frozen contract: `SourceResult`, `Spdx`, `Adapter`.
- `supabase/migrations/` — schema, triggers and RLS policies, numbered.
- `lib/supabase/client.ts` — browser Supabase client.
- `app/page.tsx` — the checker: paste links, get verdicts and credits.
- `app/search/page.tsx` — search across the four sources.
- `app/my-ideas/page.tsx` — saved projects; works signed out off localStorage.
- `app/api/resolve/route.ts` — POST links, get normalised results back.
- `app/api/search/route.ts` — GET a query, fan out to the adapters.

- `lib/adapters/*/index.ts` — one per source: `adapter` (search) and
  `resolver` (identify a link, resolve it). Both halves in one file so the
  licence mapping is never duplicated.
- `lib/adapters/registry.ts` — the four sources, and the resolver lookup.
- `lib/resolve.ts` — groups links by source, stitches the answers together.
- `lib/links.ts` — pulls links and bare DOIs out of pasted text. No adapter
  imports: the checker counts links as you type, in the browser.
- `lib/resolve-types.ts` — the `Resolver` half of the adapter contract.
- `lib/licence-rules.ts` — Spdx -> permissions, and the verdict for an intent.
- `lib/credits.ts` — the text / Markdown / CSV attribution block.
- `lib/search-response.ts` — the /api/search envelope, and dedupe.
- `lib/fixtures.ts` — RECORD / DEMO fixture read and write.

- `app/_components/CompliancePanel.tsx` — counts, credits, copy and download.
- `app/_components/PrintSheet.tsx` — the print-to-PDF licence report.
- `app/_components/ResultCard.tsx` — one source, with its verdict.
- `app/_lib/ideas-db.ts` — projects and pins CRUD against Postgres.
- `app/_lib/ideas.ts` — the same store in localStorage, for signed-out use.
- `app/_lib/usage.ts` — the shared commercial / modify preference.
- `app/_lib/migrate-local.ts` — one-time localStorage import on first sign-in.
- `app/layout.tsx` — root layout, fonts, global shell.
- `app/globals.css` — Tailwind entry, global styles, and the print rules.
- `next.config.ts` — Next.js config.
- `tsconfig.json` — TypeScript config, `@/*` path alias.
- `postcss.config.mjs` — Tailwind v4 PostCSS plugin.
- `eslint.config.mjs` — ESLint flat config.
- `package.json` — deps and scripts.
- `public/` — static assets served at `/`.

## Env
Put these in `.env.local` (and in the Vercel dashboard for deploys):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase → Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page, the `anon` `public` key
- `OPENALEX_MAILTO` — optional, only buys the OpenAlex polite pool

Without the Supabase pair the app still runs; sign-in is simply unavailable,
and the checker never needed it.

## Migrations
Run each file in `supabase/migrations/` once, in order, in the Supabase SQL
editor. They are not applied automatically — there is no CLI link set up.

All four are applied to the live project as of 2026-09-13, `0004_idea_usage.sql`
included — verified end to end: the intent set on a saved project survives a
reload. `listIdeas` still keeps its pre-0004 fallback (commit `5493e2b`), so a
deployment behind on migrations shows projects rather than an empty list.

To check any of them from a shell, ask PostgREST for a column the migration
adds and read the status:

```
curl -s -o /dev/null -w "%{http_code}" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/ideas?select=usage_commercial&limit=1"
```

`200` means applied; `400` with `42703 column does not exist` means it is not.

## Run
```
npm install
npm run dev
```
Open http://localhost:3000

To look at a change rather than develop against it, prefer
`npx next start -p 3100` after a build — `next dev` appends a generated block
to `AGENTS.md` on every run, which then has to be reverted before staging.

## Recording fixtures
`RECORD=1 npx next start -p 3100`, then request
`/api/search?q=<query>&category=<one category>` so only the adapter you want
runs and no other fixture can be overwritten. A fixture is only written when
the adapter returned rows, so a source that is merely down cannot replace good
data with `[]`. The first request often times out at the route's 4s budget
even when the same URL answers in under two — send it again.

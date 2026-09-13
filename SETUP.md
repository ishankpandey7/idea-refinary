# Setup

## Files
- `CLAUDE.md` — project rules for Claude Code: stack, sources, frozen files, scope.
- `AGENTS.md` — same rules, for agents that read AGENTS.md instead.
- `types/source-result.ts` — frozen contract: `SourceResult`, `Spdx`, `Adapter`.
- `supabase/migrations/` — schema, triggers and RLS policies, numbered.
- `lib/supabase/client.ts` — browser Supabase client.
- `app/_lib/ideas-db.ts` — ideas and pins CRUD against Postgres.
- `app/_lib/migrate-local.ts` — one-time localStorage import on first sign-in.
- `app/layout.tsx` — root layout, fonts, global shell.
- `app/page.tsx` — the checker: paste links, get verdicts and credits.
- `app/search/page.tsx` — search across the four sources.
- `app/api/resolve/route.ts` — POST links, get normalised results back.
- `lib/resolve.ts` — groups links by source, stitches the answers together.
- `lib/links.ts` — pulls links and bare DOIs out of pasted text.
- `lib/resolve-types.ts` — the `Resolver` half of the adapter contract.
- `lib/licence-rules.ts` — Spdx -> permissions, and the verdict for an intent.
- `lib/credits.ts` — the text / Markdown / CSV attribution block.
- `app/globals.css` — Tailwind entry + global styles.
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

`0004_idea_usage.sql` has **not been run** on the live project as of
2026-09-13: `select usage_commercial from ideas` answers
`42703 column does not exist`. The app degrades rather than breaking — saved
ideas load without it and fall back to non-commercial / unmodified — but the
compliance panel inside a saved idea cannot remember the intent until it is
applied.

## Run
```
npm install
npm run dev
```
Open http://localhost:3000

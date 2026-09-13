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

All four are applied to the live project as of 2026-09-13, `0004_idea_usage.sql`
included — verified end to end: the intent set on a saved idea survives a
reload. `listIdeas` still keeps its pre-0004 fallback (commit `5493e2b`), so a
project that is behind on migrations shows ideas rather than an empty list.

To check any of them from a shell, ask PostgREST for a column the migration
adds and read the status:

```
curl -s -o /dev/null -w "%{http_code}
"   "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/ideas?select=usage_commercial&limit=1"   -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

`200` means applied; `400` with `42703 column does not exist` means it is not.

## Run
```
npm install
npm run dev
```
Open http://localhost:3000

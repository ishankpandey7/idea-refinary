# Setup

## Files
- `CLAUDE.md` — project rules for Claude Code: stack, sources, frozen files, scope.
- `AGENTS.md` — same rules, for agents that read AGENTS.md instead.
- `types/source-result.ts` — frozen contract: `SourceResult`, `Spdx`, `Adapter`.
- `supabase/migrations/0001_init.sql` — schema, triggers and RLS policies.
- `lib/supabase/client.ts` — browser Supabase client.
- `app/_lib/ideas-db.ts` — ideas and pins CRUD against Postgres.
- `app/_lib/migrate-local.ts` — one-time localStorage import on first sign-in.
- `app/layout.tsx` — root layout, fonts, global shell.
- `app/page.tsx` — home page.
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

Without the Supabase pair the app still runs; sign-in is simply unavailable.
Run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor.

## Run
```
npm install
npm run dev
```
Open http://localhost:3000

# Setup

## Files
- `CLAUDE.md` — project rules for Claude Code: stack, sources, frozen files, scope.
- `AGENTS.md` — same rules, for agents that read AGENTS.md instead.
- `types/source-result.ts` — frozen contract: `SourceResult`, `Spdx`, `Adapter`.
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
`OPENALEX_MAILTO` (optional) — contact address for the OpenAlex polite pool.
Put it in `.env.local`; unset is fine, requests just use the common pool.

## Run
```
npm install
npm run dev
```
Open http://localhost:3000

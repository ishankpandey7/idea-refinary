# Idea Craft

**A licence checker for open-licence material.** Paste the links to what you
are using, say what you are doing with it, and find out which of it you can
actually ship — with the credits you owe, ready to publish.

Live: <https://idea-refinery-ten.vercel.app>

---

## The problem

People who publish commercially — indie game devs, YouTubers, course
creators, agencies, self-publishers — use open-licence assets and lose track
of which asset carries which licence. Today that tracking is a spreadsheet
kept by hand, or it does not happen at all.

Licence tags are already structured data. Nobody judges them against intent.
A "CC BY-NC" badge is useless on its own; *"these 24 assets cannot go in your
commercial project"* is not.

## What it does

1. **Check.** Paste links — Wikimedia Commons file pages, Openverse items,
   DOIs or OpenAlex works, Project Gutenberg books. Each one is resolved
   against the source that published it and its licence normalised to an
   SPDX tag.
2. **Judge.** Two questions — *commercial?* and *will you edit it?* — decide
   every verdict: **Clear**, **Usable with conditions**, **Check before
   using**, **Not usable here**.
3. **Credit.** Export the attribution block as plain text, Markdown or CSV.
   Every attribution line is the string the provider published, verbatim.

Search across the same four sources is still there, one tab over, for when
you need material you do not have yet.

All of it works without an account. Signing in only keeps your picks.

## Why the verdict is the product

Measured over the 211 real results in `fixtures/`:

| Intent                       | Clear | Conditions | Check | **Not usable** |
| ---------------------------- | ----: | ---------: | ----: | -------------: |
| Commercial project, edited   |    98 |         36 |    53 |         **24** |
| Personal project, unmodified |   113 |         45 |    53 |          **0** |

Same library, opposite answer. 113 of 211 — just over half — carry a problem
in commercial use, and none of it is visible from a badge.

Three rules that are easy to get backwards, and are the reason the rules
engine exists at all:

- **CC-BY-ND** is clear until you edit it, then it is blocked.
- **CC-BY-NC-ND** is clear for personal, unmodified use.
- **OPEN-ACCESS** is never clear. It grants the right to *read*, not to reuse.

## What it will not do

It never guesses. A link to a host it cannot read comes back as unread, and
a source that fails to answer comes back as unanswered — neither is ever
softened into something that looks like a licence. A wrong "clear" is the
one failure this tool cannot survive.

## Sources

| Source           | Covers   | Link shapes it resolves                                                     |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| Wikimedia Commons | images  | `/wiki/File:…`, `Special:FilePath/…`, `upload.wikimedia.org/…` (incl. thumbs) |
| Openverse        | images   | `openverse.org/image/<uuid>`                                                 |
| OpenAlex         | papers   | `openalex.org/W…`, `doi.org/10.…`, or a bare DOI                             |
| Project Gutenberg | writing | `/ebooks/<id>`, `/files/<id>/…`, `/cache/epub/<id>/…`                        |

All four are queried anonymously. No API key is required.

## Run it

```bash
npm install
npm run dev
```

Then <http://localhost:3000>. See [SETUP.md](SETUP.md) for environment
variables and the database migrations.

## Known limits

- `gutendex.com` returns 403 to Vercel's IP range, so Project Gutenberg is
  unreachable on the deployed site. It answers normally from a home
  connection. Search falls back to recorded fixtures and labels them as
  cached; the checker reports the book as unchecked rather than guessing.
- gutendex's first lookup for a given book can take 10–15 seconds, past the
  8-second budget. A second check usually succeeds.
- Licence data is only as good as what each source published. This is a
  compliance aid, not legal advice.

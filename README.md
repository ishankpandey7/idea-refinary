# Idea Craft

**The credits you owe, written for you.** Paste the links to everything in
your project and get the attribution you are obliged to publish — as text,
Markdown, CSV or a PDF licence report — with anything you cannot legally use
flagged before you ship it.

Live: <https://idea-refinery-ten.vercel.app>

---

## The problem

Every release needs an attribution list: the credits screen in a game, the
description under a video, the third-party notices on an app store form, the
acknowledgements at the back of a deck. Building one means going back through
every asset, working out what its licence was, and writing the line that
licence demands, in the wording it demands. It is an hour of miserable work,
it happens every release, and it is mostly done from memory.

The second problem is the one nobody goes looking for. Licence tags are
already structured data and nobody judges them against intent, so a list you
assemble by hand can quietly contain something you are not allowed to ship at
all. A "CC BY-NC" badge is useless on its own; *"these 24 assets cannot go in
your commercial project"* is not.

## What it does

1. **Check.** Paste links — Wikimedia Commons file pages, Openverse items,
   DOIs or OpenAlex works, Project Gutenberg books. Each one is resolved
   against the source that published it and its licence normalised to an
   SPDX tag.
2. **Judge.** Two questions — *commercial?* and *will you edit it?* — decide
   every verdict: **Clear**, **Usable with conditions**, **Check before
   using**, **Not usable here**. Results come back worst first, and one click
   narrows them to just the ones you cannot use.
3. **Fill the gaps.** The four sources cover a slice of a real project; the
   typeface, the music bed, the icon set and the stock photo are not in any
   of them. Describe those yourself — pick the licence from a list that runs
   from CC BY to the SIL Open Font Licence to "a stock licence I paid for" —
   and they are judged, credited and reported alongside everything else,
   labelled on every line as your word rather than a source's.
4. **Hand it over.** Download the attribution block as plain text, Markdown or
   CSV, or print a licence report to PDF — grouped by verdict, with what
   cannot be used on the first page. Every attribution line is the string the
   provider published, verbatim.
5. **Share it.** A finished check lives in the address bar, carrying the
   material, everything you described by hand, *and* the intent it was all
   judged under. Send it and the other person sees the same answers, not
   their own.

Search across the same four sources is still there, one tab over, for when
you need material you do not have yet.

All of it works without an account. Signing in only keeps your picks.

## Why the verdict comes with it

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

That holds for the entries you add by hand too. Idea Craft does not decide
what those are; you state it, and every counter, credits file and printed
report says which lines it read and which lines it was told.

## Sources

| Source           | Covers   | Link shapes it resolves                                                     |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| Wikimedia Commons | images  | `/wiki/File:…`, `Special:FilePath/…`, `upload.wikimedia.org/…` (incl. thumbs) |
| Openverse        | images   | `openverse.org/image/<uuid>`                                                 |
| OpenAlex         | papers   | `openalex.org/W…`, `doi.org/10.…`, or a bare DOI                             |
| Project Gutenberg | writing | `/ebooks/<id>`, `/files/<id>/…`, `/cache/epub/<id>/…`                        |

All four are queried anonymously. No API key is required. Anything else in
your project — a font, a track, an icon set, a paid stock photo — is added by
hand and marked as yours.

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
  cached; the checker reports the book as unchecked rather than guessing, and
  offers to let you state the licence yourself.
- gutendex's first lookup for a given book can take 10–15 seconds, past the
  8-second budget. A second check usually succeeds.
- Licence data is only as good as what each source published. This is a
  compliance aid, not legal advice.

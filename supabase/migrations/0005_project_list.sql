-- The list a project is a record of, not just the snapshots taken from it.
--
-- pins hold what each source said at the moment you kept it. That is the
-- right thing for a report and the wrong thing for a ledger: you cannot
-- re-run a check from a snapshot, because a snapshot has no idea where it
-- came from as a batch. This column holds the input — the pasted material
-- and the entries stated by hand — so "re-check before the next release" is
-- one click instead of finding the links again.
--
-- jsonb and nullable on purpose. A deploy reaches users before a migration
-- does, so the client reads projects without it and writes it only when it
-- is there.
alter table public.ideas
  add column if not exists source_list jsonb;

comment on column public.ideas.source_list is
  'The check this project is a record of: { paste, asserted }. Input, not results.';

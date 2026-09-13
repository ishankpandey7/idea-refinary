-- What the idea's material is actually going to be used for.
--
-- Two booleans rather than a free-text field on purpose: the licence rules
-- in lib/licence-rules.ts only branch on these two questions, and anything
-- richer would be stored and never read.
--
-- Default false/false is the safe pair. A new idea is treated as
-- non-commercial and unmodified, so nothing is ever reported as clear when
-- the person has not yet said what they are doing.

alter table public.ideas
  add column if not exists usage_commercial boolean not null default false,
  add column if not exists usage_modify     boolean not null default false;

-- No new policies. ideas_update already lets any member of the idea write to
-- the row, and deciding how a shared idea will be used is a member's call.

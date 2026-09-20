-- "Not stated" is a third answer, and the columns could not hold it.
--
-- 0004 added these as `boolean not null default false`, and its comment
-- called false/false "the safe pair... nothing is ever reported as clear
-- when the person has not yet said what they are doing". That was wrong,
-- and it is the bug the three-state Usage change fixes: both blocking
-- branches in lib/licence-rules.ts are guarded by the intent, so with
-- nothing said neither can fire and false/false is the *most* permissive
-- pair, not the safest. A visitor who had answered nothing was told
-- CC BY-NC-ND was clear to use.
--
-- So null now means nobody answered, here as well as in the client. The
-- defaults are dropped with the constraint: a row created before anyone
-- answers must read back as unanswered, not as two implicit noes.
--
-- app/_lib/ideas-db.ts writes the two columns and falls back to omitting
-- them while this has not run, so a deploy that reaches users first does
-- not break saving.

alter table public.ideas
  alter column usage_commercial drop not null,
  alter column usage_modify     drop not null,
  alter column usage_commercial drop default,
  alter column usage_modify     drop default;

-- Existing rows keep whatever false/false 0004 wrote. They cannot be
-- distinguished from a deliberate "no" at this point, and rewriting
-- somebody's stored answer to null on the strength of a guess would be the
-- same mistake in the other direction. The client reads `source_list`
-- (0005) first where there is one, and that JSON does carry the third state.

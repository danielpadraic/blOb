-- Stance is a 50-point skill score per activity (1 = Level Up, 50 = Excel).
-- Stored as numeric so the slider can slide freely. RLS unchanged.
-- Additive on live stamp 20260903021348.

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_stance_score_check;

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_stance_check;

alter table public.profile_interest_chips
  alter column stance_score type numeric(6,2)
  using stance_score::numeric(6,2);

-- Old 1–5 rows: 1 stays Level Up, 3 becomes the middle (25.5), 5 becomes Excel (50).
update public.profile_interest_chips
set stance_score = round((1 + (stance_score - 1) * 49.0 / 4.0)::numeric, 2)
where stance_score is not null
  and stance_score <= 5;

alter table public.profile_interest_chips
  alter column stance_score set default 25;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_stance_score_check check (
    stance_score is null or stance_score between 1 and 50
  );

alter table public.profile_interest_chips
  add constraint profile_interest_chips_stance_check check (
    (stance_score is not null and stance_score between 1 and 50)
    or excel
    or level_up
  );

comment on column public.profile_interest_chips.stance_score is
  'Per-activity skill score 1–50. 1 = Level Up (left), 50 = Excel (right). Default 25. Used for filtering and challenge placement. Never shown as a number in the app.';

-- One draft per user for the challenge creation wizard.
-- Safe to re-run.

create table if not exists public.challenge_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  step int not null default 0 check (step >= 0),
  start_path text,
  template_id text,
  source_challenge_id uuid references public.challenges(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.challenge_drafts is 'In-progress challenge creation wizard. One row per user.';
comment on column public.challenge_drafts.payload is 'CreateChallengeValues JSON: title, type, duration, prize, funding, proofs, tasks, etc.';
comment on column public.challenge_drafts.step is 'Last wizard step index the user was on.';

drop trigger if exists challenge_drafts_set_updated_at on public.challenge_drafts;
create trigger challenge_drafts_set_updated_at
  before update on public.challenge_drafts
  for each row execute function public.set_updated_at();

alter table public.challenge_drafts enable row level security;

drop policy if exists "Users read own challenge draft" on public.challenge_drafts;
create policy "Users read own challenge draft"
  on public.challenge_drafts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own challenge draft" on public.challenge_drafts;
create policy "Users insert own challenge draft"
  on public.challenge_drafts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own challenge draft" on public.challenge_drafts;
create policy "Users update own challenge draft"
  on public.challenge_drafts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own challenge draft" on public.challenge_drafts;
create policy "Users delete own challenge draft"
  on public.challenge_drafts for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.challenge_drafts to authenticated;

-- Companion to 20260906130000. That repair rewrote challenge_checkins.proof_parts, and the BEFORE
-- trigger duly restamped challenge_checkins.distance_meters — but challenge_checkins_sync_distance_total
-- is declared "after update of distance_meters", and Postgres decides that from the columns named in
-- the statement rather than the values that actually changed. The statement named only proof_parts,
-- so the participant total stayed on the old number and the goal ring kept reading 0.00 mi.
--
-- Recomputed the same way that trigger would. Re-running is a no-op, which is why it can live on its
-- own here as well as at the end of the migration it belongs to.
update public.challenge_participants cp
set distance_meters_total = totals.meters
from (
  select cp2.challenge_id,
         cp2.user_id,
         coalesce((
           select sum(coalesce(k.distance_meters, 0))
           from public.challenge_checkins k
           where k.challenge_id = cp2.challenge_id
             and k.user_id = cp2.user_id
             and k.status = 'submitted'
             and k.submitted_at is not null
         ), 0) as meters
  from public.challenge_participants cp2
) as totals
where cp.challenge_id = totals.challenge_id
  and cp.user_id = totals.user_id
  and cp.distance_meters_total is distinct from totals.meters;

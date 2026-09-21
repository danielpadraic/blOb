-- Extend save_checkin_proof / submit_checkin with p_for_user_id.
-- Keeps existing scoring math; only changes who the row belongs to.

do $patch$
declare
  src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_checkin_proof';

  if src is null then
    raise exception 'save_checkin_proof missing';
  end if;
  if src like '%p_for_user_id%' then
    -- already patched
    null;
  else
    src := replace(
      src,
      'p_clear_proof boolean DEFAULT false)',
      'p_clear_proof boolean DEFAULT false, p_for_user_id uuid DEFAULT NULL::uuid)'
    );
    src := replace(
      src,
      '  v_uid uuid := auth.uid();',
      '  v_actor uuid := auth.uid();
  v_uid uuid := auth.uid();'
    );
    src := replace(
      src,
      $old$  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  perform public.checkin_assert_open(ch, part);$old$,
      $new$  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_uid := public.checkin_resolve_subject(ch, p_for_user_id);

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  if v_actor is distinct from v_uid then
    perform public.checkin_assert_proxy_open(ch, part);
  else
    perform public.checkin_assert_open(ch, part);
  end if;$new$
    );
    src := replace(
      src,
      '    health_workout_id = v_row.health_workout_id,
    updated_at = now()
  where id = v_row.id',
      '    health_workout_id = v_row.health_workout_id,
    logged_by = case when v_actor is distinct from v_uid then v_actor else logged_by end,
    updated_at = now()
  where id = v_row.id'
    );
    src := replace(
      src,
      '    perform public.post_checkin_stage(
      v_uid, p_challenge_id, v_row.id, v_content, v_media, v_stage
    );
  end if;',
      '    perform public.post_checkin_stage(
      v_uid, p_challenge_id, v_row.id, v_content, v_media, v_stage
    );
    if v_actor is distinct from v_uid then
      perform public.checkin_stamp_proxy(p_challenge_id, v_row.id, v_actor, v_uid, v_row.notes);
    end if;
  end if;'
    );
    execute src;
  end if;

  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'submit_checkin';

  if src is null then
    raise exception 'submit_checkin missing';
  end if;
  if src like '%p_for_user_id%' then
    return;
  end if;

  src := replace(
    src,
    'submit_checkin(p_challenge_id uuid)',
    'submit_checkin(p_challenge_id uuid, p_for_user_id uuid DEFAULT NULL::uuid)'
  );
  src := replace(
    src,
    '  v_uid uuid := auth.uid();',
    '  v_actor uuid := auth.uid();
  v_uid uuid := auth.uid();'
  );
  src := replace(
    src,
    $old$  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  perform public.checkin_assert_open(ch, part);$old$,
    $new$  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_uid := public.checkin_resolve_subject(ch, p_for_user_id);

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  if v_actor is distinct from v_uid then
    perform public.checkin_assert_proxy_open(ch, part);
  else
    perform public.checkin_assert_open(ch, part);
  end if;$new$
  );
  src := replace(
    src,
    $old$  perform public.post_checkin_stage(
    v_uid,
    p_challenge_id,
    v_row.id,
    public.checkin_post_caption(true, v_row.notes),
    v_media,
    'complete'
  );$old$,
    $new$  perform public.post_checkin_stage(
    v_uid,
    p_challenge_id,
    v_row.id,
    public.checkin_post_caption(true, v_row.notes),
    v_media,
    'complete'
  );
  if v_actor is distinct from v_uid then
    perform public.checkin_stamp_proxy(p_challenge_id, v_row.id, v_actor, v_uid, v_row.notes);
  end if;$new$
  );
  execute src;
end
$patch$;

drop function if exists public.save_checkin_proof(uuid, text, jsonb, uuid, text, text[], boolean);
drop function if exists public.submit_checkin(uuid);
grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid, text, text[], boolean, uuid) to authenticated;
grant execute on function public.submit_checkin(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';

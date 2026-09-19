-- One transaction for several host Board adjusts. Each item reuses host_adjust_checkin
-- so actor / Official / settled / miss checks stay the same. First real error rolls back.

create or replace function public.host_adjust_checkin_batch(
  p_challenge_id uuid,
  p_action text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  v_user uuid;
  v_period timestamptz;
  v_name text;
  results jsonb := '[]'::jsonb;
  result jsonb;
begin
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Couldn’t update the Board.';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_user := nullif(item->>'user_id', '')::uuid;
    exception when others then
      raise exception 'Couldn’t update the Board.';
    end;
    if v_user is null then
      raise exception 'Couldn’t update the Board.';
    end if;
    v_name := coalesce(nullif(public.profile_display_name(v_user), ''), 'Someone');
    v_period := null;
    begin
      if nullif(item->>'period_start', '') is not null then
        v_period := (item->>'period_start')::timestamptz;
      end if;
    exception when others then
      v_period := null;
    end;
    if v_period is null then
      v_period := now();
    end if;
    begin
      result := public.host_adjust_checkin(p_challenge_id, v_user, p_action, v_period);
    exception when others then
      raise exception '%', v_name || ': ' || sqlerrm;
    end;
    results := results || jsonb_build_array(result);
  end loop;

  return jsonb_build_object('ok', true, 'results', results);
end;
$$;

revoke all on function public.host_adjust_checkin_batch(uuid, text, jsonb) from public, anon;
grant execute on function public.host_adjust_checkin_batch(uuid, text, jsonb) to authenticated;

create or replace function public.send_push_to_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb := '[]'::jsonb;
  rec record;
begin
  if p_user_id is null or coalesce(p_title, '') = '' then
    return;
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return;
  end if;

  for rec in
    select token from public.push_tokens where user_id = p_user_id
  loop
    v_messages := v_messages || jsonb_build_array(jsonb_build_object(
      'to', rec.token,
      'title', p_title,
      'body', coalesce(nullif(p_body, ''), p_title),
      'sound', 'default',
      'data', coalesce(p_data, '{}'::jsonb)
    ));
  end loop;

  if v_messages = '[]'::jsonb then
    return;
  end if;

  begin
    perform net.http_post(
      url := coalesce(
        nullif(current_setting('app.edge_push_url', true), ''),
        'https://tguzdtwsajnnczdxjqyq.supabase.co/functions/v1/push-notify'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := jsonb_build_object('messages', v_messages)
    );
  exception when others then
    null;
  end;
exception when others then
  null;
end;
$$;

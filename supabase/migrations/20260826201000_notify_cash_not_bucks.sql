-- User-facing wallet transfer notices say $. Never Bucks.

create or replace function public.trg_notify_coins_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_amount text;
  v_body text;
  v_cash boolean;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  v_cash := public.normalize_wallet_currency(new.currency) = 'bucks';
  v_body := case
    when v_cash then v_name || ' sent you $' || v_amount || '.'
    else v_name || ' sent you ' || v_amount || ' Coins.'
  end;
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    v_body,
    null,
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id, 'currency', coalesce(new.currency, 'coins'))
  );
  return new;
exception when others then
  return new;
end;
$$;

update public.notifications
set
  title = replace(title, 'Bucks', '$'),
  body = replace(body, 'Bucks', '$')
where coalesce(title, '') ilike '%bucks%'
   or coalesce(body, '') ilike '%bucks%';

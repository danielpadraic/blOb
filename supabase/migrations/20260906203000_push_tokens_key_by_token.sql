-- Push tokens were keyed by user, so registering one always failed.
--
-- push_tokens already existed with its primary key on user_id, which meant the
-- `create table if not exists` in 20260818180000_native_notifications.sql silently kept the wrong
-- shape. register_push_token upserts `on conflict (token)`, so every call died on 42P10 -- "no
-- unique or exclusion constraint matching the ON CONFLICT specification" -- and push_tokens stayed
-- empty, which is why no device has ever received a push.
--
-- Keying by token is also what the rest of the pipeline already assumes: the push-notify edge
-- function selects `token, user_id` for a set of users and expects a row per device, and it prunes
-- dead tokens by token. A primary key on user_id capped each account at one device and would have
-- thrown a duplicate-key error the moment someone signed in on a second one.
--
-- The table has no rows, so there is nothing to migrate.

alter table public.push_tokens
  drop constraint if exists push_tokens_pkey;

alter table public.push_tokens
  add constraint push_tokens_pkey primary key (token);

-- The edge function looks tokens up by user, and that is no longer the primary key.
create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

comment on table public.push_tokens is
  'One row per device push token. Keyed by token; a user may have several.';

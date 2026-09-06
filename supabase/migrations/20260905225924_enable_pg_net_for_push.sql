-- Enable async HTTP so notify_user can call the push-notify Edge Function.
-- Already applied on live blOb-app (tguzdtwsajnnczdxjqyq). Safe to re-run.
create extension if not exists pg_net;

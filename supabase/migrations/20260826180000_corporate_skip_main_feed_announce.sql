-- Private Corporate: never write a Home join announce.
-- Matches homeFeedAllowsChallengeContent: corporate stays lobby-only even if
-- visibility was set public by mistake.

create or replace function public.challenge_allows_main_feed_announce(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select not (
    lower(coalesce(p_challenge.privacy_mode, '')) = 'private_corporate'
    or (
      coalesce(p_challenge.is_official, false) = false
      and public.is_invite_only_challenge(p_challenge)
    )
    or lower(coalesce(p_challenge.visibility, '')) in ('invite', 'private')
  );
$$;

comment on function public.challenge_allows_main_feed_announce(public.challenges) is
  'Home join announce. False for private_corporate (always), invite-only user challenges, and visibility invite|private.';

revoke all on function public.challenge_allows_main_feed_announce(public.challenges) from public, anon, authenticated;

-- Remove leaked Home announce rows. Lobby join_challenge_feed posts stay.
delete from public.posts p
using public.challenges c
where p.challenge_id = c.id
  and p.system_kind = 'join_main_feed'
  and p.source = 'feed'
  and lower(coalesce(c.privacy_mode, '')) = 'private_corporate';

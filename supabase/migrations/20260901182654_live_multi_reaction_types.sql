-- Live allows more than one reaction type per person on the same row (Discord).
-- Home / Wave still swap a single type in the client.

drop index if exists reactions_user_post_unique_idx;
drop index if exists reactions_user_comment_unique_idx;

create unique index if not exists reactions_user_post_type_unique_idx
  on public.reactions (user_id, post_id, reaction_type)
  where post_id is not null;

create unique index if not exists reactions_user_comment_type_unique_idx
  on public.reactions (user_id, comment_id, reaction_type)
  where comment_id is not null;

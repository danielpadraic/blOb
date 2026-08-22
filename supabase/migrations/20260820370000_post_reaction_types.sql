-- Post reactions: like / love / care / fire / sad. One per user per post.
-- Live table is public.reactions (not post_reactions).
-- Apply on the linked project if the client starts writing love/care/sad.

alter table public.reactions
  add column if not exists reaction_type text;

-- One reaction per user per post/comment before remapping types.
delete from public.reactions a
using public.reactions b
where a.post_id is not null
  and a.id <> b.id
  and a.post_id = b.post_id
  and a.user_id = b.user_id
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

delete from public.reactions a
using public.reactions b
where a.comment_id is not null
  and a.id <> b.id
  and a.comment_id = b.comment_id
  and a.user_id = b.user_id
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

update public.reactions
set reaction_type = 'like'
where reaction_type is null
   or reaction_type in ('heart', 'strong');

update public.reactions
set reaction_type = 'fire'
where reaction_type in ('flame');

alter table public.reactions
  alter column reaction_type set default 'like';

alter table public.reactions
  alter column reaction_type set not null;

alter table public.reactions drop constraint if exists reaction_type_known;
alter table public.reactions
  add constraint reaction_type_known
  check (reaction_type in ('like', 'love', 'care', 'fire', 'sad'));

drop index if exists reactions_user_post_type_idx;
drop index if exists reactions_user_comment_type_idx;
alter table public.reactions drop constraint if exists reactions_user_id_post_id_reaction_type_key;
alter table public.reactions drop constraint if exists reactions_user_id_comment_id_reaction_type_key;

create unique index if not exists reactions_user_post_unique_idx
  on public.reactions (user_id, post_id)
  where post_id is not null;

create unique index if not exists reactions_user_comment_unique_idx
  on public.reactions (user_id, comment_id)
  where comment_id is not null;

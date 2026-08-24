select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'challenge_participants'
order by ordinal_position;

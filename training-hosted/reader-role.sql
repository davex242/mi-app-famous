-- Backend-only RLS reader: no direct authenticated Data API/GraphQL grants.
begin;
create role training_preview_reader nologin inherit;
grant authenticated to training_preview_reader;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'training\_%' escape '\' loop
  execute format('revoke select on public.%I from authenticated',t.tablename);
  execute format('grant select on public.%I to training_preview_reader',t.tablename);
 end loop;
end $$;
commit;

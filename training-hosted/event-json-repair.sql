-- Preview-only data representation repair. Does not alter logical audit values.
-- Malformed/non-object strings are retained for manual inspection.
begin;
do $$ declare r record; parsed jsonb; begin
 for r in select id,details from public.training_events where jsonb_typeof(details)='string' for update loop
  begin
   parsed := (r.details #>> '{}')::jsonb;
  exception when invalid_text_representation then
   continue;
  end;
  if jsonb_typeof(parsed)='object' then
   update public.training_events set details=parsed where id=r.id;
  end if;
 end loop;
end $$;
commit;

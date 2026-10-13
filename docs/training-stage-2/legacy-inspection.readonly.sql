-- READ-ONLY METADATA INVENTORY. Not a migration and never executed automatically.
-- Run only against the independently verified backend for mi-app-famous.
-- No host/user rows, passwords, tokens or file contents are selected.
begin transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';

select current_database() as database_name,current_user as inspected_by,version() as server_version;
select n.nspname as schema_name,c.relname as table_name,c.relkind,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('hosts','app_users'))
   or (n.nspname='auth' and c.relname in ('users','sessions'))
order by n.nspname,c.relname;

select table_schema,table_name,column_name,data_type,udt_schema,udt_name,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in ('hosts','app_users')
order by table_name,ordinal_position;

select n.nspname as schema_name,c.relname as table_name,k.conname,k.contype,
       pg_get_constraintdef(k.oid) as constraint_definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('hosts','app_users')
order by c.relname,k.conname;

select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('hosts','app_users') order by tablename,indexname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('hosts','app_users')
order by tablename,policyname;

select r.rolname,n.nspname as schema_name,c.relname as table_name,
       has_table_privilege(r.oid,c.oid,'SELECT') as can_select,
       has_table_privilege(r.oid,c.oid,'INSERT') as can_insert,
       has_table_privilege(r.oid,c.oid,'UPDATE') as can_update,
       has_table_privilege(r.oid,c.oid,'DELETE') as can_delete
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
where r.rolname in ('anon','authenticated') and n.nspname='public'
  and c.relname in ('hosts','app_users') order by r.rolname,c.relname;

select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='auth' and p.proname in ('uid','jwt') order by p.proname;
rollback;

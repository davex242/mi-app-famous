-- DESIGN ONLY. Never run against a hosted database as-is.
-- Verify the actual backend, app_users ownership, RLS and backups before a future migration.
begin;
do $guard$ begin raise exception 'DESIGN ONLY: recruiter MICO ID migration is not authorized'; end $guard$;
alter table public.app_users add column mico_id text;
alter table public.app_users add constraint app_users_mico_id_format check (mico_id is null or mico_id ~ '^[0-9]{1,32}$');
alter table public.app_users add constraint app_users_mico_id_key unique (mico_id);
-- Existing rows stay NULL. Do not infer MICO IDs from app_users.id, hosts.host_id or names.
-- No changes to roles, authentication, grants or RLS are included.
rollback;

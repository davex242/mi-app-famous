-- Synthetic prerequisites only. These are NOT the actual production schemas.
-- Loaded only into a fresh synthetic PGlite sandbox (memory or guarded local storage).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.app_users(id uuid primary key);
create table public.hosts(id uuid primary key);

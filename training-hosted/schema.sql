-- Standalone training preview in the separately verified mi-app-famous Supabase.
-- No DatabasePad access or legacy table migration. Existing design-only draft stays blocked.
begin;
do $$ begin
 if exists(select 1 from pg_namespace where nspname='training_private')
   or exists(select 1 from pg_tables where schemaname='public' and tablename like 'training\_%' escape '\') then
  raise exception 'Training namespace already exists; inspect migration history first';
 end if;
end $$;
create schema training_private;
revoke all on schema training_private from public, anon, authenticated;
grant usage on schema training_private to authenticated, service_role;


create table training_private.training_users (
 id uuid primary key default gen_random_uuid(), legacy_user_key text unique,
 display_name text not null default '', mico_id text unique check(mico_id ~ '^[0-9]{1,32}$'),
 created_at timestamptz not null default now()
);
create table training_private.training_hosts (
 id uuid primary key default gen_random_uuid(), legacy_host_key text unique,
 display_name text not null, mico_id text unique check(mico_id ~ '^[0-9]{1,32}$'),
 created_at timestamptz not null default now()
);

create table training_private.training_principals (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  app_user_id uuid not null unique references training_private.training_users(id) on delete restrict,
  role text not null check (role in ('superadmin','subadmin','edit','readonly')),
  is_active boolean not null default false,
  provisioned_at timestamptz not null default now()
);
-- Authoritative server-provisioned scope; never infer authorization from a name.
create table training_private.training_host_assignments (
  host_id uuid primary key references training_private.training_hosts(id) on delete restrict,
  recruiter_id uuid not null references training_private.training_users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references training_private.training_users(id) on delete restrict
);
create index training_assignments_recruiter_idx
  on training_private.training_host_assignments(recruiter_id,host_id);

create table public.training_topics (
  id uuid primary key default gen_random_uuid(), content_key uuid not null,
  revision integer not null check (revision>0), title text not null,
  description text not null default '', category text not null,
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  estimated_minutes integer not null check (estimated_minutes>0),
  created_by uuid not null references training_private.training_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(content_key,revision)
);
create table public.training_materials (
  id uuid primary key default gen_random_uuid(), content_key uuid not null,
  revision integer not null check (revision>0),
  topic_id uuid not null references public.training_topics(id), title text not null,
  kind text not null check (kind in ('document','video','image','link','slides')),
  storage_path text, external_url text,
  allow_download boolean not null default true, allow_preview boolean not null default true,
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  created_by uuid not null references training_private.training_users(id), created_at timestamptz not null default now(),
  check (num_nonnulls(storage_path,external_url)=1), unique(content_key,revision)
);
create index training_materials_topic_idx on public.training_materials(topic_id);
create table public.training_program_versions (
  id uuid primary key default gen_random_uuid(), program_key text not null,
  version integer not null check(version>0), title text not null,
  duration_days integer not null default 14 check(duration_days>0),
  status text not null default 'draft' check(status in ('draft','in_review','published','archived')),
  is_optional_update boolean not null default true, changelog text not null default '',
  created_by uuid not null references training_private.training_users(id),
  published_by uuid references training_private.training_users(id), published_at timestamptz,
  created_at timestamptz not null default now(), unique(program_key,version),
  check (status not in ('published','archived') or (published_by is not null and published_at is not null))
);
create table public.training_program_items (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references public.training_program_versions(id),
  topic_id uuid not null references public.training_topics(id), day integer not null check(day>0),
  position integer not null check(position>0), notes text not null default '',
  evidence_required boolean not null default true, assessment_required boolean not null default true,
  unique(program_version_id,day,position), unique(id,topic_id)
);
-- A program binds precise material revisions too; new uploads do not rewrite history.
create table public.training_program_materials (
  item_id uuid not null references public.training_program_items(id),
  material_id uuid not null references public.training_materials(id), primary key(item_id,material_id)
);
create index training_program_materials_material_idx on public.training_program_materials(material_id);

create table public.training_enrollments (
  id uuid primary key default gen_random_uuid(), host_id uuid not null references training_private.training_hosts(id),
  recruiter_id uuid not null references training_private.training_users(id),
  program_version_id uuid not null references public.training_program_versions(id),
  is_free_training boolean not null default false,
  status text not null default 'active' check(status in ('active','paused','completed','cancelled')),
  timezone text not null, started_at timestamptz not null default now(), completed_at timestamptz,
  check ((status='completed')=(completed_at is not null))
);
create index training_enrollments_host_idx on public.training_enrollments(host_id);
create index training_enrollments_recruiter_idx on public.training_enrollments(recruiter_id);
create index training_enrollments_version_idx on public.training_enrollments(program_version_id);
create unique index training_one_active_enrollment_idx on public.training_enrollments(host_id)
  where status in ('active','paused') and not is_free_training;
create table public.training_update_history (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.training_enrollments(id),
  from_version_id uuid not null references public.training_program_versions(id),
  to_version_id uuid not null references public.training_program_versions(id),
  accepted_by uuid not null references training_private.training_users(id), accepted_at timestamptz not null default now(),
  previous_progress_percent numeric(5,2) not null check(previous_progress_percent between 0 and 100),
  equivalence_map jsonb not null default '{}', check(from_version_id<>to_version_id)
);
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.training_enrollments(id),
  item_id uuid not null, topic_id uuid not null,
  scheduled_at timestamptz not null, duration_minutes integer not null check(duration_minutes>0),
  status text not null default 'scheduled' check(status in ('scheduled','completed','missed','rescheduled')),
  auto_generated boolean not null default true, edited_manually boolean not null default false,
  foreign key(item_id,topic_id) references public.training_program_items(id,topic_id),
  unique(enrollment_id,item_id), unique(id,enrollment_id,topic_id)
);
create index training_sessions_agenda_idx on public.training_sessions(scheduled_at);
create table public.training_attendance (
  id uuid primary key default gen_random_uuid(), session_id uuid not null unique references public.training_sessions(id),
  status text not null check(status in ('present','absent','late','excused')),
  recorded_by uuid not null references training_private.training_users(id), recorded_at timestamptz not null default now()
);
create table public.training_evidence (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.training_enrollments(id),
  session_id uuid, topic_id uuid not null references public.training_topics(id),
  description text not null, storage_path text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  submitted_by uuid not null references training_private.training_users(id), submitted_at timestamptz not null default now(),
  foreign key(session_id,enrollment_id,topic_id) references public.training_sessions(id,enrollment_id,topic_id)
);
create table public.training_assessments (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.training_enrollments(id),
  topic_id uuid not null references public.training_topics(id),
  score numeric(5,2) check(score between 0 and 100), passed boolean, notes text not null default '',
  assessed_by uuid not null references training_private.training_users(id), assessed_at timestamptz not null default now()
);
create table public.training_approvals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.training_topics(id), material_id uuid references public.training_materials(id),
  program_version_id uuid references public.training_program_versions(id),
  evidence_id uuid references public.training_evidence(id), assessment_id uuid references public.training_assessments(id),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  requested_by uuid not null references training_private.training_users(id), reviewed_by uuid references training_private.training_users(id),
  review_notes text not null default '', requested_at timestamptz not null default now(), reviewed_at timestamptz,
  check(num_nonnulls(topic_id,material_id,program_version_id,evidence_id,assessment_id)=1),
  check((status='pending' and reviewed_by is null and reviewed_at is null)
    or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create table public.training_completions (
  enrollment_id uuid not null references public.training_enrollments(id),
  item_id uuid not null references public.training_program_items(id),
  validated_by uuid not null references training_private.training_users(id), validated_at timestamptz not null default now(),
  primary key(enrollment_id,item_id)
);

create table public.training_exam_versions (
  id uuid primary key default gen_random_uuid(), exam_key text not null, version integer not null check(version>0),
  status text not null default 'draft' check(status in ('draft','in_review','published','archived')),
  question_count integer not null default 25 check(question_count in (10,25,50)),
  pass_percent numeric(5,2) not null check(pass_percent between 0 and 100),
  created_by uuid not null references training_private.training_users(id), created_at timestamptz not null default now(),
  unique(exam_key,version)
);
create table public.training_exam_questions (
  id uuid primary key default gen_random_uuid(), exam_version_id uuid not null references public.training_exam_versions(id),
  position integer not null check(position between 1 and 50), prompt text not null,
  options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)>=2),
  topic_id uuid references public.training_topics(id), unique(exam_version_id,position)
);
create table training_private.training_exam_keys (
  question_id uuid primary key references public.training_exam_questions(id),
  correct_option integer not null check(correct_option>=0)
);
create table public.training_exam_assignments (
  id uuid primary key default gen_random_uuid(), exam_version_id uuid not null references public.training_exam_versions(id),
  host_id uuid not null references training_private.training_hosts(id), enrollment_id uuid references public.training_enrollments(id),
  status text not null default 'inactive' check(status in ('inactive','issued','completed','expired')),
  expires_at timestamptz, issued_by uuid not null references training_private.training_users(id),
  created_at timestamptz not null default now(), max_attempts integer not null check(max_attempts>0)
);
create table training_private.training_exam_tokens (
  assignment_id uuid primary key references public.training_exam_assignments(id),
  token_hash text not null unique, revoked_at timestamptz
);
create table public.training_exam_attempts (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.training_exam_assignments(id),
  attempt_number integer not null check(attempt_number>0), started_at timestamptz not null default now(),
  submitted_at timestamptz, score_percent numeric(5,2) check(score_percent between 0 and 100), passed boolean,
  unique(assignment_id,attempt_number),
  check ((submitted_at is null and score_percent is null and passed is null)
    or (submitted_at is not null and score_percent is not null and passed is not null))
);
create unique index training_one_open_attempt_idx on public.training_exam_attempts(assignment_id)
  where submitted_at is null;
create table training_private.training_exam_answers (
  attempt_id uuid not null references public.training_exam_attempts(id),
  question_id uuid not null references public.training_exam_questions(id),
  selected_option integer not null check(selected_option>=0), primary key(attempt_id,question_id)
);
create table public.training_events (
  id uuid primary key default gen_random_uuid(), actor_app_user_id uuid references training_private.training_users(id),
  event_type text not null, entity_type text not null, entity_id uuid not null,
  enrollment_id uuid references public.training_enrollments(id),
  details jsonb not null default '{}', created_at timestamptz not null default now()
);

-- Private lookup functions: intentional SECURITY DEFINER to avoid recursive RLS.
-- Owner must be a narrowly controlled trusted database role, never an app user.
-- Fixed search_path, qualified tables and auth.uid check; no secrets returned.
create function training_private.current_role() returns text language sql stable
security definer set search_path='' as $$
  select p.role from training_private.training_principals p
  where p.auth_user_id=(select auth.uid()) and p.is_active and (select auth.uid()) is not null
$$;
create function training_private.can_read_host(target uuid) returns boolean language sql stable
security definer set search_path='' as $$
  select exists(select 1 from training_private.training_principals p
    where p.auth_user_id=(select auth.uid()) and p.is_active and (select auth.uid()) is not null
    and (p.role in ('superadmin','subadmin') or exists (
      select 1 from training_private.training_host_assignments a
      where a.host_id=target and a.recruiter_id=p.app_user_id)))
$$;
create function training_private.can_read_enrollment(target uuid) returns boolean language sql stable
security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.training_enrollments e
    where e.id=target and training_private.can_read_host(e.host_id))
$$;
revoke all on function training_private.current_role() from public,anon,authenticated;
revoke all on function training_private.can_read_host(uuid) from public,anon,authenticated;
revoke all on function training_private.can_read_enrollment(uuid) from public,anon,authenticated;
grant execute on function training_private.current_role(), training_private.can_read_host(uuid),
  training_private.can_read_enrollment(uuid) to authenticated;

-- Every proposed table is RLS enabled. No public direct writes; service operations
-- must authorize role/scope/transition themselves. No existing-table ACL changes.
do $$ declare t record; begin
  for t in select schemaname,tablename from pg_tables
    where (schemaname='public' and tablename like 'training\_%' escape '\')
       or schemaname='training_private' loop
    execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
    execute format('revoke all on table %I.%I from public,anon,authenticated',t.schemaname,t.tablename);
    execute format('grant select,insert,update,delete on table %I.%I to service_role',t.schemaname,t.tablename);
    if t.schemaname='public' then
      execute format('grant select on table %I.%I to authenticated',t.schemaname,t.tablename);
    end if;
  end loop;
end $$;

create policy topics_read on public.training_topics for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin') or
  ((select training_private.current_role()) is not null and status in ('published','archived')));
create policy materials_read on public.training_materials for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin') or
  ((select training_private.current_role()) is not null and status in ('published','archived')
    and exists(select 1 from public.training_topics t where t.id=topic_id and t.status in ('published','archived'))));
create policy programs_read on public.training_program_versions for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin') or
  ((select training_private.current_role()) is not null and status in ('published','archived')));
create policy program_items_read on public.training_program_items for select to authenticated using (
  exists(select 1 from public.training_program_versions v where v.id=program_version_id));
create policy program_materials_read on public.training_program_materials for select to authenticated using (
  exists(select 1 from public.training_program_items i where i.id=item_id));
create policy enrollments_read on public.training_enrollments for select to authenticated using (
  training_private.can_read_host(host_id));
create policy updates_read on public.training_update_history for select to authenticated using (
  training_private.can_read_enrollment(enrollment_id));
create policy sessions_read on public.training_sessions for select to authenticated using (
  training_private.can_read_enrollment(enrollment_id));
create policy attendance_read on public.training_attendance for select to authenticated using (
  exists(select 1 from public.training_sessions s where s.id=session_id));
create policy evidence_read on public.training_evidence for select to authenticated using (
  training_private.can_read_enrollment(enrollment_id));
create policy assessments_read on public.training_assessments for select to authenticated using (
  training_private.can_read_enrollment(enrollment_id));
create policy approvals_read on public.training_approvals for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin') or
  exists(select 1 from public.training_evidence e where e.id=evidence_id) or
  exists(select 1 from public.training_assessments a where a.id=assessment_id));
create policy completions_read on public.training_completions for select to authenticated using (
  training_private.can_read_enrollment(enrollment_id));
create policy exam_versions_admin_read on public.training_exam_versions for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin'));
create policy exam_questions_admin_read on public.training_exam_questions for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin'));
create policy exam_assignments_read on public.training_exam_assignments for select to authenticated using (
  training_private.can_read_host(host_id));
create policy exam_attempts_read on public.training_exam_attempts for select to authenticated using (
  exists(select 1 from public.training_exam_assignments a where a.id=assignment_id));
create policy events_admin_read on public.training_events for select to authenticated using (
  (select training_private.current_role()) in ('superadmin','subadmin'));
-- No policies on private secrets or identity tables: client access denied.

-- Foreign keys used by scoped reads: index all potentially large child collections.
create index training_updates_enrollment_idx on public.training_update_history(enrollment_id);
create index training_evidence_enrollment_idx on public.training_evidence(enrollment_id);
create index training_evidence_session_idx on public.training_evidence(session_id);
create index training_assessments_enrollment_idx on public.training_assessments(enrollment_id);
create index training_approvals_evidence_idx on public.training_approvals(evidence_id);
create index training_approvals_assessment_idx on public.training_approvals(assessment_id);
create index training_exam_assignments_host_idx on public.training_exam_assignments(host_id);
create index training_exam_assignments_enrollment_idx on public.training_exam_assignments(enrollment_id);
create index training_events_enrollment_idx on public.training_events(enrollment_id,created_at);


create table training_private.local_sessions (
 token_hash text primary key,auth_user_id uuid not null references auth.users(id),
 expires_at timestamptz not null,revoked_at timestamptz
);
create table training_private.local_material_content (
 material_id uuid primary key references public.training_materials(id),body text not null
);
create table training_private.local_evidence_content (
 evidence_id uuid primary key references public.training_evidence(id),body text not null
);
alter table training_private.local_sessions enable row level security;
alter table training_private.local_material_content enable row level security;
alter table training_private.local_evidence_content enable row level security;
revoke all on training_private.local_sessions,training_private.local_material_content,training_private.local_evidence_content from public,anon,authenticated;
grant select,insert,update,delete on training_private.local_sessions,training_private.local_material_content,training_private.local_evidence_content to service_role;
commit;

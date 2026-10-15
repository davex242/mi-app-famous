-- Preview only. Apply after inspecting existing policies; no host assignment changes.
begin;
create or replace function training_private.can_read_enrollment(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.training_enrollments e
    join training_private.training_principals p on p.auth_user_id=(select auth.uid())
    where e.id=target and p.is_active and (select auth.uid()) is not null
      and (p.role in ('superadmin','subadmin') or e.recruiter_id=p.app_user_id)
  )
$$;
revoke all on function training_private.can_read_enrollment(uuid) from public,anon;
grant execute on function training_private.can_read_enrollment(uuid) to authenticated;
drop policy if exists enrollments_read on public.training_enrollments;
create policy enrollments_read on public.training_enrollments for select to authenticated
  using (training_private.can_read_enrollment(id));
drop policy if exists exam_assignments_read on public.training_exam_assignments;
create policy exam_assignments_read on public.training_exam_assignments for select to authenticated
  using (training_private.can_read_enrollment(enrollment_id));
drop index if exists public.training_one_active_enrollment_idx;
create unique index training_one_active_enrollment_idx on public.training_enrollments(host_id,program_version_id)
  where status in ('active','paused','completed') and not is_free_training;
alter table public.training_exam_versions drop constraint if exists training_exam_versions_question_count_check;
alter table public.training_exam_versions add constraint training_exam_versions_question_count_check check(question_count in (10,25,50));
alter table public.training_exam_versions alter column question_count set default 25;
commit;

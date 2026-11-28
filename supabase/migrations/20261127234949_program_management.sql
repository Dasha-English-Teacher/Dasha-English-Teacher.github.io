-- Optional modules and enrollment-specific lesson release.
begin;

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  emoji text not null default '📘',
  color text not null default '#1f4fd1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  published boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (course_id, id)
);
create index if not exists course_modules_order_idx on public.course_modules(course_id, sort);

alter table public.lessons add column if not exists module_id uuid;
alter table public.enrollments add column if not exists access_mode text not null default 'full'
  check (access_mode in ('full', 'selected'));

do $$
begin
  if not exists (select from pg_constraint where conrelid = 'public.lessons'::regclass and conname = 'lessons_course_module_fkey') then
    alter table public.lessons add constraint lessons_course_module_fkey
      foreign key (course_id, module_id) references public.course_modules(course_id, id) on delete set null (module_id);
  end if;
  if not exists (select from pg_constraint where conrelid = 'public.lessons'::regclass and conname = 'lessons_course_id_key') then
    alter table public.lessons add constraint lessons_course_id_key unique (course_id, id);
  end if;
end $$;
create index if not exists lessons_module_idx on public.lessons(course_id, module_id, sort) where module_id is not null;

create table if not exists public.lesson_assignments (
  course_id uuid not null,
  student_id uuid not null,
  lesson_id uuid not null,
  available_at timestamptz,
  prerequisite_lesson_id uuid,
  primary key (course_id, student_id, lesson_id),
  foreign key (course_id, student_id) references public.enrollments(course_id, student_id) on delete cascade,
  foreign key (course_id, lesson_id) references public.lessons(course_id, id) on delete cascade,
  foreign key (course_id, prerequisite_lesson_id) references public.lessons(course_id, id) deferrable initially deferred,
  check (prerequisite_lesson_id is distinct from lesson_id),
  check (available_at is null or prerequisite_lesson_id is null)
);
create index if not exists lesson_assignments_lesson_idx on public.lesson_assignments(course_id, lesson_id);
create index if not exists lesson_assignments_prerequisite_idx on public.lesson_assignments(course_id, prerequisite_lesson_id)
  where prerequisite_lesson_id is not null;
create index if not exists lesson_assignments_student_idx on public.lesson_assignments(student_id);
create index if not exists attempts_completed_section_idx on public.attempts(student_id, material_id) where status = 'completed';

alter table public.course_modules enable row level security;
alter table public.lesson_assignments enable row level security;
revoke all on public.course_modules, public.lesson_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.course_modules to authenticated;
grant select on public.lesson_assignments to authenticated;

drop policy if exists "modules: teacher manages" on public.course_modules;
create policy "modules: teacher manages" on public.course_modules for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists "assignments: read own or teacher" on public.lesson_assignments;
create policy "assignments: read own or teacher" on public.lesson_assignments for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_teacher()));

create or replace function story_private.lesson_complete(p_lesson uuid, p_student uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select from public.materials where lesson_id = p_lesson)
    and not exists (
      select from public.materials m
      where m.lesson_id = p_lesson
        and (m.kind = 'exercise' or not exists (
          select from public.materials ex where ex.lesson_id = p_lesson and ex.kind = 'exercise'
        ))
        and not exists (
          select from public.attempts a where a.student_id = p_student and a.material_id = m.id and a.status = 'completed'
        )
    );
$$;
revoke all on function story_private.lesson_complete(uuid, uuid) from public, anon, authenticated;

create or replace function story_private.lesson_published(p_lesson uuid, p_course uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select from public.lessons l left join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson and l.course_id = p_course and l.published and (l.module_id is null or m.published)
  );
$$;
revoke all on function story_private.lesson_published(uuid, uuid) from public, anon, authenticated;

create or replace function story_private.path_open(p_lesson uuid, p_course uuid, p_rules jsonb, p_seen uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_lesson = any(p_seen) or not story_private.lesson_published(p_lesson, p_course) then
    return false;
  end if;

  -- Completion links converge: one reachable, fully completed source is enough.
  if exists (select 1 from jsonb_each(p_rules) r where r.value->>'complete' = p_lesson::text)
    and not exists (
      select 1 from jsonb_each(p_rules) r
      join public.materials marker on marker.id::text = r.key
      where r.value->>'complete' = p_lesson::text
        and story_private.path_open(marker.lesson_id, p_course, p_rules, p_seen || p_lesson)
        and not exists (
          select 1 from public.materials needed
          where needed.lesson_id = marker.lesson_id and not exists (
            select 1 from public.attempts a
            where a.material_id = needed.id and a.student_id = (select auth.uid())
              and a.status = 'completed'
          )
        )
    ) then return false; end if;

  return not exists (
    select 1 from jsonb_each(p_rules) rule
    where exists (
      select 1 from jsonb_each(rule.value->'options') opt where opt.value->>'lesson' = p_lesson::text
    ) and not exists (
      select 1 from public.story_decisions d
      join public.materials m on m.id = d.material_id
      where d.student_id = (select auth.uid()) and d.course_id = p_course
        and d.material_id::text = rule.key
        and rule.value->'options'->d.choice->>'lesson' = p_lesson::text
        and story_private.path_open(m.lesson_id, p_course, p_rules, p_seen || p_lesson)
    )
  );
end $$;
revoke all on function story_private.path_open(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;

create or replace function public.can_see_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_teacher() or exists (
    select from public.lessons l
    join public.courses c on c.id = l.course_id
    join public.enrollments e on e.course_id = c.id and e.student_id = (select auth.uid())
    where l.id = p_lesson and public.can_see_course(c.id)
      and story_private.path_open(l.id, c.id, c.story_rules, '{}'::uuid[])
      and (e.access_mode = 'full' or (c.story_rules = '{}' and exists (
        select from public.lesson_assignments a
        where a.course_id = c.id and a.student_id = e.student_id and a.lesson_id = l.id
          and (a.available_at is null or a.available_at <= now())
          and (a.prerequisite_lesson_id is null or story_private.lesson_complete(a.prerequisite_lesson_id, e.student_id))
      )))
  );
$$;

-- Upcoming lessons expose a title and release status; sections still require can_see_lesson.
-- Return one JSON value to avoid silently truncating the dashboard at the API row limit.
create or replace function public.lesson_catalog(p_course uuid, p_student uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'module_id', l.module_id, 'title', l.title, 'sort', l.sort,
    'available_at', a.available_at, 'prerequisite_lesson_id', a.prerequisite_lesson_id,
    'completed', story_private.lesson_complete(l.id, e.student_id),
    'state', case
      when e.access_mode = 'selected' and a.lesson_id is null then 'unassigned'
      when not (c.published and p.status = 'active' and story_private.lesson_published(l.id, c.id)) then 'hidden'
      when a.available_at > now() then 'scheduled'
      when a.prerequisite_lesson_id is not null and not story_private.lesson_complete(a.prerequisite_lesson_id, e.student_id) then 'waiting'
      else 'available'
    end
  ) order by l.sort, l.created_at, l.id), '[]'::jsonb)
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  join public.profiles p on p.id = e.student_id
  join public.lessons l on l.course_id = c.id
  left join public.lesson_assignments a on a.course_id = c.id and a.student_id = e.student_id
    and a.lesson_id = l.id and e.access_mode = 'selected'
  where c.id = p_course and e.student_id = p_student
    and (
      public.is_teacher() or (
        (e.access_mode = 'full' or a.lesson_id is not null) and
        p_student = (select auth.uid()) and public.can_see_course(c.id)
        and story_private.lesson_published(l.id, c.id)
        and story_private.path_open(l.id, c.id, c.story_rules, '{}'::uuid[])
        and (e.access_mode = 'full' or c.story_rules = '{}')
      )
    );
$$;
revoke all on function public.lesson_catalog(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lesson_catalog(uuid, uuid) to authenticated;

create or replace function public.can_see_module(p_module uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.course_modules m
    join public.enrollments e on e.course_id = m.course_id and e.student_id = (select auth.uid())
    where m.id = p_module and m.published and public.can_see_course(m.course_id)
      and (e.access_mode = 'full' or exists (
        select from public.lessons l join public.lesson_assignments a on a.course_id = l.course_id and a.lesson_id = l.id
        where l.module_id = m.id and l.published and a.student_id = e.student_id
      ))
  );
$$;
revoke all on function public.can_see_module(uuid) from public, anon, authenticated;
grant execute on function public.can_see_module(uuid) to authenticated;

drop policy if exists "modules: read published if enrolled" on public.course_modules;
create policy "modules: read published if enrolled" on public.course_modules for select to authenticated
  using (public.can_see_module(id));

-- Prevent selective access on story programs in either order of configuration.
create or replace function story_private.check_enrollment_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.access_mode = 'selected' then
    perform 1 from public.courses where id = new.course_id for update;
    if exists (select from public.courses where id = new.course_id and story_rules <> '{}') then
      raise exception 'Story programs require Full access to preserve their routes.';
    end if;
  end if;
  return new;
end $$;
revoke all on function story_private.check_enrollment_access() from public, anon, authenticated;
drop trigger if exists check_enrollment_access on public.enrollments;
create trigger check_enrollment_access before insert or update of access_mode, course_id on public.enrollments
  for each row execute function story_private.check_enrollment_access();

create or replace function story_private.check_story_enrollments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.story_rules <> '{}' and exists (
    select from public.enrollments where course_id = new.id and access_mode = 'selected'
  ) then
    raise exception 'Switch all enrollments to Full access before enabling a story.';
  end if;
  return new;
end $$;
revoke all on function story_private.check_story_enrollments() from public, anon, authenticated;
drop trigger if exists check_story_enrollments on public.courses;
create trigger check_story_enrollments before update of story_rules on public.courses
  for each row execute function story_private.check_story_enrollments();

-- One transaction for a profile edit or bulk assignment. Existing assignments
-- retain their release settings unless explicitly removed or edited.
create or replace function public.change_lesson_access(
  p_course uuid, p_students uuid[], p_add uuid[], p_remove uuid[],
  p_expected text, p_mode text, p_available_at timestamptz, p_prerequisite uuid,
  p_replace_release boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  enrollment public.enrollments%rowtype;
  rules jsonb;
begin
  if not public.is_teacher() then raise exception 'Only the teacher can manage lesson access.'; end if;
  select story_rules into strict rules from public.courses where id = p_course for update;
  if p_students is null or p_add is null or p_remove is null
    or (p_mode is not null and (p_mode not in ('full','selected') or cardinality(p_students) is distinct from 1 or p_expected is null))
    or (p_available_at is not null and p_prerequisite is not null)
    or (p_prerequisite is not null and p_prerequisite = any(p_add))
    or (p_replace_release and (cardinality(p_students) is distinct from 1 or cardinality(p_add) is distinct from 1 or p_expected is distinct from 'selected' or p_mode is not null))
    or (p_expected is null and cardinality(p_remove) > 0) then
    raise exception 'Choose a valid access mode and release condition.';
  end if;
  if exists (
    select from unnest(p_add || p_remove) requested(id)
    where not exists (select from public.lessons l where l.id = requested.id and l.course_id = p_course)
  ) then raise exception 'A lesson no longer belongs to this program. Reload and try again.'; end if;
  if exists (
    select from unnest(p_students) requested(id)
    where not exists (select from public.enrollments e where e.course_id = p_course and e.student_id = requested.id)
  ) then raise exception 'An enrollment changed. Reload and try again.'; end if;

  -- Freeze publication while checking a confirmed Full-to-Selected preview.
  if p_expected = 'full' and p_mode = 'selected' then
    perform 1 from public.course_modules where course_id = p_course order by id for share;
    perform 1 from public.lessons where course_id = p_course order by id for share;
  end if;

  for enrollment in
    select * from public.enrollments where course_id = p_course and student_id = any(p_students)
    order by student_id for update
  loop
    if p_expected is not null and enrollment.access_mode <> p_expected then
      raise exception 'The access mode changed. Reopen Manage access and try again.';
    end if;
    if p_mode = 'selected' and rules <> '{}' then
      raise exception 'Story programs require Full access to preserve their routes.';
    end if;
    if p_mode = 'selected' and enrollment.access_mode = 'full' and exists (
      select from public.lessons l
      join public.courses c on c.id = l.course_id
      join public.profiles p on p.id = enrollment.student_id
      where c.id = p_course and c.published and p.status = 'active'
        and story_private.lesson_published(l.id, p_course)
        and not (l.id = any(p_add || p_remove))
    ) then raise exception 'Published lessons changed. Reopen Manage access and confirm the current list.'; end if;
    if p_mode is not null and p_mode <> enrollment.access_mode then
      delete from public.lesson_assignments a where a.course_id = p_course and a.student_id = enrollment.student_id;
      update public.enrollments set access_mode = p_mode where course_id = p_course and student_id = enrollment.student_id;
    end if;
    if coalesce(p_mode, enrollment.access_mode) = 'full' then continue; end if;

    delete from public.lesson_assignments a
    where a.course_id = p_course and a.student_id = enrollment.student_id and a.lesson_id = any(p_remove);

    if p_prerequisite is not null and not exists (
      select from public.lesson_assignments a
      where a.course_id = p_course and a.student_id = enrollment.student_id and a.lesson_id = p_prerequisite
      union all
      select from public.lessons l where l.course_id = p_course and l.id = p_prerequisite
        and story_private.lesson_complete(l.id, enrollment.student_id)
    ) then raise exception 'Assign the prerequisite to each selected student first.'; end if;

    if p_replace_release and not exists (
      select from public.lesson_assignments a where a.course_id = p_course
        and a.student_id = enrollment.student_id and a.lesson_id = p_add[1]
    ) then raise exception 'The assignment was removed. Reopen Manage access and try again.'; end if;

    insert into public.lesson_assignments
      (course_id, student_id, lesson_id, available_at, prerequisite_lesson_id)
    select p_course, enrollment.student_id, item.id, p_available_at, p_prerequisite
    from (select distinct id from unnest(p_add) as requested(id)) item
    on conflict (course_id, student_id, lesson_id) do update
      set available_at = excluded.available_at, prerequisite_lesson_id = excluded.prerequisite_lesson_id
      where p_replace_release;

    if exists (
      with recursive chain(lesson_id) as (
        select p_prerequisite where p_prerequisite is not null
        union
        select a.prerequisite_lesson_id from chain
        join public.lesson_assignments a on a.lesson_id = chain.lesson_id
          and a.course_id = p_course and a.student_id = enrollment.student_id
        where a.prerequisite_lesson_id is not null
      )
      select from chain where lesson_id = any(p_add)
        and exists (
          select from public.lesson_assignments a where a.course_id = p_course
            and a.student_id = enrollment.student_id and a.lesson_id = chain.lesson_id
            and a.prerequisite_lesson_id = p_prerequisite
        )
    ) then raise exception 'These prerequisites would create a circular release rule.'; end if;
  end loop;
end $$;
revoke all on function public.change_lesson_access(uuid, uuid[], uuid[], uuid[], text, text, timestamptz, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.change_lesson_access(uuid, uuid[], uuid[], uuid[], text, text, timestamptz, uuid, boolean)
  to authenticated;

-- Historical attempts remain readable. After access closes, students can
-- acknowledge feedback, but cannot keep submitting work on the closed lesson.
create or replace function story_private.check_attempt_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or public.is_teacher() then return new; end if;
  if new.material_id is not null and exists (
    select from public.materials m where m.id = new.material_id and public.can_see_lesson(m.lesson_id)
  ) then return new; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'feedback_seen') = (to_jsonb(old) - 'updated_at' - 'feedback_seen') then
    return new;
  end if;
  raise exception 'This lesson is no longer available.' using errcode = '42501';
end $$;
revoke all on function story_private.check_attempt_access() from public, anon, authenticated;
drop trigger if exists zz_check_attempt_access on public.attempts;
create trigger zz_check_attempt_access before insert or update on public.attempts
  for each row execute function story_private.check_attempt_access();

-- Access-mode transitions must go through the same transaction as assignments.
revoke insert, update on public.enrollments from public, anon, authenticated;
grant insert (course_id, student_id) on public.enrollments to authenticated;

create or replace function public.import_program_lesson(p_lesson jsonb, p_materials jsonb)
returns public.lessons language plpgsql set search_path = '' as $$
declare
  lesson public.lessons;
  draft public.lessons := jsonb_populate_record(null::public.lessons, p_lesson);
begin
  if not public.is_teacher() then raise exception 'Only the teacher can import a lesson.'; end if;
  insert into public.lessons(course_id, module_id, title, description, published, sort)
  values (draft.course_id, draft.module_id, draft.title, draft.description, draft.published, draft.sort)
  returning * into lesson;
  insert into public.materials(lesson_id, kind, title, url, body, sort)
  select lesson.id, m.kind, m.title, m.url, m.body, m.sort
  from jsonb_to_recordset(p_materials) m(kind text, title text, url text, body text, sort integer);
  return lesson;
end $$;
revoke all on function public.import_program_lesson(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_program_lesson(jsonb, jsonb) to authenticated;

create or replace function public.reorder_program_items(p_course uuid, p_module uuid, p_ids uuid[], p_modules boolean)
returns void language plpgsql set search_path = '' as $$
declare
  actual uuid[];
begin
  if not public.is_teacher() then raise exception 'Only the teacher can reorder items.'; end if;
  perform 1 from public.courses where id = p_course for update;
  if p_modules then
    select array_agg(id) into actual from public.course_modules where course_id = p_course;
  else
    select array_agg(id) into actual from public.lessons where course_id = p_course and module_id is not distinct from p_module;
  end if;
  if cardinality(coalesce(actual, '{}')) is distinct from cardinality(p_ids) or not actual <@ p_ids then
    raise exception 'The list changed. Reload before reordering.';
  end if;
  if p_modules then
    update public.course_modules m set sort = item.position - 1
    from unnest(p_ids) with ordinality item(id, position)
    where m.id = item.id and m.course_id = p_course;
  else
    update public.lessons l set sort = item.position - 1
    from unnest(p_ids) with ordinality item(id, position)
    where l.id = item.id and l.course_id = p_course and l.module_id is not distinct from p_module;
  end if;
end $$;
revoke all on function public.reorder_program_items(uuid, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.reorder_program_items(uuid, uuid, uuid[], boolean) to authenticated;

commit;

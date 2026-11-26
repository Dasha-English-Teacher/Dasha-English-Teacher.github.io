begin;

-- Branch rules are keyed by the section UUID. Each option has a stable key,
-- label and optional destination lesson. Only the teacher edits course rules.
alter table public.courses add column if not exists story_rules jsonb not null default '{}';

create table if not exists public.story_decisions (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null,
  choice text not null,
  predictions jsonb not null default '{}',
  confirmed_at timestamptz not null default now(),
  primary key (course_id, student_id, material_id),
  check (jsonb_typeof(predictions) = 'object' and octet_length(predictions::text) <= 2048)
);
create index if not exists story_decisions_student_idx on public.story_decisions(student_id);
alter table public.story_decisions enable row level security;
revoke all on public.story_decisions from public, anon, authenticated;
grant select, delete on public.story_decisions to authenticated;
grant insert (course_id, student_id, material_id, choice, predictions) on public.story_decisions to authenticated;

create schema if not exists story_private;

-- Read the underlying lessons without recursing through their RLS policy.
-- Each gate requires a matching decision and an accessible source chapter.
create or replace function story_private.path_open(p_lesson uuid, p_course uuid, p_rules jsonb, p_seen uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_lesson = any(p_seen) or not exists (
    select 1 from public.lessons where id = p_lesson and course_id = p_course and published
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
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = p_lesson and l.published and public.can_see_course(c.id)
      and story_private.path_open(l.id, c.id, c.story_rules, '{}'::uuid[])
  );
$$;

drop policy if exists "story: read own or teacher" on public.story_decisions;
create policy "story: read own or teacher" on public.story_decisions for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_teacher()));

drop policy if exists "story: confirm own choice" on public.story_decisions;
create policy "story: confirm own choice" on public.story_decisions for insert to authenticated
  with check (
    student_id = (select auth.uid()) and not (select public.is_teacher())
    and exists (
      select 1 from public.materials m
      join public.lessons l on l.id = m.lesson_id
      join public.courses c on c.id = l.course_id
      where m.id = story_decisions.material_id and c.id = story_decisions.course_id
        and (c.story_rules->m.id::text->'options') ? story_decisions.choice
    )
  );

drop policy if exists "story: teacher resets choices" on public.story_decisions;
create policy "story: teacher resets choices" on public.story_decisions for delete to authenticated
  using ((select public.is_teacher()));

commit;

begin;

create or replace function story_private.path_open(p_lesson uuid, p_course uuid, p_rules jsonb, p_seen uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_lesson = any(p_seen) or not exists (
    select 1 from public.lessons where id = p_lesson and course_id = p_course and published
  ) then return false; end if;

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

commit;

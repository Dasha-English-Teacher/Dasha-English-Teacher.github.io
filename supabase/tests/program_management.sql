-- Run only against a disposable local database after applying schema.sql.
-- Exercises real authenticated-role RLS and rolls back all sample rows.
begin;

create function public.program_test_id(n integer) returns uuid
language sql immutable as $$ select ('ba8e5800-3700-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function public.program_test_assert(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%', message; end if; end $$;

insert into auth.users(id, email, raw_user_meta_data)
select public.program_test_id(id), 'program-fixture-' || id || '@example.test', '{}'::jsonb
from generate_series(1, 4) id;
set local role authenticated;
select set_config('request.jwt.claim.sub', public.program_test_id(1)::text, true);
update public.profiles set status = 'active'
where id in (select public.program_test_id(id) from generate_series(1, 4) id);
insert into public.courses(id, title) values (public.program_test_id(10), 'Program fixture'), (public.program_test_id(11), 'Story fixture');
insert into public.course_modules(id, course_id, title, sort) values
  (public.program_test_id(20), public.program_test_id(10), 'Module A', 0),
  (public.program_test_id(21), public.program_test_id(10), 'Module B', 1);
insert into public.lessons(id, course_id, module_id, title, sort)
select public.program_test_id(id), public.program_test_id(case when id < 36 then 10 else 11 end),
  case when id in (30, 32, 33) then public.program_test_id(20) when id = 34 then public.program_test_id(21) end,
  'Lesson ' || id, id - 30
from generate_series(30, 37) id;
insert into public.materials(id, lesson_id, title, url)
select public.program_test_id(id + 10), public.program_test_id(id), 'Exercise ' || id, 'https://example.test/fixture/' || id
from generate_series(30, 37) id;
update public.courses set story_rules = jsonb_build_object(public.program_test_id(46)::text,
  jsonb_build_object('options', jsonb_build_object('go', jsonb_build_object('lesson', public.program_test_id(37)))))
where id = public.program_test_id(11);
insert into public.enrollments(course_id, student_id)
select public.program_test_id(course), public.program_test_id(student)
from (values (10, 2), (10, 3), (10, 4), (11, 2)) sample(course, student)
on conflict (course_id, student_id) do nothing;
select public.program_test_assert((select bool_and(access_mode = 'full') from public.enrollments
  where course_id in (public.program_test_id(10), public.program_test_id(11))), 'Enrollment defaults to Full access');

select public.reorder_program_items(public.program_test_id(10), null, array[public.program_test_id(21), public.program_test_id(20)], true);
select public.program_test_assert((select sort = 0 from public.course_modules where id = public.program_test_id(21)), 'Module order');
select public.reorder_program_items(public.program_test_id(10), public.program_test_id(20),
  array[public.program_test_id(32), public.program_test_id(30), public.program_test_id(33)], false);
select public.program_test_assert((select sort = 0 from public.lessons where id = public.program_test_id(32)), 'Lesson order');
select public.import_program_lesson(
  jsonb_build_object('course_id', public.program_test_id(10), 'module_id', public.program_test_id(21),
    'title', 'Imported fixture', 'published', false, 'description', '', 'sort', 2),
  '[{"kind":"exercise","title":"Imported section","url":"https://example.test/import","body":"","sort":0}]'
);
select public.program_test_assert(exists (select from public.lessons l join public.materials m on m.lesson_id = l.id
  where l.module_id = public.program_test_id(21) and m.title = 'Imported section'), 'Atomic module import');

select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)], array[public.program_test_id(30)],
  array[public.program_test_id(31), public.program_test_id(32), public.program_test_id(33), public.program_test_id(34), public.program_test_id(35)],
  'full', 'selected', null, null);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(3)], array[public.program_test_id(31)],
  array[public.program_test_id(30), public.program_test_id(32), public.program_test_id(33), public.program_test_id(34), public.program_test_id(35)],
  'full', 'selected', null, null);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2), public.program_test_id(3), public.program_test_id(4)],
  array[public.program_test_id(32)], '{}', null, null, now() + interval '1 hour', null);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
  array[public.program_test_id(32)], '{}', null, null, null, null);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
  array[public.program_test_id(33)], '{}', null, null, null, public.program_test_id(30));
do $$
begin
  begin
    perform public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(4)],
      '{}', '{}', 'full', 'selected', null, null);
    raise exception 'Unreviewed revocations should have failed' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm not like '%confirm the current list%' then raise; end if;
  end;
  begin
    perform public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
      array[public.program_test_id(30)], '{}', 'selected', null, null, public.program_test_id(33), true);
    raise exception 'Cycle should have failed' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm not like '%circular%' then raise; end if;
  end;
  begin
    perform public.change_lesson_access(public.program_test_id(11), array[public.program_test_id(2)],
      array[public.program_test_id(36)], '{}', 'full', 'selected', null, null);
    raise exception 'Story mode should have failed' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm not like '%Story programs%' then raise; end if;
  end;
  begin
    update public.courses set story_rules = '{"new": {}}' where id = public.program_test_id(10);
    raise exception 'Enabling a story with selected enrollments should have failed' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm not like '%Full access%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', public.program_test_id(2)::text, true);
select public.program_test_assert((select count(*) = 1 from public.lessons where course_id = public.program_test_id(10)), 'Only released assigned lesson is visible');
select public.program_test_assert((select count(*) = 1 from public.course_modules where course_id = public.program_test_id(10)), 'Module with no assigned work is hidden');
select public.program_test_assert((select count(*) = 3 from public.lesson_assignments), 'Assignment rows belong to the current student');
select public.program_test_assert((select count(*) = 0 from public.materials where id in (public.program_test_id(41), public.program_test_id(42), public.program_test_id(43))), 'Direct section reads are filtered');
select public.program_test_assert(jsonb_array_length(public.lesson_catalog(public.program_test_id(10), public.program_test_id(3))) = 0, 'Catalog cannot read another student');
select public.program_test_assert((select count(*) = 3 from jsonb_array_elements(public.lesson_catalog(public.program_test_id(10), public.program_test_id(2)))), 'Upcoming lessons count toward progress');
select public.program_test_assert((select count(*) = 2 from jsonb_array_elements(public.lesson_catalog(public.program_test_id(10), public.program_test_id(2))) row
  where row->>'state' in ('scheduled', 'waiting')), 'Reassigning an existing lesson keeps its schedule');
do $$
begin
  begin
    insert into public.attempts(material_id) values (public.program_test_id(42));
    raise exception 'Future attempts must fail' using errcode = 'XX000';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.story_decisions(course_id, student_id, material_id, choice) values
      (public.program_test_id(11), public.program_test_id(2), public.program_test_id(47), 'go');
    raise exception 'Invalid story choice must fail' using errcode = 'XX000';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
      array[public.program_test_id(31)], '{}', null, null, null, null);
    raise exception 'Student must not manage access' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm not like '%Only the teacher%' then raise; end if;
  end;
end $$;
insert into public.attempts(id, material_id, status, score, max_score, answers)
values (public.program_test_id(50), public.program_test_id(40), 'completed', 3, 4, '[{"a":"saved"}]');
select public.program_test_assert(public.can_see_lesson(public.program_test_id(33)), 'Completion unlocks prerequisite lesson');
select public.program_test_assert(not public.can_see_lesson(public.program_test_id(37)), 'Story route is gated');
insert into public.story_decisions(course_id, student_id, material_id, choice)
values (public.program_test_id(11), public.program_test_id(2), public.program_test_id(46), 'go');
select public.program_test_assert(public.can_see_lesson(public.program_test_id(37)), 'Confirmed decision opens the route');

select set_config('request.jwt.claim.sub', public.program_test_id(3)::text, true);
select public.program_test_assert(public.can_see_lesson(public.program_test_id(31)) and not public.can_see_lesson(public.program_test_id(30)),
  'Student assignments differ in the same program');
select set_config('request.jwt.claim.sub', public.program_test_id(4)::text, true);
select public.program_test_assert(public.can_see_lesson(public.program_test_id(32))
  and not exists (select from public.lesson_assignments where student_id = public.program_test_id(4)), 'Bulk assignment leaves Full access unchanged');

select set_config('request.jwt.claim.sub', public.program_test_id(1)::text, true);
update public.attempts set feedback = 'Saved feedback' where id = public.program_test_id(50);
update public.lessons set module_id = public.program_test_id(21) where id = public.program_test_id(30);
update public.course_modules set published = false where id = public.program_test_id(21);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
  array[public.program_test_id(32)], '{}', 'selected', null, now() - interval '1 minute', null, true);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
  '{}', array[public.program_test_id(30)], 'selected', 'selected', null, null);
select set_config('request.jwt.claim.sub', public.program_test_id(2)::text, true);
select public.program_test_assert(not public.can_see_lesson(public.program_test_id(30)), 'Revoked lesson is inaccessible');
select public.program_test_assert(public.can_see_lesson(public.program_test_id(32)), 'Past schedule releases without client permission changes');
do $$
begin
  begin
    update public.attempts set score = 0 where id = public.program_test_id(50);
    raise exception 'Revoked attempts must reject new submissions' using errcode = 'XX000';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.attempts set feedback_seen = true where id = public.program_test_id(50);
select public.program_test_assert(exists (select from public.attempts where id = public.program_test_id(50) and status = 'completed'
  and score = 3 and answers = '[{"a":"saved"}]' and feedback = 'Saved feedback' and feedback_seen), 'Results and feedback survive revocation');

select set_config('request.jwt.claim.sub', public.program_test_id(1)::text, true);
select public.change_lesson_access(public.program_test_id(10), array[public.program_test_id(2)],
  array[public.program_test_id(30)], '{}', 'selected', 'selected', null, null);
select set_config('request.jwt.claim.sub', public.program_test_id(2)::text, true);
select public.program_test_assert(not public.can_see_lesson(public.program_test_id(30)), 'Draft module hides assigned lesson');
select set_config('request.jwt.claim.sub', public.program_test_id(1)::text, true);
delete from public.course_modules where id = public.program_test_id(21);
select set_config('request.jwt.claim.sub', public.program_test_id(2)::text, true);
select public.program_test_assert((select module_id is null from public.lessons where id = public.program_test_id(30)), 'Module removal ungroups lessons');
select public.program_test_assert((select url = 'https://example.test/fixture/30' from public.materials where id = public.program_test_id(40)),
  'Moving or ungrouping keeps the section and URL');
select public.program_test_assert((select (row->>'completed')::boolean from jsonb_array_elements(
  public.lesson_catalog(public.program_test_id(10), public.program_test_id(2))) row where row->>'id' = public.program_test_id(30)::text),
  'Restoring access restores progress');

set constraints all immediate;
rollback;

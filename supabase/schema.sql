-- =====================================================================
--  English studio website: database setup for Supabase
--  How to use: Supabase dashboard -> SQL Editor -> New query ->
--  paste this whole file -> Run. It is safe to run it again later
--  (it updates functions and rules, and keeps your data).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- One row per person who has an account (teacher or student).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'student' check (role in ('teacher','student')),
  status      text not null default 'pending' check (status in ('pending','active','paused','archived')),
  level       text not null default '',
  phone       text not null default '',
  goals       text not null default '',
  created_at  timestamptz not null default now()
);

-- Classes (courses). A student sees a class only when enrolled in it.
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  emoji       text not null default '📘',
  color       text not null default '#1f4fd1',
  level       text not null default '',
  published   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  published   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lessons_course_idx on public.lessons(course_id, sort);

-- Things inside a lesson: an HTML exercise, a video, a link or a text note.
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  kind        text not null default 'exercise' check (kind in ('exercise','video','link','text')),
  title       text not null check (char_length(title) between 1 and 300),
  url         text not null default '',
  body        text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists materials_lesson_idx on public.materials(lesson_id, sort);

-- Which student can open which class.
create table if not exists public.enrollments (
  course_id   uuid not null references public.courses(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, student_id)
);
create index if not exists enrollments_student_idx on public.enrollments(student_id);

-- Every time a student works on an exercise: score, answers, time, feedback.
create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  material_id    uuid references public.materials(id) on delete set null,
  material_title text not null default '',
  status         text not null default 'in_progress' check (status in ('in_progress','completed')),
  score          int,
  max_score      int,
  first_score    int,
  first_max      int,
  revealed       boolean not null default false,
  answers        jsonb not null default '[]'::jsonb,
  seconds        int not null default 0,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  feedback       text,
  feedback_at    timestamptz,
  feedback_seen  boolean not null default false,
  reviewed       boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index if not exists attempts_student_idx on public.attempts(student_id, started_at desc);
create index if not exists attempts_material_idx on public.attempts(material_id);

-- Scheduled lessons (the calendar).
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references public.profiles(id) on delete cascade,
  title       text not null default 'English lesson',
  starts_at   timestamptz not null,
  minutes     int not null default 60 check (minutes between 5 and 600),
  meeting_url text not null default '',
  note        text not null default '',
  status      text not null default 'scheduled' check (status in ('scheduled','done','cancelled','missed')),
  created_at  timestamptz not null default now()
);
create index if not exists sessions_time_idx on public.sessions(starts_at);
create index if not exists sessions_student_idx on public.sessions(student_id, starts_at);

-- Messages from people who want lessons (sent from the public website).
create table if not exists public.booking_requests (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  email           text not null check (char_length(email) between 3 and 200),
  contact         text not null default '' check (char_length(contact) <= 200),
  level           text not null default '' check (char_length(level) <= 100),
  preferred_times text not null default '' check (char_length(preferred_times) <= 1000),
  message         text not null default '' check (char_length(message) <= 3000),
  status          text not null default 'new' check (status in ('new','contacted','booked','closed')),
  created_at      timestamptz not null default now()
);

-- Invitation links the teacher sends to new students.
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
  email       text not null default '',
  full_name   text not null default '',
  course_ids  uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  used_by     uuid references public.profiles(id) on delete set null
);

-- Each student's personal word list.
create table if not exists public.words (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  term        text not null check (char_length(term) between 1 and 200),
  meaning     text not null default '',
  example     text not null default '',
  learned     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists words_student_idx on public.words(student_id, created_at desc);

-- The teacher's private notes about a student (students never see these).
create table if not exists public.teacher_notes (
  student_id  uuid primary key references public.profiles(id) on delete cascade,
  body        text not null default '',
  updated_at  timestamptz not null default now()
);

-- Website settings the teacher edits on the "Website" page.
create table if not exists public.site_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.site_settings (id, data) values (1, jsonb_build_object(
  'site_name', 'English with Dasha',
  'teacher_name', 'Dasha',
  'tagline', 'Online English lessons for adults who want to speak with confidence.',
  'about', 'I teach English online to adults, from everyday conversation to advanced C1 vocabulary and grammar. Every lesson comes with interactive exercises you can do between classes.',
  'booking_url', '',
  'notify_email', '',
  'notify_on_finish', true,
  'notify_on_request', true,
  'contact_text', '',
  'time_format', '12h',
  'exercise_repos', 'Dasha-English-Teacher/miro-exercises'
)) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Helper functions used by the security rules
-- ---------------------------------------------------------------------

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

create or replace function public.can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() or exists (
    select 1
    from public.courses c
    join public.enrollments e on e.course_id = c.id
    join public.profiles p on p.id = e.student_id
    where c.id = p_course and c.published
      and e.student_id = auth.uid() and p.status = 'active');
$$;

create or replace function public.can_see_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() or exists (
    select 1 from public.lessons l
    where l.id = p_lesson and l.published and public.can_see_course(l.course_id));
$$;

-- Lets the "join" page show who an invitation is for, without exposing other invites.
create or replace function public.invite_info(p_code text)
returns table (email text, full_name text)
language sql stable security definer set search_path = public as $$
  select i.email, i.full_name from public.invites i
  where i.code = p_code and i.used_at is null;
$$;

-- ---------------------------------------------------------------------
-- 3. Automatic actions (triggers)
-- ---------------------------------------------------------------------

-- When someone creates an account:
--   * the very first account becomes the teacher;
--   * an account made from an invitation link becomes an active student
--     and is added to the invited classes;
--   * any other account waits as "pending" until the teacher approves it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first  boolean;
  v_code   text;
  v_name   text;
  v_invite public.invites%rowtype;
begin
  select not exists (select 1 from public.profiles where role = 'teacher') into v_first;
  v_code := coalesce(new.raw_user_meta_data ->> 'invite_code', '');
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');

  if v_code <> '' then
    select * into v_invite from public.invites where code = v_code and used_at is null limit 1;
  end if;

  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(nullif(v_name, ''), v_invite.full_name, ''),
    case when v_first then 'teacher' else 'student' end,
    case when v_first or v_invite.id is not null then 'active' else 'pending' end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    insert into public.enrollments (course_id, student_id)
    select c, new.id from unnest(v_invite.course_ids) as c
    where exists (select 1 from public.courses where id = c)
    on conflict do nothing;
    update public.invites set used_at = now(), used_by = new.id where id = v_invite.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile e-mail in sync if a user changes it.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Students can edit their own name, level, phone and goals,
-- but not their role or status. Only the teacher can change those.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then
    new.id := old.id;
    new.role := old.role;
    new.status := old.status;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile();

-- Students save their own work, but only the teacher can write feedback.
create or replace function public.protect_attempt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then
    if tg_op = 'INSERT' then
      new.student_id := auth.uid();
      new.feedback := null;
      new.feedback_at := null;
      new.reviewed := false;
      new.feedback_seen := false;
    else
      new.student_id := old.student_id;
      new.material_id := old.material_id;
      new.feedback := old.feedback;
      new.feedback_at := old.feedback_at;
      new.reviewed := old.reviewed;
      new.started_at := old.started_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists protect_attempt on public.attempts;
create trigger protect_attempt
  before insert or update on public.attempts
  for each row execute function public.protect_attempt();

-- ---------------------------------------------------------------------
-- 4. Security rules (Row Level Security)
--    Students only ever see their own data and the classes they are in.
--    The teacher sees and controls everything.
-- ---------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.courses          enable row level security;
alter table public.lessons          enable row level security;
alter table public.materials        enable row level security;
alter table public.enrollments      enable row level security;
alter table public.attempts         enable row level security;
alter table public.sessions         enable row level security;
alter table public.booking_requests enable row level security;
alter table public.invites          enable row level security;
alter table public.words            enable row level security;
alter table public.teacher_notes    enable row level security;
alter table public.site_settings    enable row level security;

-- profiles
drop policy if exists "profiles: read own or teacher"   on public.profiles;
drop policy if exists "profiles: update own or teacher" on public.profiles;
drop policy if exists "profiles: teacher deletes"       on public.profiles;
create policy "profiles: read own or teacher"   on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher());
create policy "profiles: update own or teacher" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_teacher()) with check (id = auth.uid() or public.is_teacher());
create policy "profiles: teacher deletes"       on public.profiles for delete to authenticated
  using (public.is_teacher());

-- courses / lessons / materials
drop policy if exists "courses: read if allowed"    on public.courses;
drop policy if exists "courses: teacher writes"     on public.courses;
create policy "courses: read if allowed" on public.courses for select to authenticated
  using (public.can_see_course(id));
create policy "courses: teacher writes"  on public.courses for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "lessons: read if allowed"    on public.lessons;
drop policy if exists "lessons: teacher writes"     on public.lessons;
create policy "lessons: read if allowed" on public.lessons for select to authenticated
  using (public.can_see_lesson(id));
create policy "lessons: teacher writes"  on public.lessons for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "materials: read if allowed"  on public.materials;
drop policy if exists "materials: teacher writes"   on public.materials;
create policy "materials: read if allowed" on public.materials for select to authenticated
  using (public.can_see_lesson(lesson_id));
create policy "materials: teacher writes"  on public.materials for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- enrollments
drop policy if exists "enrollments: read own or teacher" on public.enrollments;
drop policy if exists "enrollments: teacher writes"      on public.enrollments;
create policy "enrollments: read own or teacher" on public.enrollments for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy "enrollments: teacher writes" on public.enrollments for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- attempts
drop policy if exists "attempts: read own or teacher"   on public.attempts;
drop policy if exists "attempts: insert own"            on public.attempts;
drop policy if exists "attempts: update own or teacher" on public.attempts;
drop policy if exists "attempts: teacher deletes"       on public.attempts;
create policy "attempts: read own or teacher" on public.attempts for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy "attempts: insert own" on public.attempts for insert to authenticated
  with check (
    (student_id = auth.uid() and (material_id is null or exists (
      select 1 from public.materials m where m.id = material_id and public.can_see_lesson(m.lesson_id))))
    or public.is_teacher());
create policy "attempts: update own or teacher" on public.attempts for update to authenticated
  using (student_id = auth.uid() or public.is_teacher())
  with check (student_id = auth.uid() or public.is_teacher());
create policy "attempts: teacher deletes" on public.attempts for delete to authenticated
  using (public.is_teacher());

-- sessions (schedule)
drop policy if exists "sessions: read own or teacher" on public.sessions;
drop policy if exists "sessions: teacher writes"      on public.sessions;
create policy "sessions: read own or teacher" on public.sessions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy "sessions: teacher writes" on public.sessions for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- booking requests: anyone can send one; only the teacher can read them
drop policy if exists "requests: anyone can send"   on public.booking_requests;
drop policy if exists "requests: teacher reads"     on public.booking_requests;
drop policy if exists "requests: teacher updates"   on public.booking_requests;
drop policy if exists "requests: teacher deletes"   on public.booking_requests;
create policy "requests: anyone can send" on public.booking_requests for insert to anon, authenticated
  with check (status = 'new');
create policy "requests: teacher reads"   on public.booking_requests for select to authenticated
  using (public.is_teacher());
create policy "requests: teacher updates" on public.booking_requests for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
create policy "requests: teacher deletes" on public.booking_requests for delete to authenticated
  using (public.is_teacher());

-- invites: teacher only
drop policy if exists "invites: teacher only" on public.invites;
create policy "invites: teacher only" on public.invites for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- words: own list, and the teacher can see and add to anyone's list
drop policy if exists "words: own or teacher" on public.words;
create policy "words: own or teacher" on public.words for all to authenticated
  using (student_id = auth.uid() or public.is_teacher())
  with check (student_id = auth.uid() or public.is_teacher());

-- teacher notes: teacher only
drop policy if exists "notes: teacher only" on public.teacher_notes;
create policy "notes: teacher only" on public.teacher_notes for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- site settings: everyone can read (the public page needs them); teacher edits
drop policy if exists "settings: everyone reads" on public.site_settings;
drop policy if exists "settings: teacher edits"  on public.site_settings;
create policy "settings: everyone reads" on public.site_settings for select to anon, authenticated
  using (true);
create policy "settings: teacher edits"  on public.site_settings for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- ---------------------------------------------------------------------
-- 5. Access for the website (Supabase "Data API" grants).
--    New Supabase projects require these explicitly. The security rules
--    above still decide which rows each person can see.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.site_settings to anon;
grant insert on public.booking_requests to anon;

grant select, insert, update, delete on
  public.profiles, public.courses, public.lessons, public.materials, public.enrollments,
  public.attempts, public.sessions, public.booking_requests, public.invites,
  public.words, public.teacher_notes
to authenticated;
grant select, update on public.site_settings to authenticated;

grant execute on function public.is_teacher()            to anon, authenticated;
grant execute on function public.can_see_course(uuid)    to anon, authenticated;
grant execute on function public.can_see_lesson(uuid)    to anon, authenticated;
grant execute on function public.invite_info(text)       to anon, authenticated;

-- Done. Next: create the teacher account on the website (the first account
-- becomes the teacher automatically).

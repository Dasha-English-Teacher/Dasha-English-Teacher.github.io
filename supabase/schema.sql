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

-- Money. Students pay in advance; each lesson held is taken from the balance.
-- Balance = all payments - all lessons held.
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(12,2) not null check (amount <> 0 and abs(amount) < 100000000),
  paid_on     date not null default current_date,
  method      text not null default 'kaspi' check (method in ('kaspi','cash','card','transfer','other','correction')),
  note        text not null default '' check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments(student_id, paid_on desc);

create table if not exists public.held_lessons (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  session_id  uuid unique references public.sessions(id) on delete set null,  -- the calendar lesson, if any
  lesson_id   uuid references public.lessons(id) on delete set null,          -- topic from a program, optional
  held_on     timestamptz not null default now(),
  minutes     int not null default 60 check (minutes between 5 and 600),
  price       numeric(12,2) not null default 0 check (price >= 0 and price < 100000000),
  title       text not null default 'English lesson' check (char_length(title) <= 200),
  note        text not null default '' check (char_length(note) <= 1000),
  status      text not null default 'held' check (status in ('held','missed')),
  created_at  timestamptz not null default now()
);
create index if not exists held_lessons_student_idx on public.held_lessons(student_id, held_on desc);

-- Emails to students: waiting ones and a log of sent ones.
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  to_name     text not null default '',
  student_id  uuid references public.profiles(id) on delete set null,
  kind        text not null,
  subject     text not null,
  html        text not null,
  text_body   text not null default '',
  dedupe_key  text unique,
  status      text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  tries       int not null default 0,
  request_id  bigint,
  provider_id text not null default '',
  error       text not null default '',
  created_at  timestamptz not null default now(),
  send_after  timestamptz not null default now(),
  last_try_at timestamptz,
  sent_at     timestamptz
);
create index if not exists email_outbox_status_idx on public.email_outbox(status, send_after);

-- Columns added after the first version (safe to run again).
alter table public.profiles add column if not exists lesson_price numeric(12,2) check (lesson_price is null or lesson_price >= 0);
alter table public.profiles add column if not exists email_notifications boolean not null default true;
alter table public.profiles add column if not exists timezone text not null default '';
alter table public.invites  add column if not exists send_email boolean not null default false;

-- New settings get their default values; settings already saved are kept.
update public.site_settings set data = jsonb_build_object(
  'site_url', 'https://dashaenglish.com/',
  'currency', 'KZT',
  'default_lesson_price', '',
  'kaspi_url', 'https://pay.kaspi.kz/pay/5rtd4cl9',
  'kaspi_qr', 'assets/kaspi-qr.png',
  'payment_note', '',
  'charge_missed', false,
  'emails_enabled', true,
  'email_from', 'English with Dasha <lessons@dashaenglish.com>',
  'email_reply_to', '',
  'email_reminder_hours', 24,
  'email_reminder2_hours', 1,
  'email_on_reminder', true,
  'email_on_schedule', true,
  'email_on_feedback', true,
  'email_on_program', true,
  'email_on_payment', true,
  'email_on_held', false,
  'email_on_low_balance', true,
  'email_on_welcome', true,
  'email_on_invite', true
) || data where id = 1;

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
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
    where l.id = p_lesson and l.published and public.can_see_course(c.id)
      and story_private.path_open(l.id, c.id, c.story_rules, '{}'::uuid[])
  );
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
    new.lesson_price := old.lesson_price;   -- only the teacher sets prices
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

-- ---------------------------------------------------------------------
-- 6. Balances: payments and lessons held
-- ---------------------------------------------------------------------

alter table public.payments     enable row level security;
alter table public.held_lessons enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists "payments: read own or teacher" on public.payments;
drop policy if exists "payments: teacher writes"      on public.payments;
create policy "payments: read own or teacher" on public.payments for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy "payments: teacher writes" on public.payments for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "held: read own or teacher" on public.held_lessons;
drop policy if exists "held: teacher writes"      on public.held_lessons;
create policy "held: read own or teacher" on public.held_lessons for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy "held: teacher writes" on public.held_lessons for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "emails: teacher reads"   on public.email_outbox;
drop policy if exists "emails: teacher deletes" on public.email_outbox;
create policy "emails: teacher reads"   on public.email_outbox for select to authenticated using (public.is_teacher());
create policy "emails: teacher deletes" on public.email_outbox for delete to authenticated using (public.is_teacher());

grant select, insert, update, delete on public.payments, public.held_lessons to authenticated;
grant select, delete on public.email_outbox to authenticated;

-- Settings, read safely (text, number, yes/no).
create or replace function public.setting(p_key text, p_default text default '')
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim((select data ->> p_key from public.site_settings where id = 1)), ''), p_default);
$$;

create or replace function public.setting_num(p_key text, p_default numeric default 0)
returns numeric language sql stable security definer set search_path = public as $$
  select case when public.setting(p_key, '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
              then btrim(public.setting(p_key, ''))::numeric else p_default end;
$$;

create or replace function public.setting_on(p_key text, p_default boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select case lower(public.setting(p_key, ''))
           when 'true' then true when 'on' then true when 'false' then false when 'off' then false
           else p_default end;
$$;

create or replace function public.student_price(p_student uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select lesson_price from public.profiles where id = p_student),
                  public.setting_num('default_lesson_price', 0));
$$;

create or replace function public.student_balance(p_student uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from public.payments where student_id = p_student), 0)
       - coalesce((select sum(price) from public.held_lessons where student_id = p_student), 0);
$$;

-- A lesson in the calendar marked as done (or missed, if missed lessons are
-- charged) is recorded as held: its price is taken from the balance.
-- Setting it back to planned or cancelled gives the money back.
create or replace function public.on_session_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_missed  boolean := public.setting_on('charge_missed', false);
  v_now     boolean;
  v_before  boolean := false;
  v_url     text := public.setting('site_url', 'https://dashaenglish.com/');
  v_tz      text;
begin
  v_now := new.student_id is not null and (new.status = 'done' or (new.status = 'missed' and v_missed));
  if tg_op = 'UPDATE' then
    v_before := old.status = 'done' or (old.status = 'missed' and v_missed);
  end if;
  if v_now and not v_before then
    insert into public.held_lessons (student_id, session_id, held_on, minutes, price, title, status)
    values (new.student_id, new.id, new.starts_at, new.minutes, public.student_price(new.student_id), new.title,
            case when new.status = 'missed' then 'missed' else 'held' end)
    on conflict (session_id) do nothing;
  elsif v_before and not v_now then
    delete from public.held_lessons where session_id = new.id;
  end if;

  -- Tell the student when a future lesson is moved or cancelled.
  if tg_op <> 'UPDATE' or new.student_id is null then return new; end if;
  if greatest(new.starts_at, old.starts_at) > now() then
    select timezone into v_tz from public.profiles where id = new.student_id;
    if new.status = 'cancelled' and old.status = 'scheduled' and old.starts_at > now() then
      delete from public.email_outbox where status = 'queued' and dedupe_key like 'sched:' || new.id || ':%';
      perform public.queue_email(new.student_id, 'schedule',
        'Lesson cancelled: ' || public.fmt_when(old.starts_at, v_tz),
        'Your lesson is cancelled',
        '<p>Your lesson on <strong>' || public.html_esc(public.fmt_when(old.starts_at, v_tz)) || '</strong> is cancelled.</p>'
          || case when btrim(new.note) <> '' then '<p>' || replace(public.html_esc(new.note), E'\n', '<br>') || '</p>' else '' end,
        'See your schedule', v_url || '#schedule',
        'sched:' || new.id || ':cancelled:' || extract(epoch from old.starts_at)::bigint, now() + interval '1 minute');
    elsif new.status = 'scheduled' and old.status = 'scheduled' and new.starts_at <> old.starts_at and new.starts_at > now() then
      delete from public.email_outbox where status = 'queued' and dedupe_key like 'sched:' || new.id || ':%';
      perform public.queue_email(new.student_id, 'schedule',
        'Lesson moved to ' || public.fmt_when(new.starts_at, v_tz),
        'Your lesson has a new time',
        '<p>Your lesson on ' || public.html_esc(public.fmt_when(old.starts_at, v_tz)) || ' is moved to <strong>'
          || public.html_esc(public.fmt_when(new.starts_at, v_tz)) || '</strong>.</p>',
        'See your schedule', v_url || '#schedule',
        'sched:' || new.id || ':moved:' || extract(epoch from new.starts_at)::bigint, now() + interval '1 minute');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_session_change on public.sessions;
create trigger on_session_change
  after insert or update on public.sessions
  for each row execute function public.on_session_change();

-- ---------------------------------------------------------------------
-- 7. Emails to students (sent through Resend, see README)
-- ---------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.html_esc(p text) returns text
language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function public.html_to_text(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(coalesce(p, ''), '<br\s*/?>|</p>|</div>|</li>|</h[1-6]>', E'\n', 'gi'), '<[^>]+>', '', 'g'),
      '&nbsp;', ' '), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
    E'\n{3,}', E'\n\n', 'g'));
$$;

create or replace function public.try_jsonb(p text) returns jsonb
language plpgsql immutable as $$
begin
  return p::jsonb;
exception when others then
  return null;
end $$;

-- 20000 -> "20 000 ₸"
create or replace function public.fmt_money(p numeric) returns text
language sql stable security definer set search_path = public as $$
  select case when coalesce(p, 0) < 0 then '−' else '' end
    || replace(to_char(abs(coalesce(p, 0)), case when abs(coalesce(p, 0)) = trunc(abs(coalesce(p, 0)))
                                               then 'FM999,999,999,990' else 'FM999,999,999,990.00' end), ',', chr(160))
    || chr(160) || case upper(public.setting('currency', 'KZT'))
                     when 'KZT' then '₸' when 'USD' then '$' when 'EUR' then '€' when 'RUB' then '₽'
                     else upper(public.setting('currency', 'KZT')) end;
$$;

-- A time zone name that really exists: the person's own, else the teacher's, else Almaty.
create or replace function public.safe_tz(p text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select name from pg_timezone_names where name = nullif(btrim(coalesce(p, '')), '') limit 1),
    (select t.name from public.profiles pr join pg_timezone_names t on t.name = pr.timezone
      where pr.role = 'teacher' limit 1),
    'Asia/Almaty');
$$;

-- "Saturday, 22 November, 6:00 PM (Almaty time)"
create or replace function public.fmt_when(p_at timestamptz, p_tz text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text := public.safe_tz(p_tz);
  v_local timestamp := p_at at time zone v_tz;
begin
  return to_char(v_local, 'FMDay, FMDD FMMonth') || ', '
    || to_char(v_local, case when public.setting('time_format', '12h') = '24h' then 'HH24:MI' else 'FMHH12:MI AM' end)
    || ' (' || replace(regexp_replace(v_tz, '^.*/', ''), '_', ' ') || ' time)';
end $$;

create or replace function public.balance_html(p_student uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_bal   numeric := public.student_balance(p_student);
  v_price numeric := public.student_price(p_student);
  v_left  int;
begin
  if v_price > 0 then v_left := floor(greatest(v_bal, 0) / v_price); end if;
  return '<p>Your balance: <strong>' || public.fmt_money(v_bal) || '</strong>'
    || case when v_price > 0 then ', enough for ' || case when v_left = 1 then '1 lesson' else v_left || ' lessons' end
            || ' at ' || public.fmt_money(v_price) else '' end || '.</p>';
end $$;

create or replace function public.email_layout(p_title text, p_body text, p_button text default '', p_url text default '', p_for_student boolean default true)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_site    text := public.setting('site_name', 'English with Dasha');
  v_url     text := public.setting('site_url', 'https://dashaenglish.com/');
  v_teacher text := public.setting('teacher_name', 'your teacher');
begin
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
    || '<body style="margin:0;padding:0;background:#f3f6fb;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#16243f;">'
    || '<tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border-left:4px solid #d94a61;">'
    || '<tr><td style="padding:22px 28px 6px;font-size:14px;color:#6e7d96;">' || public.html_esc(v_site) || '</td></tr>'
    || '<tr><td style="padding:0 28px;font-size:22px;line-height:1.3;font-weight:bold;color:#16243f;">' || public.html_esc(p_title) || '</td></tr>'
    || '<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:#16243f;">' || coalesce(p_body, '') || '</td></tr>'
    || case when coalesce(p_button, '') <> '' and coalesce(p_url, '') <> '' then
         '<tr><td style="padding:12px 28px 6px;"><a href="' || public.html_esc(p_url) || '" style="display:inline-block;background:#1f4fd1;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px;">'
         || public.html_esc(p_button) || '</a></td></tr>'
       else '' end
    || '<tr><td style="padding:22px 28px 24px;font-size:12px;line-height:1.5;color:#6e7d96;">'
    || case when p_for_student then
         'You get this email because you study with ' || public.html_esc(v_teacher) || ' at <a href="' || public.html_esc(v_url) || '" style="color:#6e7d96;">'
         || public.html_esc(regexp_replace(v_url, '^https?://|/$', '', 'g')) || '</a>. Reply to this email to write to ' || public.html_esc(v_teacher)
         || '. To stop these emails, untick the box in your <a href="' || public.html_esc(v_url) || '#my-profile" style="color:#6e7d96;">profile</a>.'
       else
         'You get this email because ' || public.html_esc(v_teacher) || ' invited you to <a href="' || public.html_esc(v_url) || '" style="color:#6e7d96;">'
         || public.html_esc(regexp_replace(v_url, '^https?://|/$', '', 'g')) || '</a>. Reply to this email to write to ' || public.html_esc(v_teacher) || '.'
       end
    || '</td></tr></table></td></tr></table></body></html>';
end $$;

-- Put an email in the queue. Returns null when it is not sent: the student turned
-- emails off, the account is not active, this kind of email is switched off in
-- Website settings, the address is not valid, or the same email is already queued.
create or replace function public.queue_email(
  p_student uuid, p_kind text, p_subject text, p_title text, p_body text,
  p_button text default '', p_url text default '', p_dedupe text default null,
  p_send_after timestamptz default now(), p_to text default null, p_force boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_name  text := '';
  v_ok    boolean := true;
  v_to    text;
  v_id    uuid;
  v_text  text;
begin
  if p_student is not null then
    select email, coalesce(full_name, ''), (email_notifications and status = 'active')
      into v_email, v_name, v_ok
      from public.profiles where id = p_student;
    if not found then return null; end if;
  end if;
  v_to := btrim(coalesce(p_to, v_email, ''));
  if not p_force then
    if not coalesce(v_ok, false) then return null; end if;
    if not public.setting_on('emails_enabled', true) then return null; end if;
    if not public.setting_on('email_on_' || p_kind, p_kind <> 'held') then return null; end if;
  end if;
  if v_to !~* '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then return null; end if;
  v_text := public.html_to_text(p_title) || E'\n\n' || public.html_to_text(p_body)
    || case when coalesce(p_url, '') <> '' then E'\n\n' || coalesce(p_button, 'Open') || ': ' || p_url else '' end
    || E'\n\n-- \n' || public.setting('site_name', 'English with Dasha') || ', ' || public.setting('site_url', 'https://dashaenglish.com/');
  insert into public.email_outbox (to_email, to_name, student_id, kind, subject, html, text_body, dedupe_key, send_after)
  values (v_to, v_name, p_student, p_kind, left(regexp_replace(p_subject, '\s+', ' ', 'g'), 200),
          public.email_layout(p_title, p_body, p_button, p_url, p_student is not null), v_text, p_dedupe, p_send_after)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Feedback on an exercise.
create or replace function public.notify_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_teacher text := public.setting('teacher_name', 'Your teacher');
  v_url     text := public.setting('site_url', 'https://dashaenglish.com/');
begin
  if coalesce(btrim(new.feedback), '') <> '' and new.feedback is distinct from old.feedback then
    -- A quick correction replaces an email that has not gone out yet.
    delete from public.email_outbox where status = 'queued' and dedupe_key like 'feedback:' || new.id || ':%';
    perform public.queue_email(new.student_id, 'feedback',
      v_teacher || ' left feedback on "' || new.material_title || '"',
      'New feedback on "' || new.material_title || '"',
      '<p>' || public.html_esc(v_teacher) || ' wrote:</p>'
        || '<p style="margin:0 0 12px;padding:12px 16px;background:#fff5f6;border-left:3px solid #d94a61;color:#8d2236;font-size:17px;">'
        || replace(public.html_esc(new.feedback), E'\n', '<br>') || '</p>'
        || case when new.score is not null and new.max_score is not null
                then '<p>Your score: <strong>' || new.score || ' / ' || new.max_score || '</strong></p>' else '' end,
      'See your answers', v_url || '#result-' || new.id,
      'feedback:' || new.id || ':' || md5(new.feedback),
      now() + interval '2 minutes');
  end if;
  return new;
end $$;

drop trigger if exists notify_feedback on public.attempts;
create trigger notify_feedback
  after update of feedback on public.attempts
  for each row execute function public.notify_feedback();

-- Payment receipt.
create or replace function public.notify_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A "low balance" warning that has not gone out yet is no longer true.
  delete from public.email_outbox where status = 'queued' and kind = 'low_balance' and student_id = new.student_id;
  if new.amount > 0 then
    perform public.queue_email(new.student_id, 'payment',
      'Payment received: ' || public.fmt_money(new.amount),
      'Thank you for your payment',
      '<p>' || public.html_esc(public.setting('teacher_name', 'Your teacher')) || ' received your payment of <strong>'
        || public.fmt_money(new.amount) || '</strong> on ' || to_char(new.paid_on, 'FMDD FMMonth YYYY') || '.</p>'
        || public.balance_html(new.student_id),
      'See your balance', public.setting('site_url', 'https://dashaenglish.com/') || '#my-profile',
      'payment:' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_payment on public.payments;
create trigger notify_payment
  after insert on public.payments
  for each row execute function public.notify_payment();

-- Lesson receipt (off by default) and a warning when the balance runs low.
create or replace function public.notify_held() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bal   numeric := public.student_balance(new.student_id);
  v_price numeric := public.student_price(new.student_id);
  v_url   text := public.setting('site_url', 'https://dashaenglish.com/');
  v_kaspi text := public.setting('kaspi_url', '');
  v_tz    text;
begin
  select timezone into v_tz from public.profiles where id = new.student_id;
  if new.price > 0 then
    perform public.queue_email(new.student_id, 'held',
      case when new.status = 'missed' then 'Missed lesson: ' else 'Lesson recorded: ' end
        || to_char(new.held_on at time zone public.safe_tz(v_tz), 'FMDD FMMonth'),
      case when new.status = 'missed' then 'Missed lesson' else 'Thank you for the lesson' end,
      '<p>' || case when new.status = 'missed' then 'The lesson on ' else 'Your lesson on ' end
        || public.html_esc(public.fmt_when(new.held_on, v_tz))
        || case when new.status = 'missed' then ' was missed and is charged' else ' is recorded' end
        || ': <strong>' || public.fmt_money(-new.price) || '</strong>.</p>' || public.balance_html(new.student_id),
      'See your balance', v_url || '#my-profile', 'held:' || new.id);
    if v_price > 0 and v_bal < v_price then
      -- At most one warning a day, always with the latest balance.
      delete from public.email_outbox where status = 'queued' and kind = 'low_balance' and student_id = new.student_id;
      perform public.queue_email(new.student_id, 'low_balance',
        case when v_bal < 0 then 'Please pay for your lessons' else 'Your balance is running low' end,
        case when v_bal <= 0 then 'Time to top up your balance' else 'Less than one lesson left' end,
        public.balance_html(new.student_id)
          || '<p>Please top up your balance before the next lesson.'
          || case when v_kaspi <> '' then ' The button below opens the payment in the Kaspi.kz app.' else '' end || '</p>',
        case when v_kaspi <> '' then 'Pay with Kaspi' else 'How to pay' end,
        case when v_kaspi <> '' then v_kaspi else v_url || '#pay' end,
        'low:' || new.student_id || ':' || to_char(now() at time zone public.safe_tz(v_tz), 'YYYY-MM-DD'),
        now() + interval '2 minutes');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists notify_held on public.held_lessons;
create trigger notify_held
  after insert on public.held_lessons
  for each row execute function public.notify_held();

-- A lesson record removed (or a lesson set back to planned): drop its emails that have not gone out.
create or replace function public.unnotify_held() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.email_outbox
   where status = 'queued' and (dedupe_key = 'held:' || old.id or (kind = 'low_balance' and student_id = old.student_id));
  return old;
end $$;

drop trigger if exists unnotify_held on public.held_lessons;
create trigger unnotify_held
  after delete on public.held_lessons
  for each row execute function public.unnotify_held();

-- A program opened for a student (not right after they sign up).
create or replace function public.notify_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_c public.courses%rowtype;
  v_created timestamptz;
begin
  select created_at into v_created from public.profiles where id = new.student_id;
  if v_created > now() - interval '15 minutes' then return new; end if;
  select * into v_c from public.courses where id = new.course_id;
  if found and v_c.published then
    perform public.queue_email(new.student_id, 'program',
      'New program: ' || v_c.title,
      'A new program is open for you',
      '<p>' || public.html_esc(public.setting('teacher_name', 'Your teacher')) || ' opened <strong>' || public.html_esc(v_c.title) || '</strong> for you.</p>'
        || case when btrim(v_c.description) <> '' then '<p>' || replace(public.html_esc(v_c.description), E'\n', '<br>') || '</p>' else '' end,
      'Open the program', public.setting('site_url', 'https://dashaenglish.com/') || '#program-' || v_c.id,
      'program:' || new.course_id || ':' || new.student_id, now() + interval '1 minute');
  end if;
  return new;
end $$;

drop trigger if exists notify_enrollment on public.enrollments;
create trigger notify_enrollment
  after insert on public.enrollments
  for each row execute function public.notify_enrollment();

-- Welcome email when the teacher approves a new account.
create or replace function public.notify_profile_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'student' and new.status = 'active' and old.status = 'pending' then
    perform public.queue_email(new.id, 'welcome',
      'Your account is ready',
      'Welcome' || case when btrim(new.full_name) <> '' then ', ' || split_part(btrim(new.full_name), ' ', 1) else '' end || '!',
      '<p>' || public.html_esc(public.setting('teacher_name', 'Your teacher')) || ' approved your account. Your programs, lessons and schedule are waiting for you.</p>',
      'Open the website', public.setting('site_url', 'https://dashaenglish.com/'),
      'welcome:' || new.id, now() + interval '1 minute');
  end if;
  return new;
end $$;

drop trigger if exists notify_profile_status on public.profiles;
create trigger notify_profile_status
  after update of status on public.profiles
  for each row execute function public.notify_profile_status();

-- Invitation link, when the teacher ticks "Email the invitation".
create or replace function public.notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_teacher text := public.setting('teacher_name', 'Your teacher');
begin
  if new.send_email and btrim(new.email) <> '' then
    perform public.queue_email(null, 'invite',
      v_teacher || ' invited you to ' || public.setting('site_name', 'English with Dasha'),
      'Your English lessons with ' || v_teacher,
      '<p>Hi' || case when btrim(new.full_name) <> '' then ' ' || public.html_esc(btrim(new.full_name)) else '' end || '!</p>'
        || '<p>' || public.html_esc(v_teacher) || ' made a place for your lessons, exercises and schedule. Open the link to create your account. It takes a minute.</p>',
      'Create my account', public.setting('site_url', 'https://dashaenglish.com/') || '#join-' || new.code,
      'invite:' || new.id, now(), new.email);
  end if;
  return new;
end $$;

drop trigger if exists notify_invite on public.invites;
create trigger notify_invite
  after insert on public.invites
  for each row execute function public.notify_invite();

-- Lesson reminders (checked every minute).
create or replace function public.queue_lesson_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  h1      numeric := public.setting_num('email_reminder_hours', 24);
  h2      numeric := public.setting_num('email_reminder2_hours', 1);
  v_url   text := public.setting('site_url', 'https://dashaenglish.com/');
  v_kaspi text := public.setting('kaspi_url', '');
  v_teach text := public.setting('teacher_name', 'your teacher');
  r       record;
  v_id    uuid;
  v_bal   numeric;
  v_price numeric;
  n       int := 0;
begin
  for r in
    select s.id, s.student_id, s.title, s.starts_at, s.minutes, s.meeting_url, s.note, p.timezone as tz, 1 as which
      from public.sessions s join public.profiles p on p.id = s.student_id
     where h1 > 0 and s.status = 'scheduled'
       and s.starts_at > now() + (greatest(h2, 0)::float8) * interval '1 hour'
       and s.starts_at <= now() + (h1::float8) * interval '1 hour'
    union all
    select s.id, s.student_id, s.title, s.starts_at, s.minutes, s.meeting_url, s.note, p.timezone, 2
      from public.sessions s join public.profiles p on p.id = s.student_id
     where h2 > 0 and s.status = 'scheduled'
       and s.starts_at > now()
       and s.starts_at <= now() + (h2::float8) * interval '1 hour'
  loop
    v_bal := public.student_balance(r.student_id);
    v_price := public.student_price(r.student_id);
    v_id := public.queue_email(r.student_id, 'reminder',
      case when r.which = 2 then 'Starting soon: ' else 'Reminder: ' end || r.title || ', ' || public.fmt_when(r.starts_at, r.tz),
      case when r.which = 2 then 'Your lesson starts soon' else 'Lesson reminder' end,
      '<p>' || public.html_esc(r.title) || ' with ' || public.html_esc(v_teach) || ': <strong>'
        || public.html_esc(public.fmt_when(r.starts_at, r.tz)) || '</strong>, ' || r.minutes || ' minutes.</p>'
        || case when btrim(r.note) <> '' then '<p>' || replace(public.html_esc(r.note), E'\n', '<br>') || '</p>' else '' end
        || case when v_price > 0 and v_bal < v_price then
             '<p style="color:#9a5800;">Your balance is ' || public.fmt_money(v_bal) || '. Please top up before the lesson'
             || case when v_kaspi <> '' then ': <a href="' || public.html_esc(v_kaspi) || '">pay with Kaspi</a>' else '' end || '.</p>'
           else '' end,
      case when btrim(r.meeting_url) <> '' then 'Join the lesson' else 'See your schedule' end,
      case when btrim(r.meeting_url) <> '' then r.meeting_url else v_url || '#schedule' end,
      'reminder' || r.which || ':' || r.id || ':' || extract(epoch from r.starts_at)::bigint);
    if v_id is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Send waiting emails through Resend. The key is kept in Supabase Vault as
-- "resend_api_key"; without it, emails wait in the queue.
create or replace function public.email_send_batch(p_limit int default 2) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_key   text;
  v_from  text;
  v_reply text;
  r       record;
  v_req   bigint;
  n       int := 0;
begin
  -- 1. Answers to earlier requests.
  update public.email_outbox o set
      status      = case when x.status_code between 200 and 299 then 'sent'
                         when o.tries >= 6 then 'failed' else 'queued' end,
      sent_at     = case when x.status_code between 200 and 299 then now() else null end,
      provider_id = case when x.status_code between 200 and 299 then coalesce(public.try_jsonb(x.content) ->> 'id', '') else o.provider_id end,
      error       = case when x.status_code between 200 and 299 then ''
                         else left(btrim(coalesce(x.status_code::text, '') || ' ' || coalesce(x.error_msg, '') || ' ' || coalesce(x.content, '')), 500) end,
      send_after  = case when x.status_code between 200 and 299 then o.send_after
                         else now() + make_interval(mins => (5 * power(2, least(o.tries, 5)))::int) end
    from net._http_response x
   where o.status = 'sending' and x.id = o.request_id;

  -- No answer for 30 minutes: try again.
  update public.email_outbox o set status = 'queued', error = 'No answer from the email service'
   where o.status = 'sending' and o.last_try_at < now() - interval '30 minutes'
     and not exists (select 1 from net._http_response x where x.id = o.request_id);

  -- 2. Send new ones.
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' order by created_at desc limit 1;
  v_key := btrim(coalesce(v_key, ''));
  if v_key = '' then return 0; end if;
  v_from  := public.setting('email_from', 'English with Dasha <lessons@dashaenglish.com>');
  v_reply := nullif(public.setting('email_reply_to', public.setting('notify_email', '')), '');

  for r in
    select id, to_email, subject, html, text_body, tries from public.email_outbox
     where status = 'queued' and send_after <= now()
     order by send_after, created_at
     limit p_limit
     for update skip locked
  loop
    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json',
                                    'Idempotency-Key', r.id::text || '-' || r.tries),
      body    := jsonb_strip_nulls(jsonb_build_object(
                   'from', v_from, 'to', jsonb_build_array(r.to_email), 'subject', r.subject,
                   'html', r.html, 'text', nullif(r.text_body, ''), 'reply_to', v_reply)),
      timeout_milliseconds := 15000) into v_req;
    update public.email_outbox set status = 'sending', request_id = v_req, tries = tries + 1, last_try_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.email_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.queue_lesson_reminders();
  exception when others then
    raise warning 'lesson reminders: %', sqlerrm;
  end;
  perform public.email_send_batch(2);
  delete from public.email_outbox where created_at < now() - interval '180 days';
end $$;

-- For the Website page: is sending set up, and how is it going?
create or replace function public.email_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can see this.'; end if;
  return jsonb_build_object(
    'key_set',    exists (select 1 from vault.secrets where name = 'resend_api_key'),
    'cron',       exists (select 1 from cron.job where jobname = 'english-studio-emails' and active),
    'queued',     (select count(*) from public.email_outbox where status in ('queued', 'sending')),
    'sent_today', (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    'failed',     (select count(*) from public.email_outbox where status = 'failed' and created_at > now() - interval '14 days'));
end $$;

create or replace function public.send_test_email() returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Only the teacher can do this.'; end if;
  return public.queue_email(auth.uid(), 'test', 'Test email from your website', 'Emails work!',
    '<p>This is a test. Your students get lesson reminders, feedback and payment receipts like this one.</p>',
    'Open the website', public.setting('site_url', 'https://dashaenglish.com/'),
    'test:' || gen_random_uuid(), now(), null, true);
end $$;

create or replace function public.email_retry() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_teacher() then raise exception 'Only the teacher can do this.'; end if;
  update public.email_outbox set status = 'queued', tries = 0, send_after = now(), error = '' where status = 'failed';
  get diagnostics n = row_count;
  return n;
end $$;

-- Only the database itself may use the inner functions.
revoke execute on function public.setting(text, text), public.setting_num(text, numeric), public.setting_on(text, boolean),
  public.student_price(uuid), public.student_balance(uuid), public.balance_html(uuid),
  public.email_layout(text, text, text, text, boolean),
  public.queue_email(uuid, text, text, text, text, text, text, text, timestamptz, text, boolean),
  public.queue_lesson_reminders(), public.email_send_batch(int), public.email_tick(),
  public.fmt_money(numeric), public.safe_tz(text), public.fmt_when(timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.email_status(), public.send_test_email(), public.email_retry() from public, anon;
grant execute on function public.email_status(), public.send_test_email(), public.email_retry() to authenticated;

-- Check for lessons to remind and emails to send, every minute.
select cron.schedule('english-studio-emails', '* * * * *', 'select public.email_tick()');

-- ---------------------------------------------------------------------
-- 8. Program modules and individual lesson access
-- ---------------------------------------------------------------------

-- Optional modules and enrollment-specific lesson release.
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


-- Done. Next: create the teacher account on the website (the first account
-- becomes the teacher automatically).

# dashaenglish.com: the full guide

This guide explains how Dasha's English teaching website works, how the parts fit together, and how to change it safely.
It is written for Dasha and for the AI assistant (ChatGPT or Codex) that helps her. Keep it up to date: every change to the website should also update this guide.

Contents
1. What the website does
2. Accounts and services
3. How the parts work together
4. The two GitHub repositories
5. The website's code
6. Look and styles (one theme for the website and the exercises)
7. The database (Supabase)
8. Emails
9. Lessons and exercises
10. How to make common changes (step by step)
11. Testing, publishing and undoing a change
12. When something goes wrong
13. Limits and costs
14. Safety rules

---

## 1. What the website does

- **Visitors** (not signed in) see the public page: who Dasha is, *Book a lesson* (a Cal.com booking calendar plus a request form), *Pay* (Kaspi link and QR code) and *Sign in*.
- **Students** sign in and see: *My programs* (their programs, lessons and sections), *Schedule* (their lessons with reminders), *Results* (scores, their answers and Dasha's feedback), *My words* (a word list), *Profile and balance* (contact details, balance, payments).
- **The teacher (Dasha)** sees: *Today*, *Students* (invite, approve, notes, prices, balances), *Programs* (programs → lessons → sections, editor), *Results* (to review, feedback), *Payments* (balances, CSV export), *Calendar*, *Requests* (from visitors and new sign-ups), *Exercise library* (her HTML files on GitHub), *Website* (all settings), *Profile*.
- **Lessons** open on their own full page (like Edvibe): the current section in the middle, all sections of the lesson listed on the right, *Back* / *Next*, and *Finish lesson*, which sends Dasha one email with every section's score.
- **Exercises** are Dasha's HTML files on GitHub. The website opens them inside the lesson, reads the score and the answers, and saves them.

Words used everywhere (keep them the same in the website, emails and this guide):
**Program** → **Lesson** → **Section**. A section is an *exercise* (HTML file), a *video*, a *link* or a *reading* (text). In the database a program is a `course` and a section is a `material` (old names, do not rename the tables).

## 2. Accounts and services

| Service | What it does | How to sign in | Cost and limits |
|---|---|---|---|
| **GitHub**, account `Dasha-English-Teacher` | Keeps the website's files and the exercises, and publishes them (GitHub Pages) | Dasha's GitHub login. Turn on two-factor login and keep the recovery codes: Supabase and Resend also sign in with this account | Free |
| **Supabase**, project `english-studio` (ID `membertqugfwotwnzjaz`), organization *English with Dasha* | The database, accounts and passwords, scheduled emails | supabase.com → *Continue with GitHub* (Dasha's GitHub) | Free plan: 500 MB database; pauses after 7 days without visits (see *Keep-alive*) |
| **Resend** | Sends emails to students from `lessons@dashaenglish.com`, and the "Forgot password" emails | resend.com → *Continue with GitHub* | Free: 100 emails a day, 3,000 a month |
| **Porkbun**, account `dashakim` | The domain dashaenglish.com and its DNS records | porkbun.com | Domain renews on **2027-11-21** (yearly). Keep auto-renew on and the card valid |
| **Cal.com**, user `dasha-teacher` | The booking calendar for new students (event *Trial lesson*) | cal.com | Free |
| **FormSubmit** | Sends emails *to Dasha* (lesson finished, new request) to the address on *Website → Emails to you* | No account. The first email asks her to confirm once | Free |
| **Kaspi** | Payments: link `https://pay.kaspi.kz/pay/5rtd4cl9` and QR code `assets/kaspi-qr.png` | Dasha's Kaspi business account | |
| **Google Fonts** | The fonts Lexend and Caveat | — | Free |

Secret keys and where they live (never in GitHub, never in chat):
- Resend API key for student emails: Supabase → *Integrations → Vault → Secrets*, name `resend_api_key`.
- Resend API key for "Forgot password" emails: Supabase → *Authentication → Emails → SMTP Settings* (host `smtp.resend.com`, port 465, user `resend`, sender `lessons@dashaenglish.com`).
- If a Resend key is deleted or replaced in Resend, put the new key in **both** places.
- Supabase "secret" / "service_role" key: never used by the website and never put anywhere in GitHub.
- The Supabase database password is not needed by the website.

DNS records at Porkbun (do not delete): ALIAS `dashaenglish.com` and CNAME `www` → `dasha-english-teacher.github.io`; TXT `_github-pages-challenge-Dasha-English-Teacher` (proves the domain to GitHub); for Resend: TXT `resend._domainkey`, CNAME `send` and `rsend`, TXT `_dmarc`.

## 3. How the parts work together

```
Visitor's browser
   │  opens https://dashaenglish.com
   ▼
GitHub Pages ── serves the files of the repository Dasha-English-Teacher.github.io
   │             (index.html, config.js, assets/*.js and *.css). No server code, no build step.
   │
   ├─► Supabase (database + accounts)  ◄── the website talks to it directly from the browser,
   │       with the public "publishable" key in config.js. Row Level Security rules in the
   │       database decide what each person may read or change.
   │
   ├─► Exercises: https://dashaenglish.com/miro-exercises/... (the miro-exercises repository,
   │       also served by GitHub Pages on the same domain). They open inside the lesson page
   │       in a frame; assets/tracker.js reads the score and answers and saves them in Supabase.
   │
   ├─► GitHub API (public, no key): the Exercise library lists the HTML files in the
   │       exercise repositories (setting "exercise_repos").
   ├─► Cal.com: the booking calendar is shown in a frame on *Book a lesson*.
   ├─► FormSubmit: emails to Dasha are sent straight from the browser.
   └─► Kaspi: a link and a QR picture on *Pay*.

Inside Supabase:
   database triggers ──► email_outbox table ──► pg_cron job "english-studio-emails" (every minute)
       ──► pg_net calls the Resend API with the key from Vault ──► student's inbox

GitHub Actions (in the website repository): "Keep database awake" pings Supabase every 3 days,
so the free project does not pause during holidays.
```

Important consequences:
- **A change in GitHub is live in 1–2 minutes.** There is no test copy of the website. Use `?demo` (section 11) to try things without touching real data.
- **Exercises must be on dashaenglish.com** (in a repository of the `Dasha-English-Teacher` GitHub account, published with GitHub Pages). Then the website and the exercise share one address and the website can read the score. Exercises elsewhere still open, but only report results if they use `report.js`.
- **The exercise repositories must stay public**: the library reads them without a key, and GitHub Pages publishes them.
- Anyone can read the website's settings (the public page needs them). Never put private information or keys in *Website* settings.

## 4. The two GitHub repositories

### `Dasha-English-Teacher/Dasha-English-Teacher.github.io`: the website
Published at https://dashaenglish.com (the `CNAME` file holds the domain; `.nojekyll` makes GitHub publish files as they are).

| Path | What it is |
|---|---|
| `index.html` | The one HTML page. Loads the fonts, `assets/styles.css` (which loads `assets/theme.css` first), `config.js`, then `assets/app.js` |
| `config.js` | Supabase project URL and **publishable** key (public by design), the domain, the demo settings |
| `assets/app.js` | Starts the app; the list of pages (routes) for visitors, students and the teacher; the side menu; sign-in events |
| `assets/core.js` | Shared state `S` and helpers: navigation, money and balances, progress, emails to the teacher (FormSubmit), calendar links, the exercise library (GitHub API), address fixes |
| `assets/api.js` | The data layer: every read and write to the database. Two versions with the same functions: **live** (Supabase) and **demo** (sample data in the browser). `DEFAULT_SETTINGS` and `FIELDS` (which columns may be saved) are here |
| `assets/ui.js` | Safe HTML templates (`html`), icons, dialogs, toasts, dates |
| `assets/views-public.js` | Visitor pages: home, book, sign in, sign up, join (invitation), waiting for approval |
| `assets/views-student.js` | Student pages: programs, one program (lesson list), schedule, words, results, profile |
| `assets/lesson-room.js` | The full-page lesson: sections list, exercise frame, saving, *Finish lesson* |
| `assets/tracker.js` | Reads the score and answers from an exercise in the frame |
| `assets/report.js` | Loaded by exercises: `reportResult()` and `reportAnswerKeyShown()` send results to the website |
| `assets/views-teacher.js` | Teacher pages: today, students, student, programs and the program editor, results and review, calendar, requests, Website settings |
| `assets/views-library.js` | Exercise library, "Make a lesson from this folder", the section picker, "File not found on GitHub" warnings |
| `assets/views-billing.js` | Payments page, balances, payment and lesson dialogs, the *Pay* page (Kaspi) |
| `assets/theme.css` | **The theme**: all colors, fonts and sizes, for the website and new exercises |
| `assets/styles.css` | The website's layout and parts (uses the theme) |
| `assets/exercise.css` | Ready parts for exercises (uses the theme) |
| `assets/kaspi-qr.png` | The Kaspi QR picture |
| `supabase/schema.sql` | The whole database: tables, security rules, triggers, emails, the scheduled job. Safe to run again |
| `exercise-kit/` | Rules for making exercises (`CHATGPT-INSTRUCTIONS.md`) and two working examples |
| `docs/` | This guide and the ChatGPT project instructions |
| `AGENTS.md` | Short rules for AI coding agents (Codex reads it automatically) |
| `README.md` | Setup history and everyday use, for people |
| `.github/workflows/keep-alive.yml` | Pings the database every 3 days |

### `Dasha-English-Teacher/miro-exercises`: the exercises
Published at https://dashaenglish.com/miro-exercises/. Its own workflow (`update-index.yml`) rebuilds `index.html`, a list of the HTML files **in the main folder only**; the website's *Exercise library* sees every folder.

How to organize it:
```
miro-exercises/
├── phrasal-verbs/                     one folder per program
│   ├── 01-get-and-take/               one folder per lesson; the name becomes the lesson title
│   │   ├── 1-intro.html               files numbered in lesson order; the name becomes the section title
│   │   ├── 2-match-up.html
│   │   └── 3-fill-in-the-gaps.html
│   └── 02-look-up-and-look-after/
└── (older files in the main folder stay where they are: lessons and Miro boards use their addresses)
```
- Names: lowercase letters, numbers and dashes. Never start a name with `_` (GitHub Pages does not publish it in this repository). Spaces work but make ugly addresses.
- Numbers sort naturally (`10-…` comes after `9-…`).
- **Never rename or move a file that is used in a lesson**: the lesson keeps the old address. Upload a corrected file with the same name to replace it, or a new file and change the section. The program editor shows "File not found on GitHub" next to broken sections.
- Files that link to each other stay in the same folder and link by file name only (`<a href="2-match-up.html">`).
- Other exercise repositories can be added on *Website → Exercises* (one `owner/repository` per line; `owner/repository/folder` limits it to one folder). They must be public and published with GitHub Pages.

## 5. The website's code

Plain HTML, CSS and JavaScript modules. **No build step, no npm, no frameworks**: GitHub Pages serves the files exactly as they are, and the browser runs them. The only outside library is the Supabase client, loaded from a CDN in `api.js`.

### Pages (routes)
Addresses are `#name` or `#name-id`, for example `#program-<id>`, `#lesson-<id>`, `#play-<sectionId>`, `#finish-<lessonId>`, `#student-<id>`.
`ROUTES` in `app.js` lists which pages each role may open (`public`, `waiting`, `student`, `teacher`); `NAV` builds the side menu; `FULL_PAGE` lists pages without the menu (the lesson pages); `ALIASES` keeps old addresses working (`#class-…` → `#program-…`).

### A page ("view")
A view is a function that returns an object:
```js
export async function exampleView({ id }) {
  const rows = await S.api.listSomething();               // read data through S.api, never straight from Supabase
  return {
    title: 'Page title',                                  // browser tab title
    html: html`<div class="page-head"><h1>Title</h1></div>
               <button class="btn" data-on="save">Save</button>
               <form class="form" data-submit="send">…</form>`,
    on: { async save(el) { … } },                          // clicks on [data-on="save"]
    submit: { async send(data, form) { … } },              // forms with data-submit="send"; data = the form's fields
    change: { … }, input: { … },                           // [data-change], [data-input]
    mount(root) { … }, unmount() { … },                     // after the page is shown / before it goes away
  };
}
```
- Always build HTML with the `html` template from `ui.js`: it escapes text, so a student's name cannot break the page. Use `raw()` only for HTML you wrote yourself.
- Errors thrown in `on`/`submit` handlers are shown to the user automatically.
- After changing data, call `refresh()` (redraws the page) or `go('programs')` (opens another page; no `#`).
- Helpers: `toast()`, `openModal()`, `ask()` (confirm dialog), `icon('name')`, dates (`fmtDate`, `fmtTime`…), `money()`, `plural()`.

### Data (`api.js`)
- Every database call goes through `S.api`. Both versions (live and demo) must have the same functions.
- `FIELDS` lists the columns that may be saved for each table. A new column must be added here, or it is silently not saved.
- `DEFAULT_SETTINGS` holds every *Website* setting with its default value.
- Demo mode: sample students, programs and results in `demoSeed()`, kept in the browser's localStorage under `english-studio-demo-v2`. If the shape of the demo data changes (for example a new table), add it to `demoSeed()` and change the key to `-v3` so old demo data is replaced.

### Words and style in the interface
Plain, short English; sentence case; the action word on buttons ("Save changes", "Add a section"), and the same word in the message afterwards ("Section added"). Use Program / Lesson / Section / Exercise consistently. Error messages say what to do.

## 6. Look and styles (one theme for the website and the exercises)

- `assets/theme.css` holds the theme: colors (`--paper`, `--surface`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-strong`, `--action`, `--action-dark`, `--action-soft`, `--ok`, `--ok-soft`, `--margin`, `--margin-soft`, `--hl`, `--hl-soft`, `--warn`, `--warn-soft`), fonts (`--font` Lexend, `--hand` Caveat), sizes (`--fs-xs` … `--fs-3xl`) and corners (`--r-ctl` 8px, `--r-panel` 14px).
- **To change a color or font everywhere, change it in `theme.css` only.** The website and every new exercise follow. Keep the variable names.
- `assets/styles.css`: the website's layout and parts (side menu, cards, buttons, the lesson room, payments…). Use theme variables. Some darker and lighter shades there are still written as color codes; for new work, add a variable to `theme.css` instead.
- `assets/exercise.css`: ready parts for exercises (`.ex`, `.card`, `.q`, `.btn`, `.choice`, `.chip`, `.slot`, `.is-right`, `.is-wrong`, `#score`…). The full list is at the top of the file. Changing it changes every exercise that loads it: change carefully and then look at a few exercises.
- New exercises load the theme and the parts (see `exercise-kit/CHATGPT-INSTRUCTIONS.md`). Older exercises have their own styles and do not change.
- The look: an exercise book. Ink-blue text on cool paper, a red margin line, yellow highlighter, the teacher's comments in red handwriting (Caveat).
- Fonts change in two places: the Google Fonts link (in `index.html` and in exercises) and `--font` / `--hand` in `theme.css`.
- Every page must work on a phone (360px wide), with the keyboard, and with visible focus.

## 7. The database (Supabase)

Everything is defined in `supabase/schema.sql`. Dashboard: https://supabase.com/dashboard/project/membertqugfwotwnzjaz

### Tables
| Table | What one row is |
|---|---|
| `profiles` | A person with an account. `role` teacher/student; `status` pending/active/paused/archived; `lesson_price` (own price, else the default); `email_notifications`; `timezone` |
| `courses` | A **program** (title, description, emoji, color, level, `published`, `sort`) |
| `lessons` | A lesson in a program (`course_id`, title, `published`, `sort`) |
| `materials` | A **section** of a lesson (`lesson_id`, `kind` exercise/video/link/text, title, `url`, `body`, `sort`) |
| `enrollments` | Which student can open which program (`course_id`, `student_id`) |
| `attempts` | A student's work on a section: status in_progress/completed, `score`/`max_score`, first score, `answers` (list), `seconds`, `revealed` (answer key opened), teacher `feedback`, `reviewed` |
| `sessions` | A lesson in the calendar (student, start, minutes, meeting link, status scheduled/done/cancelled/missed) |
| `held_lessons` | A lesson that was held (or missed and charged): its `price` is taken from the balance |
| `payments` | Money a student paid (amount, date, method) |
| `booking_requests` | Messages from the *Book a lesson* form |
| `invites` | Invitation links (`#join-<code>`) with the programs to open |
| `words` | Students' word lists |
| `teacher_notes` | Dasha's private notes about a student |
| `site_settings` | One row (`id = 1`) with all *Website* settings as JSON in `data` |
| `email_outbox` | Emails to students: waiting, sent, failed (kept 180 days) |

Balance of a student = all `payments` − all `held_lessons` prices. Marking a calendar lesson *done* (or *missed*, when missed lessons are charged) creates a `held_lessons` row automatically (trigger `on_session_change`); setting it back gives the money back.

### Accounts
- The **first account ever created** became the teacher (Dasha). Everyone else is a student.
- A student who signs up alone waits as `pending` on *Requests* until Dasha approves. A student who signs up from an invitation link is `active` at once and gets the invited programs.
- Email confirmation is off. Site URL and redirect URLs are set under *Authentication → URL Configuration* (`https://dashaenglish.com`, `https://dashaenglish.com/**`).

### Security (Row Level Security)
Every table has RLS on. In short: students read only their own rows and the programs they are enrolled in (and only when the program, lesson and their account are active/published); only the teacher writes programs, prices, payments, settings and feedback. Helper functions: `is_teacher()`, `can_see_course()`, `can_see_lesson()`. Triggers `protect_profile` and `protect_attempt` stop students from changing their role, status, price or the teacher's feedback.
**Never turn RLS off, and never use the service_role key in the website.**

### Changing the database safely
1. Write the change as SQL that is safe to run twice: `create table if not exists`, `alter table … add column if not exists`, `create or replace function`, `drop policy if exists` before `create policy`, `drop trigger if exists` before `create trigger`.
2. A new table needs: `enable row level security`, policies, and `grant` lines (section 5 of `schema.sql`), or the website cannot use it.
3. Add the same SQL to `supabase/schema.sql` in the right section, so the file always describes the whole database.
4. Before running it, export the tables it touches to CSV (Table Editor → open the table → *Export*).
5. Run it in Supabase → *SQL Editor* → *New query* → paste → *Run*. Expect "Success".
6. Update `api.js` (`FIELDS`, live and demo functions) and the pages that use it.
Never run `drop table`, `delete` or `truncate` on real data without a fresh CSV export and Dasha's clear yes.

### Keep-alive
Free Supabase projects pause after a week without visits. `.github/workflows/keep-alive.yml` reads one public setting every 3 days. If the project is paused anyway: Supabase dashboard → the project → *Restore*.

## 8. Emails

**To Dasha** (FormSubmit, from the browser): "lesson finished" (when a student presses *Finish lesson*) and "new request". Turn them on/off and set the address on *Website → Emails to you*.

**To students** (Resend, from the database):
1. A trigger puts an email in `email_outbox` with `public.queue_email(student_id, kind, subject, title, body_html, button_text, button_url, dedupe_key, send_after)`. It does nothing if the student turned emails off, the account is not active, the kind is switched off on *Website → Emails to students* (setting `email_on_<kind>`), or the same `dedupe_key` was already queued.
2. The job `english-studio-emails` runs `email_tick()` every minute: it queues lesson reminders (`email_reminder_hours`, `email_reminder2_hours`) and sends up to 2 waiting emails through the Resend API (`email_send_batch`), retrying failures with longer waits.
3. Kinds: `reminder`, `schedule` (lesson moved or cancelled), `feedback`, `program` (a program opened), `payment`, `held` (off by default), `low_balance`, `welcome` (account approved), `invite`, `test`.
4. *Website → Email sending* shows whether the key and the job are set, the queue and the last emails, and has *Send a test email to me* and *Try failed emails again*.
All emails use one layout (`email_layout()` in `schema.sql`); the sender is the setting `email_from`, replies go to `email_reply_to` (or `notify_email`).

**"Forgot password" emails** are sent by Supabase Auth through Resend SMTP (section 2).

## 9. Lessons and exercises

### How Dasha adds a lesson
1. Make the exercises (ChatGPT, following `exercise-kit/CHATGPT-INSTRUCTIONS.md`). Name the files with numbers: `1-intro.html`, `2-match-up.html`…
2. On her computer, put them in a lesson folder (`01-get-and-take`) inside a program folder (`phrasal-verbs`).
3. GitHub → `miro-exercises` → open the program folder (or stay in the main folder for a new program) → *Add file → Upload files* → drag the whole folder → *Commit changes*. Wait about a minute.
4. Website → *Programs → Edit* (the program) → *New lesson from a GitHub folder* → choose the folder → check the lesson title → *Create the lesson*. (Or *Exercise library → Make a lesson from this folder*.)
5. Add videos (YouTube, set to *Unlisted*), links or reading text with *Add a section*; reorder with the arrows; press the eye button to see the lesson as a student.
6. Make sure the students are enrolled in the program (*Students* → the student → programs, or *Invite a student*).

### Sections
- **Exercise**: an HTML file shown inside the lesson. Done when it shows a score or the student presses *I'm done*.
- **Video**: YouTube links play inside the lesson; other video links open in a new tab. Done when opened.
- **Link**: opens in a new tab. Done when opened.
- **Reading (text)**: plain text, line breaks kept (no formatting). For a formatted reading page, make an HTML page with the theme (it becomes an exercise section without a score).
- The same exercise can be used in several lessons. *Finish lesson* completes unfinished exercises as they are and emails Dasha.

### How the website reads results
`assets/tracker.js` watches the exercise in the frame:
1. Best: the exercise calls `reportResult(score, total, answers)` (from `assets/report.js`). This works even from another address.
2. Otherwise (same address only): it reads score text on the page ("Score: 12 / 18", "12 / 27 correct", "All 15 correct") and collects what the student chose or typed.
3. `reportAnswerKeyShown()` (or a "Show answers" button) is recorded as "answer key opened".
The rules for new exercises are in `exercise-kit/CHATGPT-INSTRUCTIONS.md`, with two working examples.

## 10. How to make common changes (step by step)

### Change texts on the public page, prices, the booking link, email settings
No code: website → *Website* page (signed in as Dasha) → change → *Save*. Settings live in `site_settings`.

### Change colors or fonts
Edit `assets/theme.css` (and the Google Fonts link in `index.html` if the font changes). Check the website (teacher and student pages, a lesson) and a new-style exercise, on a computer and a phone.

### Add a page for visitors (for example "About me" or "Courses")
1. In `assets/views-public.js` add a view, for example:
   ```js
   export function aboutView() {
     const st = S.settings;
     return { title: 'About me', html: html`<div class="page-head"><h1>About me</h1></div><div class="card-plain">…</div>` };
   }
   ```
2. In `assets/app.js` add `about: pub.aboutView` to `ROUTES.public` (and to `waiting`, `student`, `teacher` if signed-in people should see it too).
3. Add a link in the visitor header: in `paintShell()` in `app.js`, next to "Book a lesson": `<a href="#about" class="${name === 'about' ? 'is-on' : ''}">About me</a>`.
4. If Dasha should edit the text herself without code: add a setting (next recipe) and show it with `nl2br(st.about_page)`.
5. Use existing parts and theme variables; check on a phone.

### Add a setting to the *Website* page
1. Add the key with its default to `DEFAULT_SETTINGS` in `api.js`.
2. Add a field to the form in `siteSetupView()` (`views-teacher.js`), with the same `name`.
3. If the database uses it (emails), also add the default in the `update public.site_settings set data = jsonb_build_object(…) || data` block in `schema.sql`, and run that block.

### A self-study course (students work through it on their own)
The website already supports this: a program is a set of lessons with sections, and students see their progress.
- **Simple way (no code):** create the program, then give access the usual way (approve the student and tick the program, or *Invite a student* with the program ticked). Payment as now (Kaspi), access when Dasha sees the payment.
- **Open to every active student (small change):**
  1. SQL (add to `schema.sql` too):
     ```sql
     alter table public.courses add column if not exists open_to_all boolean not null default false;
     create or replace function public.can_see_course(p_course uuid) returns boolean
     language sql stable security definer set search_path = public as $$
       select public.is_teacher() or exists (
         select 1 from public.courses c
         join public.profiles p on p.id = auth.uid() and p.status = 'active'
         where c.id = p_course and c.published
           and (c.open_to_all or exists (
             select 1 from public.enrollments e where e.course_id = c.id and e.student_id = auth.uid())));
     $$;
     ```
  2. `api.js`: add `'open_to_all'` to `FIELDS.courses`; in the demo version make `canSeeCourse` accept `c.open_to_all` too.
  3. Program editor (`views-teacher.js`): a checkbox "Open to every student".
  Students' program lists come from the database rules, so nothing else changes.
- **One lesson after another (optional):** on the program page (`programView` in `views-student.js`) show the next lesson as locked until the previous one is done (`lessonDone()`). This only hides the button; it is not a security rule.
- **A public page about the course:** add a visitor page (recipe above) with a *Sign up* or *Book a lesson* button.

### Add a new kind of email to students
1. In `schema.sql` (section 7) add a trigger function that calls `public.queue_email(...)` with a new kind (copy `notify_payment()` as the pattern), plus `drop trigger if exists … / create trigger …`.
2. Add `email_on_<kind>` with a default to the settings block in `schema.sql` and to `DEFAULT_SETTINGS`, and a checkbox on *Website → Emails to students*.
3. Run the new SQL in the SQL Editor. Test with Dasha's own student test account.

### Add an exercise repository or folder
*Website → Exercises*: one `owner/repository` per line. The repository must be public and published with GitHub Pages under the `Dasha-English-Teacher` account (so it is on dashaenglish.com).

### Add a second teacher
There is one teacher account by design. If ever needed: Supabase → *Table Editor* → `profiles` → that person's `role` = `teacher` (they then see and control everything).

## 11. Testing, publishing and undoing a change

- **Try without real data:** add `?demo` to the address: `https://dashaenglish.com/?demo`. The website runs with sample students and programs kept in that browser only; the *View as* menu at the bottom switches between the teacher, students and a visitor; *Reset* starts again. Nothing touches the real database.
- **On a computer (for Codex or a developer):** in the repository folder run `python3 -m http.server 8000`, open `http://localhost:8000/?demo`. Check the browser console for errors.
- **Check list for every change:** teacher pages and student pages; a lesson (exercise score saved, *Next*, *Finish lesson*); phone width (360px); no errors in the console; existing addresses still work.
- **Publishing:** a commit to `main` is live in 1–2 minutes (GitHub → *Actions* shows "pages build and deployment"). If the browser shows the old version, reload with Ctrl+F5 (Cmd+Shift+R on a Mac).
- **Safer way:** changes as a pull request (Codex makes one). Dasha reads the description, then *Merge*. A merged pull request has a *Revert* button if something goes wrong.
- **Undo a direct change:** GitHub → the file → *History* → open the older version → copy it → edit the current file → paste → *Commit changes*.
- A test student account (another email of Dasha's) is useful to check what students see on the real website.

## 12. When something goes wrong

| Problem | What to check |
|---|---|
| The website shows "could not start" or nothing loads | Supabase project paused? (dashboard → *Restore*). Browser console errors after the last commit? Undo the last change |
| A change does not appear | Wait 2 minutes, reload with Ctrl+F5; GitHub → *Actions*: did "pages build and deployment" succeed? |
| An exercise score is not saved | Is the file on dashaenglish.com (not another site)? Does it show "Score: X / Y" or call `reportResult`? Open it alone and press *Check answers* |
| "File not found on GitHub" in the editor | The file was renamed or moved. Put it back or change the section's link |
| A new file is not in the library | Wait a minute, press *Refresh* in the library. Is the repository public and listed on *Website → Exercises*? Too many refreshes in an hour: GitHub blocks the list for a while (wait an hour) |
| Students get no emails | *Website → Email sending*: key and job OK? Failed emails and their error? Resend dashboard → *Emails*/*Logs*. Is the Vault key still valid? Daily limit (100) reached? |
| "Forgot password" email does not arrive | Supabase → *Authentication → Emails → SMTP Settings* (Resend key valid?); Resend logs; spam folder |
| Dasha gets no "lesson finished" emails | *Website → Emails to you*: address set? The first FormSubmit email needs her confirmation once (check spam) |
| Booking calendar says 404 | The Cal.com link changed: update *Website → Booking page link* |
| The domain stops working | Porkbun: domain renewed? DNS records intact? GitHub → website repo → *Settings → Pages*: custom domain `dashaenglish.com`, *Enforce HTTPS* on |

## 13. Limits and costs

Everything is free today. Limits to keep in mind:
- Supabase free plan: 500 MB database; pauses after 7 days without visits (the keep-alive prevents this).
- Resend free plan: 100 emails a day, 3,000 a month.
- GitHub Pages: about 1 GB per site; very large files (video) do not belong in GitHub. Put videos on YouTube.
- The GitHub API (exercise library) allows 60 requests an hour from one network, and each library refresh uses 2 per repository; the library keeps a copy for 10 minutes.
- The domain is paid yearly at Porkbun; next renewal 2027-11-21.

## 14. Safety rules

1. Never put passwords, the Resend key, the Supabase secret/service_role key or the database password into GitHub, ChatGPT or any chat. The publishable key in `config.js` is the only key in the repository, and it is meant to be public.
2. Never turn off Row Level Security, and give every new table its rules.
3. Before changing or deleting real data, export it (CSV) and get Dasha's clear yes.
4. Do not rename or move exercise files that lessons use. Do not rename database tables or columns.
5. Keep `schema.sql` safe to run again, and in step with the real database.
6. Try changes in demo mode (`?demo`) and publish small changes, one at a time.
7. Students' personal data (names, emails, results, payments) stays in Supabase. Do not paste it into ChatGPT; describe the problem instead.
8. Keep this guide, `AGENTS.md` and the README up to date with every change.

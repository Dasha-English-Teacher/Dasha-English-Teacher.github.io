# Rules for AI coding agents (Codex and others)

This repository is the website https://dashaenglish.com of Dasha, an English teacher. She is not a programmer: explain every change in plain, simple English, and keep changes small.

Read `docs/WEBSITE-GUIDE.md` before changing anything. It explains the services, the code, the database, emails, exercises and common recipes.

## How the website is built
- Plain HTML, CSS and JavaScript modules, served as they are by GitHub Pages from the `main` branch. **No build step, no npm, no frameworks, no TypeScript.** Do not add any.
- `index.html` → `assets/app.js` (routes and menu) → views in `assets/views-*.js` and `assets/lesson-room.js`. Shared helpers: `assets/core.js`, `assets/ui.js`.
- All data goes through `S.api` from `assets/api.js`, which has two versions with the same functions: live (Supabase) and demo (sample data in the browser). Change both.
- The database is Supabase; everything is in `supabase/schema.sql` (tables, Row Level Security, triggers, emails, the pg_cron job).
- Exercises are separate HTML files in the public repository `Dasha-English-Teacher/miro-exercises`, served at `https://dashaenglish.com/miro-exercises/`. Rules for new exercises: `exercise-kit/CHATGPT-INSTRUCTIONS.md`.

## Rules
1. Never commit secrets: no service_role/secret keys, Resend keys or passwords. `config.js` holds only the project URL and the publishable key, which are public by design.
2. Never weaken security: keep Row Level Security on every table; a new table needs RLS, policies and grants. Do not move permission checks into the browser.
3. Database changes are SQL that is safe to run twice (`if not exists`, `create or replace`, `drop … if exists` before `create`). Add them to `supabase/schema.sql` in the right section **and** give Dasha the exact SQL to paste into Supabase → SQL Editor, with a note to export the affected tables to CSV first. Never drop or rename tables or columns that hold data.
4. New columns: add them to `FIELDS` in `api.js`, or they are not saved. New settings: add them to `DEFAULT_SETTINGS` and to the *Website* page (`siteSetupView`).
5. Build HTML with the `html` template from `ui.js` (it escapes text). Use `raw()` only for HTML written in the code.
6. Styles: colors, fonts and sizes come from `assets/theme.css` variables. For a new color, add a variable to `theme.css` instead of typing a color code (`styles.css` still has some older shade codes; leave them). Website parts go in `styles.css`, exercise parts in `exercise.css`.
7. Keep old addresses working (see `ALIASES` in `app.js`); never change the address of an exercise file that lessons use.
8. Words in the interface: Program → Lesson → Section (exercise, video, link, reading). Short, plain English, sentence case.
9. Every page must work on a phone (360px wide), with the keyboard, without console errors.
10. Update `docs/WEBSITE-GUIDE.md` (and `README.md` for things Dasha does by hand) in the same change.

## Testing
- Start a local server in the repository folder: `python3 -m http.server 8000`, then open `http://localhost:8000/?demo`.
  `?demo` runs the website with sample data in the browser only; the *View as* menu switches between the teacher, students and a visitor. Real data is never touched.
- Check: teacher pages, student pages, a lesson (an exercise saves its score, *Next*, *Finish lesson*), phone width, no console errors.
- If the demo data shape changes (for example a new table), update `demoSeed()` in `api.js` and change the localStorage key `english-studio-demo-v2` to the next number.

## Pull requests
One topic per pull request. The description says, in simple English: what changes for Dasha and her students, what she must do by hand (for example run SQL), and how to check it after merging.

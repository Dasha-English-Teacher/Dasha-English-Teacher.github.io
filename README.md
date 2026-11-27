# English with Dasha: website

A website for online English lessons:

- **Students** sign in and see only their own programs, lessons and exercises, their schedule, their word list, their results with your feedback, and their balance.
- **You (the teacher)** control everything: students, programs, lessons, exercises, the calendar, payments and balances, lesson requests and the public page.
- **Exercises** are your usual HTML files on GitHub. The website opens them inside a lesson, reads the score and the answers automatically and saves them. When a student finishes a lesson, you get one email with the results.
- **Visitors** see your public page, can book a lesson or send a request, and can pay with Kaspi.

Everything runs on free services: GitHub Pages (the website), Supabase (the database), Resend (emails to students), FormSubmit (emails to you) and Cal.com (a booking page).

**Managing the website with ChatGPT:** the full guide for Dasha and her AI assistant is [`docs/WEBSITE-GUIDE.md`](docs/WEBSITE-GUIDE.md). The text for the ChatGPT project's instructions is [`docs/CHATGPT-PROJECT-INSTRUCTIONS.md`](docs/CHATGPT-PROJECT-INSTRUCTIONS.md). Rules for coding agents such as Codex: [`AGENTS.md`](AGENTS.md).

## Current setup

- **Website:** https://dashaenglish.com (this repository, published with GitHub Pages). The old address https://dasha-english-teacher.github.io redirects there.
- **Domain:** dashaenglish.com, registered at Porkbun (account `dashakim`), renews 2027-11-21. DNS at Porkbun: ALIAS `dashaenglish.com` and CNAME `www` both point to `dasha-english-teacher.github.io`; a TXT record `_github-pages-challenge-Dasha-English-Teacher` proves to GitHub that the domain is hers. Do not delete these records.
- **Database:** Supabase project **english-studio** in the organization *English with Dasha* (free plan). Sign in to Supabase with Dasha's GitHub account. Email confirmation is turned off, and the site address is set under *Authentication → URL Configuration*.
- **Booking page:** Cal.com event **Trial lesson** (30 minutes): https://cal.com/dasha-teacher/trial-lesson. Still to do in Cal.com: set the real teaching hours (*Availability*) and connect Google Calendar (*Apps → Calendar*) so busy times are hidden.
  **If you change the Cal.com username or the event link, also update *Booking page link* on the website's Website page.** Otherwise the booking calendar shows "404, this page does not exist".
- **Emails to you:** sent through FormSubmit to the address on the website's *Website* page.
- **Emails to students:** sent from `lessons@dashaenglish.com` through **Resend** (account: Dasha's GitHub, free plan: 100 emails a day, 3,000 a month). Replies go to Dasha's Gmail. The Resend key is stored in Supabase: *Integrations → Vault → Secrets*, named `resend_api_key`. "Forgot password" emails also go through Resend (Supabase → *Authentication → Emails → SMTP Settings*, with a second Resend key). If a Resend key is replaced, update it in both places. DNS records for Resend at Porkbun: TXT `resend._domainkey`, CNAME `send` and `rsend`, TXT `_dmarc`. Do not delete them.
- **Payments:** Kaspi link https://pay.kaspi.kz/pay/5rtd4cl9 and the QR code `assets/kaspi-qr.png`, shown on the *Pay* page (`dashaenglish.com/#pay`) and on each student's profile.

Steps 1, 2, 3 and 5 below are done. In step 4, check once that *Send notifications to* has Dasha's email. The steps stay here in case you ever need to set things up again.

## What is in this folder

| File or folder | What it is |
|---|---|
| `index.html`, `config.js`, `assets/` | The website itself. `assets/theme.css` holds the colors and fonts for the website and new exercises |
| `supabase/schema.sql` | Sets up the database. Run it once; run it again after an update (it keeps your data). |
| `exercise-kit/` | Rules for making exercises with ChatGPT, and two working examples |
| `docs/` | The full guide and the ChatGPT project instructions |
| `AGENTS.md` | Rules for AI coding agents (Codex) |
| `.github/workflows/keep-alive.yml` | Keeps the free database awake during holidays |

Until `config.js` has the database details, the website runs in **demo mode** with example students and data that stays in your browser only.

## Setup (about 30 minutes, once)

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), press **Start your project**, and sign up with **Continue with GitHub** (use the Dasha-English-Teacher account).
2. Create a **New project**. Name: `english-studio`. Region: the one closest to most students (for example *East US*). For the database password, press **Generate a password** and save it somewhere safe. The website does not need it.
3. Wait about 2 minutes until the project is ready.
4. Open **SQL Editor**, then **New query**. Paste everything from `supabase/schema.sql` and press **Run**. You should see *Success. No rows returned*.
5. Open **Authentication**, then **Sign In / Providers**, then **Email**. Turn **off** *Confirm email* and save. (Supabase's built-in email only reaches your own team, so students could not confirm. You can turn it back on later if you connect your own email under *Emails → SMTP Settings*.)
6. Open **Authentication**, then **URL Configuration**. Set **Site URL** to `https://dashaenglish.com` and add `https://dashaenglish.com/**` under **Redirect URLs**.
7. Open **Project Settings**, then **API Keys** (or **API**). Copy the **Project URL** and the **publishable** key (older projects call it the *anon public* key). Never use the *secret* or *service_role* key on the website.

### 2. Put the website online (GitHub Pages)

1. On GitHub, create a **new repository** named exactly `Dasha-English-Teacher.github.io`, **Public**.
2. Upload all the files from this folder (**Add file → Upload files**, drag everything in, **Commit**).
   If the hidden `.github` folder does not upload, create it by hand: **Add file → Create new file**, name it `.github/workflows/keep-alive.yml`, and paste the file's contents.
3. Open `config.js` in the repository, press the pencil icon, paste the **Project URL** and the **publishable key** between the quotes, and **Commit**.
4. Open **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
5. After 1–2 minutes the website is at **https://dasha-english-teacher.github.io/**

### 3. Create your teacher account

Open the website, press **Sign in**, then **create an account**. **The first account ever created becomes the teacher.** Do this before you invite anyone.

### 4. Fill in your settings

In the website, open **Website** and set:

- your name, the description and the "about" text for the public page,
- **Send notifications to:** your email. The first notification asks you to confirm once (a FormSubmit email), then they arrive automatically,
- your usual **video call link** (Zoom or Google Meet),
- a **booking page link**, if you make one (next step).

### 5. Booking page (optional)

1. Go to [cal.com](https://cal.com) and sign up with your **Google account**, so it can see your Google Calendar and only offer free times.
2. Create an event, for example *Trial lesson, 30 min*, and set your working hours.
3. Copy the event link (like `https://cal.com/your-name/trial-lesson`) and paste it into **Website → Booking page link**.

New people then pick a time themselves, and it goes straight into your Google Calendar.

## Everyday use

- **New student:** *Students → Invite a student*, tick their programs. The website emails them the link (or copy it and send it yourself). They choose a password and their programs are ready. People who sign up by themselves wait on *Requests* until you approve them.
- **Programs, lessons, sections:** a *program* holds lessons, and a lesson has *sections* (exercises, videos, links, notes). Students open a program and see its lessons as a numbered list. A lesson opens on its own full page, like in Edvibe: the section fills the page, and all sections of the lesson are listed on the right, with *Finish lesson* at the end. An exercise is saved as done when it shows a score or the student presses *I'm done*. *Finish lesson* sends you one email with the score of each section.
- **Editing a program:** *Programs → Edit*. The arrows move lessons and sections up and down; the ↔ button moves or copies a lesson to another program, or a section to another lesson; the eye button opens a lesson as students see it. The same exercise can sit in several lessons.
- **New lesson:** upload its files to GitHub in one folder (see *Organizing exercises on GitHub* below), then *Programs → Edit → New lesson from a GitHub folder*, or *Exercise library → Make a lesson from this folder*. For one new exercise: upload the file, then *Add a section* in the program editor, or *Exercise library → Add to a lesson*. If a new file does not show up, press *Refresh* in the library (GitHub needs about a minute).
- **Lessons and reminders:** *Calendar → Schedule a lesson*. Students see their lessons on their *Schedule* page and get an email reminder (by default 1 day and 1 hour before). You can also put the lesson in Google Calendar with one button.
- **Payments and balances:** set a default price on *Website → Payments*, and a personal price on a student's page if needed. When a student pays, press *Payment* (on *Payments* or the student's page) and enter the amount. After a lesson, press **Held** on *Today* (or *Lesson held* in the calendar): the price is taken from the balance. *Payments* shows every student's balance, what you received and earned this month, homework progress and average scores, and can be downloaded as a CSV file for Excel.
- **Checking work:** *Results → To review*. You see the score, each answer with ✓ or ✗, the time spent, and whether the answer key was opened. Write a comment and the student sees it in red "teacher's pen" next to their answers.

## Organizing exercises on GitHub

Keep the exercises repository (`miro-exercises`) in folders: one folder per program, and inside it one folder per lesson, with the files numbered in the order of the lesson.

```
miro-exercises/
├── phrasal-verbs/                      one program
│   ├── 01-get-and-take/                one lesson: "Get and take"
│   │   ├── 1-intro.html                section 1: "Intro"
│   │   ├── 2-match-up.html             section 2: "Match up"
│   │   └── 3-fill-in-the-gaps.html     section 3: "Fill in the gaps"
│   └── 02-look-up-and-look-after/
│       ├── 1-balloon-pop.html
│       └── 2-unjumble.html
└── Tamila_Part_1_Multiple_Choice.html  older files stay where they are
```

- The folder name becomes the lesson title and the file names become the section titles, in the order of their numbers (`10-…` comes after `9-…`). You can rename and reorder everything later in the program editor; GitHub does not have to change. Use letters, numbers and dashes in names (a name that starts with `_` is not published).
- To upload a lesson: on GitHub, open the program folder, then **Add file → Upload files**, drag the whole lesson folder from your computer, and **Commit changes**. GitHub keeps the folders. For a new program, stay in the main folder and drag the program folder (with the lesson folder inside) instead.
- Do not rename or move a file after it is used in a lesson: the lesson keeps the old address. Upload a new file instead. If it happens, the program editor marks the section "File not found on GitHub".
- Exercises that link to each other: keep them in the same folder and link by the file name only (`<a href="2-match-up.html">`). If the linked file is also a section of the lesson, the website switches to that section, so the result is saved in the right place.
- Older files in the main folder stay where they are, because lessons and Miro boards already use their addresses. A lesson can mix files from any folder.
- The list page of the repository (`dashaenglish.com/miro-exercises/`) shows only the files in the main folder. The website's *Exercise library* shows every folder.

## How exercises report results

The website reads the score your exercises already show, such as "Score: 12 / 18", "12 / 27 correct" or "All 15 correct", and collects what the student chose or typed. This works because your exercises and the website live on the same address (`dashaenglish.com`; exercises in any repository of the Dasha-English-Teacher account are served there too, for example `dashaenglish.com/miro-exercises/...`). Keep your exercises in a repository of the Dasha-English-Teacher account and they will work.

New exercises follow `exercise-kit/CHATGPT-INSTRUCTIONS.md`: they load the website's theme and `report.js`, and report their score and answers directly, which is the most reliable way.

## Good to know

- **Cost:** everything here is free. The free Supabase plan includes 500 MB of database space, which is plenty for many years of results. A free project pauses after a week without visits. The *keep-alive* task wakes it every 3 days, and you can also restore a paused project with one click in Supabase.
- **Security:** the publishable key in `config.js` is meant to be public. The database rules (row-level security) make sure each student sees only their own data and balance, and only the teacher can change programs, prices, payments, settings and feedback. Secret keys (like the Resend key) live only in Supabase Vault, never in this repository.
- **Your data:** in Supabase, *Table Editor* shows all tables like a spreadsheet, and every table can be exported to CSV.
- **Emails to students** (each can be switched off on *Website → Emails to students*): lesson reminders, a moved or cancelled lesson, your feedback on an exercise, a new program, payment receipts, a warning when the balance is less than one lesson, a welcome email when you approve an account, and invitations. Receipts for every lesson held are off by default. Students can turn all emails off in their profile. *Website → Email sending* shows whether sending works and lists the latest emails.
- **"Forgot password" emails** go through Resend: Supabase → *Authentication → Emails → SMTP Settings*, host `smtp.resend.com`, port `465`, user `resend`, password: a Resend API key, sender `lessons@dashaenglish.com`.
- **Trying things safely:** add `?demo` to the address (`https://dashaenglish.com/?demo`) to use the website with sample data that stays in your browser. Real data is not touched.

## Branching Advent lessons

See [the website guide](docs/WEBSITE-GUIDE.md#branching-stories) for the Advent preset, future chapters, and how to test and reset a story in Student view.

For Advent Part 5 setup and recording instructions, see the [website guide](docs/WEBSITE-GUIDE.md#connect-advent-part-5).

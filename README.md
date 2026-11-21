# English with Dasha: website

A website for online English lessons:

- **Students** sign in and see only their own classes, lessons and exercises, their schedule, their word list, and their results with your feedback.
- **You (the teacher)** control everything: students, classes, lessons, exercises, the calendar, lesson requests and the public page.
- **Exercises** are your usual HTML files on GitHub. The website opens them inside a lesson, reads the score and the answers automatically, saves them, and emails you.
- **Visitors** see your public page and can book a lesson or send a request.

Everything runs on free services: GitHub Pages (the website), Supabase (the database), FormSubmit (email notifications) and, if you want, Cal.com (a booking page).

## Current setup

- **Website:** https://dashaenglish.com (this repository, published with GitHub Pages). The old address https://dasha-english-teacher.github.io redirects there.
- **Domain:** dashaenglish.com, registered at Porkbun (account `dashakim`), renews 2027-11-21. DNS at Porkbun: ALIAS `dashaenglish.com` and CNAME `www` both point to `dasha-english-teacher.github.io`; a TXT record `_github-pages-challenge-Dasha-English-Teacher` proves to GitHub that the domain is hers. Do not delete these records.
- **Database:** Supabase project **english-studio** in the organization *English with Dasha* (free plan). Sign in to Supabase with Dasha's GitHub account. Email confirmation is turned off, and the site address is set under *Authentication → URL Configuration*.
- **Booking page:** Cal.com event **Trial lesson** (30 minutes): https://cal.com/dasha-teacher/trial-lesson. Still to do in Cal.com: set the real teaching hours (*Availability*) and connect Google Calendar (*Apps → Calendar*) so busy times are hidden.
  **If you change the Cal.com username or the event link, also update *Booking page link* on the website's Website page.** Otherwise the booking calendar shows "404, this page does not exist".
- **Notifications:** sent to the email on the website's *Website* page.

Steps 1, 2 and 5 below are already done. They stay here in case you ever need to set things up again.

## What is in this folder

| File or folder | What it is |
|---|---|
| `index.html`, `config.js`, `assets/` | The website itself |
| `supabase/schema.sql` | Sets up the database. You run it once. |
| `exercise-kit/` | How to make new exercises send their score (a sentence for your AI prompt and an example) |
| `.github/workflows/keep-alive.yml` | Keeps the free database awake during holidays |

Until `config.js` has the database details, the website runs in **demo mode** with example students and data that stays in your browser only.

## Setup (about 30 minutes, once)

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), press **Start your project**, and sign up with **Continue with GitHub** (use the Dasha-English-Teacher account).
2. Create a **New project**. Name: `english-studio`. Region: the one closest to most students (for example *East US*). For the database password, press **Generate a password** and save it somewhere safe. The website does not need it.
3. Wait about 2 minutes until the project is ready.
4. Open **SQL Editor**, then **New query**. Paste everything from `supabase/schema.sql` and press **Run**. You should see *Success. No rows returned*.
5. Open **Authentication**, then **Sign In / Providers**, then **Email**. Turn **off** *Confirm email* and save. (Supabase's built-in email only reaches your own team, so students could not confirm. You can turn it back on later if you connect your own email under *Emails → SMTP Settings*.)
6. Open **Authentication**, then **URL Configuration**. Set **Site URL** to `https://dasha-english-teacher.github.io/` and add the same address under **Redirect URLs**.
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

- **New student:** *Students → Invite a student*, tick their classes, send them the link. They choose a password and their classes are ready. People who sign up by themselves wait on *Requests* until you approve them.
- **New exercise:** upload the HTML file to your exercises repository as usual. Then open *Exercise library → Refresh* and press *Add to a lesson*.
- **Lessons and reminders:** *Calendar → Schedule a lesson*, then press **Open Google Calendar** and **Save**. Google sends the student an invitation and reminders. Students also see all their lessons on their *Schedule* page.
- **Checking work:** *Results → To review*. You see the score, each answer with ✓ or ✗, the time spent, and whether the answer key was opened. Write a comment and the student sees it in red "teacher's pen" next to their answers.

## How exercises report results

The website reads the score your exercises already show, such as "Score: 12 / 18", "12 / 27 correct" or "All 15 correct", and collects what the student chose or typed. This works because your exercises and the website live on the same address (`dashaenglish.com`; exercises in any repository of the Dasha-English-Teacher account are served there too, for example `dashaenglish.com/miro-exercises/...`). Keep your exercises in a repository of the Dasha-English-Teacher account and they will work.

For new exercises, add the sentence from `exercise-kit/AI-PROMPT.md` to your request to the AI. The exercise then reports its score directly, which is the most reliable way.

## Good to know

- **Cost:** everything here is free. The free Supabase plan includes 500 MB of database space, which is plenty for many years of results. A free project pauses after a week without visits. The *keep-alive* task wakes it every 3 days, and you can also restore a paused project with one click in Supabase.
- **Security:** the publishable key in `config.js` is meant to be public. The database rules (row-level security) make sure each student sees only their own data, and only the teacher can change classes, settings and feedback.
- **Your data:** in Supabase, *Table Editor* shows all tables like a spreadsheet, and every table can be exported to CSV.
- **Your own domain** (for example `englishwithdasha.com`) can be added later in *Settings → Pages → Custom domain*. Your exercises keep working because GitHub moves them to the same domain.

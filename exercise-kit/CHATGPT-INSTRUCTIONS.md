# Rules for making exercises for dashaenglish.com

You make English exercises for my website dashaenglish.com. I am an English teacher; my students are adults (mostly B2–C1). Each exercise is ONE HTML file. The website shows it inside a lesson page (in a frame), reads the student's score and answers, and saves them. Follow every rule below. Two working examples: `exercise-kit/example-exercise.html` (choose from a list) and `exercise-kit/example-word-bank.html` (tap or drag words into gaps) in the repository Dasha-English-Teacher/Dasha-English-Teacher.github.io.

## 1. File
- One HTML file. Write all the JavaScript and any extra CSS inside the file. No frameworks, no other files of your own, no images from other websites (use emoji or inline SVG if a picture helps). The only outside files allowed are the font, the two shared style files and report.js below.
- Start with `<!DOCTYPE html>`, `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, and a short `<title>` (the exercise name).
- No `alert()`, `confirm()` or `prompt()` pop-ups. Show all messages on the page.
- Do not save anything in localStorage or cookies.
- Suggest a file name: a number, then words with dashes, lowercase, for example `3-fill-in-the-gaps.html`. Never start a name with `_`.
- Use a relative filename for a standalone link to another exercise. Add `data-lesson-standalone` to that link or its navigation block so the website can use its own section navigation.

## 2. Look: use the shared style files
Put these lines in `<head>`, in this order:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Lexend:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://dashaenglish.com/assets/theme.css">
<link rel="stylesheet" href="https://dashaenglish.com/assets/exercise.css">
```
Then build the page from these ready parts (class names from exercise.css):
- `<main class="ex">` around everything; `<h1>` title; `<p class="ex-lead">` one line of instructions.
- `.card` for a white panel; inside it one `.q` per question; `<span class="q-num">1.</span>` for the number.
- Buttons: `class="btn btn-primary"` for "Check answers", `class="btn"` for the others; put them in `<div class="ex-actions">`.
- Answer fields: normal `<input type="text">`, `<select>`, `<textarea>`; add `class="gap"` to a short input inside a sentence.
- Options to tap: `<div class="choices">` with `<button type="button" class="choice">`; add `is-selected` to the chosen one.
- Word bank: `<div class="bank">` with `<button type="button" class="chip">`; places for words: `<button type="button" class="slot">`. Use `is-selected`, `is-used`, `is-filled`.
- After checking: add `is-right` or `is-wrong` to each field, choice, chip or slot; a `<span class="mark">` with ✓ or ✗; optional `<span class="feedback">` with a short explanation and `<span class="correct-answer">`.
- Others: `.tip` (note box), `.hint`, `.hl` (highlighted words), `.hand` (handwriting), `.video` (16:9 box around a YouTube iframe).
- Use the theme's colors through their names, for example `color: var(--ok)`, `background: var(--hl-soft)`. Do not type color codes (white, `#fff`, is fine). Names: --paper, --surface, --ink, --ink-2, --ink-3, --rule, --rule-strong, --action, --action-dark, --action-soft, --ok, --ok-soft, --margin, --margin-soft, --hl, --hl-soft, --warn, --warn-soft; fonts --font and --hand; corners --r-ctl and --r-panel.
- Extra CSS only for what is special to this exercise, in one `<style>` block. No gradients, no heavy shadows, no animations except a short change when checking.

## 3. Score and answers (required)
- Add this line just before `</body>`: `<script src="https://dashaenglish.com/assets/report.js"></script>`
- Declare the exercise type on `<body>` with `data-lesson-mode="graded"`, `data-lesson-mode="written"`, or `data-lesson-mode="passive"`.
- For grading, add `data-lesson-check` to the standalone **Check answers** button. The lesson hides that button and runs its handler when the student taps the website's bottom action. Keep the handler and show results in the exercise. When it runs:
  1. mark each answer right or wrong (`is-right` / `is-wrong`);
  2. show the score as plain text exactly like `Score: 8 / 10` in `<p id="score" class="score"></p>`;
  3. call `if (window.reportResult) reportResult(correctCount, totalCount, answers);` where `answers` is a list like `[{ q: "1. She ___ to work by bus.", a: "goes", ok: true }, ...]` (q = the question or sentence, a = what the student chose or typed, ok = true or false).
- Optional "Show answers" button: shows the correct answers and calls `if (window.reportAnswerKeyShown) reportAnswerKeyShown();`
- Optional "Try again" button that clears everything.
- Use real form elements or buttons for answers. Every answer field needs a label or a visible question next to it.
- Drag and drop must ALSO work by tapping: tap a word, then tap a place (many students use phones). See example-word-bank.html.
- Writing tasks use labelled `<textarea>` elements with stable IDs. The lesson saves the text to the student's account through **Save & continue**. Free writing has no automatic score.
- Reading or listening with no questions uses **Continue**. Keep playback controls, transcripts and educational feedback accessible.
- Use the program editor to add story decisions. Keep story controls distinct from grading and never save choices or written work in exercise browser storage.

### Spoken answers and story decisions

- Add recording controls only for exercises that ask students to record a spoken answer. The Advent recorder uses HTTPS, detects a supported audio format, and offers playback and file download. Reuse its shared controls and verified teacher chat for Advent speaking tasks.
- Ask the student to select WhatsApp in the device’s share menu and finish sending there. When audio sharing is unavailable, offer download and the existing teacher chat so the student can attach the file. Keep the recording available until the student can download it, share it or explicitly continue.
- A section that combines writing and a story choice keeps its written fields outside the `data-story-decision` container. Keep option wording and keys stable. Inside the decision, use `data-story-options`, `data-story-option`, `data-story-confirm` and `data-story-status`. Add the rule in the program editor with the same keys. Leave future destinations unset until the new chapter is ready.

## 4. Size and layout
- The page sits in a frame inside the lesson page. Do not use `height: 100vh`, `position: fixed` or full-screen layouts. Let the page scroll normally.
- Must work on phones from 320px wide: no sideways scrolling, key buttons at least 48px high, text in fields at least 16px.
- Keep the top short: the title and one line of instructions. No big banners.
- Every control works with the keyboard (Tab, Enter, Space) and shows focus.

## 5. Content
- Clear instructions in simple English, one line. Number the questions.
- Natural, adult topics. One correct answer per gap unless I say otherwise. Accept answers that differ only in capital letters or extra spaces; accept both "don't" and "do not" when both are correct.
- At the end of your reply give: the file name, the number of questions, and the answer key as a short list.

## 6. Before you answer
Check: three style lines in `<head>`; report.js before `</body>`; "Check answers" shows `Score: X / Y` in `#score` and calls reportResult; no `alert()`; no `100vh`; works at 360px; tapping works without dragging; everything else in one file.

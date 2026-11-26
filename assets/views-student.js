// Student pages: programs, lessons, schedule, words, results, profile and balance.
import { html, icon, toast, openModal, nl2br, fmtDate, fmtDateLong, fmtTime, fmtDateTime, timeAgo, duration, pct, plural, sameDay, ask } from './ui.js';
import { S, go, refresh, isTeacher, progressIndex, sectionDone, lessonDone, courseStats, scoreText, scoreClass, gcalUrl, icsText, downloadText, teacherName, money, priceOf, ledgerFor, balanceLevel, invalidateNav, isExerciseAttempt } from './core.js';
import { balanceCard, ledgerItems, ledgerList } from './views-billing.js';

// ---------- shared pieces ----------
export function bar(done, total, label) {
  const p = pct(done, total);
  return html`<div class="hl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="${label || 'Progress'}"><span style="width:${p}%"></span></div>`;
}

export function tile(course, size = '') {
  return html`<span class="tile ${size}" style="--tile:${course.color || '#1f4fd1'}" aria-hidden="true">${course.emoji || '📘'}</span>`;
}

const KIND_ICON = { exercise: 'pen', video: 'video', link: 'link', text: 'note' };
const SESSION_WORD = { scheduled: 'past', done: 'held', missed: 'missed', cancelled: 'cancelled' };
export const kindIcon = (k) => icon(KIND_ICON[k] || 'pen');

function sessionRow(s, { showStudent = null } = {}) {
  const end = new Date(new Date(s.starts_at).getTime() + (s.minutes || 60) * 60000);
  return html`<li class="session ${s.status !== 'scheduled' ? `is-${s.status}` : ''}">
    <div class="session-time"><strong>${fmtTime(s.starts_at)}</strong><span>${fmtTime(end)}</span></div>
    <div class="session-body">
      <div class="session-title">${s.title}${showStudent ? html` <span class="muted">with ${showStudent}</span>` : ''}${s.status !== 'scheduled' ? html` <span class="chip chip-${s.status}">${SESSION_WORD[s.status] || s.status}</span>` : ''}</div>
      ${s.note ? html`<p class="muted small">${s.note}</p>` : ''}
    </div>
    <div class="session-actions">
      ${s.meeting_url && s.status === 'scheduled' ? html`<a class="btn btn-primary btn-sm" href="${s.meeting_url}" target="_blank" rel="noopener">Join</a>` : ''}
      ${s.status === 'scheduled' ? html`<a class="btn btn-sm" href="${gcalUrl({ title: `${s.title} with ${teacherName()}`, start: s.starts_at, minutes: s.minutes, details: [s.note, s.meeting_url].filter(Boolean).join('\n'), where: s.meeting_url })}" target="_blank" rel="noopener" title="Add to Google Calendar">${icon('calendar')}<span class="hide-sm">Add to calendar</span></a>` : ''}
    </div>
  </li>`;
}

export function agenda(sessions, opts = {}) {
  const days = [];
  for (const s of sessions) {
    const last = days[days.length - 1];
    if (last && sameDay(last.date, s.starts_at)) last.items.push(s);
    else days.push({ date: s.starts_at, items: [s] });
  }
  return html`${days.map((d) => html`<section class="day"><h3 class="day-head">${sameDay(d.date, new Date()) ? 'Today' : fmtDateLong(d.date)}</h3>
    <ul class="sessions">${d.items.map((s) => (opts.row ? opts.row(s) : sessionRow(s, opts)))}</ul></section>`)}`;
}

// ---------- My programs (student home) ----------
export async function programsView() {
  const now = Date.now();
  const [tree, attempts, sessions, payments, held] = await Promise.all([
    S.api.tree(),
    S.api.listAttempts({ student_id: S.me.id }),
    S.api.listSessions({ from: new Date(now - 2 * 3600000), to: new Date(now + 30 * 86400000), student_id: S.me.id }),
    S.api.listPayments({ student_id: S.me.id }).catch(() => []),
    S.api.listHeld({ student_id: S.me.id }).catch(() => []),
  ]);
  const idx = progressIndex(attempts);
  const next = sessions.find((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() + (s.minutes || 60) * 60000 > now);
  const unseen = attempts.filter((a) => a.feedback && !a.feedback_seen);
  const visible = new Set(tree.flatMap((c) => c.lessons.flatMap((l) => l.materials.map((m) => m.id))));
  const cont = attempts.find((a) => a.status === 'in_progress' && visible.has(a.material_id));
  const first = (S.me.full_name || '').split(' ')[0];
  const L = ledgerFor(S.me.id, payments, held);
  const price = priceOf(S.me);
  const level = balanceLevel(L.balance, price);
  const lowBalance = (L.any || price > 0) && (level === 'out' || (level === 'low' && next));

  return {
    title: 'My programs',
    html: html`
      <div class="page-head"><p class="hand hand-lg">Hi${first ? `, ${first}` : ''}!</p><h1>My programs</h1></div>
      ${next ? html`<div class="next-lesson">
          <div><span class="muted small">Next lesson</span><p class="next-when">${sameDay(next.starts_at, new Date()) ? 'Today' : fmtDateLong(next.starts_at)}, ${fmtTime(next.starts_at)}</p>
          ${next.note ? html`<p class="muted small">${next.note}</p>` : ''}</div>
          <div class="row-gap">${next.meeting_url ? html`<a class="btn btn-primary" href="${next.meeting_url}" target="_blank" rel="noopener">Join lesson</a>` : ''}
          <a class="btn" href="#schedule">${icon('calendar')} Schedule</a></div></div>` : ''}
      ${lowBalance ? html`<a class="balance-alert is-${level}" href="#pay">${icon('wallet')}<span>${L.balance < 0 ? `Your balance is ${money(L.balance)}. Please pay for the lessons you had.` : level === 'out' ? `Your balance is ${money(L.balance)}, less than one lesson.` : `Your balance is ${money(L.balance)}, enough for one more lesson.`} <strong>Top up with Kaspi</strong></span></a>` : ''}
      ${unseen.length ? html`<a class="feedback-alert" href="#result-${unseen[0].id}"><span class="dot"></span>${teacherName()} left feedback on ${unseen.length === 1 ? `"${unseen[0].material_title}"` : plural(unseen.length, 'exercise')}. <strong>Read it</strong></a>` : ''}
      ${cont ? html`<a class="continue" href="#play-${cont.material_id}">${icon('play')}<span>Continue <strong>${cont.material_title}</strong>${cont.score != null ? html` <span class="muted">(${scoreText(cont)})</span>` : ''}</span></a>` : ''}
      ${tree.length ? html`<ul class="course-list">${tree.map((c) => {
        const st = courseStats(c, idx);
        return html`<li><a class="course-row" href="#program-${c.id}">
          ${tile(c)}
          <div class="course-main"><h2>${c.title}</h2>${c.level ? html`<span class="muted small">${c.level}</span>` : ''}
            <div class="course-progress">${bar(st.done, st.total, `Lessons completed in ${c.title}`)}<span class="small">${st.done} of ${plural(st.total, 'lesson')} completed</span></div></div>
        </a></li>`;
      })}</ul>` : html`<div class="empty"><h2>No programs yet</h2><p>${teacherName()} will open a program for you soon. Your lessons and exercises will appear here.</p></div>`}`,
  };
}

// ---------- One program: its lessons ----------
export async function programView({ id }) {
  const [tree, attempts] = await Promise.all([S.api.tree(), isTeacher() ? [] : S.api.listAttempts({ student_id: S.me.id })]);
  const course = tree.find((c) => c.id === id);
  if (!course) return missing('This program is not available', 'programs');
  const idx = progressIndex(attempts);
  const st = courseStats(course, idx);
  const teacher = isTeacher();
  let q = '';

  const card = (l, i) => {
    const total = l.materials.length;
    const done = teacher ? 0 : l.materials.filter((m) => sectionDone(m, idx)).length;
    const started = !teacher && l.materials.some((m) => m.decision || (!m.story?.only && idx.get(m.id)));
    const finished = !teacher && lessonDone(l, idx);
    const state = finished ? 'done' : started ? 'started' : '';
    return html`<li data-title="${l.title.toLowerCase()}"><a class="lesson-card ${state ? `is-${state}` : ''}" href="#lesson-${l.id}">
      <span class="lesson-tile" aria-hidden="true">${i + 1}</span>
      <span class="lesson-card-main"><span class="tile-label">Lesson ${i + 1}</span><strong>${l.title}</strong>
        <span class="muted small">${plural(total, 'section')}${started && !finished ? `, ${done} done` : ''}${teacher && !l.published ? ', hidden draft' : ''}</span></span>
      ${finished ? html`<span class="chip chip-good hide-sm">${icon('check')} Completed</span>` : started ? html`<span class="chip chip-fair hide-sm">In progress</span>` : ''}
      <span class="btn btn-sm ${finished ? '' : 'btn-primary'} lesson-open">${finished ? 'Review' : started ? 'Continue' : 'Open lesson'}${icon('next')}</span>
    </a></li>`;
  };

  return {
    title: course.title,
    html: html`
      <nav class="crumbs"><a href="#programs">${teacher ? 'Programs' : 'My programs'}</a></nav>
      <div class="page-head with-tile">${tile(course, 'tile-lg')}<div><h1>${course.title}</h1>${course.description ? html`<p class="lede">${course.description}</p>` : ''}</div></div>
      ${teacher ? html`<p class="notice small">This is what students see. <a href="#edit-program-${course.id}">Edit this program</a></p>` : html`
        <div class="course-progress wide">${bar(st.done, st.total)}<span>${st.done} of ${plural(st.total, 'lesson')} completed</span></div>`}
      ${course.lessons.length > 6 ? html`<input type="search" class="search-wide" placeholder="Search lessons" data-input="q" aria-label="Search lessons">` : ''}
      ${course.lessons.length ? html`<ol class="lesson-cards" style="--prog:${course.color || '#1f4fd1'}">${course.lessons.map(card)}</ol>
        <p class="muted small empty-sm" id="no-lessons" hidden>No lessons match.</p>`
        : html`<div class="empty"><p>No lessons in this program yet.</p></div>`}`,
    input: {
      q(el) {
        q = el.value.trim().toLowerCase();
        let shown = 0;
        document.querySelectorAll('.lesson-cards > li').forEach((li) => { const ok = !q || li.dataset.title.includes(q); li.hidden = !ok; if (ok) shown += 1; });
        const none = document.getElementById('no-lessons');
        if (none) none.hidden = shown > 0;
      },
    },
  };
}

function missing(title, back) {
  return { title, html: html`<div class="empty"><h1>${title}</h1><p>It may have been moved or hidden. <a href="#${back}">Go back</a></p></div>` };
}

// ---------- Schedule ----------
export async function scheduleView() {
  const now = Date.now();
  const all = await S.api.listSessions({ from: new Date(now - 60 * 86400000), student_id: S.me.id });
  const upcoming = all.filter((s) => new Date(s.starts_at).getTime() + (s.minutes || 60) * 60000 > now && s.status !== 'cancelled');
  const past = all.filter((s) => !upcoming.includes(s)).reverse().slice(0, 12);
  return {
    title: 'Schedule',
    html: html`
      <div class="page-head row-between"><div><h1>Schedule</h1><p class="lede">Times are shown in your time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).</p></div>
        ${S.settings.booking_url ? html`<a class="btn" href="#book">Book an extra lesson</a>` : ''}</div>
      ${upcoming.length ? html`${agenda(upcoming)}
        <p><button class="btn btn-sm" data-on="ics">${icon('calendar')} Download all lessons for your calendar (.ics)</button></p>`
        : html`<div class="empty"><h2>No lessons planned</h2><p>When ${teacherName()} schedules a lesson, it will appear here${S.settings.booking_url ? html`, or you can <a href="#book">book one</a>` : ''}.</p></div>`}
      ${past.length ? html`<details class="past"><summary>Past lessons</summary><ul class="sessions">${past.map((s) => html`<li class="session is-past"><div class="session-time"><strong>${fmtDate(s.starts_at)}</strong><span>${fmtTime(s.starts_at)}</span></div><div class="session-body">${s.title} <span class="chip chip-${s.status}">${SESSION_WORD[s.status] || s.status}</span></div></li>`)}</ul></details>` : ''}`,
    on: {
      ics() { downloadText('english-lessons.ics', icsText(upcoming, `${S.settings.site_name} lessons`)); },
    },
  };
}

// ---------- My words ----------
export async function wordsView({ studentId } = {}) {
  const owner = studentId || S.me.id;
  let words = await S.api.listWords(owner);
  let filter = 'all';
  let query = '';
  const list = () => {
    const q = query.toLowerCase();
    const rows = words.filter((w) => (filter === 'all' || (filter === 'learn' ? !w.learned : w.learned))
      && (!q || `${w.term} ${w.meaning} ${w.example}`.toLowerCase().includes(q)));
    if (!rows.length) return html`<p class="muted empty-sm">${words.length ? 'No words match.' : 'Your list is empty. Add words you want to remember from lessons.'}</p>`;
    return html`<ul class="word-list">${rows.map((w) => html`<li class="${w.learned ? 'is-learned' : ''}">
      <div class="word-main"><strong class="term">${w.term}</strong>${w.meaning ? html`<span class="meaning">${w.meaning}</span>` : ''}${w.example ? html`<em class="example">${w.example}</em>` : ''}</div>
      <div class="word-actions">
        <button class="icon-btn ${w.learned ? 'is-on' : ''}" data-on="learned" data-id="${w.id}" aria-label="${w.learned ? 'Mark as not learned' : 'Mark as learned'}" title="${w.learned ? 'Learned' : 'Mark as learned'}">${icon('check')}</button>
        <button class="icon-btn" data-on="del" data-id="${w.id}" aria-label="Delete word" title="Delete">${icon('trash')}</button>
      </div></li>`)}</ul>`;
  };
  const paint = () => { const box = document.getElementById('word-box'); if (box) box.innerHTML = list().toString(); };
  const counts = () => `${words.length} words, ${words.filter((w) => w.learned).length} learned`;
  return {
    title: 'My words',
    html: html`
      ${studentId ? '' : html`<div class="page-head row-between"><div><h1>My words</h1><p class="lede" id="word-count">${counts()}</p></div>
        <button class="btn" data-on="practice" ${words.length ? '' : 'disabled'}>Practice with cards</button></div>`}
      <form class="form word-form" data-submit="add">
        <input name="term" required maxlength="200" placeholder="Word or expression" aria-label="Word or expression">
        <input name="meaning" maxlength="500" placeholder="Meaning" aria-label="Meaning">
        <input name="example" maxlength="500" placeholder="Example sentence (optional)" aria-label="Example sentence">
        <button class="btn btn-primary" type="submit">${icon('plus')} Add</button>
      </form>
      <div class="toolbar">
        <input type="search" placeholder="Search" data-input="search" aria-label="Search words">
        <div class="seg" role="group" aria-label="Filter">
          <button class="seg-btn is-on" data-on="filter" data-f="all">All</button>
          <button class="seg-btn" data-on="filter" data-f="learn">To learn</button>
          <button class="seg-btn" data-on="filter" data-f="learned">Learned</button>
        </div>
      </div>
      <div id="word-box">${list()}</div>`,
    input: { search(el) { query = el.value; paint(); } },
    on: {
      filter(el) {
        filter = el.dataset.f;
        el.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b === el));
        paint();
      },
      async learned(el) {
        const w = words.find((x) => x.id === el.dataset.id);
        const row = await S.api.saveWord({ id: w.id, learned: !w.learned });
        Object.assign(w, row); paint();
        const c = document.getElementById('word-count'); if (c) c.textContent = counts();
      },
      async del(el) {
        await S.api.deleteWord(el.dataset.id);
        words = words.filter((x) => x.id !== el.dataset.id); paint();
        const c = document.getElementById('word-count'); if (c) c.textContent = counts();
      },
      practice() { practice(words.filter((w) => !w.learned).length ? words.filter((w) => !w.learned) : words, (w) => { w.learned = true; paint(); }); },
    },
    submit: {
      async add(d, form) {
        const row = await S.api.saveWord({ student_id: owner, term: d.term.trim(), meaning: d.meaning.trim(), example: d.example.trim(), learned: false });
        words.unshift(row); form.reset(); form.term.focus(); paint();
        const c = document.getElementById('word-count'); if (c) c.textContent = counts();
      },
    },
  };
}

function practice(source, onLearned) {
  const cards = [...source].sort(() => Math.random() - 0.5);
  let i = 0;
  let shown = false;
  const body = () => {
    if (i >= cards.length) return html`<div class="flash-done"><p class="hand hand-lg">Well done!</p><p>You went through ${plural(cards.length, 'card')}.</p><div class="row-end"><button class="btn btn-primary" data-on="close">Close</button></div></div>`;
    const w = cards[i];
    return html`<div class="flash">
      <p class="muted small">Card ${i + 1} of ${cards.length}</p>
      <p class="flash-term">${w.term}</p>
      ${shown ? html`<p class="flash-meaning">${w.meaning || '(no meaning saved)'}</p>${w.example ? html`<p class="example">${w.example}</p>` : ''}` : ''}
      <div class="row-end">${shown
        ? html`<button class="btn" data-on="next">Again later</button><button class="btn btn-primary" data-on="knew">I knew it</button>`
        : html`<button class="btn btn-primary" data-on="show">Show meaning</button>`}</div></div>`;
  };
  const m = openModal({
    title: 'Practice',
    body: body(),
    on: {
      show() { shown = true; m.setBody(body()); },
      next() { i += 1; shown = false; m.setBody(body()); },
      async knew() { const w = cards[i]; await S.api.saveWord({ id: w.id, learned: true }); onLearned(w); i += 1; shown = false; m.setBody(body()); },
    },
  });
}

// ---------- Results ----------
export async function resultsView() {
  const attempts = (await S.api.listAttempts({ student_id: S.me.id, limit: 200 })).filter(isExerciseAttempt);
  return {
    title: 'My results',
    html: html`<div class="page-head"><h1>My results</h1><p class="lede">Every exercise you worked on, with ${teacherName()}'s feedback.</p></div>
      ${attempts.length ? html`<ul class="result-list">${attempts.map((a) => html`<li><a class="result-row" href="#result-${a.id}">
        <div><strong>${a.material_title || 'Exercise'}</strong><span class="muted small">${a.status === 'completed' ? `Sent ${timeAgo(a.finished_at || a.updated_at)}` : `In progress, ${timeAgo(a.updated_at || a.started_at)}`}</span></div>
        <div class="result-side">${a.feedback ? html`<span class="fb-link ${a.feedback_seen ? '' : 'is-new'}">${a.feedback_seen ? 'Feedback' : 'New feedback'}</span>` : ''}
          ${a.score != null ? html`<span class="score ${scoreClass(a)}">${scoreText(a)}</span>` : ''}</div>
      </a></li>`)}</ul>` : html`<div class="empty"><h2>No results yet</h2><p>Open a program and start an exercise. Your scores will appear here.</p></div>`}`,
  };
}

export function answersTable(a) {
  const rows = (a.answers || []).filter((x) => x.a || x.q);
  if (!rows.length) return html`<p class="muted">No answers were saved for this exercise.</p>`;
  return html`${a.revealed ? html`<p class="muted small">These are the answers as they were before the answer key was opened.</p>` : ''}<ol class="answers">${rows.map((x) => html`<li class="${x.ok === true ? 'is-ok' : x.ok === false ? 'is-no' : ''}">
    ${x.q ? html`<p class="answer-q">${x.q}</p>` : ''}
    <p class="answer-a">${x.ok === true ? html`<span class="mark mark-ok" aria-label="correct">✓</span>` : x.ok === false ? html`<span class="mark mark-no" aria-label="incorrect">✗</span>` : ''}${x.a ? nl2br(x.a) : html`<span class="muted">(no answer)</span>`}</p>
  </li>`)}</ol>`;
}

export function attemptFacts(a) {
  return html`<dl class="facts">
    <div><dt>Score</dt><dd>${a.score != null ? html`<span class="score ${scoreClass(a)}">${scoreText(a)}</span>` : 'No score'}</dd></div>
    ${a.first_score != null && (a.first_score !== a.score || a.first_max !== a.max_score) ? html`<div><dt>First check</dt><dd>${a.first_score} / ${a.first_max}</dd></div>` : ''}
    <div><dt>Time</dt><dd>${duration(a.seconds)}</dd></div>
    <div><dt>${a.status === 'completed' ? 'Sent' : 'Started'}</dt><dd>${fmtDateTime(a.finished_at || a.started_at)}</dd></div>
    ${a.revealed ? html`<div><dt>Answer key</dt><dd>Opened</dd></div>` : ''}
  </dl>`;
}

export async function resultView({ id }) {
  const a = await S.api.getAttempt(id);
  if (!a) return missing('This result is not available', 'results');
  if (a.feedback && !a.feedback_seen && a.student_id === S.me.id) {
    S.api.updateAttempt(a.id, { feedback_seen: true }).catch(() => {});
  }
  return {
    title: a.material_title,
    html: html`
      <nav class="crumbs"><a href="#results">My results</a></nav>
      <div class="page-head"><h1>${a.material_title}</h1></div>
      ${attemptFacts(a)}
      ${a.feedback ? html`<div class="teacher-note"><p class="teacher-note-who">${teacherName()} wrote</p><p class="hand teacher-note-text">${nl2br(a.feedback)}</p></div>`
        : a.status === 'completed' ? html`<p class="muted">${teacherName()} has not left a comment yet.</p>` : ''}
      <h2 class="section-title">Your answers</h2>
      ${answersTable(a)}
      ${a.material_id ? html`<p class="next-link"><a class="btn" href="#play-${a.material_id}">Do this exercise again</a></p>` : ''}`,
  };
}

// ---------- Profile (students and teacher) ----------
export async function profileView() {
  const me = S.me;
  const teacher = isTeacher();
  const email = me.email || me.auth_email || '';
  let payments = [];
  let held = [];
  let lessonTitle = () => '';
  if (!teacher) {
    const [p, h, tree] = await Promise.all([
      S.api.listPayments({ student_id: me.id }).catch(() => []),
      S.api.listHeld({ student_id: me.id }).catch(() => []),
      S.api.tree().catch(() => []),
    ]);
    payments = p;
    held = h;
    const titles = new Map(tree.flatMap((c) => c.lessons.map((l) => [l.id, l.title])));
    lessonTitle = (id) => (id ? titles.get(id) || '' : '');
    invalidateNav(); // the side menu shows the balance; keep it fresh
  }
  const items = ledgerItems(payments, held);
  return {
    title: 'Profile',
    html: html`
      <div class="page-head"><h1>Profile</h1><p class="lede">${me.full_name || email}</p></div>
      ${teacher ? '' : html`
        <section aria-labelledby="bal-h"><h2 class="section-title" id="bal-h">Balance</h2>
          ${balanceCard(me, payments, held)}
          <details class="history" ${items.length && items.length <= 8 ? 'open' : ''}><summary>Payments and lessons <span class="count">${items.length}</span></summary>
            ${ledgerList(items, { lessonTitle, empty: `No payments or lessons yet. When ${teacherName()} records your payment, it appears here.` })}</details>
        </section>`}
      <h2 class="section-title">About you</h2>
      <form class="form card-plain" data-submit="save">
        <div class="grid-2">
          <label>Name<input name="full_name" value="${me.full_name}" maxlength="120" required autocomplete="name"></label>
          <label>Email<input value="${email}" readonly aria-readonly="true" class="is-readonly"><span class="hint">You sign in with this address${teacher ? '' : ', and lesson reminders go here'}.</span></label>
          <label>Phone or messenger <span class="opt">optional</span><input name="phone" value="${me.phone || ''}" maxlength="80" autocomplete="tel"></label>
          ${teacher ? '' : html`<label>Your level<input name="level" value="${me.level || ''}" maxlength="40" placeholder="For example B2"></label>`}
        </div>
        ${teacher ? '' : html`<label>Your goals<textarea name="goals" rows="3" maxlength="1000" placeholder="What do you want to achieve with English?">${me.goals || ''}</textarea></label>
          <label class="check"><input type="checkbox" name="email_notifications" ${me.email_notifications !== false ? 'checked' : ''}> Email me lesson reminders, feedback from ${teacherName()} and payment receipts</label>`}
        <div class="row-end"><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>
      <h2 class="section-title">Password</h2>
      <form class="form card-plain" data-submit="password">
        <label>New password<input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
        <div class="row-end"><button class="btn" type="submit">Change password</button></div>
      </form>
      <p><button class="btn btn-ghost" data-on="signout">${icon('logout')} Sign out</button></p>`,
    submit: {
      async save(d) {
        const row = await S.api.updateProfile(me.id, {
          full_name: d.full_name.trim(), phone: d.phone.trim(),
          ...(teacher ? {} : { level: d.level.trim(), goals: d.goals.trim(), email_notifications: !!d.email_notifications }),
        });
        Object.assign(S.me, row);
        toast('Changes saved');
        refresh();
      },
      async password(d, form) {
        if (S.api.mode === 'demo') { toast('Demo accounts have no passwords.'); return; }
        await S.api.setPassword(d.password);
        form.reset();
        toast('Password changed');
      },
    },
    on: {
      async signout() {
        if (!(await ask('Sign out?', { ok: 'Sign out' }))) return;
        await S.api.signOut();
        location.hash = 'home';
      },
    },
  };
}

export { sessionRow, money };

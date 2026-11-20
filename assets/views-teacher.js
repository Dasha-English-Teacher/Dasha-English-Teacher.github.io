// Teacher pages: today, students, classes, library, results, calendar, requests, website settings.
import { html, raw, icon, toast, openModal, ask, copyText, nl2br, fmtDate, fmtDateLong, fmtTime, fmtDateTime, fmtDay, timeAgo, duration, plural, initials, sameDay, startOfWeek, addDays, startOfDay, dateInput, timeInput, setTimeFormat, esc } from './ui.js';
import { S, go, refresh, progressIndex, courseStats, scoreText, scoreClass, gcalUrl, loadLibrary, siteUrl, teacherName } from './core.js';
import { tile, bar, kindIcon, agenda, answersTable, attemptFacts } from './views-student.js';

const STATUS_LABEL = { active: 'Active', pending: 'Waiting for approval', paused: 'Paused', archived: 'Archived' };
const EMOJIS = ['📘', '✍️', '🌿', '🗣️', '🎧', '🎬', '🧠', '💼', '✈️', '📈', '⭐', '☕'];
const COLORS = ['#1f4fd1', '#1e8a5a', '#c2410c', '#7c3aed', '#0e7490', '#be185d', '#a16207', '#334155'];

const nameOf = (profiles) => {
  const m = new Map(profiles.map((p) => [p.id, p.full_name || p.email || 'Student']));
  return (id) => (id ? m.get(id) || 'Former student' : '');
};
const students = (profiles) => profiles.filter((p) => p.role === 'student');
const avatar = (p) => html`<span class="avatar" aria-hidden="true">${initials(p.full_name || p.email)}</span>`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// =====================================================================
// Today
// =====================================================================
export async function todayView() {
  const now = new Date();
  const [profiles, sessions, attempts, requests] = await Promise.all([
    S.api.listProfiles(),
    S.api.listSessions({ from: startOfDay(now), to: addDays(startOfDay(now), 8) }),
    S.api.listAttempts({ limit: 300 }),
    S.api.listRequests(),
  ]);
  const name = nameOf(profiles);
  const toReview = attempts.filter((a) => a.status === 'completed' && !a.reviewed);
  const pending = profiles.filter((p) => p.status === 'pending');
  const newReq = requests.filter((r) => r.status === 'new');
  const upcoming = sessions.filter((s) => s.status !== 'cancelled');
  const first = (S.me.full_name || teacherName()).split(' ')[0];

  return {
    title: 'Today',
    html: html`
      <div class="page-head"><p class="hand hand-lg">${greeting()}, ${first}!</p><h1>Today</h1></div>
      <div class="dash">
        <section class="dash-col dash-wide">
          <div class="row-between"><h2 class="section-title">Lessons this week</h2><a class="btn btn-sm" href="#calendar">${icon('calendar')} Calendar</a></div>
          ${upcoming.length ? agenda(upcoming, { row: (s) => teacherSessionRow(s, name) }) : html`<p class="muted empty-sm">No lessons in the next 7 days. <a href="#calendar">Schedule a lesson</a></p>`}
        </section>
        <section class="dash-col">
          <h2 class="section-title">Waiting for your review</h2>
          ${toReview.length ? html`<ul class="mini-list">${toReview.slice(0, 8).map((a) => html`<li><a href="#review-${a.id}">
            <strong>${name(a.student_id)}</strong><span>${a.material_title}</span>
            <span class="mini-side">${a.score != null ? html`<span class="score ${scoreClass(a)}">${scoreText(a)}</span>` : ''}<span class="muted small">${timeAgo(a.finished_at || a.updated_at)}</span></span></a></li>`)}</ul>
            ${toReview.length > 8 ? html`<p><a href="#reviews">See all ${toReview.length}</a></p>` : ''}`
          : html`<p class="muted empty-sm">All caught up. New results appear here when students press Finish.</p>`}
        </section>
        <section class="dash-col">
          <h2 class="section-title">New requests</h2>
          ${pending.length || newReq.length ? html`<ul class="mini-list">
            ${pending.map((p) => html`<li><a href="#requests"><strong>${p.full_name || p.email}</strong><span>New account, waiting for approval</span><span class="mini-side muted small">${timeAgo(p.created_at)}</span></a></li>`)}
            ${newReq.map((r) => html`<li><a href="#requests"><strong>${r.name}</strong><span>${r.message || 'Wants to book a lesson'}</span><span class="mini-side muted small">${timeAgo(r.created_at)}</span></a></li>`)}
          </ul>` : html`<p class="muted empty-sm">No new requests.</p>`}
        </section>
      </div>`,
    on: sessionActions(),
  };
}

function teacherSessionRow(s, name) {
  const end = new Date(new Date(s.starts_at).getTime() + (s.minutes || 60) * 60000);
  const who = name(s.student_id);
  return html`<li class="session ${s.status !== 'scheduled' ? `is-${s.status}` : ''}">
    <div class="session-time"><strong>${fmtTime(s.starts_at)}</strong><span>${fmtTime(end)}</span></div>
    <div class="session-body">
      <div class="session-title">${who ? html`<a href="#student-${s.student_id}">${who}</a>, ` : ''}${s.title}${s.status !== 'scheduled' ? html` <span class="chip chip-${s.status}">${s.status}</span>` : ''}</div>
      ${s.note ? html`<p class="muted small">${s.note}</p>` : ''}
    </div>
    <div class="session-actions">
      ${s.meeting_url && s.status === 'scheduled' ? html`<a class="btn btn-sm" href="${s.meeting_url}" target="_blank" rel="noopener">Join</a>` : ''}
      <button class="icon-btn" data-on="session-menu" data-id="${s.id}" aria-label="Lesson options" title="Options">${icon('more')}</button>
    </div>
  </li>`;
}

// Options for one scheduled lesson (used on Today, Calendar and student pages).
function sessionActions() {
  return {
    async 'session-menu'(el) {
      const [s] = (await S.api.listSessions({})).filter((x) => x.id === el.dataset.id);
      if (!s) return;
      const profiles = await S.api.listProfiles();
      const student = profiles.find((p) => p.id === s.student_id);
      const invite = gcalUrl({ title: `${s.title}${student ? `: ${student.full_name}` : ''}`, start: s.starts_at, minutes: s.minutes, details: [s.note, s.meeting_url].filter(Boolean).join('\n'), where: s.meeting_url, guests: student?.email || '' });
      const m = openModal({
        title: `${fmtDateLong(s.starts_at)}, ${fmtTime(s.starts_at)}`,
        body: html`<p>${student ? html`<strong>${student.full_name}</strong>, ` : ''}${s.title}, ${s.minutes} min</p>
          <div class="stack-sm">
            <a class="btn btn-block" href="${invite}" target="_blank" rel="noopener">${icon('calendar')} Add to Google Calendar${student?.email ? ' and invite the student' : ''}</a>
            <button class="btn btn-block" data-on="edit">${icon('edit')} Change time or details</button>
            <div class="row-gap">
              <button class="btn" data-on="status" data-v="done">Mark as done</button>
              <button class="btn" data-on="status" data-v="missed">Missed</button>
              <button class="btn" data-on="status" data-v="cancelled">Cancelled</button>
              ${s.status !== 'scheduled' ? html`<button class="btn" data-on="status" data-v="scheduled">Planned again</button>` : ''}
            </div>
            <button class="btn btn-ghost btn-danger-text" data-on="delete">${icon('trash')} Delete this lesson</button>
          </div>`,
        on: {
          async status(b) { await S.api.saveSession({ id: s.id, status: b.dataset.v }); m.close(); toast('Lesson updated'); refresh(); },
          async delete() { if (!(await ask('Delete this lesson from the schedule?', { ok: 'Delete', danger: true }))) return; await S.api.deleteSession(s.id); m.close(); toast('Lesson deleted'); refresh(); },
          edit() { m.close(); scheduleDialog({ session: s }); },
        },
      });
    },
  };
}

// =====================================================================
// Schedule dialog (new lesson or edit)
// =====================================================================
export async function scheduleDialog({ session = null, studentId = '' } = {}) {
  const profiles = await S.api.listProfiles();
  const list = students(profiles).filter((p) => p.status === 'active' || p.id === session?.student_id);
  const start = session ? new Date(session.starts_at) : (() => { const d = addDays(new Date(), 1); d.setHours(18, 0, 0, 0); return d; })();
  const sel = session?.student_id ?? studentId;
  const m = openModal({
    title: session ? 'Change lesson' : 'Schedule a lesson',
    body: html`<form class="form" data-submit="save">
      <label>Student<select name="student_id"><option value="">No student (trial or other)</option>
        ${list.map((p) => html`<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${p.full_name || p.email}</option>`)}</select></label>
      <label>Title<input name="title" value="${session?.title || 'English lesson'}" maxlength="120" required></label>
      <div class="grid-3">
        <label>Date<input type="date" name="date" value="${dateInput(start)}" required></label>
        <label>Time<input type="time" name="time" value="${timeInput(start)}" required></label>
        <label>Length<select name="minutes">${[30, 45, 50, 60, 75, 90, 120].map((n) => html`<option value="${n}" ${(session?.minutes || 60) === n ? 'selected' : ''}>${n} min</option>`)}</select></label>
      </div>
      ${session ? '' : html`<label>Repeat every week<select name="weeks">${[1, 2, 4, 6, 8, 10, 12, 16, 20, 26].map((n) => html`<option value="${n}">${n === 1 ? 'No, just once' : `${n} weeks`}</option>`)}</select></label>`}
      <label>Video call link<input name="meeting_url" type="url" value="${session?.meeting_url ?? S.settings.meeting_url ?? ''}" placeholder="https://zoom.us/j/… or https://meet.google.com/…"></label>
      <label>Note for the student <span class="opt">optional</span><textarea name="note" rows="2" maxlength="500">${session?.note || ''}</textarea></label>
      <p class="muted small">Times are in your time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Students see them in theirs.</p>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">${session ? 'Save changes' : 'Schedule'}</button></div>
    </form>`,
    submit: {
      async save(d) {
        const startAt = new Date(`${d.date}T${d.time}`);
        if (Number.isNaN(startAt.getTime())) { toast('Check the date and time.', 'error'); return; }
        const base = { student_id: d.student_id || null, title: d.title.trim(), minutes: +d.minutes, meeting_url: d.meeting_url.trim(), note: d.note.trim() };
        if (session) {
          await S.api.saveSession({ id: session.id, ...base, starts_at: startAt.toISOString() });
          m.close(); toast('Lesson updated'); refresh();
          return;
        }
        const weeks = +d.weeks || 1;
        const rows = Array.from({ length: weeks }, (_, i) => ({ ...base, status: 'scheduled', starts_at: addDays(startAt, 7 * i).toISOString() }));
        await S.api.addSessions(rows);
        const student = profiles.find((p) => p.id === base.student_id);
        const invite = gcalUrl({ title: `${base.title}${student ? `: ${student.full_name}` : ''}`, start: startAt, minutes: base.minutes, details: [base.note, base.meeting_url].filter(Boolean).join('\n'), where: base.meeting_url, guests: student?.email || '', weeks });
        m.setBody(html`<div class="sent"><p class="hand hand-lg">Scheduled!</p>
          <p>${plural(weeks, 'lesson')} added${student ? html` for <strong>${student.full_name}</strong>. ${student.full_name || 'The student'} sees ${weeks === 1 ? 'it' : 'them'} on the Schedule page` : ''}.</p>
          <p>To send ${student ? 'the student ' : ''}a calendar invitation with automatic reminders, add it to your Google Calendar:</p>
          <div class="row-end"><button class="btn" data-on="close">Done</button>
          <a class="btn btn-primary" href="${invite}" target="_blank" rel="noopener">${icon('calendar')} Open Google Calendar</a></div>
          <p class="muted small">Google Calendar opens with everything filled in${student?.email ? ', and the student as a guest' : ''}. Press Save there, then Send.</p></div>`);
        refresh();
      },
    },
  });
}

// =====================================================================
// Students
// =====================================================================
export async function studentsView() {
  const [profiles, enrollments, invites, tree, attempts] = await Promise.all([
    S.api.listProfiles(), S.api.listEnrollments(), S.api.listInvites(), S.api.tree(), S.api.listAttempts({ limit: 500 }),
  ]);
  const list = students(profiles);
  const lastSeen = new Map();
  for (const a of attempts) if (!lastSeen.has(a.student_id)) lastSeen.set(a.student_id, a.updated_at || a.started_at);
  const courseTitle = new Map(tree.map((c) => [c.id, c.title]));
  let filter = list.some((p) => p.status === 'active') ? 'active' : 'all';
  const count = (st) => list.filter((p) => st === 'all' || p.status === st).length;

  const rows = () => {
    const shown = list.filter((p) => filter === 'all' || p.status === filter);
    if (!shown.length) return html`<p class="muted empty-sm">${list.length ? 'Nobody here.' : 'No students yet. Invite your first student with the button above.'}</p>`;
    return html`<ul class="people">${shown.map((p) => {
      const n = enrollments.filter((e) => e.student_id === p.id).length;
      return html`<li><a class="person" href="#student-${p.id}">${avatar(p)}
        <div class="person-main"><strong>${p.full_name || '(no name)'}</strong><span class="muted small">${p.email}</span></div>
        <div class="person-meta">${p.level ? html`<span class="chip">${p.level}</span>` : ''}
          ${p.status !== 'active' ? html`<span class="chip chip-${p.status}">${STATUS_LABEL[p.status]}</span>` : ''}
          <span class="muted small hide-sm">${plural(n, 'class', 'classes')}</span>
          <span class="muted small hide-sm">${lastSeen.has(p.id) ? `active ${timeAgo(lastSeen.get(p.id))}` : 'no activity yet'}</span></div>
      </a></li>`;
    })}</ul>`;
  };

  return {
    title: 'Students',
    html: html`
      <div class="page-head row-between"><h1>Students</h1><button class="btn btn-primary" data-on="invite">${icon('plus')} Invite a student</button></div>
      <div class="seg" role="group" aria-label="Show">
        ${['active', 'pending', 'paused', 'archived', 'all'].map((st) => html`<button class="seg-btn ${filter === st ? 'is-on' : ''}" data-on="filter" data-f="${st}">${st === 'all' ? 'All' : STATUS_LABEL[st]} <span class="count">${count(st)}</span></button>`)}
      </div>
      <div id="people-box">${rows()}</div>
      ${invites.length ? html`<h2 class="section-title">Invitations not used yet</h2>
        <ul class="invites">${invites.map((i) => html`<li>
          <div><strong>${i.full_name || i.email || 'Invitation'}</strong> <span class="muted small">${i.email}</span>
            <p class="muted small">${i.course_ids.length ? i.course_ids.map((c) => courseTitle.get(c)).filter(Boolean).join(', ') : 'No classes chosen'}, created ${timeAgo(i.created_at)}</p></div>
          <div class="row-gap"><button class="btn btn-sm" data-on="copy-invite" data-code="${i.code}">${icon('copy')} Copy link</button>
            <button class="icon-btn" data-on="del-invite" data-id="${i.id}" aria-label="Delete invitation" title="Delete">${icon('trash')}</button></div>
        </li>`)}</ul>` : ''}`,
    on: {
      filter(el) {
        filter = el.dataset.f;
        el.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b === el));
        document.getElementById('people-box').innerHTML = rows().toString();
      },
      invite: () => inviteDialog({ tree }),
      'copy-invite': (el) => copyText(`${siteUrl()}#join-${el.dataset.code}`),
      async 'del-invite'(el) {
        if (!(await ask('Delete this invitation?', { ok: 'Delete', danger: true, detail: 'The link will stop working.' }))) return;
        await S.api.deleteInvite(el.dataset.id); refresh();
      },
    },
  };
}

export async function inviteDialog({ tree, name = '', email = '' } = {}) {
  tree = tree || (await S.api.tree());
  const m = openModal({
    title: 'Invite a student',
    body: html`<form class="form" data-submit="create">
      <p class="muted">You get a personal link to send to the student. They open it, choose a password, and their classes are ready.</p>
      <div class="grid-2"><label>Name<input name="full_name" value="${name}" maxlength="120"></label>
      <label>Email<input name="email" type="email" value="${email}" maxlength="200"></label></div>
      ${tree.length ? html`<fieldset><legend>Open these classes</legend>${tree.map((c) => html`<label class="check"><input type="checkbox" name="course_ids" value="${c.id}" data-multi> ${c.title}</label>`)}</fieldset>` : html`<p class="muted small">You have no classes yet. You can add the student to classes later.</p>`}
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">Create invitation link</button></div>
    </form>`,
    submit: {
      async create(d) {
        const inv = await S.api.createInvite({ full_name: d.full_name.trim(), email: d.email.trim(), course_ids: d.course_ids || [] });
        const link = `${siteUrl()}#join-${inv.code}`;
        const subject = `Your English classes with ${teacherName()}`;
        const bodyText = `Hi${inv.full_name ? ` ${inv.full_name}` : ''}!\n\nHere is your personal link to create an account on my website. You will find your lessons, exercises and schedule there:\n\n${link}\n\nSee you soon,\n${teacherName()}`;
        m.setBody(html`<div class="sent"><p class="hand hand-lg">Invitation ready</p>
          <p>Send this link to ${inv.full_name || 'the student'} by email, Telegram or WhatsApp:</p>
          <div class="copy-field"><input readonly value="${link}" aria-label="Invitation link"><button class="btn" data-on="copy" data-text="${link}">${icon('copy')} Copy</button></div>
          <div class="row-end">${inv.email ? html`<a class="btn" href="mailto:${inv.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}">${icon('mail')} Write an email</a>` : ''}
          <button class="btn btn-primary" data-on="done">Done</button></div></div>`);
      },
    },
    on: { copy: (el) => copyText(el.dataset.text), done: () => { m.close(); refresh(); } },
  });
}

// =====================================================================
// One student
// =====================================================================
export async function studentView({ id }) {
  const [p, tree, enrollments, sessions, attempts, words, notes] = await Promise.all([
    S.api.getProfile(id), S.api.tree(), S.api.listEnrollments(),
    S.api.listSessions({ from: addDays(new Date(), -30), student_id: id }),
    S.api.listAttempts({ student_id: id, limit: 300 }), S.api.listWords(id), S.api.getNotes(id),
  ]);
  if (!p) return { title: 'Not found', html: html`<div class="empty"><h1>Student not found</h1><p><a href="#students">Back to students</a></p></div>` };
  const enrolled = new Set(enrollments.filter((e) => e.student_id === id).map((e) => e.course_id));
  const idx = progressIndex(attempts);
  const upcoming = sessions.filter((s) => new Date(s.starts_at) > new Date() && s.status === 'scheduled');
  let notesTimer = null;
  const name = () => p.full_name || p.email;

  return {
    title: name(),
    html: html`
      <nav class="crumbs"><a href="#students">Students</a></nav>
      <div class="page-head person-head">${avatar(p)}<div><h1>${name()}</h1><p class="muted">${p.email}${p.phone ? `, ${p.phone}` : ''}</p></div>
        <label class="status-pick">Status<select data-change="status">${Object.entries(STATUS_LABEL).map(([k, v]) => html`<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`)}</select></label></div>
      ${p.status === 'pending' ? html`<div class="notice notice-warn">This person created an account and is waiting for your approval. <button class="btn btn-sm btn-primary" data-on="approve">Approve</button></div>` : ''}
      <div class="two-col">
        <div>
          <section><h2 class="section-title">Classes</h2>
            ${tree.length ? html`<ul class="check-list">${tree.map((c) => {
              const st = courseStats(c, idx);
              return html`<li><label class="check"><input type="checkbox" data-change="enroll" value="${c.id}" ${enrolled.has(c.id) ? 'checked' : ''}> ${c.title}</label>
                ${enrolled.has(c.id) ? html`<span class="muted small">${st.done} of ${st.total} lessons done</span>` : ''}</li>`;
            })}</ul>` : html`<p class="muted">No classes yet. <a href="#class-editor">Create a class</a></p>`}
          </section>
          <section><div class="row-between"><h2 class="section-title">Lessons</h2><button class="btn btn-sm" data-on="schedule">${icon('plus')} Schedule</button></div>
            ${upcoming.length ? html`<ul class="sessions compact">${upcoming.slice(0, 6).map((s) => html`<li class="session"><div class="session-time"><strong>${fmtDate(s.starts_at)}</strong><span>${fmtTime(s.starts_at)}</span></div><div class="session-body">${s.title}</div>
              <div class="session-actions"><button class="icon-btn" data-on="session-menu" data-id="${s.id}" aria-label="Lesson options">${icon('more')}</button></div></li>`)}</ul>` : html`<p class="muted small">No upcoming lessons.</p>`}
          </section>
          <section><h2 class="section-title">Results</h2>
            ${attempts.length ? html`<ul class="mini-list">${attempts.slice(0, 15).map((a) => html`<li><a href="#review-${a.id}"><span>${a.material_title}</span>
              <span class="mini-side">${a.status === 'in_progress' ? html`<span class="chip">In progress</span>` : !a.reviewed ? html`<span class="chip chip-new">To review</span>` : ''}
              ${a.score != null ? html`<span class="score ${scoreClass(a)}">${scoreText(a)}</span>` : ''}<span class="muted small">${timeAgo(a.updated_at || a.started_at)}</span></span></a></li>`)}</ul>`
            : html`<p class="muted small">No exercises done yet.</p>`}
          </section>
        </div>
        <div>
          <section><h2 class="section-title">About</h2>
            <form class="form" data-submit="profile">
              <div class="grid-2"><label>Name<input name="full_name" value="${p.full_name}" maxlength="120"></label>
              <label>Level<input name="level" value="${p.level || ''}" maxlength="40"></label></div>
              <label>Phone or messenger<input name="phone" value="${p.phone || ''}" maxlength="80"></label>
              <label>Goals<textarea name="goals" rows="2" maxlength="1000">${p.goals || ''}</textarea></label>
              <div class="row-end"><button class="btn btn-sm" type="submit">Save</button></div>
            </form>
          </section>
          <section><h2 class="section-title">Private notes</h2>
            <textarea class="notes" rows="6" data-input="notes" placeholder="Only you can see this. Saved automatically.">${notes}</textarea>
            <p class="muted small" id="notes-state"></p>
          </section>
          <section><h2 class="section-title">Words</h2>
            <form class="form word-form compact" data-submit="word"><input name="term" required maxlength="200" placeholder="Word" aria-label="Word">
              <input name="meaning" maxlength="500" placeholder="Meaning" aria-label="Meaning"><button class="btn btn-sm" type="submit">Add</button></form>
            ${words.length ? html`<ul class="word-list compact">${words.slice(0, 30).map((w) => html`<li class="${w.learned ? 'is-learned' : ''}"><div class="word-main"><strong class="term">${w.term}</strong>${w.meaning ? html`<span class="meaning">${w.meaning}</span>` : ''}</div></li>`)}</ul>`
            : html`<p class="muted small">No words yet. Words you add here appear in the student's list.</p>`}
          </section>
        </div>
      </div>`,
    change: {
      async status(el) { await S.api.updateProfile(id, { status: el.value }); toast('Status changed'); refresh(); },
      async enroll(el) { await S.api.setEnrollment(el.value, id, el.checked); toast(el.checked ? 'Class opened for this student' : 'Class closed for this student'); },
    },
    input: {
      notes(el) {
        clearTimeout(notesTimer);
        const stateEl = document.getElementById('notes-state');
        if (stateEl) stateEl.textContent = 'Saving…';
        notesTimer = setTimeout(async () => { await S.api.saveNotes(id, el.value); if (stateEl) stateEl.textContent = 'Saved'; }, 800);
      },
    },
    submit: {
      async profile(d) { await S.api.updateProfile(id, { full_name: d.full_name.trim(), level: d.level.trim(), phone: d.phone.trim(), goals: d.goals.trim() }); toast('Saved'); refresh(); },
      async word(d) { await S.api.saveWord({ student_id: id, term: d.term.trim(), meaning: d.meaning.trim(), example: '', learned: false }); toast('Word added'); refresh(); },
    },
    on: {
      async approve() { await S.api.updateProfile(id, { status: 'active' }); toast('Approved. Now open some classes for this student.'); refresh(); },
      schedule: () => scheduleDialog({ studentId: id }),
      ...sessionActions(),
    },
  };
}

// =====================================================================
// Classes (list + editor)
// =====================================================================
export async function classEditorView() {
  const [tree, enrollments] = await Promise.all([S.api.tree(), S.api.listEnrollments()]);
  return {
    title: 'Classes',
    html: html`
      <div class="page-head row-between"><div><h1>Classes</h1><p class="lede">A class holds lessons. Each lesson holds exercises, links, videos and notes. Students see only the classes you open for them.</p></div>
        <button class="btn btn-primary" data-on="new">${icon('plus')} New class</button></div>
      ${tree.length ? html`<ul class="course-list">${tree.map((c) => {
        const n = enrollments.filter((e) => e.course_id === c.id).length;
        const items = c.lessons.reduce((s, l) => s + l.materials.length, 0);
        return html`<li class="course-row editable">${tile(c)}
          <div class="course-main"><h2><a href="#edit-class-${c.id}">${c.title}</a></h2>
            <p class="muted small">${plural(c.lessons.length, 'lesson')}, ${plural(items, 'item')}, ${plural(n, 'student')}${c.level ? `, ${c.level}` : ''}</p>
            ${c.published ? '' : html`<span class="chip chip-pending">Hidden from students</span>`}</div>
          <div class="row-gap"><a class="btn btn-sm" href="#class-${c.id}">${icon('eye')}<span class="hide-sm">Student view</span></a><a class="btn btn-sm btn-primary" href="#edit-class-${c.id}">${icon('edit')} Edit</a></div>
        </li>`;
      })}</ul>` : html`<div class="empty"><h2>No classes yet</h2><p>Create a class, add lessons, then put your exercises inside.</p></div>`}`,
    on: { new: () => courseDialog() },
  };
}

function courseDialog(course = null) {
  const c = course || { title: '', description: '', emoji: '📘', color: COLORS[0], level: '', published: true };
  const m = openModal({
    title: course ? 'Class settings' : 'New class',
    body: html`<form class="form" data-submit="save">
      <label>Title<input name="title" value="${c.title}" required maxlength="200" placeholder="For example: B2 speaking club"></label>
      <label>Description <span class="opt">optional</span><textarea name="description" rows="2" maxlength="1000">${c.description}</textarea></label>
      <div class="grid-2"><label>Level <span class="opt">optional</span><input name="level" value="${c.level}" maxlength="40" placeholder="B2"></label>
        <label class="check check-top"><input type="checkbox" name="published" ${c.published ? 'checked' : ''}> Visible to enrolled students</label></div>
      <fieldset><legend>Icon</legend><div class="swatches">${EMOJIS.map((e) => html`<label class="swatch"><input type="radio" name="emoji" value="${e}" ${e === c.emoji ? 'checked' : ''}><span>${e}</span></label>`)}</div></fieldset>
      <fieldset><legend>Colour</legend><div class="swatches">${COLORS.map((col) => html`<label class="swatch"><input type="radio" name="color" value="${col}" ${col === c.color ? 'checked' : ''}><span style="background:${col}" aria-label="${col}"></span></label>`)}</div></fieldset>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">${course ? 'Save changes' : 'Create class'}</button></div>
    </form>`,
    submit: {
      async save(d) {
        const row = await S.api.saveCourse({ id: course?.id, title: d.title.trim(), description: d.description.trim(), level: d.level.trim(), published: d.published, emoji: d.emoji || '📘', color: d.color || COLORS[0], ...(course ? {} : { sort: Date.now() % 100000 }) });
        m.close();
        toast(course ? 'Class saved' : 'Class created');
        if (course) refresh(); else go(`edit-class-${row.id}`);
      },
    },
  });
}

async function reorder(list, i, dir, saveFn) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const arr = [...list];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  await Promise.all(arr.map((x, k) => (x.sort !== k ? saveFn({ id: x.id, sort: k }) : null)));
}

export async function editClassView({ id }) {
  const [tree, profiles, enrollments] = await Promise.all([S.api.tree(), S.api.listProfiles(), S.api.listEnrollments()]);
  const course = tree.find((c) => c.id === id);
  if (!course) return { title: 'Not found', html: html`<div class="empty"><h1>Class not found</h1><p><a href="#class-editor">Back to classes</a></p></div>` };
  const name = nameOf(profiles);
  const inClass = enrollments.filter((e) => e.course_id === id).map((e) => e.student_id);

  const lessonBlock = (l, i) => html`<li class="ed-lesson">
    <div class="ed-lesson-head">
      <span class="margin-num">${i + 1}</span>
      <div class="ed-title"><h3>${l.title}</h3>${l.published ? '' : html`<span class="chip chip-pending">Draft, hidden</span>`}${l.description ? html`<p class="muted small">${l.description}</p>` : ''}</div>
      <div class="ed-tools">
        <button class="icon-btn" data-on="lesson-up" data-i="${i}" aria-label="Move lesson up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-on="lesson-down" data-i="${i}" aria-label="Move lesson down" ${i === course.lessons.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button class="icon-btn" data-on="lesson-edit" data-i="${i}" aria-label="Edit lesson">${icon('edit')}</button>
        <button class="icon-btn" data-on="lesson-del" data-i="${i}" aria-label="Delete lesson">${icon('trash')}</button>
      </div>
    </div>
    <ul class="ed-materials">${l.materials.map((mat, k) => html`<li>
      ${kindIcon(mat.kind)}<div class="ed-mat-main"><span>${mat.title}</span>${mat.url ? html`<span class="muted small ellipsis">${mat.url}</span>` : ''}</div>
      <div class="ed-tools">
        ${mat.kind === 'exercise' ? html`<a class="icon-btn" href="#play-${mat.id}" aria-label="Preview" title="Preview">${icon('play')}</a>` : ''}
        <button class="icon-btn" data-on="mat-up" data-i="${i}" data-k="${k}" aria-label="Move up" ${k === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-on="mat-down" data-i="${i}" data-k="${k}" aria-label="Move down" ${k === l.materials.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button class="icon-btn" data-on="mat-edit" data-i="${i}" data-k="${k}" aria-label="Edit">${icon('edit')}</button>
        <button class="icon-btn" data-on="mat-del" data-i="${i}" data-k="${k}" aria-label="Remove">${icon('trash')}</button>
      </div></li>`)}
      <li class="ed-add"><button class="btn btn-sm" data-on="mat-add" data-i="${i}">${icon('plus')} Add exercise, link, video or note</button></li>
    </ul>
  </li>`;

  return {
    title: course.title,
    html: html`
      <nav class="crumbs"><a href="#class-editor">Classes</a></nav>
      <div class="page-head with-tile">${tile(course, 'tile-lg')}<div class="grow"><h1>${course.title}</h1>
        <p class="muted">${course.level ? `${course.level}, ` : ''}${course.published ? 'Visible to enrolled students' : 'Hidden from students'}</p></div>
        <div class="row-gap"><a class="btn" href="#class-${course.id}">${icon('eye')} Student view</a><button class="btn" data-on="settings">${icon('gear')} Settings</button></div></div>

      <section><div class="row-between"><h2 class="section-title">Students in this class</h2><button class="btn btn-sm" data-on="add-students">${icon('plus')} Add students</button></div>
        ${inClass.length ? html`<ul class="chips">${inClass.map((sid) => html`<li class="chip chip-person"><a href="#student-${sid}">${name(sid)}</a><button class="chip-x" data-on="unenroll" data-id="${sid}" aria-label="Remove ${name(sid)} from this class">×</button></li>`)}</ul>`
        : html`<p class="muted small">Nobody yet. Add students so they can see this class.</p>`}
      </section>

      <section><div class="row-between"><h2 class="section-title">Lessons</h2><button class="btn btn-sm btn-primary" data-on="lesson-add">${icon('plus')} Add a lesson</button></div>
        ${course.lessons.length ? html`<ol class="ed-lessons">${course.lessons.map(lessonBlock)}</ol>` : html`<p class="muted">No lessons yet. Add the first lesson, then put exercises in it.</p>`}
      </section>
      <p class="danger-zone"><button class="btn btn-ghost btn-danger-text" data-on="delete">${icon('trash')} Delete this class</button></p>`,
    on: {
      settings: () => courseDialog(course),
      async delete() {
        if (!(await ask(`Delete "${course.title}"?`, { ok: 'Delete class', danger: true, detail: 'All its lessons are deleted too. Student results stay in Results.' }))) return;
        await S.api.deleteCourse(id); toast('Class deleted'); go('class-editor');
      },
      'add-students': () => {
        const list = students(profiles).filter((p) => p.status === 'active' && !inClass.includes(p.id));
        const m = openModal({
          title: 'Add students',
          body: list.length ? html`<form class="form" data-submit="add">${list.map((p) => html`<label class="check"><input type="checkbox" name="ids" value="${p.id}" data-multi> ${p.full_name || p.email}</label>`)}
            <div class="row-end"><button class="btn btn-primary" type="submit">Add to class</button></div></form>`
            : html`<p class="muted">All active students are already in this class.</p><div class="row-end"><button class="btn btn-primary" data-on="to-students">Invite a new student</button></div>`,
          submit: { async add(d) { await Promise.all((d.ids || []).map((sid) => S.api.setEnrollment(id, sid, true))); m.close(); toast('Students added'); refresh(); } },
          on: { 'to-students': () => { m.close(); go('students'); } },
        });
      },
      async unenroll(el) { await S.api.setEnrollment(id, el.dataset.id, false); toast('Removed from class'); refresh(); },
      'lesson-add': () => lessonDialog(course),
      'lesson-edit': (el) => lessonDialog(course, course.lessons[+el.dataset.i]),
      async 'lesson-del'(el) {
        const l = course.lessons[+el.dataset.i];
        if (!(await ask(`Delete lesson "${l.title}"?`, { ok: 'Delete lesson', danger: true, detail: 'Its exercises are removed from the class. Student results stay in Results.' }))) return;
        await S.api.deleteLesson(l.id); refresh();
      },
      async 'lesson-up'(el) { await reorder(course.lessons, +el.dataset.i, -1, S.api.saveLesson); refresh(); },
      async 'lesson-down'(el) { await reorder(course.lessons, +el.dataset.i, 1, S.api.saveLesson); refresh(); },
      async 'mat-up'(el) { await reorder(course.lessons[+el.dataset.i].materials, +el.dataset.k, -1, S.api.saveMaterial); refresh(); },
      async 'mat-down'(el) { await reorder(course.lessons[+el.dataset.i].materials, +el.dataset.k, 1, S.api.saveMaterial); refresh(); },
      'mat-add': (el) => materialDialog(course.lessons[+el.dataset.i]),
      'mat-edit': (el) => { const l = course.lessons[+el.dataset.i]; materialDialog(l, l.materials[+el.dataset.k]); },
      async 'mat-del'(el) {
        const mat = course.lessons[+el.dataset.i].materials[+el.dataset.k];
        if (!(await ask(`Remove "${mat.title}" from this lesson?`, { ok: 'Remove', danger: true, detail: 'The exercise file stays on GitHub. Student results stay in Results.' }))) return;
        await S.api.deleteMaterial(mat.id); refresh();
      },
    },
  };
}

function lessonDialog(course, lesson = null) {
  const m = openModal({
    title: lesson ? 'Edit lesson' : 'New lesson',
    body: html`<form class="form" data-submit="save">
      <label>Title<input name="title" value="${lesson?.title || ''}" required maxlength="200" placeholder="For example: Talking about plans"></label>
      <label>Description <span class="opt">optional</span><textarea name="description" rows="2" maxlength="1000">${lesson?.description || ''}</textarea></label>
      <label class="check"><input type="checkbox" name="published" ${!lesson || lesson.published ? 'checked' : ''}> Visible to students (untick to keep it as a draft)</label>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">${lesson ? 'Save' : 'Add lesson'}</button></div></form>`,
    submit: {
      async save(d) {
        await S.api.saveLesson({ id: lesson?.id, course_id: course.id, title: d.title.trim(), description: d.description.trim(), published: d.published, ...(lesson ? {} : { sort: course.lessons.length }) });
        m.close(); toast(lesson ? 'Lesson saved' : 'Lesson added'); refresh();
      },
    },
  });
}

function guessKind(url) {
  if (/youtu\.?be|vimeo\.com|loom\.com/i.test(url)) return 'video';
  if (/\.html?(\?|#|$)/i.test(url)) return 'exercise';
  return 'link';
}

function materialDialog(lesson, mat = null) {
  let tab = mat ? (mat.kind === 'text' ? 'text' : 'link') : 'library';
  let lib = null;
  let q = '';
  const libList = () => {
    if (!lib) return html`<p class="muted">Loading your exercises from GitHub…</p>`;
    if (lib.error && !lib.items.length) return html`<p class="notice notice-warn small">${lib.error}</p>`;
    const rows = lib.items.filter((x) => !q || `${x.title} ${x.file}`.toLowerCase().includes(q.toLowerCase()));
    return rows.length ? html`<ul class="pick-list">${rows.map((x) => html`<li><div><strong>${x.title}</strong><span class="muted small">${x.file}</span></div>
      <div class="row-gap"><a class="btn btn-sm btn-ghost" href="${x.url}" target="_blank" rel="noopener">Preview</a><button class="btn btn-sm btn-primary" data-on="pick" data-url="${x.url}" data-title="${x.title}">Add</button></div></li>`)}</ul>`
      : html`<p class="muted">No exercises match.</p>`;
  };
  const body = () => html`
    ${mat ? '' : html`<div class="seg" role="tablist">
      <button class="seg-btn ${tab === 'library' ? 'is-on' : ''}" data-on="tab" data-t="library">From my exercises</button>
      <button class="seg-btn ${tab === 'link' ? 'is-on' : ''}" data-on="tab" data-t="link">Link or video</button>
      <button class="seg-btn ${tab === 'text' ? 'is-on' : ''}" data-on="tab" data-t="text">Text note</button></div>`}
    ${tab === 'library' ? html`<input type="search" placeholder="Search exercises" data-input="q" value="${q}" aria-label="Search exercises"><div id="lib-box">${libList()}</div>
      <p class="muted small">This list comes from your GitHub. Upload a new HTML exercise there and it appears here.</p>` : ''}
    ${tab === 'link' ? html`<form class="form" data-submit="link">
      <label>Title<input name="title" value="${mat?.title || ''}" required maxlength="300"></label>
      <label>Link<input name="url" type="url" value="${mat?.url || ''}" required placeholder="https://…"></label>
      <label>Type<select name="kind">${[['auto', 'Choose from the link'], ['exercise', 'Exercise (opens inside the website, results are saved)'], ['video', 'Video (YouTube links play inside the lesson)'], ['link', 'Link (opens in a new tab)']].filter(([v]) => !mat || v !== 'auto').map(([v, t]) => html`<option value="${v}" ${(mat?.kind || 'auto') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
      <div class="row-end"><button class="btn btn-primary" type="submit">${mat ? 'Save' : 'Add to lesson'}</button></div></form>` : ''}
    ${tab === 'text' ? html`<form class="form" data-submit="text">
      <label>Title<input name="title" value="${mat?.title || ''}" required maxlength="300" placeholder="For example: Homework"></label>
      <label>Text<textarea name="body" rows="6" maxlength="5000">${mat?.body || ''}</textarea></label>
      <div class="row-end"><button class="btn btn-primary" type="submit">${mat ? 'Save' : 'Add to lesson'}</button></div></form>` : ''}`;
  const sortNext = lesson.materials.length;
  const saveMat = async (o) => {
    await S.api.saveMaterial({ id: mat?.id, lesson_id: lesson.id, ...o, ...(mat ? {} : { sort: sortNext }) });
    m.close(); toast(mat ? 'Saved' : 'Added to the lesson'); refresh();
  };
  const m = openModal({
    title: mat ? 'Edit item' : `Add to "${lesson.title}"`,
    wide: true,
    body: body(),
    on: {
      tab(el) { tab = el.dataset.t; m.setBody(body()); if (tab === 'library') fill(); },
      pick: (el) => saveMat({ kind: 'exercise', title: el.dataset.title, url: el.dataset.url, body: '' }),
    },
    input: { q(el) { q = el.value; const box = document.getElementById('lib-box'); if (box) box.innerHTML = libList().toString(); } },
    submit: {
      link(d) {
        const url = d.url.trim();
        const kind = d.kind === 'auto' ? guessKind(url) : d.kind;
        return saveMat({ kind, title: d.title.trim(), url, body: '' });
      },
      text: (d) => saveMat({ kind: 'text', title: d.title.trim(), url: '', body: d.body }),
    },
  });
  const fill = async () => {
    if (!lib) lib = await loadLibrary();
    const box = document.getElementById('lib-box');
    if (box) box.innerHTML = libList().toString();
  };
  if (tab === 'library') fill();
}

// =====================================================================
// Exercise library
// =====================================================================
export async function libraryView() {
  const [lib, tree] = await Promise.all([loadLibrary(), S.api.tree()]);
  const usedIn = new Map();
  for (const c of tree) for (const l of c.lessons) for (const mat of l.materials) {
    if (!mat.url) continue;
    const key = mat.url.split('#')[0];
    usedIn.set(key, [...(usedIn.get(key) || []), `${c.title}, ${l.title}`]);
  }
  let q = '';
  const list = () => {
    const rows = lib.items.filter((x) => !q || `${x.title} ${x.file}`.toLowerCase().includes(q.toLowerCase()));
    if (!rows.length) return html`<p class="muted empty-sm">${lib.items.length ? 'No exercises match.' : 'No HTML exercises found in your GitHub folders.'}</p>`;
    return html`<ul class="lib-list">${rows.map((x) => {
      const used = usedIn.get(x.url) || [];
      return html`<li><div class="lib-main"><strong>${x.title}</strong><span class="muted small">${x.file}</span>
        <span class="small ${used.length ? '' : 'muted'}">${used.length ? `Used in: ${used.join('; ')}` : 'Not used in a class yet'}</span></div>
        <div class="row-gap"><a class="btn btn-sm btn-ghost" href="${x.url}" target="_blank" rel="noopener">${icon('external')} Preview</a>
          <button class="btn btn-sm btn-primary" data-on="add" data-url="${x.url}" data-title="${x.title}">Add to a lesson</button></div></li>`;
    })}</ul>`;
  };
  return {
    title: 'Exercise library',
    html: html`
      <div class="page-head row-between"><div><h1>Exercise library</h1>
        <p class="lede">Your HTML exercises on GitHub (${S.settings.exercise_repos}). Upload a new file there, then press Refresh.</p></div>
        <button class="btn" data-on="reload">Refresh</button></div>
      ${lib.error ? html`<p class="notice notice-warn small">${lib.error}</p>` : ''}
      <input type="search" class="search-wide" placeholder="Search ${plural(lib.items.length, 'exercise')}" data-input="q" aria-label="Search exercises">
      <div id="lib-list">${list()}</div>`,
    input: { q(el) { q = el.value; document.getElementById('lib-list').innerHTML = list().toString(); } },
    on: {
      async reload() { await loadLibrary(true); refresh(); },
      add(el) { addToLessonDialog(tree, { url: el.dataset.url, title: el.dataset.title }); },
    },
  };
}

function addToLessonDialog(tree, item) {
  if (!tree.length || !tree.some((c) => c.lessons.length)) {
    openModal({ title: 'Add to a lesson', body: html`<p>Create a class with at least one lesson first.</p><div class="row-end"><a class="btn btn-primary" href="#class-editor">Go to Classes</a></div>` });
    return;
  }
  const withLessons = tree.filter((c) => c.lessons.length);
  const lessonOptions = (cid) => (withLessons.find((c) => c.id === cid)?.lessons || []).map((l) => html`<option value="${l.id}">${l.title}</option>`);
  const m = openModal({
    title: 'Add to a lesson',
    body: html`<form class="form" data-submit="add">
      <label>Title students see<input name="title" value="${item.title}" required maxlength="300"></label>
      <label>Class<select name="course" data-change="course">${withLessons.map((c) => html`<option value="${c.id}">${c.title}</option>`)}</select></label>
      <label>Lesson<select name="lesson" id="lesson-pick">${lessonOptions(withLessons[0].id)}</select></label>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">Add</button></div></form>`,
    change: { course(el) { document.getElementById('lesson-pick').innerHTML = html`${lessonOptions(el.value)}`.toString(); } },
    submit: {
      async add(d) {
        const lesson = withLessons.flatMap((c) => c.lessons).find((l) => l.id === d.lesson);
        await S.api.saveMaterial({ lesson_id: d.lesson, kind: 'exercise', title: d.title.trim(), url: item.url, body: '', sort: lesson ? lesson.materials.length : 0 });
        m.close(); toast(`Added to "${lesson?.title}"`); refresh();
      },
    },
  });
}

// =====================================================================
// Results (review)
// =====================================================================
export async function reviewsView() {
  const [attempts, profiles] = await Promise.all([S.api.listAttempts({ limit: 500 }), S.api.listProfiles()]);
  const name = nameOf(profiles);
  let filter = attempts.some((a) => a.status === 'completed' && !a.reviewed) ? 'review' : 'all';
  let who = '';
  const match = (a) => (filter === 'review' ? a.status === 'completed' && !a.reviewed : filter === 'progress' ? a.status === 'in_progress' : true) && (!who || a.student_id === who);
  const count = (f) => attempts.filter((a) => (f === 'review' ? a.status === 'completed' && !a.reviewed : f === 'progress' ? a.status === 'in_progress' : true)).length;
  const list = () => {
    const rows = attempts.filter(match);
    if (!rows.length) return html`<p class="muted empty-sm">${filter === 'review' ? 'Nothing waiting for review.' : 'No results yet.'}</p>`;
    return html`<ul class="result-list">${rows.map((a) => html`<li><a class="result-row" href="#review-${a.id}">
      <div><strong>${name(a.student_id)}</strong><span>${a.material_title}</span></div>
      <div class="result-side">
        ${a.revealed ? html`<span class="chip chip-note" title="The student opened the answer key">key opened</span>` : ''}
        ${a.status === 'in_progress' ? html`<span class="chip">In progress</span>` : !a.reviewed ? html`<span class="chip chip-new">To review</span>` : a.feedback ? html`<span class="chip chip-done">Commented</span>` : ''}
        ${a.score != null ? html`<span class="score ${scoreClass(a)}">${scoreText(a)}</span>` : ''}
        <span class="muted small">${timeAgo(a.finished_at || a.updated_at || a.started_at)}</span></div></a></li>`)}</ul>`;
  };
  const paint = () => { document.getElementById('res-box').innerHTML = list().toString(); };
  return {
    title: 'Results',
    html: html`<div class="page-head"><h1>Results</h1><p class="lede">Every exercise your students opened. Scores and answers are saved automatically.</p></div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Show">
          <button class="seg-btn ${filter === 'review' ? 'is-on' : ''}" data-on="filter" data-f="review">To review <span class="count">${count('review')}</span></button>
          <button class="seg-btn" data-on="filter" data-f="progress">In progress <span class="count">${count('progress')}</span></button>
          <button class="seg-btn ${filter === 'all' ? 'is-on' : ''}" data-on="filter" data-f="all">All <span class="count">${count('all')}</span></button>
        </div>
        <select data-change="who" aria-label="Student"><option value="">All students</option>${students(profiles).map((p) => html`<option value="${p.id}">${p.full_name || p.email}</option>`)}</select>
      </div>
      <div id="res-box">${list()}</div>`,
    on: { filter(el) { filter = el.dataset.f; el.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b === el)); paint(); } },
    change: { who(el) { who = el.value; paint(); } },
  };
}

export async function reviewView({ id }) {
  const [a, profiles, attempts] = await Promise.all([S.api.getAttempt(id), S.api.listProfiles(), S.api.listAttempts({ limit: 500 })]);
  if (!a) return { title: 'Not found', html: html`<div class="empty"><h1>Result not found</h1><p><a href="#reviews">Back to results</a></p></div>` };
  const student = profiles.find((p) => p.id === a.student_id);
  const nextUp = attempts.find((x) => x.id !== a.id && x.status === 'completed' && !x.reviewed);
  const save = async (feedback, goNext) => {
    await S.api.updateAttempt(a.id, { feedback: feedback || null, feedback_at: feedback ? new Date().toISOString() : null, reviewed: true, feedback_seen: false });
    toast(feedback ? 'Feedback saved. The student will see it.' : 'Marked as reviewed');
    if (goNext && nextUp) go(`review-${nextUp.id}`); else refresh();
  };
  return {
    title: a.material_title,
    html: html`
      <nav class="crumbs"><a href="#reviews">Results</a></nav>
      <div class="page-head"><h1>${a.material_title}</h1>
        <p class="muted">${student ? html`<a href="#student-${student.id}">${student.full_name || student.email}</a>` : 'Former student'}${a.status === 'in_progress' ? ', still working on it' : ''}</p></div>
      ${attemptFacts(a)}
      <form class="form feedback-form" data-submit="feedback">
        <label for="fb">Your feedback <span class="opt">the student sees it next to their answers</span></label>
        <textarea id="fb" name="feedback" rows="4" maxlength="3000" placeholder="Well done! Look again at number 4…">${a.feedback || ''}</textarea>
        <div class="row-end">
          ${a.reviewed ? '' : html`<button class="btn" type="button" data-on="reviewed">Mark as reviewed, no comment</button>`}
          <button class="btn btn-primary" type="submit" name="next" value="1">${a.feedback ? 'Update feedback' : 'Send feedback'}${nextUp ? ' and open next' : ''}</button>
        </div>
      </form>
      <h2 class="section-title">Answers</h2>
      ${answersTable(a)}
      <p class="row-gap">${a.material_id ? html`<a class="btn btn-sm" href="#play-${a.material_id}">${icon('play')} Open the exercise</a>` : ''}
        <button class="btn btn-sm btn-ghost btn-danger-text" data-on="delete">${icon('trash')} Delete this result</button></p>`,
    submit: { feedback: (d) => save(d.feedback.trim(), true) },
    on: {
      reviewed: () => save('', false),
      async delete() {
        if (!(await ask('Delete this result?', { ok: 'Delete', danger: true, detail: 'The score and answers are removed for good.' }))) return;
        await S.api.deleteAttempt(a.id); toast('Result deleted'); go('reviews');
      },
    },
  };
}

// =====================================================================
// Calendar
// =====================================================================
let weekOffset = 0;
export async function calendarView() {
  const from = addDays(startOfWeek(new Date()), weekOffset * 7);
  const to = addDays(from, 7);
  const [sessions, profiles] = await Promise.all([S.api.listSessions({ from, to }), S.api.listProfiles()]);
  const name = nameOf(profiles);
  const label = `${fmtDay(from)} to ${fmtDay(addDays(to, -1))}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return {
    title: 'Calendar',
    html: html`
      <div class="page-head row-between"><h1>Calendar</h1><button class="btn btn-primary" data-on="new">${icon('plus')} Schedule a lesson</button></div>
      <div class="week-nav"><button class="icon-btn" data-on="prev" aria-label="Previous week">${icon('back')}</button>
        <strong>${weekOffset === 0 ? 'This week' : label}</strong>${weekOffset === 0 ? html`<span class="muted small">${label}</span>` : html`<button class="btn btn-sm btn-ghost" data-on="today">Back to this week</button>`}
        <button class="icon-btn flip" data-on="next" aria-label="Next week">${icon('back')}</button></div>
      <div class="week">${days.map((d) => {
        const list = sessions.filter((s) => sameDay(s.starts_at, d));
        return html`<section class="week-day ${sameDay(d, new Date()) ? 'is-today' : ''}"><h3>${fmtDate(d)}</h3>
          ${list.length ? html`<ul class="sessions">${list.map((s) => teacherSessionRow(s, name))}</ul>` : html`<p class="muted small">Free</p>`}</section>`;
      })}</div>
      <div class="notice small">${S.settings.booking_url
        ? html`New students book free times on your <a href="${S.settings.booking_url}" target="_blank" rel="noopener">booking page</a>. Those bookings go straight to your Google Calendar.`
        : html`Want new students to pick free times by themselves? Add a booking page link in <a href="#site-setup">Website settings</a>.`}</div>`,
    on: {
      new: () => scheduleDialog(),
      prev() { weekOffset -= 1; refresh(); },
      next() { weekOffset += 1; refresh(); },
      today() { weekOffset = 0; refresh(); },
      ...sessionActions(),
    },
  };
}

// =====================================================================
// Requests
// =====================================================================
export async function requestsView() {
  const [requests, profiles] = await Promise.all([S.api.listRequests(), S.api.listProfiles()]);
  const pending = profiles.filter((p) => p.status === 'pending');
  const REQ = { new: 'New', contacted: 'Contacted', booked: 'Booked', closed: 'Closed' };
  return {
    title: 'Requests',
    html: html`
      <div class="page-head"><h1>Requests</h1><p class="lede">People who wrote to you from the website, and new accounts waiting for approval.</p></div>
      <section><h2 class="section-title">New accounts</h2>
        ${pending.length ? html`<ul class="people">${pending.map((p) => html`<li class="person">${avatar(p)}
          <div class="person-main"><strong>${p.full_name || '(no name)'}</strong><span class="muted small">${p.email}, signed up ${timeAgo(p.created_at)}</span></div>
          <div class="row-gap"><button class="btn btn-sm btn-primary" data-on="approve" data-id="${p.id}">Approve</button>
            <button class="btn btn-sm" data-on="decline" data-id="${p.id}">Decline</button></div></li>`)}</ul>`
        : html`<p class="muted small">No accounts waiting.</p>`}
      </section>
      <section><h2 class="section-title">Lesson requests</h2>
        ${requests.length ? html`<ul class="requests">${requests.map((r) => html`<li class="request ${r.status === 'new' ? 'is-new' : ''}">
          <div class="request-head"><strong>${r.name}</strong><span class="muted small">${timeAgo(r.created_at)}</span>
            <select data-change="req-status" data-id="${r.id}" aria-label="Status">${Object.entries(REQ).map(([k, v]) => html`<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`)}</select></div>
          <dl class="facts compact">
            <div><dt>Email</dt><dd><a href="mailto:${r.email}">${r.email}</a></dd></div>
            ${r.contact ? html`<div><dt>Contact</dt><dd>${r.contact}</dd></div>` : ''}
            ${r.level ? html`<div><dt>Level</dt><dd>${r.level}</dd></div>` : ''}
            ${r.preferred_times ? html`<div><dt>Free times</dt><dd>${r.preferred_times}</dd></div>` : ''}
          </dl>
          ${r.message ? html`<p class="request-msg">${nl2br(r.message)}</p>` : ''}
          <div class="row-gap"><a class="btn btn-sm" href="mailto:${r.email}?subject=${encodeURIComponent(`English lessons with ${teacherName()}`)}">${icon('mail')} Reply</a>
            <button class="btn btn-sm" data-on="invite" data-id="${r.id}">Invite as student</button>
            <button class="icon-btn" data-on="del" data-id="${r.id}" aria-label="Delete request">${icon('trash')}</button></div>
        </li>`)}</ul>` : html`<p class="muted small">No requests yet. They arrive from the "Book a lesson" page.</p>`}
      </section>`,
    on: {
      async approve(el) { await S.api.updateProfile(el.dataset.id, { status: 'active' }); toast('Approved. Now open classes for this student.'); go(`student-${el.dataset.id}`); },
      async decline(el) { if (!(await ask('Decline this account?', { ok: 'Decline', danger: true, detail: 'The person will not see any classes. You can change this later on the Students page.' }))) return; await S.api.updateProfile(el.dataset.id, { status: 'archived' }); refresh(); },
      invite(el) { const r = requests.find((x) => x.id === el.dataset.id); inviteDialog({ name: r.name, email: r.email }); },
      async del(el) { if (!(await ask('Delete this request?', { ok: 'Delete', danger: true }))) return; await S.api.deleteRequest(el.dataset.id); refresh(); },
    },
    change: { async 'req-status'(el) { await S.api.updateRequest(el.dataset.id, { status: el.value }); toast('Saved'); } },
  };
}

// =====================================================================
// Website settings
// =====================================================================
export function siteSetupView() {
  const st = S.settings;
  const script = `<script src="${siteUrl().replace(/index\.html$/, '')}assets/report.js"></script>`;
  const prompt = `When you create an interactive exercise for me, add this line just before </body>:\n${script}\nWhen the student presses the main "Check answers" button, call reportResult(correctCount, totalCount). If there is a "Show answers" button, call reportAnswerKeyShown() when it is pressed. Also show the score on the page as "Score: X / Y".`;
  return {
    title: 'Website',
    html: html`
      <div class="page-head"><h1>Website</h1><p class="lede">Settings for your public page, booking and notifications.</p></div>
      <p class="notice small">${S.api.mode === 'demo'
        ? html`<strong>Demo mode.</strong> The website is not connected to a database yet, so changes are saved only in this browser.`
        : html`Connected to your database. Changes are saved for everyone.`}</p>
      <form class="form" data-submit="save">
        <fieldset class="card-plain"><legend>Public page</legend>
          <div class="grid-2"><label>Website name<input name="site_name" value="${st.site_name}" maxlength="80" required></label>
          <label>Your name<input name="teacher_name" value="${st.teacher_name}" maxlength="80" required></label></div>
          <label>Short description<input name="tagline" value="${st.tagline}" maxlength="200"></label>
          <label>About you<textarea name="about" rows="4" maxlength="2000">${st.about}</textarea></label>
          <label>Contact line at the bottom of the page <span class="opt">optional</span><input name="contact_text" value="${st.contact_text}" maxlength="200" placeholder="Telegram @… or email"></label>
        </fieldset>
        <fieldset class="card-plain"><legend>Lessons and booking</legend>
          <label>Booking page link <span class="opt">Cal.com or Google Calendar booking page</span><input name="booking_url" type="url" value="${st.booking_url}" placeholder="https://cal.com/your-name/trial-lesson"></label>
          <p class="muted small">New students pick a free time there. Without it, the "Book a lesson" page shows a request form.</p>
          <label>Your usual video call link <span class="opt">filled in when you schedule a lesson</span><input name="meeting_url" type="url" value="${st.meeting_url || ''}" placeholder="https://zoom.us/j/… or https://meet.google.com/…"></label>
          <label>Time format<select name="time_format"><option value="12h" ${st.time_format !== '24h' ? 'selected' : ''}>12-hour (6:00 PM)</option><option value="24h" ${st.time_format === '24h' ? 'selected' : ''}>24-hour (18:00)</option></select></label>
        </fieldset>
        <fieldset class="card-plain"><legend>Email notifications</legend>
          <label>Send notifications to<input name="notify_email" type="email" value="${st.notify_email}" placeholder="you@gmail.com"></label>
          <label class="check"><input type="checkbox" name="notify_on_finish" ${st.notify_on_finish !== false ? 'checked' : ''}> When a student finishes an exercise (with score and answers)</label>
          <label class="check"><input type="checkbox" name="notify_on_request" ${st.notify_on_request !== false ? 'checked' : ''}> When someone asks for a lesson or creates an account</label>
          <p class="muted small">Emails are sent through FormSubmit, a free service. The first time, FormSubmit emails you a confirmation link. Click it once and notifications start.</p>
        </fieldset>
        <fieldset class="card-plain"><legend>Exercises</legend>
          <label>Your GitHub folders with exercises <span class="opt">one per line: owner/repository or owner/repository/folder</span><textarea name="exercise_repos" rows="2">${st.exercise_repos}</textarea></label>
        </fieldset>
        <div class="row-end sticky-save"><button class="btn btn-primary" type="submit">Save settings</button></div>
      </form>
      <section class="card-plain"><h2 class="section-title">Make new exercises send their score</h2>
        <p>Your current exercises already work: the website reads the score they show. For new exercises, add this sentence to your request to the AI:</p>
        <pre class="code">${prompt}</pre>
        <div class="row-end"><button class="btn" data-on="copy" data-text="${prompt}">${icon('copy')} Copy the sentence</button></div>
      </section>`,
    submit: {
      async save(d) {
        const data = { ...S.settings, ...d, exercise_repos: d.exercise_repos.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).join('\n') };
        await S.api.saveSettings(data);
        S.settings = data;
        setTimeFormat(data.time_format);
        toast('Settings saved');
        refresh();
      },
    },
    on: { copy: (el) => copyText(el.dataset.text) },
  };
}

export { esc, raw, fmtDateTime, duration, bar };

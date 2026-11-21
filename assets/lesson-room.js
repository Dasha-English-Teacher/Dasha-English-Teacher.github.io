// The lesson room: one lesson on its own full page, like in Edvibe.
// The section the student is on (an exercise, a video, a text or a link) fills
// the middle. All sections of the lesson are listed on the right, with
// "Finish lesson" at the end. Exercises save by themselves while the student works.
import { html, icon, toast, openModal, duration, nl2br, plural } from './ui.js';
import { S, go, isTeacher, findLesson, findMaterial, progressIndex, lessonDone, courseStats, scoreText, scoreClass, teacherName, notifyTeacher, siteUrl, siteAddress, youtubeId, normUrl } from './core.js';
import { createTracker } from './tracker.js';

export const lessonRoom = ({ id }) => room({ lessonId: id });
export const playRoom = ({ id }) => room({ materialId: id });
export const finishRoom = ({ id }) => room({ lessonId: id, finish: true });

const KIND_WORD = { exercise: 'Exercise', video: 'Video', link: 'Link', text: 'Reading' };
const KIND_ICON = { exercise: 'pen', video: 'video', link: 'link', text: 'note' };

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

function notFound(teacher) {
  return {
    title: 'Not available',
    layout: 'full',
    html: html`<div class="room room-empty"><div class="room-card"><h1>This lesson is not available</h1>
      <p>It may have been moved or hidden.</p><p><a class="btn btn-primary" href="#programs">${teacher ? 'Programs' : 'My programs'}</a></p></div></div>`,
  };
}

async function room({ lessonId, materialId, finish = false }) {
  const teacher = isTeacher();
  const [tree, attempts] = await Promise.all([S.api.tree(), teacher ? [] : S.api.listAttempts({ student_id: S.me.id })]);
  const found = materialId ? findMaterial(tree, materialId) : findLesson(tree, lessonId);
  if (!found) return notFound(teacher);
  const { course, lesson } = found;
  const mats = lesson.materials;
  const lessonNo = course.lessons.indexOf(lesson) + 1;
  const nextLesson = course.lessons[lessonNo] || null;
  let idx = progressIndex(attempts);

  // Which section to show: the one asked for, or the first one not done yet.
  // A finished lesson opens at its first section, for review.
  let cur = -1;
  if (materialId) cur = found.index;
  else if (!finish && mats.length) {
    cur = teacher || lessonDone(lesson, idx) ? 0 : Math.max(0, mats.findIndex((m) => !idx.get(m.id)?.done));
    history.replaceState(null, '', `#play-${mats[cur].id}`);
  }
  const mat = cur >= 0 ? mats[cur] : null;
  // The result from an earlier visit, shown until the student starts again.
  const before = !teacher && mat ? idx.get(mat.id)?.completed || null : null;
  // An exercise the student started (or started again) and has not finished.
  const openAttempt = (m) => {
    const p = teacher ? null : idx.get(m.id);
    return m.kind === 'exercise' && p && p.last && p.last.status !== 'completed' ? p.last : null;
  };

  // ---------- right column: the list of sections ----------
  const stateOf = (m) => {
    const p = teacher ? null : idx.get(m.id);
    if (p?.done) return { cls: 'is-done', note: m.kind === 'exercise' && p.completed.score != null ? scoreText(p.completed) : '', a: p.completed };
    if (p) return { cls: 'is-started', note: 'started', a: p.last };
    return { cls: '', note: '' };
  };
  const sideList = () => html`<ol class="sec-list">
    ${mats.map((m, k) => {
      const st = stateOf(m);
      const on = k === cur;
      return html`<li><a class="sec-link ${st.cls} ${on ? 'is-on' : ''}" href="#play-${m.id}" ${on ? 'aria-current="step"' : ''}>
        <span class="sec-mark" aria-hidden="true"></span>
        <span class="sec-name">${m.title}</span>
        ${st.note ? html`<span class="sec-note ${st.a && st.a.score != null ? scoreClass(st.a) : ''}">${st.note}</span>` : ''}
        <span class="sr-only">${st.cls === 'is-done' ? ', done' : st.cls === 'is-started' ? ', started' : ''}</span></a></li>`;
    })}
    <li><a class="sec-link sec-finish ${finish ? 'is-on' : ''}" href="#finish-${lesson.id}" ${finish ? 'aria-current="step"' : ''}>${icon('flag')}<span class="sec-name">Finish lesson</span></a></li>
  </ol>`;
  const paintSide = () => { const box = document.getElementById('sec-box'); if (box) box.innerHTML = sideList().toString(); };
  const markDone = (a) => {
    if (!a) return;
    const p = idx.get(a.material_id) || { done: false, last: null, completed: null, attempts: [] };
    p.attempts = [a, ...p.attempts.filter((x) => x.id !== a.id)];
    p.last = a;
    if (a.status === 'completed') { p.done = true; p.completed = a; }
    idx.set(a.material_id, p);
    paintSide();
    paintProgress();
  };

  // ---------- top bar ----------
  const progressBlock = () => {
    if (teacher) return html`<span class="chip chip-note">Preview: nothing is saved for the teacher</span>`;
    const st = courseStats(course, idx);
    const pct = st.total ? Math.round((100 * st.done) / st.total) : 0;
    return html`<span class="ring" style="--p:${pct}" aria-hidden="true"></span>
      <span class="room-prog-text"><span>Program progress</span><strong>${st.done} of ${plural(st.total, 'lesson')}</strong></span>`;
  };
  const paintProgress = () => { const el = document.getElementById('room-prog'); if (el) el.innerHTML = progressBlock().toString(); };

  // ---------- exercise saving (students only) ----------
  let tracker = null;
  let attempt = null;
  let creating = null;
  let completedHere = false;
  let saveTimer = null;
  let timerTick = null;
  let lastSaved = '';

  const ensureAttempt = () => {
    if (teacher) return Promise.resolve(null);
    if (attempt) return Promise.resolve(attempt);
    if (!creating) {
      creating = S.api.createAttempt({ material_id: mat.id, material_title: mat.title, status: 'in_progress' })
        .then((a) => { attempt = a; markDone(a); return a; })
        .catch((e) => { creating = null; throw e; });
    }
    return creating;
  };
  const payload = (snap) => ({
    score: snap.score, max_score: snap.max, first_score: snap.firstScore, first_max: snap.firstMax,
    revealed: snap.revealed, answers: snap.answers, seconds: snap.seconds,
  });
  async function save(snap = tracker && tracker.snapshot(), extra = {}) {
    if (teacher || !snap || !snap.interacted) return attempt;
    await ensureAttempt();
    const body = { ...payload(snap), ...extra };
    const sig = JSON.stringify(body);
    if (sig === lastSaved) return attempt;
    attempt = await S.api.updateAttempt(attempt.id, body);
    lastSaved = sig;
    return attempt;
  }
  const scheduleSave = (ms) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save().catch((e) => console.error('autosave', e)), ms); };

  // The exercise showed a score, or the student pressed "I'm done": the section is done.
  async function complete(snap) {
    if (completedHere) return save(snap);
    completedHere = true;
    const a = await save(snap, { status: 'completed', finished_at: new Date().toISOString() });
    markDone(a);
    paintDoneButton();
    return a;
  }

  // The chip next to the title: the score now, or the result from an earlier visit.
  const chipState = (st) => {
    if (st.score != null) return { text: `Score ${st.score} / ${st.max}`, cls: st.score / st.max >= 0.85 ? 'chip-good' : 'chip-fair' };
    if (st.interacted) return { text: 'Working…', cls: '' };
    if (before) return { text: before.score != null && before.max_score ? `Done: ${scoreText(before)}` : 'Done', cls: 'chip-good' };
    return { text: 'Not started', cls: '' };
  };
  function paintBar(st) {
    const chip = document.getElementById('play-score');
    if (chip) {
      const c = chipState(st);
      chip.textContent = c.text;
      chip.className = `chip ${c.cls}`;
    }
    const t = document.getElementById('play-time');
    if (t) t.textContent = duration(st.seconds);
  }
  function paintDoneButton() {
    const b = document.getElementById('done-btn');
    if (b) { b.outerHTML = html`<span class="chip chip-good" id="done-btn">${icon('check')} Saved</span>`.toString(); }
  }

  function doneDialog() {
    if (teacher) { toast('Preview: nothing is saved for the teacher.'); return; }
    const snap = tracker.snapshot({ final: true });
    if (!snap.interacted && tracker.sameOrigin) { toast('Do the exercise first, then press "I\'m done".', 'error'); return; }
    const m = openModal({
      title: 'Finished this exercise?',
      body: html`<div class="summary">
          ${snap.score != null ? html`<p class="summary-score"><span>${snap.score}</span> / ${snap.max}</p>` : html`<p class="muted">This exercise has no automatic score. ${teacherName()} will read your answers.</p>`}
          <p class="muted">Time: ${duration(snap.seconds)}${snap.answers?.length ? `, ${snap.answers.filter((x) => x.a).length} answers saved` : ''}</p>
          ${snap.revealed ? html`<p class="notice notice-warn small">You opened the answer key. That's fine, ${teacherName()} will see it too.</p>` : ''}
          ${!tracker.sameOrigin ? html`<p class="muted small">This exercise is on another website, so the score cannot be read. It is saved as done.</p>` : ''}
        </div>
        <div class="row-end"><button class="btn" data-on="close">Keep working</button>
        <button class="btn btn-primary" data-on="ok">${cur < mats.length - 1 ? 'Save and go on' : 'Save'}</button></div>`,
      on: {
        async ok() {
          await complete(snap.interacted ? snap : { ...snap, interacted: true });
          m.close();
          go(cur < mats.length - 1 ? `play-${mats[cur + 1].id}` : `finish-${lesson.id}`);
        },
      },
    });
  }

  // ---------- the middle: one section ----------
  const pager = () => {
    const prev = cur > 0 ? mats[cur - 1] : null;
    const next = cur < mats.length - 1 ? mats[cur + 1] : null;
    return html`<footer class="sec-foot">
      ${prev ? html`<a class="btn" href="#play-${prev.id}">${icon('back')} Back</a>` : html`<span></span>`}
      <span class="sec-count">${cur + 1} of ${mats.length}</span>
      ${next ? html`<a class="btn btn-primary" href="#play-${next.id}">Next ${icon('next')}</a>`
        : html`<a class="btn btn-primary" href="#finish-${lesson.id}">Finish lesson ${icon('next')}</a>`}
    </footer>`;
  };

  const sectionHtml = () => {
    if (!mat) return html`<div class="sec-empty"><h1>No sections yet</h1><p class="muted">${teacher ? html`Add exercises and other sections to this lesson in the <a href="#edit-program-${course.id}">program editor</a>.` : `${teacherName()} has not added anything to this lesson yet.`}</p></div>`;
    const head = html`<header class="sec-head">
      <div class="sec-title"><span class="sec-kicker">${icon(KIND_ICON[mat.kind] || 'note')} ${KIND_WORD[mat.kind] || 'Section'}</span><h1>${mat.title}</h1></div>
      ${mat.kind === 'exercise' ? html`<div class="sec-tools">
        ${teacher ? '' : html`<span class="chip ${chipState({}).cls}" id="play-score">${chipState({}).text}</span>
          <span class="player-time" title="Time on this exercise">${icon('clock')}<span id="play-time">0 s</span></span>`}
        <a class="icon-btn hide-sm" href="${siteAddress(mat.url)}" target="_blank" rel="noopener" aria-label="Open in a new tab" title="Open in a new tab">${icon('external')}</a>
        ${teacher ? '' : html`<button class="btn btn-sm" id="done-btn" data-on="done">${icon('check')} I'm done</button>`}
      </div>` : ''}
    </header>`;
    let body = '';
    if (mat.kind === 'exercise') {
      body = html`<iframe id="exercise-frame" class="sec-frame" src="${siteAddress(mat.url)}" title="${mat.title}" allow="autoplay; clipboard-write; fullscreen"></iframe>`;
    } else if (mat.kind === 'video') {
      const vid = youtubeId(mat.url);
      body = vid
        ? html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="${mat.title}" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
        : html`<p><a class="btn btn-primary" href="${mat.url}" target="_blank" rel="noopener">${icon('video')} Watch the video</a></p>`;
    } else if (mat.kind === 'text') {
      body = html`<div class="sec-text">${nl2br(mat.body || '')}</div>`;
    } else {
      body = html`<div class="sec-link-box"><p class="muted">This section opens on another website (${hostOf(mat.url)}).</p>
        <p><a class="btn btn-primary" href="${mat.url}" target="_blank" rel="noopener" data-on="open-link">${icon('external')} Open the link</a></p></div>`;
    }
    return html`${head}<div class="sec-body sec-${mat.kind}">${body}</div>${pager()}`;
  };

  // ---------- the middle: finishing the lesson ----------
  const exerciseLine = (m) => {
    const p = idx.get(m.id);
    if (!p) return 'not opened';
    if (!p.done) return 'started, not finished';
    return m.kind === 'exercise' && p.completed.score != null ? scoreText(p.completed) : 'done';
  };
  const finishHtml = (sent = false) => {
    const pending = mats.filter(openAttempt);
    const unopened = teacher ? [] : mats.filter((m) => !idx.get(m.id));
    const complete = !teacher && lessonDone(lesson, idx);
    const scored = mats.map((m) => idx.get(m.id)?.completed).filter((a) => a && a.score != null && a.max_score);
    const total = scored.reduce((s, a) => s + a.score, 0);
    const max = scored.reduce((s, a) => s + a.max_score, 0);
    return html`<div class="finish">
      <span class="sec-kicker">${icon('flag')} Lesson ${lessonNo}</span>
      <h1>${sent ? 'Well done!' : complete ? 'All exercises are done' : 'Finish the lesson'}</h1>
      ${sent ? html`<p class="hand hand-lg">Sent to ${teacherName()}!</p>` : ''}
      ${max ? html`<p class="finish-total">Exercises: <strong>${total} / ${max}</strong></p>` : ''}
      <ol class="finish-list">${mats.map((m) => {
        const p = teacher ? null : idx.get(m.id);
        return html`<li class="${p?.done ? 'is-done' : p ? 'is-started' : ''}"><a href="#play-${m.id}">${m.title}</a><span class="${p?.completed?.score != null ? `score ${scoreClass(p.completed)}` : 'muted small'}">${teacher ? '' : exerciseLine(m)}</span></li>`;
      })}</ol>
      ${teacher ? html`<p class="notice small">Students press this button at the end of a lesson. Their unfinished exercises are saved as they are, and you get one email with all the results.</p>` : ''}
      ${!teacher && !sent && unopened.length ? html`<p class="notice notice-warn small">Not opened yet: ${unopened.map((m) => m.title).join(', ')}. You can go back to ${unopened.length === 1 ? 'it' : 'them'}, or finish now.</p>` : ''}
      ${!teacher && !sent && pending.length ? html`<p class="notice small">Not finished yet: ${pending.map((m) => m.title).join(', ')}. ${pending.length === 1 ? 'It is' : 'They are'} sent as ${pending.length === 1 ? 'it is' : 'they are'}.</p>` : ''}
      <div class="row-end finish-actions">
        <a class="btn" href="#program-${course.id}">All lessons</a>
        ${nextLesson && (teacher || sent || complete) ? html`<a class="btn ${sent || teacher ? 'btn-primary' : ''}" href="#lesson-${nextLesson.id}">Next lesson: ${nextLesson.title} ${icon('next')}</a>` : ''}
        ${!teacher && !sent ? html`<button class="btn btn-primary" data-on="finish-lesson">${icon('flag')} ${complete ? `Send results to ${teacherName()}` : `Finish and send to ${teacherName()}`}</button>` : ''}
      </div>
    </div>`;
  };

  async function finishLesson() {
    const now = new Date().toISOString();
    // Exercises started (or started again) but not finished are sent as they are.
    for (const a of mats.map(openAttempt).filter(Boolean)) await S.api.updateAttempt(a.id, { status: 'completed', finished_at: now });
    idx = progressIndex(await S.api.listAttempts({ student_id: S.me.id }));
    if (S.settings.notify_on_finish !== false) {
      const lines = mats.map((m, k) => `${k + 1}. ${m.title}: ${exerciseLine(m)}`).join('\n');
      notifyTeacher(`${S.me.full_name || S.me.email} finished ${lesson.title}`, {
        Student: S.me.full_name || S.me.email,
        Program: course.title,
        Lesson: `${lessonNo}. ${lesson.title}`,
        Sections: lines,
        'See the answers': `${siteUrl()}#student-${S.me.id}`,
      });
    }
    const box = document.getElementById('room-main');
    if (box) box.innerHTML = finishHtml(true).toString();
    paintSide();
    paintProgress();
  }

  // ---------- page ----------
  return {
    title: finish ? `Finish: ${lesson.title}` : mat ? `${mat.title}, ${lesson.title}` : lesson.title,
    layout: 'full',
    html: html`
      <div class="room" style="--prog:${course.color || '#1f4fd1'}">
        <header class="room-bar">
          <a class="btn btn-sm room-back" href="#program-${course.id}">${icon('back')}<span>All lessons</span></a>
          <div class="room-prog" id="room-prog">${progressBlock()}</div>
          <span class="room-course hide-sm">${course.title}</span>
          ${teacher ? html`<a class="btn btn-sm hide-sm" href="#edit-program-${course.id}">${icon('edit')} Edit</a>` : ''}
          <a class="icon-btn" href="#programs" aria-label="Close the lesson" title="Close">${icon('close')}</a>
        </header>
        <div class="room-body">
          <main class="room-card room-main ${mat ? `is-${mat.kind}` : ''}" id="room-main">${finish ? finishHtml() : sectionHtml()}</main>
          <aside class="room-card room-side" aria-label="Sections of this lesson">
            <div class="side-lesson"><span class="lesson-tile">${lessonNo}</span>
              <div><span class="tile-label">Lesson ${lessonNo}</span><strong>${lesson.title}</strong></div></div>
            <h2 class="side-h">Sections</h2>
            <div id="sec-box">${sideList()}</div>
          </aside>
        </div>
      </div>`,
    on: {
      done: () => doneDialog(),
      'finish-lesson': () => finishLesson().catch((e) => toast(e.message || 'Could not finish the lesson', 'error')),
      'open-link'() {
        window.open(mat.url, '_blank', 'noopener');
        if (!teacher && mat && !idx.get(mat.id)?.done) {
          S.api.createAttempt({ material_id: mat.id, material_title: mat.title, status: 'completed', finished_at: new Date().toISOString() }).then(markDone).catch(() => {});
        }
      },
    },
    mount() {
      if (!mat) return;
      if (mat.kind === 'exercise') {
        const frame = document.getElementById('exercise-frame');
        tracker = createTracker(frame, {
          studentName: teacher ? '' : (S.me.full_name || ''),
          onChange(reason, snap) {
            paintBar(snap);
            if (teacher) return;
            if (reason === 'start') ensureAttempt().catch((e) => console.error(e));
            if (reason === 'score') { complete(snap).catch((e) => console.error(e)); return; }
            scheduleSave(reason === 'revealed' ? 600 : 4000);
          },
        });
        timerTick = setInterval(() => paintBar(tracker.peek()), 1000);
        // An exercise can link to the next file. If that file is another section
        // of this lesson, show it as that section (so its results are saved there).
        frame.addEventListener('load', () => {
          let href = '';
          try { href = frame.contentWindow.location.href; } catch { return; }
          if (!href || href === 'about:blank' || normUrl(href) === normUrl(siteAddress(mat.url))) return;
          const other = mats.find((m) => m.id !== mat.id && m.url && normUrl(siteAddress(m.url)) === normUrl(href));
          if (other) go(`play-${other.id}`);
        });
      } else if (mat.kind !== 'link' && !teacher && !idx.get(mat.id)?.done) {
        // Reading and videos count as done once opened.
        S.api.createAttempt({ material_id: mat.id, material_title: mat.title, status: 'completed', finished_at: new Date().toISOString() }).then(markDone).catch(() => {});
      }
    },
    unmount() {
      clearInterval(timerTick);
      clearTimeout(saveTimer);
      if (!tracker) return;
      const snap = tracker.snapshot({ final: true });
      tracker.destroy();
      if (teacher || !snap.interacted) return;
      save(snap).catch((e) => console.error(e)); // keep the work; "Finish lesson" sends it
    },
  };
}

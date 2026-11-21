// Exercise player: shows one exercise full-screen, follows the score, saves the work.
import { html, icon, toast, openModal, duration, esc } from './ui.js';
import { S, go, isTeacher, findMaterial, teacherName, notifyTeacher, siteUrl, siteAddress } from './core.js';
import { createTracker } from './tracker.js';

export async function playView({ id }) {
  const tree = await S.api.tree();
  const found = findMaterial(tree, id);
  if (!found) {
    return { title: 'Not found', html: html`<div class="empty"><h1>This exercise is not available</h1><p><a href="#">Back to the start page</a></p></div>` };
  }
  const { course, lesson, material, index } = found;
  const teacher = isTeacher();
  const next = lesson.materials.slice(index + 1).find((m) => m.kind === 'exercise') || null;
  const backHash = `lesson-${lesson.id}`;

  let tracker = null;
  let attempt = null;
  let creating = null;
  let finished = false;
  let saveTimer = null;
  let timerTick = null;
  let lastSaved = '';

  const ensureAttempt = () => {
    if (teacher) return Promise.resolve(null);
    if (attempt) return Promise.resolve(attempt);
    if (!creating) {
      creating = S.api.createAttempt({ material_id: material.id, material_title: material.title, status: 'in_progress' })
        .then((a) => (attempt = a))
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

  const scheduleSave = (ms) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch((e) => console.error('autosave', e)), ms);
  };

  function paintBar(st) {
    const chip = document.getElementById('play-score');
    if (chip) {
      chip.textContent = st.score != null ? `Score ${st.score} / ${st.max}` : (st.interacted ? 'Working…' : 'Not started');
      chip.className = `chip ${st.score != null ? (st.score / st.max >= 0.85 ? 'chip-good' : 'chip-fair') : ''}`;
    }
    const t = document.getElementById('play-time');
    if (t) t.textContent = duration(st.seconds);
  }

  async function sendToTeacher(snap) {
    const a = await save(snap, { status: 'completed', finished_at: new Date().toISOString() });
    finished = true;
    if (S.settings.notify_on_finish !== false) {
      const answers = (snap.answers || []).filter((x) => x.a).slice(0, 60)
        .map((x, i) => `${i + 1}. ${x.q ? `${x.q}\n   ` : ''}${x.ok === true ? '✓ ' : x.ok === false ? '✗ ' : ''}${x.a}`).join('\n');
      notifyTeacher(`${S.me.full_name || S.me.email} finished: ${material.title}`, {
        Student: S.me.full_name || S.me.email,
        Program: `${course.title}, ${lesson.title}`,
        Exercise: material.title,
        Score: snap.score != null ? `${snap.score} / ${snap.max}` : 'No score (open answers)',
        'Time spent': duration(snap.seconds),
        'Answer key shown': snap.revealed ? 'Yes' : 'No',
        Answers: answers || '—',
        Review: a ? `${siteUrl()}#review-${a.id}` : '',
      });
    }
    return a;
  }

  function summaryBody(snap) {
    return html`
      <div class="summary">
        ${snap.score != null ? html`<p class="summary-score"><span>${snap.score}</span> / ${snap.max}</p>` : html`<p class="muted">This exercise has no automatic score. ${teacherName()} will read your answers.</p>`}
        <p class="muted">Time: ${duration(snap.seconds)}${snap.answers?.length ? `, ${snap.answers.filter((x) => x.a).length} answers saved` : ''}</p>
        ${snap.revealed ? html`<p class="notice notice-warn small">You opened the answer key. That's fine, ${teacherName()} will see it too.</p>` : ''}
      </div>`;
  }

  function finishDialog() {
    if (teacher) { toast('Preview: results are not saved for the teacher.'); return; }
    const snap = tracker.snapshot({ final: true });
    if (!snap.interacted && tracker.sameOrigin) { toast('Start the exercise first, then press Finish.', 'error'); return; }
    const m = openModal({
      title: 'Send your work?',
      body: html`${summaryBody(snap)}
        ${!tracker.sameOrigin ? html`<p class="muted small">This exercise is on another website, so the score cannot be read automatically. It will be saved as done.</p>` : ''}
        <div class="row-end"><button class="btn" data-on="close">Keep working</button>
        <button class="btn btn-primary" data-on="send">Send to ${teacherName()}</button></div>`,
      on: {
        async send() {
          await sendToTeacher(snap.interacted ? snap : { ...snap, interacted: true });
          m.setBody(html`<div class="sent"><p class="hand hand-lg">Sent!</p>
            <p>${teacherName()} can now see your work${snap.score != null ? ` (${snap.score} / ${snap.max})` : ''}.</p>
            <div class="row-end">
              <a class="btn" href="#${backHash}" data-on="go-back">Back to the lesson</a>
              ${next ? html`<a class="btn btn-primary" href="#play-${next.id}" data-on="go-next">Next exercise</a>` : ''}
            </div></div>`);
        },
        'go-next': () => { m.close(); go(`play-${next.id}`); },
        'go-back': () => { m.close(); go(backHash); },
      },
    });
  }

  return {
    title: material.title,
    layout: 'full',
    html: html`
      <div class="player">
        <header class="player-bar">
          <a class="icon-btn" href="#${backHash}" aria-label="Back to the lesson">${icon('back')}</a>
          <div class="player-title"><span class="player-crumb">${course.title}, ${lesson.title}</span><strong>${material.title}</strong></div>
          ${teacher ? html`<span class="chip chip-note">Preview, results are not saved</span>` : html`
            <span class="chip" id="play-score">Not started</span>
            <span class="player-time" title="Time on this exercise">${icon('clock')}<span id="play-time">0 s</span></span>`}
          <a class="icon-btn hide-sm" href="${siteAddress(material.url)}" target="_blank" rel="noopener" aria-label="Open in a new tab" title="Open in a new tab">${icon('external')}</a>
          ${teacher ? '' : html`<button class="btn btn-primary" data-on="finish">${icon('check')} Finish</button>`}
        </header>
        <iframe id="exercise-frame" class="player-frame" src="${siteAddress(material.url)}" title="${material.title}" allow="autoplay; clipboard-write; fullscreen"></iframe>
      </div>`,
    on: { finish: () => finishDialog() },
    mount() {
      const frame = document.getElementById('exercise-frame');
      tracker = createTracker(frame, {
        studentName: teacher ? '' : (S.me.full_name || ''),
        onChange(reason, snap) {
          paintBar(snap);
          if (teacher) return;
          if (reason === 'start') ensureAttempt().catch((e) => console.error(e));
          scheduleSave(reason === 'score' || reason === 'revealed' ? 600 : 4000);
        },
      });
      timerTick = setInterval(() => paintBar(tracker.peek()), 1000);
    },
    unmount() {
      clearInterval(timerTick);
      clearTimeout(saveTimer);
      if (!tracker) return;
      const snap = tracker.snapshot({ final: true });
      tracker.destroy();
      if (teacher || finished || !snap.interacted) return;
      // Save what we have, then offer to send it.
      save(snap).then((a) => {
        if (!a) return;
        const m = openModal({
          title: `Send "${material.title}" to ${teacherName()}?`,
          body: html`${summaryBody(snap)}<p class="muted small">Your work is saved. You can also come back and finish later.</p>
            <div class="row-end"><button class="btn" data-on="close">Later</button>
            <button class="btn btn-primary" data-on="send">Send now</button></div>`,
          on: {
            async send() {
              await sendToTeacher(snap);
              m.close();
              toast(`Sent to ${teacherName()}`);
            },
          },
        });
      }).catch((e) => console.error(e));
    },
  };
}

export { esc };

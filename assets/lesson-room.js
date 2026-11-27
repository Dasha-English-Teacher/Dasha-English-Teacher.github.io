import { prepareExercise } from './exercise-frame.js';
// The lesson room: one lesson on its own full page, like in Edvibe.
// The section the student is on (an exercise, a video, a text or a link) fills
// the middle. All sections of the lesson are listed on the right, with
// "Finish lesson" at the end. Exercises save by themselves while the student works.
import { ask, html, icon, toast, nl2br, plural } from './ui.js';
import { S, go, isTeacher, findLesson, findMaterial, progressIndex, sectionDone, lessonDone, courseStats, scoreText, scoreClass, teacherName, notifyTeacher, siteUrl, siteAddress, youtubeId, normUrl } from './core.js';
import { bindStoryControls, storyDestination, STORY_INSTRUCTION, STORY_PENDING } from './story.js';
import { confirmPreviewDecision, hasStoryPreview, previewRoute, storyPreviewCourse } from './story-preview.js';
import { createTracker } from './tracker.js';

let finishRequest;

export const lessonRoom = ({ id }) => room({ lessonId: id });
export const playRoom = ({ id }) => room({ materialId: id });
export const finishRoom = ({ id }) => room({ lessonId: id, finish: true });

export function storyPreviewRoom({ id, name }) {
  const [previewId, target, extra] = id.split('/');
  if (!isTeacher() || !previewId || !target || extra !== undefined) return notFound(isTeacher());
  return room({ previewId, materialId: name === 'preview-play' ? target : undefined,
    lessonId: target, finish: name === 'preview-finish' });
}


function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

function accessibleActionColor(color) {
  const hex = /^#[0-9a-f]{3}$/i.test(color) ? color.replace(/[0-9a-f]/gi, (digit) => digit.repeat(2)) : color;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'var(--action)';
  const rgb = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16));
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const max = 1.05 / 4.5 - 0.05;
  if (luminance(rgb) <= max) return 'var(--prog)';

  // Retain the hue and darken just enough for 4.5:1 contrast with white.
  for (let percent = 99; percent > 0; percent -= 1) {
    const darker = rgb.map((channel) => Math.floor(channel * percent / 100));
    if (luminance(darker) <= max) return `rgb(${darker.join(', ')})`;
  }
  return 'var(--action)';
}

function notFound(teacher, previewId) {
  return {
    title: 'Not available',
    layout: 'full',
    html: html`<div class="room room-empty"><div class="room-card"><h1>This lesson is not available</h1>
      <p>It may have been moved or hidden.</p><p><a class="btn btn-primary" href="#${previewId ? `program-${previewId}` : 'programs'}">${previewId ? 'Back to Student view' : teacher ? 'Programs' : 'My programs'}</a></p></div></div>`,
  };
}

async function room({ lessonId, materialId, finish = false, previewId }) {
  const teacher = isTeacher();
  const studentId = S.me.id;
  const sameAccount = () => S.api.me?.id === studentId;
  const [tree, attempts] = await Promise.all([S.api.tree(), teacher ? [] : S.api.listAttempts({ student_id: S.me.id })]);
  const sourceCourse = previewId && tree.find((c) => c.id === previewId);
  const preview = teacher && hasStoryPreview(sourceCourse);
  if (previewId && !preview) return notFound(teacher, previewId);
  const visibleTree = preview ? [storyPreviewCourse(sourceCourse, studentId)] : tree;
  const found = materialId ? findMaterial(visibleTree, materialId) : findLesson(visibleTree, lessonId);
  if (!found) return notFound(teacher, previewId);
  const { lesson } = found;
  let { course } = found;
  const route = (page, id) => preview ? previewRoute(course.id, page, id) : `${page}-${id}`;
  const mats = lesson.materials;
  const lessonNo = course.lessons.indexOf(lesson) + 1;
  const ending = lesson.materials.find((m) => m.story);
  const nextLesson = () => (!teacher || preview) && ending
    ? storyDestination(course, ending)
    : course.lessons[course.lessons.findIndex((l) => l.id === lesson.id) + 1];
  let idx = progressIndex(attempts);

  // Which section to show: the one asked for, or the first one not done yet.
  // A finished lesson opens at its first section, for review.
  let cur = -1;
  if (materialId) cur = found.index;
  else if (!finish && mats.length) {
    cur = (teacher && !preview) || lessonDone(lesson, idx) ? 0 : Math.max(0, mats.findIndex((m) => !sectionDone(m, idx)));
    history.replaceState(null, '', `#${route('play', mats[cur].id)}`);
  }
  const mat = cur >= 0 ? mats[cur] : null;
  // The result from an earlier visit, shown until the student starts again.
  // An exercise the student started (or started again) and has not finished.
  const openAttempt = (m) => {
    const p = teacher ? null : idx.get(m.id);
    return m.kind === 'exercise' && p && p.last && p.last.status !== 'completed' ? p.last : null;
  };

  // ---------- right column: the list of sections ----------
  const stateOf = (m) => {
    const p = teacher ? null : idx.get(m.id);
    if (m.story?.only) return m.decision ? { cls: 'is-done', note: 'Choice saved' } : { cls: '', note: 'Choice pending' };
    if (p?.done && m.story && !m.decision) return { cls: 'is-started', note: 'Choice pending' };
    if (p?.done) return { cls: 'is-done', note: m.kind === 'exercise' && p.completed.score != null ? scoreText(p.completed) : '', a: p.completed };
    if (p) return { cls: 'is-started', note: 'started', a: p.last };
    return { cls: '', note: '' };
  };
  const sideList = () => html`<ol class="sec-list">
    ${mats.map((m, k) => {
      const st = stateOf(m);
      const on = k === cur;
      return html`<li><a class="sec-link ${st.cls} ${on ? 'is-on' : ''}" href="#${route('play', m.id)}" ${on ? 'aria-current="step"' : ''}>
        <span class="sec-mark" aria-hidden="true"></span>
        <span class="sec-name">${m.title}</span>
        ${st.note ? html`<span class="sec-note ${st.a && st.a.score != null ? scoreClass(st.a) : ''}">${st.note}</span>` : ''}
        <span class="sr-only">${st.cls === 'is-done' ? ', done' : st.cls === 'is-started' ? ', started' : ''}</span></a></li>`;
    })}
    <li><a class="sec-link sec-finish ${finish ? 'is-on' : ''}" href="#${route('finish', lesson.id)}" ${finish ? 'aria-current="step"' : ''}>${icon('flag')}<span class="sec-name">Finish lesson</span></a></li>
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
    if (preview) return html`<span class="chip chip-note" title="Story choices stay in this browser">Story preview</span>`;
    if (teacher) return html`<span class="chip chip-note">Preview: nothing is saved for the teacher</span>`;
    const st = courseStats(course, idx);
    const pct = st.total ? Math.round((100 * st.done) / st.total) : 0;
    return html`<span class="ring" style="--p:${pct}" aria-hidden="true"></span>
      <span class="room-prog-text"><span>Program progress</span><strong>${st.done} of ${plural(st.total, 'lesson')}</strong></span>`;
  };
  const paintProgress = () => { const el = document.getElementById('room-prog'); if (el) el.innerHTML = progressBlock().toString(); };

  // Serialize saves so an earlier autosave cannot overwrite the final answers.
  let tracker;
  let frameTools;
  let storyAction;
  let checked = false;
  let busy = false;
  let attempt;
  let restoredDraft = false;
  let saving = Promise.resolve();
  let revision = 0;
  let savedRevision = 0;
  let saveTimer;

  const status = (message) => {
    const node = document.getElementById('section-save-status');
    if (mounted && node) node.textContent = message;
  };
  const retryMessage = 'Your work could not be saved. Try again before leaving this section.';

  function save(complete = false) {
    if (teacher || !mat || mat.story?.only || (!complete && revision === savedRevision)) return saving;
    if (!sameAccount()) return Promise.reject(new Error('Sign in again to save your work.'));
    const snap = tracker?.snapshot({ final: complete });
    const version = revision;
    const job = saving.catch(() => {}).then(async () => {
      if (!sameAccount()) throw new Error('Sign in again to save your work.');
      if (!attempt) {
        const prior = openAttempt(mat);
        attempt = ((restoredDraft || !snap?.interacted) && prior) || await S.api.createAttempt({
          material_id: mat.id, material_title: mat.title, status: 'in_progress',
        });
      }
      const result = snap?.interacted || (snap && restoredDraft) ? {
        score: snap.score, max_score: snap.max, first_score: snap.firstScore, first_max: snap.firstMax,
        revealed: snap.revealed, answers: snap.answers, seconds: snap.seconds,
      } : {};
      const completion = complete ? { status: 'completed', finished_at: attempt.finished_at || new Date().toISOString() } : {};
      attempt = await S.api.updateAttempt(attempt.id, { ...result, ...completion });
      savedRevision = Math.max(savedRevision, version);
      if (mounted) { markDone(attempt); status(''); }
    });
    saving = job;
    return job;
  }

  function trackChange(reason) {
    if (teacher) return;
    revision += 1;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch(() => status(retryMessage)), reason === 'score' ? 300 : 1800);
  }

  const nextSection = () => mats[cur + 1];
  function actionLabel() {
    if (frameTools?.mode === 'graded' && !checked) return 'Check answers';
    if (mat.story && !mat.decision) return 'Continue my story';
    if (frameTools?.mode === 'written' && nextSection()) return 'Save & continue';
    return nextSection() ? 'Continue' : 'Finish lesson';
  }

  function paintAction() {
    const button = document.getElementById('section-action');
    if (!button) return;
    const label = actionLabel();
    button.textContent = label;
    button.disabled = busy || (mat.kind === 'exercise' && !frameTools)
      || (label === 'Continue my story' && !storyAction?.ready);
  }

  const recordingState = (state) => !!document.getElementById('exercise-frame')?.contentDocument?.querySelector('[data-recording-' + state + ']');
  let recordingConfirmation;

  async function advanceSection() {
    if (busy) return;
    busy = true;
    paintAction();
    try {
      clearTimeout(saveTimer);
      if (frameTools?.mode === 'graded' && !checked) {
        await frameTools.check();
        const result = tracker?.snapshot({ final: true });
        if (result?.score == null) {
          status('Answer the questions, then check your answers again.');
          return;
        }
        checked = true;
        await save(true);
        return;
      }
      if (mat.story && !mat.decision) {
        if (frameTools?.validate?.() === false) { status('Complete the required answers before confirming your choice.'); return; }
        if (!mat.story.only) await save(true);
        await storyAction?.save();
        return;
      }
      if (!(mat.story?.only || (!tracker?.peek().interacted && idx.get(mat.id)?.done))) await save(true);
      if (!mounted || !sameAccount()) return;
      const next = nextSection();
      if (!next && !teacher) finishRequest = { studentId, lessonId: lesson.id };
      go(next ? route('play', next.id) : route('finish', lesson.id));
    } catch {
      status(retryMessage);
    } finally {
      busy = false;
      paintAction();
    }
  }

  const pager = () => html`<footer class="sec-foot">
    <p id="section-save-status" class="section-save-status" role="status"></p>
    <button class="btn btn-primary" id="section-action" data-on="advance" ${mat.kind === 'exercise' || mat.story ? 'disabled' : ''}>${actionLabel()}</button>
  </footer>`;

  function warnUnsaved(event) {
    if (recordingState('pending') || recordingState('active') || (!teacher && revision !== savedRevision)) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  const sectionHtml = () => {
    if (!mat) return html`<div class="sec-empty"><h1>No sections yet</h1><p class="muted">${teacher ? html`Add exercises and other sections to this lesson in the <a href="#edit-program-${course.id}">program editor</a>.` : `${teacherName()} has not added anything to this lesson yet.`}</p></div>`;
    const head = html`<header class="sec-head"><div class="sec-title"><h1>${mat.title}</h1></div></header>`;
    let body = '';
    if (mat.kind === 'exercise') {
      body = html`<iframe id="exercise-frame" class="sec-frame" src="${siteAddress(mat.url)}" title="${mat.title}" allow="autoplay; clipboard-write; fullscreen; microphone 'self'; web-share 'self'"></iframe>`;
    } else if (mat.kind === 'video') {
      const vid = youtubeId(mat.url);
      body = vid
        ? html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="${mat.title}" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
        : html`<p><a class="btn" href="${mat.url}" target="_blank" rel="noopener">${icon('video')} Watch the video</a></p>`;
    } else if (mat.kind === 'text') {
      body = html`<div class="sec-text">${nl2br(mat.body || '')}</div>`;
    } else {
      body = html`<div class="sec-link-box"><p class="muted">This section opens on another website (${hostOf(mat.url)}).</p>
        <p><a class="btn" href="${mat.url}" target="_blank" rel="noopener" data-on="open-link">${icon('external')} Open the link</a></p></div>`;
    }
    const story = mat.story && !mat.story.embedded ? html`
      <div data-story-decision class="notice" id="room-story">
        <p>${STORY_INSTRUCTION}</p>
        <fieldset data-story-options><legend>Choose what happens next</legend>
          ${Object.entries(mat.story.options).map(([key, option]) => html`
            <label class="check"><input type="radio" name="story-choice" data-story-option="${key}"> ${option.label}</label>`)}
        </fieldset>
        <p><button class="btn btn-primary" type="button" data-story-confirm disabled>Continue my story</button></p>
        <p data-story-status role="status"></p>
      </div>` : '';
    return html`${head}<div class="sec-body sec-${mat.kind}">${body}${story}</div>${pager()}`;
  };

  // ---------- the middle: finishing the lesson ----------
  const exerciseLine = (m) => {
    if (m.story?.only) return m.decision ? 'Choice saved' : 'Choice pending';
    const p = idx.get(m.id);
    if (!p) return 'not opened';
    if (!p.done) return 'started, not finished';
    if (m.story && !m.decision) return 'Choice pending';
    return m.kind === 'exercise' && p.completed.score != null ? scoreText(p.completed) : 'done';
  };
  const finishHtml = (sent = false, notified = false) => {
    const next = nextLesson();
    const pending = mats.filter((m) => !m.story?.only && openAttempt(m));
    const unopened = teacher ? [] : mats.filter((m) => !m.story?.only && !idx.get(m.id));
    const complete = !teacher && lessonDone(lesson, idx);
    const scored = mats.filter((m) => !m.story?.only).map((m) => idx.get(m.id)?.completed).filter((a) => a && a.score != null && a.max_score);
    const total = scored.reduce((s, a) => s + a.score, 0);
    const max = scored.reduce((s, a) => s + a.max_score, 0);
    return html`<div class="finish">
      <span class="sec-kicker">${icon('flag')} Lesson ${lessonNo}</span>
      <h1>${sent ? 'Well done!' : complete ? 'All exercises are done' : 'Finish the lesson'}</h1>
      ${sent ? html`<p class="hand hand-lg">${notified ? `Sent to ${teacherName()}!` : 'Your work is saved.'}</p>` : ''}
      ${max ? html`<p class="finish-total">Exercises: <strong>${total} / ${max}</strong></p>` : ''}
      <ol class="finish-list">${mats.map((m) => {
        const p = teacher || m.story?.only ? null : idx.get(m.id);
        return html`<li class="${!teacher && sectionDone(m, idx) ? 'is-done' : p ? 'is-started' : ''}"><a href="#${route('play', m.id)}">${m.title}</a><span class="${p?.completed?.score != null ? `score ${scoreClass(p.completed)}` : 'muted small'}">${teacher ? '' : exerciseLine(m)}</span></li>`;
      })}</ol>
      ${teacher && !preview ? html`<p class="notice small">Students press this button at the end of a lesson. Their unfinished exercises are saved as they are, and you get one email with all the results.</p>` : ''}
      ${!teacher && !sent && unopened.length ? html`<p class="notice notice-warn small">Not opened yet: ${unopened.map((m) => m.title).join(', ')}. You can go back to ${unopened.length === 1 ? 'it' : 'them'}, or finish now.</p>` : ''}
      ${!teacher && !sent && pending.length ? html`<p class="notice small">Not finished yet: ${pending.map((m) => m.title).join(', ')}. ${pending.length === 1 ? 'It is' : 'They are'} sent as ${pending.length === 1 ? 'it is' : 'they are'}.</p>` : ''}
      ${(!teacher || preview) && ending && !next ? html`<p class="notice">${ending.decision ? STORY_PENDING : html`<a href="#${route('play', ending.id)}">Choose what happens next to continue your story.</a>`}</p>` : ''}
      <div class="row-end finish-actions">
        <a class="btn" href="#program-${course.id}">All lessons</a>
        ${next && (teacher || sent) ? html`<a class="btn ${sent || teacher ? 'btn-primary' : ''}" href="#${route('lesson', next.id)}">Next lesson: ${next.title} ${icon('next')}</a>` : ''}
        ${!teacher && !sent ? html`<button class="btn btn-primary" data-on="finish-lesson">${icon('flag')} Finish lesson</button>` : ''}
      </div>
    </div>`;
  };

  async function finishLesson() {
    if (teacher || busy) return;
    busy = true;
    const button = document.querySelector('[data-on="finish-lesson"]');
    if (button) button.disabled = true;
    try {
      const now = new Date().toISOString();
      // Exercises started (or started again) but not finished are sent as they are.
      for (const a of mats.filter((m) => !m.story?.only).map(openAttempt).filter(Boolean)) await S.api.updateAttempt(a.id, { status: 'completed', finished_at: now });
      idx = progressIndex(await S.api.listAttempts({ student_id: S.me.id }));
      let notified = false;
      if (S.settings.notify_on_finish !== false) {
        const lines = mats.map((m, k) => `${k + 1}. ${m.title}: ${exerciseLine(m)}`).join('\n');
        notified = await notifyTeacher(`${S.me.full_name || S.me.email} finished ${lesson.title}`, {
          Student: S.me.full_name || S.me.email,
          Program: course.title,
          Lesson: `${lessonNo}. ${lesson.title}`,
          Sections: lines,
          'See the answers': `${siteUrl()}#student-${S.me.id}`,
        });
      }
      const box = document.getElementById('room-main');
      if (mounted && sameAccount() && box) {
        box.innerHTML = finishHtml(true, notified).toString();
        paintSide();
        paintProgress();
      }
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  let cleanStory;
  let mounted = false;
  async function confirmStory(choice, predictions) {
    if (!mounted || !sameAccount()) throw new Error('Open the section again to save your choice.');
    if (teacher && !preview) throw new Error('Open Student view to confirm a story choice.');
    const decision = preview
      ? confirmPreviewDecision(sourceCourse, studentId, mat.id, choice, predictions)
      : await S.api.confirmStoryDecision({ course_id: course.id, material_id: mat.id, choice, predictions });
    const updated = preview ? storyPreviewCourse(sourceCourse, studentId) : (await S.api.tree()).find((c) => c.id === course.id);
    if (mounted && sameAccount()) {
      course = updated || course;
      mat.decision = decision;
      paintSide();
      paintProgress();
    }
    return decision;
  }

  function bindStory(container) {
    if (!container || !mat.story) return;
    cleanStory?.();
    cleanStory = bindStoryControls(container, {
      material: mat, teacher: teacher && !preview, confirm: confirmStory,
      navigate: (id) => go(route('lesson', id)),
      lessonHref: (id) => '#' + route('lesson', id),
      onAction: (action) => { storyAction = action; paintAction(); },
      destination: (decision) => storyDestination(course, mat, decision),
    });
  }

  // ---------- page ----------
  return {
    title: finish ? `Finish: ${lesson.title}` : mat ? `${mat.title}, ${lesson.title}` : lesson.title,
    layout: 'full',
    html: html`
      <div class="room" style="--prog:${course.color || '#1f4fd1'};--prog-action:${accessibleActionColor(course.color || '#1f4fd1')}">
        <header class="room-bar">
          <a class="btn btn-sm room-back" aria-label="All lessons" href="#program-${course.id}">${icon('back')}<span>All lessons</span></a>
          <div class="room-prog" id="room-prog">${progressBlock()}</div>
          <span class="room-course hide-sm">${course.title}</span>
          ${teacher ? html`<a class="btn btn-sm hide-sm" href="#edit-program-${course.id}">${icon('edit')} Edit</a>` : ''}
          <a class="icon-btn" href="#${preview ? `program-${course.id}` : 'programs'}" aria-label="Close the lesson" title="Close">${icon('close')}</a>
        </header>
        <div class="room-body">
          <main class="room-card room-main ${mat ? `is-${mat.kind}` : ''}" id="room-main">${finish ? finishHtml() : sectionHtml()}</main>
          <aside class="room-card room-side" aria-label="Sections of this lesson">
            <details class="room-sections" open><summary>Sections</summary>
            <div class="side-lesson"><span class="lesson-tile">${lessonNo}</span>
              <div><span class="tile-label">Lesson ${lessonNo}</span><strong>${lesson.title}</strong></div></div>
            <div id="sec-box">${sideList()}</div>
            </details>
          </aside>
        </div>
      </div>`,
    on: {
      advance: () => advanceSection(),
      'finish-lesson': () => finishLesson().catch((e) => toast(e.message || 'Could not finish the lesson', 'error')),
      'open-link'() {
        window.open(mat.url, '_blank', 'noopener');

      },
    },
    mount() {
      mounted = true;
      if (window.matchMedia('(max-width: 760px)').matches) document.querySelector('.room-sections').open = false;
      if (finish && !teacher && finishRequest?.studentId === studentId && finishRequest.lessonId === lesson.id) {
        finishRequest = undefined;
        finishLesson().catch(() => toast('Your lesson could not be finished. Try again.', 'error'));
      }
      if (!mat) return;
      bindStory(document.getElementById('room-story'));
      window.addEventListener('beforeunload', warnUnsaved);
      if (mat.kind === 'exercise') {
        const frame = document.getElementById('exercise-frame');
        const address = siteAddress(mat.url);
        const currentDocument = () => {
          try {
            const href = frame.contentWindow.location.href;
            return normUrl(href) === normUrl(address) ? frame.contentDocument : null;
          } catch { return null; }
        };
        const branching = Object.keys(course.story_rules || {}).length > 0;
        const otherSection = (url) => (branching ? course.lessons.flatMap((l) => l.materials) : mats)
          .find((m) => m.id !== mat.id && m.kind === 'exercise' && normUrl(siteAddress(m.url)) === normUrl(url));
        const acceptsDocument = () => {
          // Cross-origin legacy exercise reporting remains supported.
          if (new URL(address, location.href).origin !== location.origin) return true;
          return !!currentDocument();
        };

        function attachFrame() {
          const doc = currentDocument();
          if (!doc) {
            if (new URL(address, location.href).origin !== location.origin) {
              frameTools = { mode: 'external' };
              status('Use the controls inside this exercise before continuing.');
              paintAction();
              return;
            }
            try {
              const href = frame.contentWindow.location.href;
              if (href === 'about:blank') return;
              const other = otherSection(href);
              if (other) { go(route('play', other.id)); return; }
            } catch { /* cross-origin section */ }
            if (branching && new URL(address, location.href).origin === location.origin) frame.src = address;
            return;
          }
          if (!teacher && !restoredDraft) {
            const answers = openAttempt(mat)?.answers || [];
            const fields = [...doc.querySelectorAll('textarea, input[type=text], [contenteditable=true]')];
            for (const field of fields) {
              const saved = answers.find((answer) => answer.field && answer.field === (field.id || field.name));
              if (!saved || field.value || (field.isContentEditable && field.textContent)) continue;
              if (field.isContentEditable) field.textContent = saved.a;
              else field.value = saved.a;
              restoredDraft = true;
            }
          }
          frameTools?.destroy?.();
          frameTools = prepareExercise(doc, frame, () => {
            if (checked && !mat.decision) { checked = false; paintAction(); }
          });
          for (const anchor of doc.querySelectorAll('a[href]:not([download])')) {
            if (otherSection(anchor.href)) {
              anchor.setAttribute('data-lesson-standalone', '');
              anchor.hidden = true;
            }
          }
          if (mat.decision) checked = true;
          paintAction();
          if (mat.story?.embedded) bindStory(doc.querySelector('[data-story-decision]'));
          doc.addEventListener('click', (event) => {
            const anchor = event.target.closest('a[href]');
            if (!anchor || event.defaultPrevented || anchor.hasAttribute('download')) return;
            const target = new URL(anchor.href, doc.URL);
            if (normUrl(target.href) === normUrl(address)) return;
            const other = otherSection(target.href);
            if (other) {
              event.preventDefault();
              go(route('play', other.id));
            } else if (branching && target.pathname.startsWith('/miro-exercises/') && /\.html?$/i.test(target.pathname)) {
              event.preventDefault();
            }
          }, true);
        }

        frame.addEventListener('load', attachFrame);
        if (currentDocument()?.readyState === 'complete') attachFrame();
        if (mat.story?.only) return;
        tracker = createTracker(frame, {
          studentName: teacher ? '' : (S.me.full_name || ''),
          acceptsDocument,
          onChange: trackChange,
        });
      }
    },
    async beforeLeave() {
      if (!sameAccount()) return;
      if (recordingState('active')) {
        if (finishRequest?.studentId === studentId && finishRequest.lessonId === lesson.id) finishRequest = undefined;
        status('Stop recording before leaving this section.');
        return false;
      }
      if (recordingState('pending')) {
        recordingConfirmation ||= ask('Your recording hasn’t been saved. Leave this page anyway?', {
          cancel: 'Stay on page', ok: 'Continue',
        }).finally(() => { recordingConfirmation = undefined; });
        if (!(await recordingConfirmation)) {
          if (finishRequest?.studentId === studentId && finishRequest.lessonId === lesson.id) finishRequest = undefined;
          return false;
        }
      }
      if (teacher) return;
      clearTimeout(saveTimer);
      try {
        do { await save(); } while (revision !== savedRevision);
      } catch {
        status(retryMessage);
        return false;
      }
    },
    unmount() {
      mounted = false;
      cleanStory?.();
      clearTimeout(saveTimer);
      window.removeEventListener('beforeunload', warnUnsaved);
      frameTools?.destroy?.();
      tracker?.destroy();
    },
  };
}

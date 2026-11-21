// Watches an exercise inside an <iframe> and works out the student's score and answers.
//
// Works in two ways:
// 1. Automatically, for exercises on the same website (her GitHub Pages): it reads the
//    score text the exercise shows ("Score: 12 / 18", "12 / 27 correct", "All 15 correct")
//    and collects what the student chose or typed.
// 2. Explicitly, for exercises that include report.js and call reportResult(score, total).

const SCORE_PATTERNS = [
  /score\s*[:\-–—]?\s*(\d{1,3})\s*(?:\/|out of|of)\s*(\d{1,3})/i,
  /(\d{1,3})\s*(?:\/|out of|of)\s*(\d{1,3})\s*(?:answers?\s+|questions?\s+|items?\s+)?(?:(?:checked\s+)?and\s+)?(?:are\s+)?correct/i,
  /(?:you|you've|you have)\s+(?:got|scored|answered)\s+(\d{1,3})\s*(?:\/|out of|of)\s*(\d{1,3})/i,
  /(\d{1,3})\s*(?:\/|out of|of)\s*(\d{1,3})\s*(?:points?|pts|marks?|right)\b/i,
  /(\d{1,3})\s*correct\s*(?:answers?\s*)?(?:\/|out of|of)\s*(\d{1,3})/i,
];
const ALL_CORRECT = /\ball\s+(\d{1,3})\s+(?:answers?\s+|questions?\s+|items?\s+)?(?:are\s+)?correct/i;
const SCORE_HOLDER = /score|result|feedback|summary|total|grade|mark/i;
const CHECK_ALL = /check\s+(all|answers|my answers|everything|the answers)|^\s*✓?\s*check\s*$|submit|finish|get (my )?score|show (my )?(score|results?)/i;
const REVEAL = /show\s+(the\s+)?(answers?|key|solutions?)|reveal|answer key|show answer/i;
const ROW_CHECK = /this answer/i;
const STATE_CLASSES = { ok: true, correct: true, right: true, success: true, no: false, incorrect: false, wrong: false, error: false };
const CONTAINER = 'article, li, tr, .question, .q, .item, .card, .row, .pair, .exercise, [class*="question"], [class*="item"], [class*="task"]';
const PLACEHOLDER = /^(drop|drag|select|choose|tap|click)\b.*(here|answer|word|option)/i;

function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }

export function parseScore(text) {
  const t = clean(text);
  if (!t) return null;
  for (const re of SCORE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const s = +m[1], max = +m[2];
      if (max > 0 && max <= 500 && s >= 0 && s <= max) return { score: s, max };
    }
  }
  const all = t.match(ALL_CORRECT);
  if (all && +all[1] > 0) return { score: +all[1], max: +all[1] };
  return null;
}

function classOf(el) {
  return typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
}

function visible(el) {
  if (!el.isConnected) return false;
  const st = el.ownerDocument.defaultView.getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden';
}

// Find the score the exercise is showing right now.
export function findScore(doc) {
  if (!doc || !doc.body) return null;
  const holders = [...doc.querySelectorAll('[id], [class]')].filter((el) => {
    const key = `${el.id || ''} ${classOf(el)}`;
    return SCORE_HOLDER.test(key) && !/row-result|status|qstatus/i.test(key) && el.textContent.length < 600 && visible(el);
  });
  // Prefer an element literally called "score", then other holders.
  holders.sort((a, b) => (/\bscore\b/i.test(b.id) ? 1 : 0) - (/\bscore\b/i.test(a.id) ? 1 : 0));
  for (const el of holders) {
    const s = parseScore(el.textContent);
    if (s) return s;
  }
  // Fall back to any line of visible text that mentions a score.
  const lines = (doc.body.innerText || '').split('\n');
  for (const line of lines) {
    if (line.length > 200) continue;
    const s = parseScore(line);
    if (s) return s;
  }
  return null;
}

function correctness(el, box) {
  const read = (node) => {
    for (const c of classOf(node).split(/\s+/)) if (c in STATE_CLASSES) return STATE_CLASSES[c];
    return null;
  };
  let v = read(el);
  if (v !== null) return v;
  if (box) {
    v = read(box);
    if (v !== null) return v;
    const flagged = box.querySelector('.correct, .incorrect, .wrong, .ok, .no');
    if (flagged) return read(flagged);
  }
  return null;
}

function describe(box, el) {
  if (!box) return '';
  const copy = box.cloneNode(true);
  copy.querySelectorAll('select, input, textarea, [contenteditable], .slot, .drop, [class*="slot"]').forEach((n) => n.replaceWith(' ___ '));
  copy.querySelectorAll('button, [aria-live], .status, .msg, .feedback, .clue, .hint, .row-result, .qstatus, .number, .num, .n, script, style, label.answerlabel').forEach((n) => n.remove());
  let t = clean(copy.textContent);
  if (!t && el && el.getAttribute) t = clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
  return t.length > 220 ? `${t.slice(0, 217)}…` : t;
}

// Collect what the student chose, typed or dropped.
export function collectAnswers(doc) {
  if (!doc || !doc.body) return [];
  const out = [];
  const seen = new Set();
  const push = (el, value) => {
    if (seen.has(el) || out.length >= 150) return;
    seen.add(el);
    const box = el.closest(CONTAINER);
    const v = String(value ?? '');
    out.push({
      q: describe(box && box !== doc.body ? box : el.parentElement, el),
      a: v.length > 3000 ? `${v.slice(0, 3000)}…` : v,
      ok: correctness(el, box),
    });
  };
  doc.querySelectorAll('select').forEach((s) => {
    if (s.closest('[hidden]') || s.multiple) return;
    push(s, s.value === '' ? '' : clean(s.selectedOptions[0] ? s.selectedOptions[0].textContent : s.value));
  });
  const radiosDone = new Set();
  doc.querySelectorAll('input').forEach((i) => {
    const type = (i.type || 'text').toLowerCase();
    if (['text', 'search', 'email', 'number', ''].includes(type)) {
      if (/name/i.test(i.id + i.name) && !i.closest(CONTAINER)) return; // student name field
      push(i, i.value);
    } else if (type === 'radio' && i.name && !radiosDone.has(i.name)) {
      radiosDone.add(i.name);
      const checked = doc.querySelector(`input[type=radio][name="${CSS.escape(i.name)}"]:checked`);
      const label = checked ? clean((checked.closest('label') || checked.parentElement).textContent) : '';
      push(i, label);
    }
  });
  doc.querySelectorAll('textarea, [contenteditable="true"]').forEach((t) => push(t, t.value !== undefined ? t.value : t.textContent));
  // Drag-and-drop targets: elements called slot / drop that do not contain other targets.
  doc.querySelectorAll('.slot, .drop, [class*="slot"], [class*="dropzone"], [class*="drop-zone"]').forEach((d) => {
    if (d.querySelector('.slot, .drop, select, input, textarea')) return;
    if (/bank|pool|chips|words/i.test(`${d.id} ${classOf(d)}`)) return;
    let v = clean(d.textContent.replace(/×/g, ''));
    if (PLACEHOLDER.test(v)) v = '';
    push(d, v);
  });
  return out;
}

export function createTracker(iframe, { onChange = () => {}, studentName = '' } = {}) {
  const state = {
    score: null, max: null, firstScore: null, firstMax: null,
    revealed: false, interacted: false, seconds: 0, answers: [], explicit: false,
    lastActive: Date.now(), sameOrigin: false,
    frozen: null,     // answers as they were just before the answer key was opened
    baseline: '',     // score text the page showed before the student did anything
  };
  let doc = null;
  let observer = null;
  let scanTimer = null;
  let checkAllAt = 0;
  const cleanups = [];

  const emit = (reason) => { try { onChange(reason, snapshot()); } catch (e) { console.error(e); } };

  // final: true when the student finishes. Then a score the page shows is used
  // even if it never changed (for example the student got everything wrong).
  function snapshot({ final = false } = {}) {
    if (state.frozen) state.answers = state.frozen;
    else if (doc && state.sameOrigin && !state.explicitAnswers) {
      try { state.answers = collectAnswers(doc); } catch (e) { /* page changed */ }
    }
    if (final && state.score === null && state.interacted && doc && state.sameOrigin && !state.explicit) {
      try { const s = findScore(doc); if (s) { state.score = s.score; state.max = s.max; } } catch (e) { /* ignore */ }
    }
    return {
      score: state.score, max: state.max, firstScore: state.firstScore, firstMax: state.firstMax,
      revealed: state.revealed, interacted: state.interacted, seconds: state.seconds,
      answers: state.answers, sameOrigin: state.sameOrigin, explicit: state.explicit,
    };
  }

  function setScore(s, source) {
    if (!s) return;
    if (state.score === s.score && state.max === s.max) return;
    state.score = s.score;
    state.max = s.max;
    if (state.firstScore === null && (source === 'explicit' || Date.now() - checkAllAt < 2500)) {
      state.firstScore = s.score;
      state.firstMax = s.max;
    }
    emit('score');
  }

  const keyOf = (s) => (s ? `${s.score}/${s.max}` : '');

  function scan() {
    if (!doc || !state.interacted || state.explicit) return;
    try {
      const s = findScore(doc);
      // A counter that was already on the page before any work ("0 / 15 correct") is not a result yet.
      if (s && state.baseline && keyOf(s) === state.baseline && Date.now() - checkAllAt > 2500) return;
      if (s) state.baseline = '';
      setScore(s, 'auto');
    } catch (e) { /* ignore */ }
  }

  const scheduleScan = (ms = 350) => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, ms); };

  function markActive() {
    state.lastActive = Date.now();
    if (!state.interacted) { state.interacted = true; emit('start'); }
  }

  // time spent: counts while the page is visible and the student was active in the last 3 minutes
  const tick = setInterval(() => {
    if (document.visibilityState === 'visible' && state.interacted && Date.now() - state.lastActive < 180000) state.seconds += 1;
  }, 1000);
  cleanups.push(() => clearInterval(tick));

  function onMessage(ev) {
    if (ev.source !== iframe.contentWindow || !ev.data || ev.data.source !== 'english-studio') return;
    const d = ev.data;
    markActive();
    if (d.type === 'result' && Number.isFinite(+d.score) && Number.isFinite(+d.total) && +d.total > 0) {
      state.explicit = true;
      if (Array.isArray(d.answers)) {
        state.explicitAnswers = true;
        state.answers = d.answers.slice(0, 150).map((x) => ({ q: clean(x.q ?? x.question ?? ''), a: String(x.a ?? x.answer ?? ''), ok: typeof x.ok === 'boolean' ? x.ok : (typeof x.correct === 'boolean' ? x.correct : null) }));
      }
      setScore({ score: Math.max(0, Math.min(+d.score, +d.total)), max: +d.total }, 'explicit');
    } else if (d.type === 'revealed') {
      if (!state.revealed && doc && !state.frozen && !state.explicitAnswers) { try { state.frozen = collectAnswers(doc); } catch (e) { /* ignore */ } }
      state.revealed = true;
      emit('revealed');
    } else if (d.type === 'activity') {
      emit('answers');
    }
  }
  window.addEventListener('message', onMessage);
  cleanups.push(() => window.removeEventListener('message', onMessage));

  function attach() {
    observer?.disconnect();
    doc = null;
    state.sameOrigin = false;
    try { doc = iframe.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) return;
    state.sameOrigin = true;
    const win = iframe.contentWindow;
    try { state.baseline = keyOf(findScore(doc)); } catch (e) { state.baseline = ''; }

    // Exercises can also call reportResult(score, total) directly.
    try {
      if (typeof win.reportResult !== 'function') {
        win.reportResult = (score, total, answers) => onMessage({ source: win, data: { source: 'english-studio', type: 'result', score, total, answers } });
      }
      if (typeof win.reportAnswerKeyShown !== 'function') {
        win.reportAnswerKeyShown = () => onMessage({ source: win, data: { source: 'english-studio', type: 'revealed' } });
      }
    } catch (e) { /* ignore */ }

    // Fill in a "Your name" box if the exercise has one.
    if (studentName) {
      doc.querySelectorAll('#studentName, input[name="studentName"], input[name="name"], input[autocomplete="name"]').forEach((i) => {
        if (!i.value) { i.value = studentName; i.dispatchEvent(new Event('input', { bubbles: true })); }
      });
    }

    const onClick = (e) => {
      // Following a link to another page (for example "Next exercise") is not work on this exercise.
      const link = e.target.closest && e.target.closest('a[href]');
      const href = link ? link.getAttribute('href').trim() : '';
      if (href && !href.startsWith('#') && !/^javascript:/i.test(href)) return;
      markActive();
      const b = e.target.closest && e.target.closest('button, [role="button"], a, input[type="button"], input[type="submit"]');
      if (!b) { scheduleScan(); return; }
      const label = clean(b.textContent || b.value || b.getAttribute('aria-label') || '');
      if (REVEAL.test(label)) {
        // This runs before the exercise fills in the key, so we keep the student's own answers.
        if (!state.frozen) { try { state.frozen = collectAnswers(doc); } catch (e) { /* ignore */ } }
        state.revealed = true;
        emit('revealed');
      }
      if (CHECK_ALL.test(label) && !ROW_CHECK.test(label)) checkAllAt = Date.now();
      scheduleScan(250);
    };
    const onInput = () => { markActive(); emit('answers'); };
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('change', onInput, true);
    doc.addEventListener('input', onInput, true);
    doc.addEventListener('keydown', markActive, true);
    doc.addEventListener('drop', () => { markActive(); scheduleScan(); emit('answers'); }, true);

    observer = new MutationObserver(() => { if (state.interacted) scheduleScan(); });
    observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  iframe.addEventListener('load', attach);
  cleanups.push(() => iframe.removeEventListener('load', attach));
  if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete' && iframe.contentDocument.body?.childElementCount) attach();

  return {
    snapshot,
    // Same as snapshot() but without reading the answers (cheap, for the live timer).
    peek: () => ({ score: state.score, max: state.max, revealed: state.revealed, interacted: state.interacted, seconds: state.seconds }),
    get sameOrigin() { return state.sameOrigin; },
    destroy() {
      observer?.disconnect();
      clearTimeout(scanTimer);
      cleanups.forEach((f) => f());
    },
  };
}

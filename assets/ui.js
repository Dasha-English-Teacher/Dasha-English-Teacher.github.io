// Small UI helpers: safe HTML templates, dialogs, toasts, dates.

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const raw = (s) => new Safe(String(s ?? ''));

function piece(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(piece).join('');
  return esc(v);
}

// html`<p>${userText}</p>` escapes userText; nested html`` and raw() pass through.
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += piece(vals[i]);
  });
  return new Safe(out);
}

export const nl2br = (text) => raw(esc(text).replace(/\n/g, '<br>'));

// ---------- icons (simple inline SVG, stroke = currentColor) ----------
const ICONS = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  pen: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="M14 7l3 3"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  words: '<path d="M4 6h10M4 12h7M4 18h10"/><path d="M15 18l3.5-9 3.5 9M16.2 15h4.6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 4.8l3.7-1 4 15.4-3.7 1z" transform="translate(-2 .5)"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`);
}

// ---------- event wiring ----------
// Views describe actions declaratively: data-on="name" (click) and data-submit="name" (forms).
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

export function wire(root, view) {
  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-on]');
    if (!el || !root.contains(el)) return;
    const fn = view.on && view.on[el.dataset.on];
    if (!fn) return;
    ev.preventDefault();
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    try { await fn(el, ev); } catch (err) { showError(err); } finally { delete el.dataset.busy; }
  });
  root.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('form[data-submit]');
    if (!form) return;
    ev.preventDefault();
    const fn = view.submit && view.submit[form.dataset.submit];
    if (!fn) return;
    const btns = form.querySelectorAll('button[type=submit]');
    btns.forEach((b) => (b.disabled = true));
    try { await fn(formData(form), form); } catch (err) { showError(err); } finally { btns.forEach((b) => (b.disabled = false)); }
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const fn = view.change && view.change[el.dataset.change];
    if (fn) Promise.resolve(fn(el, ev)).catch(showError);
  });
  root.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-input]');
    if (!el) return;
    const fn = view.input && view.input[el.dataset.input];
    if (fn) Promise.resolve(fn(el, ev)).catch(showError);
  });
}

// ---------- toasts ----------
let toastBox;
export function toast(message, kind = 'ok') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    document.body.append(toastBox);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = message;
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function errorText(err) {
  if (!err) return 'Something went wrong.';
  const m = err.message || err.error_description || String(err);
  if (/Invalid login credentials/i.test(m)) return 'The email or password is not correct.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection to the server. Check your internet and try again.';
  if (/User already registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/Password should be at least/i.test(m)) return 'The password needs at least 6 characters.';
  if (/row-level security|permission denied/i.test(m)) return 'You do not have access to this.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first: open the link we sent you.';
  return m;
}

export function showError(err) {
  console.error(err);
  toast(errorText(err), 'error');
}

// ---------- dialogs ----------
let modalStack = [];

export function openModal({ title, body, on = {}, submit = {}, change = {}, input = {}, wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${esc(title || '')}</h2>
      <button class="icon-btn" data-on="close" aria-label="Close">${icon('close')}</button></div>
      <div class="modal-body">${piece(body)}</div></div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.add('out');
    document.removeEventListener('keydown', onKey);
    modalStack = modalStack.filter((m) => m !== api);
    setTimeout(() => wrap.remove(), 160);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack[modalStack.length - 1] === api) close();
  };
  const api = { el: wrap, close, setBody(b) { wrap.querySelector('.modal-body').innerHTML = piece(b); } };
  wire(wrap, { on: { close: () => close(), ...on }, submit, change, input });
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  modalStack.push(api);
  requestAnimationFrame(() => {
    const f = wrap.querySelector('[autofocus], input:not([type=hidden]), textarea, select, button.btn-primary');
    (f || wrap.querySelector('.modal')).focus?.();
  });
  return api;
}

// Close every open dialog (used when the page changes).
export function closeAllModals() {
  [...modalStack].reverse().forEach((m) => m.close());
}

// await ask('Delete this lesson?', { ok: 'Delete lesson', danger: true })
export function ask(question, { ok = 'OK', cancel = 'Cancel', danger = false, detail = '' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title: question,
      body: html`${detail ? html`<p class="muted">${detail}</p>` : ''}
        <div class="row-end"><button class="btn" data-on="no">${cancel}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-on="yes">${ok}</button></div>`,
      on: {
        yes: () => { answered = true; m.close(); resolve(true); },
        no: () => { answered = true; m.close(); resolve(false); },
      },
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Select the text and copy it with Ctrl+C', 'error');
  }
}

// ---------- dates ----------
let hour12 = true;
export function setTimeFormat(fmt) { hour12 = fmt !== '24h'; }

const fmt = (opts) => new Intl.DateTimeFormat('en', opts);
export const fmtDate = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
export const fmtDateLong = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
export const fmtTime = (d) => fmt({ hour: 'numeric', minute: '2-digit', hour12 }).format(new Date(d));
export const fmtDateTime = (d) => `${fmtDate(d)}, ${fmtTime(d)}`;
export const fmtDay = (d) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

export function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return fmtDay(d);
}

export function duration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return `${sec} s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function startOfWeek(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// value for <input type=date> / <input type=time> in local time
export const dateInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const timeInput = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function pct(a, b) { return b ? Math.round((100 * a) / b) : 0; }

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many || one + 's'}`; }

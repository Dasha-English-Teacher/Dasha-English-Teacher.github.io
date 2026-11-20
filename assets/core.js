// Shared state and helpers used by all pages.
import { toast } from './ui.js';
import { DEMO_EXERCISES, prettyName } from './api.js';

export const S = {
  api: null,      // data layer (live or demo)
  me: null,       // signed-in profile
  settings: {},   // website settings
  cfg: {},        // config.js
  counts: { reviews: 0, requests: 0 },
};

let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
export function refresh() { return rerender(); }
export function go(hash) {
  if (location.hash === `#${hash}`) rerender();
  else location.hash = hash;
}

export const isTeacher = () => S.me?.role === 'teacher';
export const teacherName = () => S.settings.teacher_name || 'your teacher';
export const siteUrl = () => location.origin + location.pathname;

// ---------- progress ----------
// attempts: newest first. Returns Map(material_id -> { done, last, completed, attempts })
export function progressIndex(attempts) {
  const map = new Map();
  for (const a of attempts || []) {
    if (!a.material_id) continue;
    const m = map.get(a.material_id) || { done: false, last: null, completed: null, attempts: [] };
    m.attempts.push(a);
    if (!m.last) m.last = a;
    if (a.status === 'completed') { m.done = true; if (!m.completed) m.completed = a; }
    map.set(a.material_id, m);
  }
  return map;
}

// A lesson is done when all its exercises are done. Lessons without exercises
// (only links, videos, notes) are done when every item is marked as done.
export function lessonDone(lesson, idx) {
  const ex = lesson.materials.filter((m) => m.kind === 'exercise');
  const need = ex.length ? ex : lesson.materials;
  return need.length > 0 && need.every((m) => idx.get(m.id)?.done);
}

export function courseStats(course, idx) {
  const total = course.lessons.length;
  const done = course.lessons.filter((l) => lessonDone(l, idx)).length;
  return { total, done };
}

export function findMaterial(tree, materialId) {
  for (const course of tree) {
    for (const lesson of course.lessons) {
      const i = lesson.materials.findIndex((m) => m.id === materialId);
      if (i >= 0) return { course, lesson, material: lesson.materials[i], index: i };
    }
  }
  return null;
}

export function findLesson(tree, lessonId) {
  for (const course of tree) {
    const i = course.lessons.findIndex((l) => l.id === lessonId);
    if (i >= 0) return { course, lesson: course.lessons[i], index: i };
  }
  return null;
}

export function scoreText(a) {
  if (!a || a.score == null || !a.max_score) return '';
  return `${a.score} / ${a.max_score}`;
}

export function scoreClass(a) {
  if (!a || a.score == null || !a.max_score) return '';
  const p = a.score / a.max_score;
  return p >= 0.85 ? 'good' : p >= 0.6 ? 'fair' : 'low';
}

// ---------- notifications to the teacher (FormSubmit, free, no account) ----------
export async function notifyTeacher(subject, fields) {
  const to = (S.settings.notify_email || '').trim();
  if (!to) return false;
  if (S.api.mode === 'demo') return false;
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...fields }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- calendar ----------
const gcalStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function gcalUrl({ title, start, minutes = 60, details = '', where = '', guests = '', weeks = 1 }) {
  const end = new Date(new Date(start).getTime() + minutes * 60000);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${gcalStamp(start)}/${gcalStamp(end)}` });
  if (details) p.set('details', details);
  if (where) p.set('location', where);
  if (guests) p.set('add', guests);
  if (weeks > 1) p.set('recur', `RRULE:FREQ=WEEKLY;COUNT=${weeks}`);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function icsText(sessions, calName) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//English studio//EN', `X-WR-CALNAME:${calName}`];
  for (const s of sessions) {
    const end = new Date(new Date(s.starts_at).getTime() + (s.minutes || 60) * 60000);
    lines.push(
      'BEGIN:VEVENT', `UID:${s.id}@english-studio`, `DTSTAMP:${gcalStamp(new Date())}`,
      `DTSTART:${gcalStamp(s.starts_at)}`, `DTEND:${gcalStamp(end)}`,
      `SUMMARY:${(s.title || 'English lesson').replace(/[,;]/g, ' ')}`,
      `DESCRIPTION:${[s.note, s.meeting_url].filter(Boolean).join('\\n').replace(/[,;]/g, ' ')}`,
      s.meeting_url ? `URL:${s.meeting_url}` : '',
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Lesson in 30 minutes', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function downloadText(filename, text, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- videos ----------
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : '';
}

// ---------- exercise library (HTML files in her GitHub repositories) ----------
function pagesUrl(owner, repo, path) {
  const host = `${owner.toLowerCase()}.github.io`;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return repo.toLowerCase() === host ? `https://${host}/${encoded}` : `https://${host}/${repo}/${encoded}`;
}

async function listRepo(spec) {
  const [owner, repo, ...rest] = spec.trim().split('/');
  if (!owner || !repo) return [];
  const folder = rest.join('/').replace(/\/$/, '');
  const info = await fetch(`https://api.github.com/repos/${owner}/${repo}`).then((r) => {
    if (!r.ok) throw new Error(`GitHub: cannot read ${owner}/${repo} (${r.status})`);
    return r.json();
  });
  const tree = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`).then((r) => {
    if (!r.ok) throw new Error(`GitHub: cannot list files in ${owner}/${repo} (${r.status})`);
    return r.json();
  });
  return (tree.tree || [])
    .filter((f) => f.type === 'blob' && /\.html?$/i.test(f.path))
    .filter((f) => !folder || f.path.startsWith(`${folder}/`))
    .filter((f) => !/(^|\/)index\.html?$/i.test(f.path) && !/^(assets|exercise-kit|supabase)\//.test(f.path) && !f.path.startsWith('.'))
    .map((f) => ({
      title: prettyName(f.path.split('/').pop()),
      file: f.path,
      repo: `${owner}/${repo}`,
      url: pagesUrl(owner, repo, f.path),
      source: `https://github.com/${owner}/${repo}/blob/${info.default_branch}/${f.path}`,
    }));
}

export async function loadLibrary(force = false) {
  const key = 'english-studio-library';
  const specs = String(S.settings.exercise_repos || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (!force) {
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && c.specs === specs.join(',') && Date.now() - c.at < 10 * 60000) return { items: c.items, error: '' };
    } catch { /* ignore */ }
  }
  let items = [];
  let error = '';
  for (const spec of specs) {
    try { items = items.concat(await listRepo(spec)); } catch (e) { error = e.message || String(e); }
  }
  if (!items.length && S.api.mode === 'demo') {
    // Demo fallback when GitHub cannot be reached.
    const base = S.cfg.demoExerciseBase || 'https://dasha-english-teacher.github.io/miro-exercises/';
    const files = Array.isArray(S.cfg.demoExercises) ? S.cfg.demoExercises : DEMO_EXERCISES;
    items = files.map((f) => ({ title: prettyName(f), file: f, repo: 'Dasha-English-Teacher/miro-exercises', url: base + f, source: '' }));
    error = '';
  }
  try { sessionStorage.setItem(key, JSON.stringify({ specs: specs.join(','), at: Date.now(), items })); } catch { /* ignore */ }
  return { items, error };
}

export async function withToast(promise, message) {
  const r = await promise;
  if (message) toast(message);
  return r;
}

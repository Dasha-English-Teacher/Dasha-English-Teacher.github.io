// Main file: starts the app, decides which page to show, draws the menu.
import { html, icon, wire, toast, openModal, closeAllModals, showError, setTimeFormat, initials, esc } from './ui.js';
import { createApi } from './api.js';
import { S, setRerender, go, refresh, isTeacher, loadNav, invalidateNav, trackTreeChanges, money, priceOf, balanceLevel, needsReview } from './core.js';
import * as pub from './views-public.js';
import * as stu from './views-student.js';
import * as tea from './views-teacher.js';
import * as bill from './views-billing.js';
import * as room from './lesson-room.js';

const ROUTES = {
  public: { home: pub.homeView, book: pub.bookView, pay: bill.payView, login: pub.loginView, signup: pub.signupView, join: pub.joinView },
  waiting: { home: pub.homeView, book: pub.bookView, pay: bill.payView, account: pub.waitingView },
  student: {
    programs: stu.programsView, program: stu.programView, lesson: room.lessonRoom, play: room.playRoom, finish: room.finishRoom,
    schedule: stu.scheduleView, words: stu.wordsView, results: stu.resultsView, result: stu.resultView,
    'my-profile': stu.profileView, pay: bill.payView, book: pub.bookView, home: pub.homeView,
  },
  teacher: {
    today: tea.todayView, students: tea.studentsView, student: tea.studentView, payments: bill.paymentsView,
    programs: tea.programEditorView, 'edit-program': tea.editProgramView, library: tea.libraryView,
    reviews: tea.reviewsView, review: tea.reviewView, calendar: tea.calendarView, requests: tea.requestsView,
    'site-setup': tea.siteSetupView, 'my-profile': stu.profileView,
    'preview-lesson': room.storyPreviewRoom, 'preview-play': room.storyPreviewRoom, 'preview-finish': room.storyPreviewRoom,
    program: stu.programView, lesson: room.lessonRoom, play: room.playRoom, finish: room.finishRoom, book: pub.bookView, pay: bill.payView, home: pub.homeView,
  },
};
// Old addresses (before "classes" were renamed "programs") keep working.
const ALIASES = { classes: 'programs', class: 'program', 'class-editor': 'programs', 'edit-class': 'edit-program' };
const DEFAULT = { public: 'home', waiting: 'account', student: 'programs', teacher: 'today' };
const KNOWN = [...new Set([...Object.values(ROUTES).flatMap((r) => Object.keys(r)), ...Object.keys(ALIASES)])].sort((a, b) => b.length - a.length);

const NAV = {
  student: [
    ['programs', 'My programs', 'book', ['program', 'lesson', 'play', 'finish']],
    ['schedule', 'Schedule', 'calendar'],
    ['results', 'Results', 'star', ['result']],
    ['words', 'My words', 'words'],
    ['my-profile', 'Profile and balance', 'user', ['pay']],
  ],
  teacher: [
    ['today', 'Today', 'home'],
    ['students', 'Students', 'users', ['student']],
    ['programs', 'Programs', 'book', ['edit-program', 'program', 'lesson', 'play', 'finish']],
    ['reviews', 'Results', 'check', ['review']],
    ['payments', 'Payments', 'wallet'],
    ['calendar', 'Calendar', 'calendar'],
    ['requests', 'Requests', 'inbox'],
    ['library', 'Exercise library', 'library'],
    ['site-setup', 'Website', 'gear'],
    ['my-profile', 'Profile', 'user'],
  ],
};
const MOBILE_MAIN = { student: 5, teacher: 5 };
const SHORT = { 'my-profile': 'Profile' }; // labels in the narrow bottom bar
const FULL_PAGE = new Set([room.lessonRoom, room.playRoom, room.finishRoom, room.storyPreviewRoom]); // lesson pages use the whole screen

function parse(hash) {
  const h = decodeURIComponent(String(hash || '').replace(/^#\/?/, ''));
  if (!h) return { name: '', id: '' };
  for (const n of KNOWN) {
    if (h === n) return { name: ALIASES[n] || n, id: '' };
    if (h.startsWith(`${n}-`)) return { name: ALIASES[n] || n, id: h.slice(n.length + 1) };
  }
  return { name: h, id: '' };
}

function roleNow() {
  if (!S.me) return 'public';
  if (S.me.role === 'teacher') return 'teacher';
  return S.me.status === 'active' ? 'student' : 'waiting';
}

// ---------------------------------------------------------------------
const app = document.getElementById('app');
let current = null;
let renderToken = 0;
let displayedHash = '';

async function render(navigated = false) {
  const token = ++renderToken;
  if (/access_token=|error_description=|type=recovery/.test(location.hash)) return; // sign-in link: Supabase handles it first
  if (current?.beforeLeave && await current.beforeLeave() === false) {
    if (token === renderToken) history.replaceState(null, '', displayedHash || location.pathname);
    return;
  }
  if (token !== renderToken) return;
  const role = roleNow();
  let { name, id } = parse(location.hash);
  const routes = ROUTES[role];
  if (!routes[name]) {
    name = DEFAULT[role];
    id = '';
    if (location.hash && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  } else {
    // Rewrite an old address (#class-…) to the new one (#program-…).
    const want = `#${name}${id ? `-${id}` : ''}`;
    if (location.hash && decodeURIComponent(location.hash) !== want && /^#\/?(classes|class-|class-editor|edit-class)/.test(location.hash)) history.replaceState(null, '', want);
  }

  if (navigated) closeAllModals(); // a refresh of the same page keeps open dialogs
  try { current?.unmount?.(); } catch (e) { console.error(e); }
  current = null;

  if (role === 'student' || role === 'teacher') {
    try { await loadNav(); } catch { /* the menu works without it */ }
    if (token !== renderToken) return;
  }
  const shell = paintShell(role, name, FULL_PAGE.has(routes[name]));
  const main = shell.querySelector('#main');
  main.innerHTML = '<div class="loading" aria-live="polite">Loading…</div>';

  let view;
  try {
    view = await routes[name]({ id, name });
  } catch (err) {
    if (token !== renderToken) return;
    showError(err);
    main.innerHTML = html`<div class="empty"><h1>This page could not load</h1><p>${(err && err.message) || ''}</p><p><button class="btn" data-retry>Try again</button></p></div>`.toString();
    main.querySelector('[data-retry]').addEventListener('click', () => location.reload());
    return;
  }
  if (token !== renderToken) { try { view.unmount?.(); } catch { /* ignore */ } return; }

  const fresh = main.cloneNode(false);
  main.replaceWith(fresh);
  fresh.innerHTML = view.html.toString();
  wire(fresh, view);
  current = view;
  document.title = view.title && view.title !== S.settings.site_name ? `${view.title}, ${S.settings.site_name}` : S.settings.site_name;
  if (!shell.dataset.keepScroll) window.scrollTo(0, 0);
  try { view.mount?.(fresh); } catch (e) { console.error(e); }
  displayedHash = location.hash;
  const h1 = fresh.querySelector('h1');
  if (h1 && document.activeElement === document.body) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  if (role === 'teacher') updateBadges();
}

function navLink([key, label, ic, also = []], name, cls = 'nav-link') {
  const on = key === name || also.includes(name);
  const badge = key === 'reviews' ? S.counts.reviews : key === 'requests' ? S.counts.requests : 0;
  const text = cls === 'tab' && SHORT[key] ? SHORT[key] : label;
  return html`<a class="${cls} ${on ? 'is-on' : ''}" href="#${key}" ${on ? 'aria-current="page"' : ''}>${icon(ic)}<span>${text}</span>${badge ? html`<span class="badge" data-badge="${key}">${badge}</span>` : html`<span class="badge" data-badge="${key}" hidden></span>`}</a>`;
}

function sideBalance() {
  const b = S.nav && S.nav.balance;
  if (!b) return '';
  const price = priceOf(S.me);
  if (!b.any && !(price > 0)) return '';
  return html`<a class="side-balance bal-${balanceLevel(b.balance, price)}" href="#my-profile" title="Your balance">${icon('wallet')}<span>${money(b.balance)}</span></a>`;
}

function paintShell(role, name, full) {
  const st = S.settings;
  app.className = '';
  if (full) {
    app.innerHTML = '<main id="main" class="main-full"></main>';
    app.className = 'layout-full';
    return app;
  }
  if (role === 'public' || role === 'waiting') {
    app.innerHTML = html`
      <header class="pub-head"><a class="brand" href="#home">${st.site_name}</a>
        <nav class="pub-nav" aria-label="Main">${role === 'public'
          ? html`<a href="#book" class="${name === 'book' ? 'is-on' : ''}">Book a lesson</a>${st.kaspi_url ? html`<a href="#pay" class="${name === 'pay' ? 'is-on' : ''}">Pay</a>` : ''}<a class="btn btn-sm" href="#login">Sign in</a>`
          : html`<a href="#account">My account</a>`}</nav></header>
      <main id="main" class="pub-main" tabindex="-1"></main>
      <footer class="pub-foot"><span>${st.site_name}</span>${st.contact_text ? html`<span>${st.contact_text}</span>` : ''}</footer>
      ${demoBar()}`.toString();
    app.className = 'layout-public';
    wireDemoBar();
    return app;
  }
  const items = NAV[role];
  const main = items.slice(0, MOBILE_MAIN[role]);
  const extra = items.slice(MOBILE_MAIN[role]);
  app.innerHTML = html`
    <button class="skip" data-skip>Skip to content</button>
    <aside class="side" aria-label="Menu">
      <a class="brand" href="#${DEFAULT[role]}">${st.site_name}</a>
      <nav class="side-nav">${items.map((it) => navLink(it, name))}</nav>
      <div class="side-me"><span class="avatar" aria-hidden="true">${initials(S.me.full_name || S.me.email)}</span>
        <div><strong>${S.me.full_name || 'Me'}</strong><span class="muted small">${role === 'teacher' ? 'Teacher' : S.me.level || 'Student'}</span></div>
        ${role === 'student' ? sideBalance() : ''}</div>
    </aside>
    <main id="main" class="app-main" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Menu">${main.map((it) => navLink(it, name, 'tab'))}
      ${extra.length ? html`<button class="tab ${extra.some(([k, , , also = []]) => k === name || also.includes(name)) ? 'is-on' : ''}" data-more>${icon('more')}<span>More</span>${S.counts.requests ? html`<span class="badge">${S.counts.requests}</span>` : ''}</button>` : ''}</nav>
    ${demoBar()}`.toString();
  app.className = `layout-app role-${role}`;
  app.querySelector('[data-skip]').addEventListener('click', () => app.querySelector('#main').focus());
  const more = app.querySelector('[data-more]');
  if (more) {
    more.addEventListener('click', () => {
      const m = openModal({ title: 'More', body: html`<nav class="more-nav">${extra.map((it) => navLink(it, name))}</nav>` });
      m.el.addEventListener('click', (e) => { if (e.target.closest('a')) m.close(); });
    });
  }
  wireDemoBar();
  return app;
}

async function updateBadges() {
  try {
    const [attempts, requests, profiles] = await Promise.all([S.api.listAttempts({ limit: 500 }), S.api.listRequests(), S.api.listProfiles()]);
    S.counts.reviews = attempts.filter(needsReview).length;
    S.counts.requests = requests.filter((r) => r.status === 'new').length + profiles.filter((p) => p.status === 'pending').length;
    for (const [key, n] of [['reviews', S.counts.reviews], ['requests', S.counts.requests]]) {
      document.querySelectorAll(`[data-badge="${key}"]`).forEach((b) => { b.hidden = !n; b.textContent = n || ''; });
    }
  } catch { /* badges are optional */ }
}

// ---------------------------------------------------------------------
// Demo mode bar: switch between example people
function demoBar() {
  if (S.api.mode !== 'demo') return '';
  const users = S.api.demoUsers();
  return html`<div class="demo-bar" role="region" aria-label="Demo mode">
    <strong>Demo</strong><span class="hide-sm">Data stays in this browser.</span>
    <label class="demo-as">View as <select data-demo-as>
      <option value="">Visitor</option>
      ${users.map((u) => html`<option value="${u.id}" ${S.me?.id === u.id ? 'selected' : ''}>${u.full_name}${u.role === 'teacher' ? ' (teacher)' : u.status === 'pending' ? ' (waiting)' : ''}</option>`)}
    </select></label>
    <button class="link-btn" data-demo-reset>Reset</button></div>`;
}

function wireDemoBar() {
  const sel = app.querySelector('[data-demo-as]');
  if (sel && !sel.dataset.wired) {
    sel.dataset.wired = '1';
    sel.addEventListener('change', async () => {
      if (sel.value) S.api.demoSwitch(sel.value); else await S.api.signOut();
    });
  }
  const reset = app.querySelector('[data-demo-reset]');
  if (reset && !reset.dataset.wired) {
    reset.dataset.wired = '1';
    reset.addEventListener('click', () => { S.api.demoReset(); toast('Demo data reset'); });
  }
}

// ---------------------------------------------------------------------
async function reloadMe() {
  const before = S.me?.id;
  S.me = await S.api.session();
  if (S.me?.id !== before) invalidateNav();
  syncTimezone();
}

// Remember each person's time zone, so reminder emails show their local time.
function syncTimezone() {
  if (!S.me || S.me.timezone === undefined) return;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (!tz || S.me.timezone === tz) return;
  S.api.updateProfile(S.me.id, { timezone: tz }).then((row) => { if (row && S.me) S.me.timezone = row.timezone; }).catch(() => {});
}

function newPasswordDialog() {
  const m = openModal({
    title: 'Choose a new password',
    body: html`<form class="form" data-submit="save"><label>New password<input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
      <div class="row-end"><button class="btn btn-primary" type="submit">Save password</button></div></form>`,
    submit: { async save(d) { await S.api.setPassword(d.password); m.close(); toast('Password saved. You are signed in.'); } },
  });
}

async function boot() {
  S.cfg = window.SITE_CONFIG || {};
  try {
    S.api = trackTreeChanges(await createApi(S.cfg));
  } catch (err) {
    console.error(err);
    app.innerHTML = html`<div class="empty"><h1>The website could not start</h1><p>It could not reach the database library. Check your internet connection and reload the page.</p></div>`.toString();
    return;
  }
  // Show an error that came back from an email link (for example an expired link).
  const hp = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hp.get('error_description')) {
    toast(hp.get('error_description').replace(/\+/g, ' '), 'error');
    history.replaceState(null, '', location.pathname);
  }
  try { S.settings = await S.api.getSettings(); } catch (e) { console.error(e); S.settings = {}; }
  setTimeFormat(S.settings.time_format);
  try { await reloadMe(); } catch (e) { console.error(e); S.me = null; }

  setRerender(() => render(false));
  S.api.onAuth((event) => {
    // Run outside the auth callback (Supabase recommends not awaiting inside it).
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') {
        history.replaceState(null, '', location.pathname);
        await reloadMe();
        render();
        newPasswordDialog();
        return;
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        const before = S.me?.id;
        await reloadMe().catch(() => { S.me = null; });
        if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname);
        if (event === 'SIGNED_OUT' || before !== S.me?.id) {
          const { name } = parse(location.hash);
          if (!ROUTES[roleNow()][name] || ['login', 'signup', 'join', 'account'].includes(name)) history.replaceState(null, '', `#${DEFAULT[roleNow()]}`);
          render();
        }
      }
    }, 0);
  });
  window.addEventListener('hashchange', () => render(true));
  render();
}

boot();

export { go, refresh, isTeacher, esc };

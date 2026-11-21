// Pages for visitors who are not signed in, plus "waiting for approval".
import { html, raw, icon, toast, openModal, nl2br, esc } from './ui.js';
import { S, go, refresh, notifyTeacher, teacherName } from './core.js';

const LEVELS = ['Not sure', 'A1 Beginner', 'A2 Elementary', 'B1 Intermediate', 'B2 Upper-intermediate', 'C1 Advanced', 'C2 Proficiency'];

export function homeView() {
  const st = S.settings;
  return {
    title: st.site_name,
    html: html`
      <section class="hero">
        <div class="hero-text">
          <h1 class="hero-title">${st.site_name}</h1>
          <p class="hero-tagline">${st.tagline}</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#book">Book a lesson</a>
            <a class="btn btn-lg" href="#login">Student sign in</a>
          </div>
        </div>
        <aside class="hero-note" aria-label="A note from the teacher">
          <p class="hand">Hi, I'm ${st.teacher_name}!</p>
          <p>${nl2br(st.about)}</p>
        </aside>
      </section>
      <section class="how">
        <h2>How lessons work</h2>
        <div class="how-grid">
          <div class="how-item">${icon('video')}<h3>Lessons on a video call</h3><p>We meet online at a time that suits you. You get a calendar invitation with the link, and a reminder before each lesson.</p></div>
          <div class="how-item">${icon('pen')}<h3>Exercises between lessons</h3><p>Each lesson comes with interactive exercises: drag words, choose answers, write sentences. You see your score straight away.</p></div>
          <div class="how-item">${icon('check')}<h3>Feedback on your work</h3><p>Your results reach me automatically. I leave comments you can read in your account, next to your answers.</p></div>
        </div>
      </section>`,
  };
}

export function bookView() {
  const st = S.settings;
  let sent = false;
  const view = {
    title: 'Book a lesson',
    html: html`
      <div class="page-head"><h1>Book a lesson</h1>
        <p class="lede">${st.booking_url ? 'Choose a free time below. You will get a confirmation email with the details.' : `Tell ${teacherName()} what you need and when you are free. You will get a reply by email.`}</p></div>
      ${st.booking_url ? html`
        <div class="booking-frame"><iframe src="${st.booking_url}" title="Booking calendar" loading="lazy"></iframe></div>
        <p class="muted small">The calendar does not load? <a href="${st.booking_url}" target="_blank" rel="noopener">Open the booking page in a new tab</a>.</p>
        <h2 class="section-title">Prefer to write first?</h2>` : ''}
      <div id="request-box">${requestForm()}</div>`,
    submit: {
      async request(d, form) {
        if (sent) return;
        if (!d.name.trim() || !/^\S+@\S+\.\S+$/.test(d.email.trim())) { toast('Please enter your name and a valid email.', 'error'); return; }
        const row = { name: d.name.trim(), email: d.email.trim(), contact: d.contact.trim(), level: d.level, preferred_times: d.preferred_times.trim(), message: d.message.trim() };
        await S.api.createRequest(row);
        sent = true;
        if (S.settings.notify_on_request !== false) {
          notifyTeacher(`New lesson request from ${row.name}`, { Name: row.name, Email: row.email, Contact: row.contact, Level: row.level, 'Preferred times': row.preferred_times, Message: row.message });
        }
        form.closest('#request-box').innerHTML = html`<div class="notice notice-ok"><h3>Request sent</h3>
          <p>Thank you, ${row.name}. ${teacherName()} will reply to ${row.email} soon.</p></div>`.toString();
      },
    },
  };
  return view;
}

function requestForm() {
  return html`<form class="form card-plain" data-submit="request">
    <div class="grid-2">
      <label>Your name<input name="name" required maxlength="120" autocomplete="name"></label>
      <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
      <label>Telegram, WhatsApp or phone <span class="opt">optional</span><input name="contact" maxlength="200"></label>
      <label>Your English level<select name="level">${LEVELS.map((l) => html`<option>${l}</option>`)}</select></label>
    </div>
    <label>When are you usually free?<input name="preferred_times" maxlength="1000" placeholder="For example: weekday evenings after 7 pm, New York time"></label>
    <label>What would you like to work on?<textarea name="message" rows="4" maxlength="3000" placeholder="Speaking at work, an exam, grammar…"></textarea></label>
    <div class="row-end"><button class="btn btn-primary" type="submit">Send request</button></div>
  </form>`;
}

export function loginView() {
  const demo = S.api.mode === 'demo';
  return {
    title: 'Sign in',
    html: html`
      <div class="auth">
        <form class="form auth-card" data-submit="login">
          <h1>Sign in</h1>
          <label>Email<input name="email" type="email" required autocomplete="email" autofocus></label>
          <label>Password<input name="password" type="password" ${demo ? '' : 'required'} autocomplete="current-password"></label>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
          <button class="link-btn" type="button" data-on="forgot">Forgot your password?</button>
        </form>
        ${demo ? html`<div class="auth-demo"><h2>Demo accounts</h2><p class="muted small">No password needed in demo mode.</p>
          <div class="stack-sm">
            <button class="btn btn-block" data-on="demo" data-email="dasha@example.com">Dasha, the teacher</button>
            <button class="btn btn-block" data-on="demo" data-email="tamila@example.com">Tamila, a student</button>
            <button class="btn btn-block" data-on="demo" data-email="ivan@example.com">Ivan, waiting for approval</button>
          </div></div>` : ''}
        <p class="auth-foot">Got an invitation link? Open it to create your account.<br>
          New here? <a href="#book">Book a lesson</a> or <a href="#signup">create an account</a>.</p>
      </div>`,
    on: {
      async demo(el) { await S.api.signIn(el.dataset.email, ''); },
      forgot() {
        const m = openModal({
          title: 'Reset your password',
          body: html`<form class="form" data-submit="reset"><p class="muted">We will email you a link to choose a new password.</p>
            <label>Email<input name="email" type="email" required autocomplete="email"></label>
            <div class="row-end"><button class="btn btn-primary" type="submit">Send link</button></div></form>`,
          submit: {
            async reset(d) {
              await S.api.sendReset(d.email.trim());
              m.setBody(html`<p>If an account exists for <strong>${d.email}</strong>, a reset link is on its way. Check your inbox and spam folder.</p>`);
            },
          },
        });
      },
    },
    submit: {
      async login(d) {
        const me = await S.api.signIn(d.email.trim(), d.password);
        if (!me) toast('Signed in, but your profile is missing. Ask your teacher to check the database setup.', 'error');
      },
    },
  };
}

function signupForm({ name = '', email = '', code = '' } = {}) {
  return html`<form class="form auth-card" data-submit="signup">
    <input type="hidden" name="code" value="${code}">
    <label>Your name<input name="full_name" required maxlength="120" value="${name}" autocomplete="name"></label>
    <label>Email<input name="email" type="email" required value="${email}" autocomplete="email"></label>
    <label>Choose a password<input name="password" type="password" ${S.api.mode === 'demo' ? '' : 'required minlength="6"'} autocomplete="new-password"><span class="hint">At least 6 characters.</span></label>
    <button class="btn btn-primary btn-block" type="submit">Create account</button>
  </form>`;
}

const signupSubmit = {
  async signup(d, form) {
    const res = await S.api.signUp({ email: d.email.trim(), password: d.password, full_name: d.full_name.trim(), invite_code: d.code });
    if (res.needsConfirm) {
      form.outerHTML = html`<div class="notice notice-ok auth-card"><h2>Check your email</h2>
        <p>We sent a confirmation link to <strong>${d.email}</strong>. Open it to finish creating your account.</p></div>`.toString();
    } else if (!d.code && S.settings.notify_on_request !== false) {
      notifyTeacher(`New student account: ${d.full_name}`, { Name: d.full_name, Email: d.email, Note: 'Waiting for your approval on the Requests page.' });
    }
  },
};

export function signupView() {
  return {
    title: 'Create an account',
    html: html`<div class="auth"><div class="auth-intro"><h1>Create an account</h1>
      <p class="muted">${teacherName()} will approve your account and open your programs.</p></div>
      ${signupForm()}
      <p class="auth-foot">Already have an account? <a href="#login">Sign in</a></p></div>`,
    submit: signupSubmit,
  };
}

export async function joinView({ id }) {
  const info = await S.api.inviteInfo(id);
  if (!info) {
    return {
      title: 'Invitation',
      html: html`<div class="auth"><div class="notice auth-card"><h1>This link does not work</h1>
        <p>The invitation was already used or is not valid. If you already created your account, <a href="#login">sign in</a>. Otherwise, ask ${teacherName()} for a new link.</p></div></div>`,
    };
  }
  return {
    title: 'Join',
    html: html`<div class="auth"><div class="auth-intro"><p class="hand hand-lg">Welcome${info.full_name ? `, ${info.full_name}` : ''}!</p>
      <h1>Create your account</h1><p class="muted">${teacherName()} invited you. Your programs will be ready as soon as you finish.</p></div>
      ${signupForm({ name: info.full_name, email: info.email, code: id })}</div>`,
    submit: signupSubmit,
  };
}

export function waitingView() {
  const me = S.me;
  const paused = me.status === 'paused' || me.status === 'archived';
  return {
    title: 'Your account',
    html: html`<div class="auth"><div class="notice auth-card">
      <p class="hand hand-lg">Hi${me.full_name ? `, ${me.full_name}` : ''}!</p>
      ${paused
        ? html`<h1>Your account is paused</h1><p>Your programs are hidden for now. Write to ${teacherName()} if you want to continue.</p>`
        : html`<h1>Almost there</h1><p>${teacherName()} will approve your account soon. After that you will see your programs here.</p>
          <p>Want to start? <a href="#book">Book a lesson</a>.</p>`}
      <button class="btn" data-on="signout">${icon('logout')} Sign out</button></div></div>`,
    on: { async signout() { await S.api.signOut(); go('home'); refresh(); } },
  };
}

export function notFoundView() {
  return { title: 'Not found', html: html`<div class="empty"><h1>This page does not exist</h1><p><a href="#">Go to the start page</a></p></div>` };
}

export { esc, raw };

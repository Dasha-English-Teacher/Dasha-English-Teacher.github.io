// Balances. Students pay in advance; the teacher records payments and the
// lessons she gives; the balance is payments minus lessons held.
// This file has: the public "Pay" page (Kaspi), the student's balance card,
// the payment and lesson dialogs, the history list and the teacher's table.
import { html, icon, toast, openModal, ask, fmtDay, fmtTime, dateInput, timeInput, localDay, plural } from './ui.js';
import { S, refresh, money, currencySign, priceOf, hasOwnPrice, ledgerFor, lessonsLeft, balanceLevel, progressIndex, lessonDone, toCsv, downloadText, teacherName, invalidateNav } from './core.js';

export const METHODS = { kaspi: 'Kaspi', cash: 'Cash', card: 'Card', transfer: 'Bank transfer', other: 'Other', correction: 'Correction' };
const LENGTHS = [30, 45, 50, 60, 75, 90, 120];

const studentsOf = (profiles) => profiles.filter((p) => p.role === 'student');
const nameOf = (p) => (p ? p.full_name || p.email || 'Student' : 'Former student');
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/\s| /g, '').replace(',', '.')));

// ---------------------------------------------------------------------
// Kaspi: button and QR code
// ---------------------------------------------------------------------
export function kaspiBlock() {
  const st = S.settings;
  if (!st.kaspi_url && !st.kaspi_qr) return html`<p class="notice small">Online payment is not set up yet. Ask ${teacherName()} how to pay.</p>`;
  return html`<div class="kaspi">
    <div class="kaspi-main">
      <h2 class="kaspi-title">Pay with Kaspi</h2>
      <p class="muted">On your phone, press the button and the Kaspi.kz app opens the payment. On a computer, open the Kaspi.kz app on your phone and scan the QR code.</p>
      ${st.kaspi_url ? html`<a class="btn btn-kaspi btn-lg" href="${st.kaspi_url}" target="_blank" rel="noopener">${icon('wallet')} Pay with Kaspi</a>` : ''}
      ${st.payment_note ? html`<p class="kaspi-note">${st.payment_note}</p>` : ''}
    </div>
    ${st.kaspi_qr ? html`<figure class="kaspi-qr"><img src="${st.kaspi_qr}" alt="Kaspi QR code to pay ${st.site_name}" width="200" height="200" loading="lazy"><figcaption>Scan with the Kaspi.kz app</figcaption></figure>` : ''}
  </div>`;
}

// Public page: #pay (also used by signed-in students)
export async function payView() {
  const st = S.settings;
  const student = S.me && S.me.role === 'student';
  let mine = null;
  if (student) {
    const [payments, held] = await Promise.all([S.api.listPayments({ student_id: S.me.id }), S.api.listHeld({ student_id: S.me.id })]);
    mine = { L: ledgerFor(S.me.id, payments, held), price: priceOf(S.me) };
  }
  return {
    title: 'Pay for lessons',
    html: html`
      <div class="page-head"><h1>Pay for lessons</h1>
        <p class="lede">Lessons are paid in advance. ${teacherName()} adds your payment to your balance, and each lesson is taken from it.</p></div>
      ${mine ? html`<p class="pay-mine">Your balance now: <strong class="${mine.L.balance < 0 ? 'is-minus' : ''}">${money(mine.L.balance)}</strong>${mine.price > 0 ? html`, one lesson is ${money(mine.price)}` : ''}. <a href="#my-profile">See the history</a></p>` : ''}
      ${kaspiBlock()}
      <p class="muted small pay-other">No Kaspi? ${st.contact_text ? html`Write to ${teacherName()} (${st.contact_text})` : html`<a href="#book">Write to ${teacherName()}</a>`} to agree on another way to pay.</p>`,
  };
}

// ---------------------------------------------------------------------
// The student's balance card (on their profile page)
// ---------------------------------------------------------------------
export function balanceCard(profile, payments, held, { teacher = false } = {}) {
  const price = priceOf(profile);
  const L = ledgerFor(profile.id, payments, held);
  const left = lessonsLeft(L.balance, price);
  const level = balanceLevel(L.balance, price);
  const whose = teacher ? 'Balance' : 'Your balance';
  let line = '';
  if (L.balance < 0) line = teacher ? `Owes ${money(-L.balance)}` : `Please pay ${money(-L.balance)} for lessons you already had.`;
  else if (price > 0) line = left === 0 ? 'Less than one lesson left' : `Enough for ${plural(left, 'lesson')}`;
  return html`<div class="balance-card is-${level}">
    <div class="balance-main">
      <span class="balance-label">${whose}</span>
      <span class="balance-amount">${money(L.balance)}</span>
      ${line ? html`<span class="balance-line">${line}</span>` : ''}
    </div>
    <dl class="balance-facts">
      <div><dt>One lesson</dt><dd>${price > 0 ? money(price) : 'Not set'}${teacher && price > 0 && !hasOwnPrice(profile) ? html` <span class="muted small">(default)</span>` : ''}</dd></div>
      <div><dt>Paid in total</dt><dd>${money(L.paid)}</dd></div>
      <div><dt>Lessons held</dt><dd>${L.count}${L.missed ? html` <span class="muted small">(${L.missed} missed)</span>` : ''}</dd></div>
    </dl>
    ${teacher ? '' : html`<a class="btn btn-kaspi" href="#pay">${icon('wallet')} Top up</a>`}
  </div>`;
}

// ---------------------------------------------------------------------
// History: payments (+) and lessons (−), newest first
// ---------------------------------------------------------------------
export function ledgerItems(payments, held) {
  const items = [
    ...payments.map((p) => ({ kind: 'pay', id: p.id, at: localDay(p.paid_on), amount: Number(p.amount) || 0, row: p })),
    ...held.map((h) => ({ kind: 'held', id: h.id, at: new Date(h.held_on), amount: -(Number(h.price) || 0), row: h })),
  ].sort((a, b) => a.at - b.at || (a.kind === 'pay' ? -1 : 1));
  let run = 0;
  for (const it of items) { run += it.amount; it.after = run; }
  return items.reverse();
}

export function ledgerList(items, { teacher = false, who = null, lessonTitle = () => '', runningBalance = true, empty = 'No payments or lessons yet.' } = {}) {
  if (!items.length) return html`<p class="muted small empty-sm">${empty}</p>`;
  return html`<ul class="ledger">${items.map((it) => {
    const r = it.row;
    let title;
    let detail;
    if (it.kind === 'pay') {
      title = r.method === 'correction' ? 'Correction' : `Payment${METHODS[r.method] && r.method !== 'other' ? `, ${METHODS[r.method]}` : ''}`;
      detail = r.note || '';
    } else {
      title = r.status === 'missed' ? 'Missed lesson (charged)' : (r.title || 'Lesson');
      const covered = lessonTitle(r.lesson_id);
      detail = [covered ? `Topic: ${covered}` : '', r.minutes ? `${r.minutes} min` : '', r.note].filter(Boolean).join(', ');
    }
    return html`<li class="ledger-row ${it.kind === 'pay' ? 'is-pay' : 'is-held'}">
      <span class="ledger-date">${fmtDay(it.at)}${it.kind === 'held' ? html`<span class="muted small">${fmtTime(it.at)}</span>` : ''}</span>
      <span class="ledger-main"><strong>${title}</strong>${who ? html`<span class="ledger-who">${who(r.student_id)}</span>` : ''}${detail ? html`<span class="muted small">${detail}</span>` : ''}</span>
      <span class="ledger-amount ${it.amount >= 0 ? 'is-plus' : 'is-minus'}">${money(it.amount, { plus: true })}</span>
      ${runningBalance ? html`<span class="ledger-after" title="Balance after this">${money(it.after)}</span>` : ''}
      ${teacher ? html`<span class="ledger-tools">
        <button class="icon-btn" data-on="ledger-edit" data-kind="${it.kind}" data-id="${it.id}" aria-label="Edit" title="Edit">${icon('edit')}</button>
        <button class="icon-btn" data-on="ledger-del" data-kind="${it.kind}" data-id="${it.id}" aria-label="Delete" title="Delete">${icon('trash')}</button></span>` : ''}
    </li>`;
  })}</ul>`;
}

// Click handlers for the history list (teacher)
export function ledgerActions(ctx) {
  // ctx: { payments, held, profiles, tree, onDone }
  return {
    'ledger-edit'(el) {
      if (el.dataset.kind === 'pay') {
        const p = ctx.payments.find((x) => x.id === el.dataset.id);
        if (p) paymentDialog({ profiles: ctx.profiles, studentId: p.student_id, payment: p, onDone: ctx.onDone });
      } else {
        const h = ctx.held.find((x) => x.id === el.dataset.id);
        if (h) heldDialog({ profiles: ctx.profiles, studentId: h.student_id, held: h, tree: ctx.tree, onDone: ctx.onDone });
      }
    },
    async 'ledger-del'(el) {
      const pay = el.dataset.kind === 'pay';
      const row = (pay ? ctx.payments : ctx.held).find((x) => x.id === el.dataset.id);
      if (!row) return;
      const what = pay ? `the payment of ${money(row.amount)}` : `the lesson on ${fmtDay(row.held_on)}`;
      const ok = await ask(`Delete ${what}?`, { ok: 'Delete', danger: true, detail: pay ? 'The balance goes down by this amount.' : `${money(row.price)} goes back to the balance.${row.session_id ? ' The lesson stays in the calendar as planned.' : ''}` });
      if (!ok) return;
      if (pay) await S.api.deletePayment(row.id);
      else {
        await S.api.deleteHeld(row.id);
        // Keep the calendar in step: a lesson that is no longer charged is planned again.
        if (row.session_id) await S.api.saveSession({ id: row.session_id, status: 'scheduled' }).catch(() => {});
      }
      toast('Deleted');
      invalidateNav();
      (ctx.onDone || refresh)();
    },
  };
}

// ---------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------
function studentSelect(profiles, selected) {
  const list = studentsOf(profiles).filter((p) => p.status !== 'archived' || p.id === selected);
  return html`<label>Student<select name="student_id" required>
    ${selected ? '' : html`<option value="">Choose a student</option>`}
    ${list.map((p) => html`<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${nameOf(p)}</option>`)}</select></label>`;
}

export function paymentDialog({ profiles, studentId = '', payment = null, onDone = null } = {}) {
  const student = profiles.find((p) => p.id === (payment?.student_id || studentId));
  const m = openModal({
    title: payment ? 'Change payment' : `Add a payment${student ? ` from ${nameOf(student)}` : ''}`,
    body: html`<form class="form" data-submit="save">
      ${student ? html`<input type="hidden" name="student_id" value="${student.id}">` : studentSelect(profiles, '')}
      <div class="grid-2">
        <label>Amount, ${currencySign()}<input name="amount" type="text" inputmode="decimal" required autocomplete="off" value="${payment ? payment.amount : ''}" placeholder="20000"></label>
        <label>Date<input name="paid_on" type="date" required value="${payment?.paid_on || dateInput(new Date())}"></label>
      </div>
      <label>How it was paid<select name="method">${Object.entries(METHODS).map(([k, v]) => html`<option value="${k}" ${(payment?.method || 'kaspi') === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label>Note <span class="opt">optional</span><input name="note" maxlength="300" value="${payment?.note || ''}" placeholder="For example: 4 lessons in December"></label>
      <p class="muted small">The amount is added to the student's balance. For a correction you can enter a minus amount, for example −5000.</p>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">${payment ? 'Save' : 'Add payment'}</button></div>
    </form>`,
    submit: {
      async save(d) {
        const amount = num(String(d.amount).replace('−', '-'));
        if (!d.student_id) { toast('Choose a student.', 'error'); return; }
        if (!Number.isFinite(amount) || amount === 0) { toast('Enter the amount, for example 20000.', 'error'); return; }
        if (amount < 0 && d.method !== 'correction') { toast('A minus amount is only for corrections. Choose "Correction".', 'error'); return; }
        await S.api.savePayment({ id: payment?.id, student_id: d.student_id, amount, paid_on: d.paid_on, method: d.method, note: d.note.trim() });
        m.close();
        const who = profiles.find((p) => p.id === d.student_id);
        toast(payment ? 'Payment saved' : `${money(amount)} added to ${nameOf(who)}'s balance`);
        invalidateNav();
        (onDone || refresh)();
      },
    },
  });
  return m;
}

function lessonOptions(tree, selected) {
  return html`<option value="">Not chosen</option>${(tree || []).filter((c) => c.lessons.length).map((c) => html`<optgroup label="${c.title}">
    ${c.lessons.map((l) => html`<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${l.title}</option>`)}</optgroup>`)}`;
}

// Record a lesson that took place (or a missed lesson that is charged).
export function heldDialog({ profiles, studentId = '', held = null, tree = null, session = null, onDone = null } = {}) {
  const student = profiles.find((p) => p.id === (held?.student_id || studentId || session?.student_id));
  const when = new Date(held?.held_on || session?.starts_at || Date.now());
  const minutes = held?.minutes || session?.minutes || 60;
  const price = held ? Number(held.price) : priceOf(student);
  const m = openModal({
    title: held ? 'Change lesson' : `Lesson held${student ? ` with ${nameOf(student)}` : ''}`,
    body: html`<form class="form" data-submit="save">
      ${student ? html`<input type="hidden" name="student_id" value="${student.id}">` : studentSelect(profiles, '')}
      <div class="grid-3">
        <label>Date<input type="date" name="date" value="${dateInput(when)}" required></label>
        <label>Time<input type="time" name="time" value="${timeInput(when)}" required></label>
        <label>Length<select name="minutes">${LENGTHS.map((n) => html`<option value="${n}" ${minutes === n ? 'selected' : ''}>${n} min</option>`)}</select></label>
      </div>
      <div class="grid-2">
        <label>Price, ${currencySign()}<input name="price" type="text" inputmode="decimal" required autocomplete="off" value="${Number.isFinite(price) ? price : ''}" data-input="price-hint"></label>
        <label>What happened<select name="status"><option value="held" ${held?.status !== 'missed' ? 'selected' : ''}>The lesson took place</option><option value="missed" ${held?.status === 'missed' ? 'selected' : ''}>Missed, but charged</option></select></label>
      </div>
      ${tree ? html`<label>Topic from a program <span class="opt">optional</span><select name="lesson_id">${lessonOptions(tree, held?.lesson_id || '')}</select></label>` : ''}
      <label>Note <span class="opt">optional</span><input name="note" maxlength="300" value="${held?.note || ''}" placeholder="For example: speaking practice, checked homework"></label>
      ${student && !held ? html`<p class="muted small">${nameOf(student)}'s balance goes down by this price.${price > 0 ? '' : ' Set a price per lesson on the student page or in Website settings.'}</p>` : ''}
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">${held ? 'Save' : 'Record the lesson'}</button></div>
    </form>`,
    submit: {
      async save(d) {
        if (!d.student_id) { toast('Choose a student.', 'error'); return; }
        const p = num(d.price);
        if (!Number.isFinite(p) || p < 0) { toast('Enter the price, for example 5000. Use 0 for a free lesson.', 'error'); return; }
        const at = new Date(`${d.date}T${d.time}`);
        if (Number.isNaN(at.getTime())) { toast('Check the date and time.', 'error'); return; }
        await S.api.saveHeld({
          id: held?.id, student_id: d.student_id, held_on: at.toISOString(), minutes: +d.minutes, price: p,
          status: d.status, lesson_id: d.lesson_id || null, note: (d.note || '').trim(),
          ...(held ? {} : { session_id: session?.id || null, title: session?.title || 'English lesson' }),
        });
        m.close();
        const who = profiles.find((x) => x.id === d.student_id);
        toast(held ? 'Lesson saved' : `Lesson recorded: ${money(-p)} from ${nameOf(who)}'s balance`);
        invalidateNav();
        (onDone || refresh)();
      },
    },
  });
  return m;
}

// ---------------------------------------------------------------------
// Homework statistics for one student (programs they are in)
// ---------------------------------------------------------------------
export function homeworkStats(studentId, tree, enrollments, attempts) {
  const mine = new Set(enrollments.filter((e) => e.student_id === studentId).map((e) => e.course_id));
  const idx = progressIndex(attempts.filter((a) => a.student_id === studentId));
  let lessons = 0;
  let done = 0;
  let exercises = 0;
  let exDone = 0;
  const scores = [];
  for (const c of tree) {
    if (!mine.has(c.id)) continue;
    for (const l of c.lessons) {
      if (!l.published) continue;
      lessons += 1;
      if (lessonDone(l, idx)) done += 1;
      for (const mat of l.materials) {
        if (mat.kind !== 'exercise') continue;
        exercises += 1;
        const pr = idx.get(mat.id);
        if (pr && pr.done) {
          exDone += 1;
          const a = pr.completed;
          if (a.score != null && a.max_score) scores.push(a.score / a.max_score);
        }
      }
    }
  }
  const avg = scores.length ? Math.round((100 * scores.reduce((s, x) => s + x, 0)) / scores.length) : null;
  return { lessons, done, exercises, exDone, avg };
}

// ---------------------------------------------------------------------
// Teacher: Payments page (table of all students)
// ---------------------------------------------------------------------
const PERIODS = { month: 'This month', last: 'Last month', year: 'This year', all: 'All time' };
let period = 'month';
let sortKey = 'name';
let sortDir = 1;

function periodRange(p) {
  const now = new Date();
  if (p === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), null];
  if (p === 'last') return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  if (p === 'year') return [new Date(now.getFullYear(), 0, 1), null];
  return [null, null];
}
const periodName = (p) => {
  const [from] = periodRange(p);
  if (p === 'month' || p === 'last') return new Intl.DateTimeFormat('en', { month: 'long' }).format(from);
  if (p === 'year') return String(from.getFullYear());
  return 'all time';
};

export async function paymentsView() {
  const [profiles, payments, held, tree, enrollments, attempts] = await Promise.all([
    S.api.listProfiles(), S.api.listPayments(), S.api.listHeld(), S.api.tree(), S.api.listEnrollments(), S.api.listAttemptStats(),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const lessonTitles = new Map(tree.flatMap((c) => c.lessons.map((l) => [l.id, l.title])));
  const lessonTitle = (id) => (id ? lessonTitles.get(id) || '' : '');

  // Active and paused students, plus anyone else who has payments or lessons recorded.
  const list = studentsOf(profiles).filter((p) => ['active', 'paused'].includes(p.status) || payments.some((x) => x.student_id === p.id) || held.some((x) => x.student_id === p.id));

  const compute = () => {
    const [from, to] = periodRange(period);
    const inP = (d) => (!from || d >= from) && (!to || d < to);
    const pPay = payments.filter((x) => inP(localDay(x.paid_on)));
    const pHeld = held.filter((x) => inP(new Date(x.held_on)));
    const rows = list.map((p) => {
      const L = ledgerFor(p.id, payments, held);
      const price = priceOf(p);
      const hw = homeworkStats(p.id, tree, enrollments, attempts);
      const paidP = pPay.filter((x) => x.student_id === p.id).reduce((s, x) => s + Number(x.amount), 0);
      const heldP = pHeld.filter((x) => x.student_id === p.id);
      const earnedP = heldP.reduce((s, x) => s + Number(x.price), 0);
      return { p, L, price, left: lessonsLeft(L.balance, price), level: balanceLevel(L.balance, price), hw, paidP, heldP: heldP.length, earnedP };
    });
    const val = {
      name: (r) => nameOf(r.p).toLowerCase(),
      balance: (r) => r.L.balance,
      left: (r) => (r.left == null ? -1 : r.left),
      paid: (r) => r.paidP,
      held: (r) => r.heldP,
      earned: (r) => r.earnedP,
      homework: (r) => r.hw.exDone,
      score: (r) => (r.hw.avg == null ? -1 : r.hw.avg),
      last: (r) => r.L.last || '',
      price: (r) => r.price,
    }[sortKey];
    rows.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir || nameOf(a.p).localeCompare(nameOf(b.p));
    });
    const totals = {
      received: pPay.reduce((s, x) => s + Number(x.amount), 0),
      earned: pHeld.reduce((s, x) => s + Number(x.price), 0),
      lessons: pHeld.length,
      prepaid: rows.reduce((s, r) => s + Math.max(0, r.L.balance), 0),
      owed: rows.reduce((s, r) => s + Math.max(0, -r.L.balance), 0),
    };
    return { rows, totals, pPay, pHeld };
  };

  const th = (key, label, cls = '') => html`<th class="${cls}" aria-sort="${sortKey === key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="th-sort ${sortKey === key ? 'is-on' : ''}" data-on="sort" data-k="${key}">${label}${sortKey === key ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;

  const table = (c) => {
    if (!c.rows.length) return html`<div class="empty"><h2>No students yet</h2><p>Invite students on the <a href="#students">Students</a> page. Their balances will appear here.</p></div>`;
    const pn = periodName(period);
    return html`<div class="table-wrap"><table class="data">
      <thead><tr>
        ${th('name', 'Student')}${th('balance', 'Balance', 'num')}
        ${th('paid', `Paid, ${pn}`, 'num')}${th('held', `Lessons, ${pn}`, 'num')}${th('earned', `Earned, ${pn}`, 'num')}
        ${th('homework', 'Homework')}${th('score', 'Score', 'num')}${th('last', 'Last lesson')}<th><span class="sr-only">Actions</span></th>
      </tr></thead>
      <tbody>${c.rows.map((r) => html`<tr class="${r.p.status !== 'active' ? 'is-dim' : ''}">
        <th scope="row"><a href="#student-${r.p.id}">${nameOf(r.p)}</a>${r.p.status !== 'active' ? html` <span class="chip chip-${r.p.status}">${r.p.status}</span>` : ''}
          <span class="muted small cell-sub">${r.price > 0 ? `${money(r.price)} a lesson` : 'No price set'}</span></th>
        <td class="num"><span class="bal bal-${r.level}">${money(r.L.balance)}</span>${r.left != null ? html`<span class="muted small cell-sub">${r.left === 0 ? 'no lessons left' : `${plural(r.left, 'lesson')} left`}</span>` : ''}</td>
        <td class="num">${r.paidP ? money(r.paidP) : html`<span class="muted">—</span>`}</td>
        <td class="num">${r.heldP || html`<span class="muted">0</span>`}</td>
        <td class="num">${r.earnedP ? money(r.earnedP) : html`<span class="muted">—</span>`}</td>
        <td>${r.hw.lessons ? html`${r.hw.done} of ${plural(r.hw.lessons, 'lesson')}<span class="muted small cell-sub">${plural(r.hw.exDone, 'exercise')} done</span>` : html`<span class="muted">No program</span>`}</td>
        <td class="num">${r.hw.avg == null ? html`<span class="muted">—</span>` : html`<span class="score ${r.hw.avg >= 85 ? 'good' : r.hw.avg >= 60 ? 'fair' : 'low'}">${r.hw.avg}%</span>`}</td>
        <td>${r.L.last ? fmtDay(r.L.last) : html`<span class="muted">—</span>`}</td>
        <td><span class="cell-actions"><button class="btn btn-sm" data-on="pay" data-id="${r.p.id}" title="Add a payment from ${nameOf(r.p)}">${icon('plus')} Payment</button><button class="btn btn-sm" data-on="held" data-id="${r.p.id}" title="Record a lesson with ${nameOf(r.p)}">${icon('check')} Lesson</button></span></td>
      </tr>`)}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="num">${money(c.rows.reduce((s, r) => s + r.L.balance, 0))}</td>
        <td class="num">${money(c.totals.received)}</td><td class="num">${c.totals.lessons}</td><td class="num">${money(c.totals.earned)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>`;
  };

  const facts = (c) => html`<dl class="facts money-facts">
    <div><dt>Received, ${periodName(period)}</dt><dd>${money(c.totals.received)}</dd></div>
    <div><dt>Earned from lessons</dt><dd>${money(c.totals.earned)}</dd></div>
    <div><dt>Lessons held</dt><dd>${c.totals.lessons}</dd></div>
    <div><dt>Paid in advance, not used yet</dt><dd>${money(c.totals.prepaid)}</dd></div>
    <div><dt>Students owe</dt><dd class="${c.totals.owed ? 'is-minus' : ''}">${money(c.totals.owed)}</dd></div>
  </dl>`;

  const history = (c) => ledgerList(ledgerItems(c.pPay, c.pHeld), {
    teacher: true, who: (id) => nameOf(byId.get(id)), lessonTitle, runningBalance: false,
    empty: `No payments or lessons in ${periodName(period)}.`,
  });

  const paint = () => {
    const c = compute();
    const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h.toString(); };
    set('pay-facts', facts(c));
    set('pay-table', table(c));
    set('pay-history', history(c));
    set('pay-history-title', html`Payments and lessons, ${periodName(period)}`);
  };

  const first = compute();
  const ctx = { payments, held, profiles, tree };

  return {
    title: 'Payments',
    html: html`
      <div class="page-head row-between"><div><h1>Payments</h1>
        <p class="lede">Balances, payments and lessons for every student. A lesson you mark as held in the calendar is taken from the balance automatically.</p></div>
        <div class="row-gap"><button class="btn" data-on="pay-any">${icon('plus')} Add a payment</button><button class="btn btn-primary" data-on="held-any">${icon('check')} Record a lesson</button></div></div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Period">${Object.entries(PERIODS).map(([k, v]) => html`<button class="seg-btn ${period === k ? 'is-on' : ''}" data-on="period" data-p="${k}">${v}</button>`)}</div>
        <button class="btn btn-sm btn-ghost" data-on="csv">${icon('download')} Download table (CSV)</button>
        <button class="btn btn-sm btn-ghost" data-on="csv-ledger">${icon('download')} Download history (CSV)</button>
      </div>
      <div id="pay-facts">${facts(first)}</div>
      <div id="pay-table">${table(first)}</div>
      <section><h2 class="section-title" id="pay-history-title">Payments and lessons, ${periodName(period)}</h2>
        <div id="pay-history">${history(first)}</div></section>
      ${S.settings.default_lesson_price ? '' : html`<p class="notice small">Tip: set a default price per lesson in <a href="#site-setup">Website settings</a>. You can also set a different price for each student on their page.</p>`}`,
    on: {
      period(el) { period = el.dataset.p; el.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b === el)); paint(); },
      sort(el) { const k = el.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = ['name'].includes(k) ? 1 : -1; } paint(); },
      pay: (el) => paymentDialog({ profiles, studentId: el.dataset.id }),
      held: (el) => heldDialog({ profiles, studentId: el.dataset.id, tree }),
      'pay-any': () => paymentDialog({ profiles }),
      'held-any': () => heldDialog({ profiles, tree }),
      csv() {
        const c = compute();
        const pn = periodName(period);
        const rows = [['Student', 'Email', 'Status', `Price per lesson (${S.settings.currency || 'KZT'})`, 'Balance', 'Lessons left', `Paid, ${pn}`, `Lessons held, ${pn}`, `Earned, ${pn}`, 'Paid in total', 'Lessons held in total', 'Homework lessons done', 'Homework lessons in programs', 'Exercises done', 'Average score %', 'Last lesson']];
        for (const r of c.rows) {
          rows.push([nameOf(r.p), r.p.email, r.p.status, r.price || '', r.L.balance, r.left ?? '', r.paidP, r.heldP, r.earnedP, r.L.paid, r.L.count, r.hw.done, r.hw.lessons, r.hw.exDone, r.hw.avg ?? '', r.L.last ? dateInput(r.L.last) : '']);
        }
        downloadText(`balances-${dateInput(new Date())}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      },
      'csv-ledger'() {
        const items = ledgerItems(payments, held).reverse();
        const rows = [['Date', 'Student', 'Type', `Amount (${S.settings.currency || 'KZT'})`, 'Method', 'Lesson length (min)', 'Topic', 'Note']];
        for (const it of items) {
          const r = it.row;
          rows.push([dateInput(it.at), nameOf(byId.get(r.student_id)), it.kind === 'pay' ? (r.method === 'correction' ? 'Correction' : 'Payment') : (r.status === 'missed' ? 'Missed lesson' : 'Lesson'), it.amount, it.kind === 'pay' ? METHODS[r.method] || r.method : '', it.kind === 'held' ? r.minutes : '', it.kind === 'held' ? lessonTitle(r.lesson_id) : '', r.note || '']);
        }
        downloadText(`payments-and-lessons-${dateInput(new Date())}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      },
      ...ledgerActions(ctx),
    },
  };
}

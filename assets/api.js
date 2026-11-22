// Data layer. Two interchangeable versions with the same functions:
//  - live: Supabase (real accounts, data stored online)
//  - demo: sample data kept in this browser only (used until Supabase is connected)

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const DEFAULT_SETTINGS = {
  site_name: 'English with Dasha',
  teacher_name: 'Dasha',
  tagline: 'Online English lessons for adults who want to speak with confidence.',
  about: 'I teach English online to adults, from everyday conversation to advanced C1 vocabulary and grammar. Every lesson comes with interactive exercises you can do between classes.',
  booking_url: '',
  meeting_url: '',
  notify_email: '',
  notify_on_finish: true,
  notify_on_request: true,
  contact_text: '',
  time_format: '12h',
  exercise_repos: 'Dasha-English-Teacher/miro-exercises',
  // payments
  currency: 'KZT',
  default_lesson_price: '',
  kaspi_url: 'https://pay.kaspi.kz/pay/5rtd4cl9',
  kaspi_qr: 'assets/kaspi-qr.png',
  payment_note: '',
  charge_missed: false,
  // emails to students
  site_url: 'https://dashaenglish.com/',
  emails_enabled: true,
  email_from: 'English with Dasha <lessons@dashaenglish.com>',
  email_reply_to: '',
  email_reminder_hours: 24,
  email_reminder2_hours: 1,
  email_on_reminder: true,
  email_on_feedback: true,
  email_on_payment: true,
  email_on_held: false,
  email_on_low_balance: true,
  email_on_program: true,
  email_on_schedule: true,
  email_on_welcome: true,
  email_on_invite: true,
};

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const FIELDS = {
  profiles: ['full_name', 'role', 'status', 'level', 'phone', 'goals', 'lesson_price', 'email_notifications', 'timezone'],
  courses: ['title', 'description', 'emoji', 'color', 'level', 'published', 'sort'],
  lessons: ['course_id', 'title', 'description', 'published', 'sort'],
  materials: ['lesson_id', 'kind', 'title', 'url', 'body', 'sort'],
  attempts: ['material_id', 'material_title', 'status', 'score', 'max_score', 'first_score', 'first_max', 'revealed', 'answers', 'seconds', 'finished_at', 'feedback', 'feedback_at', 'feedback_seen', 'reviewed'],
  sessions: ['student_id', 'title', 'starts_at', 'minutes', 'meeting_url', 'note', 'status'],
  booking_requests: ['name', 'email', 'contact', 'level', 'preferred_times', 'message', 'status'],
  invites: ['email', 'full_name', 'course_ids', 'send_email'],
  words: ['student_id', 'term', 'meaning', 'example', 'learned'],
  payments: ['student_id', 'amount', 'paid_on', 'method', 'note'],
  held_lessons: ['student_id', 'session_id', 'lesson_id', 'held_on', 'minutes', 'price', 'title', 'note', 'status'],
};

// Light columns for statistics (no answers), so the payments table loads fast.
const ATTEMPT_STATS = 'id,student_id,material_id,material_title,status,score,max_score,started_at,finished_at,updated_at,reviewed';

export function sortTree(courses) {
  courses.sort((a, b) => (a.sort - b.sort) || String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of courses) {
    c.lessons = (c.lessons || []).sort((a, b) => (a.sort - b.sort) || String(a.created_at).localeCompare(String(b.created_at)));
    for (const l of c.lessons) l.materials = (l.materials || []).sort((a, b) => (a.sort - b.sort) || String(a.created_at).localeCompare(String(b.created_at)));
  }
  return courses;
}

// =====================================================================
// LIVE (Supabase)
// =====================================================================
export async function createLiveApi(cfg) {
  const { createClient } = await import(SUPABASE_CDN);
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const run = async (p) => {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  };
  const back = () => location.origin + location.pathname;
  let me = null;

  async function loadMe(session) {
    if (!session) { me = null; return null; }
    me = await run(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (me) me.auth_email = session.user.email;
    return me;
  }

  const save = async (table, o) => {
    const row = pick(o, FIELDS[table]);
    if (o.id) return run(sb.from(table).update(row).eq('id', o.id).select().single());
    return run(sb.from(table).insert(row).select().single());
  };
  const remove = (table, id) => run(sb.from(table).delete().eq('id', id));

  const api = {
    mode: 'live',
    get me() { return me; },
    async session() {
      const { data } = await sb.auth.getSession();
      return loadMe(data.session);
    },
    onAuth(cb) { sb.auth.onAuthStateChange((event) => cb(event)); },
    async signIn(email, password) {
      await run(sb.auth.signInWithPassword({ email, password }));
      return api.session();
    },
    async signUp({ email, password, full_name, invite_code }) {
      const data = await run(sb.auth.signUp({
        email, password,
        options: { data: { full_name, invite_code: invite_code || '' }, emailRedirectTo: back() },
      }));
      return { needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); me = null; },
    async sendReset(email) { await run(sb.auth.resetPasswordForEmail(email, { redirectTo: back() })); },
    async setPassword(password) { await run(sb.auth.updateUser({ password })); },
    async inviteInfo(code) {
      const rows = await run(sb.rpc('invite_info', { p_code: code }));
      return (rows && rows[0]) || null;
    },

    async getSettings() {
      const row = await run(sb.from('site_settings').select('data').eq('id', 1).maybeSingle());
      return { ...DEFAULT_SETTINGS, ...(row?.data || {}) };
    },
    async saveSettings(data) {
      await run(sb.from('site_settings').update({ data, updated_at: new Date().toISOString() }).eq('id', 1));
    },

    listProfiles: () => run(sb.from('profiles').select('*').order('created_at')),
    getProfile: (id) => run(sb.from('profiles').select('*').eq('id', id).maybeSingle()),
    async updateProfile(id, patch) {
      const row = await run(sb.from('profiles').update(pick(patch, FIELDS.profiles)).eq('id', id).select().single());
      if (me && id === me.id) Object.assign(me, row);
      return row;
    },

    listInvites: () => run(sb.from('invites').select('*').is('used_at', null).order('created_at', { ascending: false })),
    createInvite: (o) => save('invites', o),
    deleteInvite: (id) => remove('invites', id),

    async tree() {
      const rows = await run(sb.from('courses').select('*, lessons(*, materials(*))').order('sort'));
      return sortTree(rows || []);
    },
    saveCourse: (o) => save('courses', o),
    deleteCourse: (id) => remove('courses', id),
    saveLesson: (o) => save('lessons', o),
    deleteLesson: (id) => remove('lessons', id),
    saveMaterial: (o) => save('materials', o),
    deleteMaterial: (id) => remove('materials', id),
    // Copy a lesson with everything inside it into a program.
    async copyLesson(lesson, course_id, sort) {
      const row = await save('lessons', { course_id, title: lesson.title, description: lesson.description || '', published: lesson.published, sort });
      const mats = (lesson.materials || []).map((m, i) => ({ lesson_id: row.id, kind: m.kind, title: m.title, url: m.url || '', body: m.body || '', sort: i }));
      if (mats.length) await run(sb.from('materials').insert(mats));
      return row;
    },

    listEnrollments: () => run(sb.from('enrollments').select('*')),
    async setEnrollment(course_id, student_id, on) {
      if (on) await run(sb.from('enrollments').upsert({ course_id, student_id }, { onConflict: 'course_id,student_id', ignoreDuplicates: true }));
      else await run(sb.from('enrollments').delete().eq('course_id', course_id).eq('student_id', student_id));
    },

    async listAttempts({ student_id, material_id, limit = 500 } = {}) {
      let p = sb.from('attempts').select('*').order('started_at', { ascending: false }).limit(limit);
      if (student_id) p = p.eq('student_id', student_id);
      if (material_id) p = p.eq('material_id', material_id);
      return run(p);
    },
    async listAttemptStats({ student_id } = {}) {
      let p = sb.from('attempts').select(ATTEMPT_STATS).order('started_at', { ascending: false }).limit(5000);
      if (student_id) p = p.eq('student_id', student_id);
      return run(p);
    },
    getAttempt: (id) => run(sb.from('attempts').select('*').eq('id', id).maybeSingle()),
    createAttempt: (o) => save('attempts', o),
    updateAttempt: (id, patch) => save('attempts', { ...patch, id }),
    deleteAttempt: (id) => remove('attempts', id),

    async listSessions({ from, to, student_id } = {}) {
      let p = sb.from('sessions').select('*').order('starts_at');
      if (from) p = p.gte('starts_at', new Date(from).toISOString());
      if (to) p = p.lt('starts_at', new Date(to).toISOString());
      if (student_id) p = p.eq('student_id', student_id);
      return run(p);
    },
    saveSession: (o) => save('sessions', o),
    addSessions: (list) => run(sb.from('sessions').insert(list.map((o) => pick(o, FIELDS.sessions))).select()),
    deleteSession: (id) => remove('sessions', id),

    createRequest: (o) => run(sb.from('booking_requests').insert(pick(o, FIELDS.booking_requests))),
    listRequests: () => run(sb.from('booking_requests').select('*').order('created_at', { ascending: false })),
    updateRequest: (id, patch) => save('booking_requests', { ...patch, id }),
    deleteRequest: (id) => remove('booking_requests', id),

    listWords: (student_id) => run(sb.from('words').select('*').eq('student_id', student_id).order('created_at', { ascending: false })),
    saveWord: (o) => save('words', o),
    deleteWord: (id) => remove('words', id),

    async getNotes(student_id) {
      const row = await run(sb.from('teacher_notes').select('body').eq('student_id', student_id).maybeSingle());
      return row?.body || '';
    },
    saveNotes: (student_id, body) => run(sb.from('teacher_notes').upsert({ student_id, body, updated_at: new Date().toISOString() })),

    // ----- balances -----
    async listPayments({ student_id } = {}) {
      let p = sb.from('payments').select('*').order('paid_on', { ascending: false }).order('created_at', { ascending: false });
      if (student_id) p = p.eq('student_id', student_id);
      return run(p);
    },
    savePayment: (o) => save('payments', o),
    deletePayment: (id) => remove('payments', id),
    async listHeld({ student_id } = {}) {
      let p = sb.from('held_lessons').select('*').order('held_on', { ascending: false });
      if (student_id) p = p.eq('student_id', student_id);
      return run(p);
    },
    saveHeld: (o) => save('held_lessons', o),
    deleteHeld: (id) => remove('held_lessons', id),

    // ----- emails to students -----
    emailStatus: () => run(sb.rpc('email_status')),
    listEmails: (limit = 30) => run(sb.from('email_outbox').select('id,to_email,to_name,kind,subject,status,tries,error,created_at,sent_at,send_after').order('created_at', { ascending: false }).limit(limit)),
    sendTestEmail: () => run(sb.rpc('send_test_email')),
    retryEmails: () => run(sb.rpc('email_retry')),
  };
  return api;
}

// =====================================================================
// DEMO (sample data in this browser)
// =====================================================================
const DEMO_KEY = 'english-studio-demo-v2';

export const DEMO_EXERCISES = [
  'Tamila_Part_1_Multiple_Choice.html',
  'Tamila_Part_2_Writing_and_Submit.html',
  'Impostor_Syndrome_Vocabulary_Drag_Drop.html',
  'Impostor_Burnout_Choose_Only.html',
  'burnout_vocabulary_matching_illustrated.html',
  'burnout_vocabulary_sentence_completion_horizontal.html',
];

export function prettyName(file) {
  return file.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function demoSeed(base, only) {
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const at = (days, hour, min = 0) => { const d = new Date(now + days * day); d.setHours(hour, min, 0, 0); return d.toISOString(); };
  const ex = (f) => base + f;
  const T = 'u-dasha', S1 = 'u-tamila', S2 = 'u-maria', S3 = 'u-ivan';
  const created = iso(now - 40 * day);
  const db = {
    settings: { ...DEFAULT_SETTINGS, meeting_url: 'https://meet.google.com/', default_lesson_price: 5000 },
    profiles: [
      { id: T, email: 'dasha@example.com', full_name: 'Dasha', role: 'teacher', status: 'active', level: '', phone: '', goals: '', lesson_price: null, email_notifications: true, timezone: '', created_at: iso(now - 60 * day) },
      { id: S1, email: 'tamila@example.com', full_name: 'Tamila', role: 'student', status: 'active', level: 'C1', phone: '', goals: 'Sound natural at work meetings; prepare for C1 exam.', lesson_price: 6000, email_notifications: true, timezone: '', created_at: created },
      { id: S2, email: 'maria@example.com', full_name: 'Maria', role: 'student', status: 'active', level: 'B2', phone: '', goals: 'Vocabulary for talking about work and well-being.', lesson_price: null, email_notifications: true, timezone: '', created_at: iso(now - 20 * day) },
      { id: S3, email: 'ivan@example.com', full_name: 'Ivan', role: 'student', status: 'pending', level: '', phone: '', goals: '', lesson_price: null, email_notifications: true, timezone: '', created_at: iso(now - 1 * day) },
    ],
    payments: [
      { id: 'p-1', student_id: S1, amount: 24000, paid_on: iso(now - 30 * day).slice(0, 10), method: 'kaspi', note: '4 lessons', created_at: iso(now - 30 * day) },
      { id: 'p-2', student_id: S1, amount: 12000, paid_on: iso(now - 6 * day).slice(0, 10), method: 'kaspi', note: '', created_at: iso(now - 6 * day) },
      { id: 'p-3', student_id: S2, amount: 10000, paid_on: iso(now - 15 * day).slice(0, 10), method: 'cash', note: '', created_at: iso(now - 15 * day) },
    ],
    held_lessons: [
      { id: 'h-1', student_id: S1, session_id: null, lesson_id: 'l-contrast', held_on: at(-25, 18), minutes: 60, price: 6000, title: 'English lesson', note: '', status: 'held', created_at: iso(now - 25 * day) },
      { id: 'h-2', student_id: S1, session_id: null, lesson_id: 'l-writing', held_on: at(-18, 18), minutes: 60, price: 6000, title: 'English lesson', note: '', status: 'held', created_at: iso(now - 18 * day) },
      { id: 'h-3', student_id: S1, session_id: null, lesson_id: 'l-impostor', held_on: at(-11, 18), minutes: 60, price: 6000, title: 'English lesson', note: '', status: 'held', created_at: iso(now - 11 * day) },
      { id: 'h-4', student_id: S1, session_id: 's-p1', lesson_id: null, held_on: at(-4, 18), minutes: 60, price: 6000, title: 'English lesson', note: '', status: 'held', created_at: iso(now - 4 * day) },
      { id: 'h-5', student_id: S2, session_id: null, lesson_id: 'l-impostor', held_on: at(-9, 10, 30), minutes: 45, price: 5000, title: 'Vocabulary lesson', note: '', status: 'held', created_at: iso(now - 9 * day) },
    ],
    courses: [
      { id: 'c-grammar', title: 'C1 grammar with Tamila', description: 'Contrast linkers, comparatives and combining ideas in writing.', emoji: '✍️', color: '#1f4fd1', level: 'C1', published: true, sort: 0, created_at: created },
      { id: 'c-burnout', title: 'Burnout and well-being vocabulary', description: 'Words and expressions for talking about stress, impostor syndrome and healthy work habits.', emoji: '🌿', color: '#1e8a5a', level: 'B2–C1', published: true, sort: 1, created_at: created },
    ],
    lessons: [
      { id: 'l-contrast', course_id: 'c-grammar', title: 'Contrast and comparatives', description: 'Although, despite, whereas, nevertheless and the more…, the more…', published: true, sort: 0, created_at: created },
      { id: 'l-writing', course_id: 'c-grammar', title: 'Combining ideas in writing', description: 'Write 16 sentences and send them for feedback.', published: true, sort: 1, created_at: created },
      { id: 'l-impostor', course_id: 'c-burnout', title: 'Impostor syndrome', description: 'Key vocabulary from the article we read in class.', published: true, sort: 0, created_at: created },
      { id: 'l-burnout', course_id: 'c-burnout', title: 'Burnout and sustainable productivity', description: '', published: true, sort: 1, created_at: created },
      { id: 'l-review', course_id: 'c-burnout', title: 'Review before the test', description: 'Coming soon.', published: false, sort: 2, created_at: created },
    ],
    materials: [
      { id: 'm-t1', lesson_id: 'l-contrast', kind: 'exercise', title: 'Choose the best option', url: ex(DEMO_EXERCISES[0]), body: '', sort: 0, created_at: created },
      { id: 'm-ref', lesson_id: 'l-contrast', kind: 'link', title: 'Grammar reference: although and though', url: 'https://dictionary.cambridge.org/grammar/british-grammar/although-and-though', body: '', sort: 1, created_at: created },
      { id: 'm-t2', lesson_id: 'l-writing', kind: 'exercise', title: 'Combine the ideas (writing)', url: ex(DEMO_EXERCISES[1]), body: '', sort: 0, created_at: created },
      { id: 'm-tip', lesson_id: 'l-writing', kind: 'text', title: 'Tip before you write', url: '', body: 'Use a comma after a clause that starts with although or even though when it comes first.\nDespite and in spite of are followed by a noun or an -ing form, never by a full clause.', sort: 1, created_at: created },
      { id: 'm-dd', lesson_id: 'l-impostor', kind: 'exercise', title: 'Vocabulary: drag and drop', url: ex(DEMO_EXERCISES[2]), body: '', sort: 0, created_at: created },
      { id: 'm-co', lesson_id: 'l-impostor', kind: 'exercise', title: 'Choose the correct option', url: ex(DEMO_EXERCISES[3]), body: '', sort: 1, created_at: created },
      { id: 'm-ma', lesson_id: 'l-burnout', kind: 'exercise', title: 'Match the expressions', url: ex(DEMO_EXERCISES[4]), body: '', sort: 0, created_at: created },
      { id: 'm-sc', lesson_id: 'l-burnout', kind: 'exercise', title: 'Complete the sentences', url: ex(DEMO_EXERCISES[5]), body: '', sort: 1, created_at: created },
    ],
    enrollments: [
      { course_id: 'c-grammar', student_id: S1, created_at: created },
      { course_id: 'c-burnout', student_id: S1, created_at: created },
      { course_id: 'c-burnout', student_id: S2, created_at: created },
    ],
    attempts: [
      {
        id: 'a-1', student_id: S1, material_id: 'm-t1', material_title: 'Choose the best option', status: 'completed',
        score: 16, max_score: 18, first_score: 13, first_max: 18, revealed: false, seconds: 540,
        answers: [
          { q: 'She went to work ___ she felt ill.', a: 'even though', ok: true },
          { q: '___ the rain, we went for a walk.', a: 'Although', ok: false },
          { q: 'The more you read, ___ your vocabulary becomes.', a: 'the richer', ok: true },
        ],
        started_at: iso(now - 3 * day - 600000), finished_at: iso(now - 3 * day), feedback: 'Very good! Look again at number 2: despite + noun, although + clause.', feedback_at: iso(now - 2 * day), feedback_seen: false, reviewed: true, updated_at: iso(now - 2 * day),
      },
      {
        id: 'a-2', student_id: S1, material_id: 'm-dd', material_title: 'Vocabulary: drag and drop', status: 'completed',
        score: 24, max_score: 27, first_score: 24, first_max: 27, revealed: false, seconds: 760,
        answers: [{ q: 'Persistent and difficult to get rid of (a feeling).', a: 'Nagging', ok: true }, { q: 'To think about something carefully for a long time.', a: 'Fret over', ok: false }],
        started_at: iso(now - 1 * day - 900000), finished_at: iso(now - 1 * day), feedback: null, feedback_at: null, feedback_seen: false, reviewed: false, updated_at: iso(now - 1 * day),
      },
      {
        id: 'a-3', student_id: S2, material_id: 'm-co', material_title: 'Choose the correct option', status: 'in_progress',
        score: 20, max_score: 42, first_score: null, first_max: null, revealed: false, seconds: 420,
        answers: [], started_at: iso(now - 5 * 3600000), finished_at: null, feedback: null, feedback_at: null, feedback_seen: false, reviewed: false, updated_at: iso(now - 5 * 3600000),
      },
    ],
    sessions: [
      { id: 's-p1', student_id: S1, title: 'English lesson', starts_at: at(-4, 18), minutes: 60, meeting_url: 'https://meet.google.com/', note: '', status: 'done', created_at: created },
      { id: 's-p2', student_id: S2, title: 'Vocabulary lesson', starts_at: at(-2, 10, 30), minutes: 45, meeting_url: 'https://meet.google.com/', note: '', status: 'scheduled', created_at: created },
      { id: 's-1', student_id: S1, title: 'English lesson', starts_at: at(1, 18), minutes: 60, meeting_url: 'https://meet.google.com/', note: 'We will check the writing task together.', status: 'scheduled', created_at: created },
      { id: 's-2', student_id: S1, title: 'English lesson', starts_at: at(8, 18), minutes: 60, meeting_url: 'https://meet.google.com/', note: '', status: 'scheduled', created_at: created },
      { id: 's-3', student_id: S2, title: 'Vocabulary lesson', starts_at: at(2, 10, 30), minutes: 45, meeting_url: 'https://meet.google.com/', note: '', status: 'scheduled', created_at: created },
      { id: 's-4', student_id: null, title: 'Trial lesson: Anna', starts_at: at(3, 12), minutes: 30, meeting_url: 'https://meet.google.com/', note: 'Booked through the website.', status: 'scheduled', created_at: created },
    ],
    booking_requests: [
      { id: 'r-1', name: 'Anna', email: 'anna@example.com', contact: 'Telegram @anna', level: 'B1', preferred_times: 'Weekday evenings after 7 pm', message: 'I want to prepare for IELTS speaking in spring.', status: 'new', created_at: iso(now - 7200000) },
    ],
    invites: [
      { id: 'i-1', code: 'demo-oleg-invite', email: 'oleg@example.com', full_name: 'Oleg', course_ids: ['c-burnout'], created_at: iso(now - 2 * day), used_at: null, used_by: null },
    ],
    words: [
      { id: 'w-1', student_id: S1, term: 'running on empty', meaning: 'having almost no energy left', example: 'After three night shifts I was running on empty.', learned: false, created_at: iso(now - 3 * day) },
      { id: 'w-2', student_id: S1, term: 'knock-on effect', meaning: 'an indirect result of something', example: 'The delay had a knock-on effect on the whole project.', learned: true, created_at: iso(now - 4 * day) },
      { id: 'w-3', student_id: S1, term: 'fall by the wayside', meaning: 'to be stopped or forgotten', example: 'My hobbies fell by the wayside when I changed jobs.', learned: false, created_at: iso(now - 4 * day) },
      { id: 'w-4', student_id: S1, term: 'mull over', meaning: 'to think carefully about something for a long time', example: 'I need to mull over the offer.', learned: false, created_at: iso(now - 5 * day) },
    ],
    notes: { [S1]: 'Prefers evening lessons. Working on C1 writing. Strong vocabulary, needs practice with articles.' },
    current: null,
  };
  if (only && only.length) {
    // Preview build: keep only the exercises that are shipped with the demo.
    const keep = (m) => m.kind !== 'exercise' || only.some((f) => m.url.endsWith(f));
    db.materials = db.materials.filter(keep);
    const usedLessons = new Set(db.materials.filter((m) => m.kind === 'exercise').map((m) => m.lesson_id));
    db.lessons = db.lessons.filter((l) => usedLessons.has(l.id) || !l.published);
    db.materials = db.materials.filter((m) => db.lessons.some((l) => l.id === m.lesson_id));
    db.attempts = db.attempts.filter((a) => db.materials.some((m) => m.id === a.material_id));
  }
  return db;
}

export function createDemoApi(cfg) {
  const base = cfg.demoExerciseBase || 'https://dasha-english-teacher.github.io/miro-exercises/';
  const only = Array.isArray(cfg.demoExercises) ? cfg.demoExercises : null;
  const seedKey = base + (only ? only.join('|') : '');
  let db;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { db = null; }
  if (!db || db.base !== seedKey) { db = demoSeed(base, only); db.base = seedKey; }
  const persist = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* storage may be off */ } };
  const id = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const nowIso = () => new Date().toISOString();
  const wait = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));
  const meRow = () => db.profiles.find((p) => p.id === db.current) || null;
  const isTeacher = () => meRow()?.role === 'teacher';
  const need = (ok) => { if (!ok) throw new Error('You do not have access to this.'); };
  const authCbs = [];
  const fire = (ev) => authCbs.forEach((cb) => cb(ev));

  const canSeeCourse = (c) => {
    const me = meRow();
    if (!me) return false;
    if (me.role === 'teacher') return true;
    return c.published && me.status === 'active' && db.enrollments.some((e) => e.course_id === c.id && e.student_id === me.id);
  };

  function upsert(list, o, prefix, fields) {
    if (o.id) {
      const row = list.find((x) => x.id === o.id);
      need(row);
      Object.assign(row, pick(o, fields));
      persist();
      return wait(row);
    }
    const row = { id: id(prefix), created_at: nowIso(), ...pick(o, fields) };
    list.push(row);
    persist();
    return wait(row);
  }

  const api = {
    mode: 'demo',
    get me() { return meRow() ? clone(meRow()) : null; },
    async session() { return wait(meRow()); },
    onAuth(cb) { authCbs.push(cb); },
    async signIn(email) {
      const p = db.profiles.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
      if (!p) throw new Error('Invalid login credentials');
      db.current = p.id; persist(); fire('SIGNED_IN');
      return wait(p);
    },
    async signUp({ email, full_name, invite_code }) {
      if (db.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) throw new Error('User already registered');
      const inv = invite_code ? db.invites.find((i) => i.code === invite_code && !i.used_at) : null;
      const p = { id: id('u'), email, full_name: full_name || inv?.full_name || '', role: 'student', status: inv ? 'active' : 'pending', level: '', phone: '', goals: '', lesson_price: null, email_notifications: true, timezone: '', created_at: nowIso() };
      db.profiles.push(p);
      if (inv) {
        inv.course_ids.forEach((c) => db.enrollments.push({ course_id: c, student_id: p.id, created_at: nowIso() }));
        inv.used_at = nowIso(); inv.used_by = p.id;
      }
      db.current = p.id; persist(); fire('SIGNED_IN');
      return { needsConfirm: false };
    },
    async signOut() { db.current = null; persist(); fire('SIGNED_OUT'); },
    async sendReset() { /* nothing to send in demo */ },
    async setPassword() { /* demo accounts have no passwords */ },
    async inviteInfo(code) { const i = db.invites.find((x) => x.code === code && !x.used_at); return i ? { email: i.email, full_name: i.full_name } : null; },

    // demo-only helpers
    demoUsers: () => clone(db.profiles),
    demoSwitch(userId) { db.current = userId; persist(); fire('SIGNED_IN'); },
    demoReset() { try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } db = demoSeed(base, only); db.base = seedKey; persist(); fire('SIGNED_OUT'); },

    async getSettings() { return wait({ ...DEFAULT_SETTINGS, ...db.settings }); },
    async saveSettings(data) { need(isTeacher()); db.settings = { ...data }; persist(); },

    async listProfiles() { const me = meRow(); need(me); return wait(isTeacher() ? db.profiles : db.profiles.filter((p) => p.id === me.id)); },
    async getProfile(pid) { const me = meRow(); need(me && (isTeacher() || me.id === pid)); return wait(db.profiles.find((p) => p.id === pid) || null); },
    async updateProfile(pid, patch) {
      const me = meRow(); need(me && (isTeacher() || me.id === pid));
      const row = db.profiles.find((p) => p.id === pid); need(row);
      const allowed = isTeacher() ? FIELDS.profiles : ['full_name', 'level', 'phone', 'goals', 'email_notifications', 'timezone'];
      Object.assign(row, pick(patch, allowed)); persist();
      return wait(row);
    },

    async listInvites() { need(isTeacher()); return wait(db.invites.filter((i) => !i.used_at)); },
    async createInvite(o) { need(isTeacher()); const row = { id: id('i'), code: Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12), created_at: nowIso(), used_at: null, used_by: null, ...pick(o, FIELDS.invites) }; db.invites.push(row); persist(); return wait(row); },
    async deleteInvite(iid) { need(isTeacher()); db.invites = db.invites.filter((i) => i.id !== iid); persist(); },

    async tree() {
      const teacher = isTeacher();
      const courses = db.courses.filter(canSeeCourse).map((c) => ({
        ...c,
        lessons: db.lessons.filter((l) => l.course_id === c.id && (teacher || l.published)).map((l) => ({
          ...l, materials: db.materials.filter((m) => m.lesson_id === l.id),
        })),
      }));
      return sortTree(clone(courses));
    },
    saveCourse(o) { need(isTeacher()); return upsert(db.courses, o, 'c', FIELDS.courses); },
    async deleteCourse(cid) {
      need(isTeacher());
      const lids = db.lessons.filter((l) => l.course_id === cid).map((l) => l.id);
      db.materials = db.materials.filter((m) => !lids.includes(m.lesson_id));
      db.lessons = db.lessons.filter((l) => l.course_id !== cid);
      db.enrollments = db.enrollments.filter((e) => e.course_id !== cid);
      db.courses = db.courses.filter((c) => c.id !== cid); persist();
    },
    saveLesson(o) { need(isTeacher()); return upsert(db.lessons, o, 'l', FIELDS.lessons); },
    async deleteLesson(lid) {
      need(isTeacher());
      db.materials = db.materials.filter((m) => m.lesson_id !== lid);
      db.lessons = db.lessons.filter((l) => l.id !== lid);
      db.held_lessons.forEach((h) => { if (h.lesson_id === lid) h.lesson_id = null; });
      persist();
    },
    saveMaterial(o) { need(isTeacher()); return upsert(db.materials, o, 'm', FIELDS.materials); },
    async deleteMaterial(mid) { need(isTeacher()); db.materials = db.materials.filter((m) => m.id !== mid); persist(); },
    async copyLesson(lesson, course_id, sort) {
      need(isTeacher());
      const row = { id: id('l'), created_at: nowIso(), course_id, title: lesson.title, description: lesson.description || '', published: lesson.published, sort };
      db.lessons.push(row);
      (lesson.materials || []).forEach((m, i) => db.materials.push({ id: id('m'), created_at: nowIso(), lesson_id: row.id, kind: m.kind, title: m.title, url: m.url || '', body: m.body || '', sort: i }));
      persist();
      return wait(row);
    },

    async listEnrollments() { const me = meRow(); need(me); return wait(isTeacher() ? db.enrollments : db.enrollments.filter((e) => e.student_id === me.id)); },
    async setEnrollment(course_id, student_id, on) {
      need(isTeacher());
      db.enrollments = db.enrollments.filter((e) => !(e.course_id === course_id && e.student_id === student_id));
      if (on) db.enrollments.push({ course_id, student_id, created_at: nowIso() });
      persist();
    },

    async listAttempts({ student_id, material_id, limit = 500 } = {}) {
      const me = meRow(); need(me);
      let rows = db.attempts.filter((a) => isTeacher() || a.student_id === me.id);
      if (student_id) rows = rows.filter((a) => a.student_id === student_id);
      if (material_id) rows = rows.filter((a) => a.material_id === material_id);
      rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
      return wait(rows.slice(0, limit));
    },
    async listAttemptStats({ student_id } = {}) { return api.listAttempts({ student_id, limit: 5000 }); },
    async getAttempt(aid) { const me = meRow(); need(me); const a = db.attempts.find((x) => x.id === aid && (isTeacher() || x.student_id === me.id)); return wait(a || null); },
    async createAttempt(o) {
      const me = meRow(); need(me);
      const row = { id: id('a'), student_id: me.id, status: 'in_progress', score: null, max_score: null, first_score: null, first_max: null, revealed: false, answers: [], seconds: 0, started_at: nowIso(), finished_at: null, feedback: null, feedback_at: null, feedback_seen: false, reviewed: false, ...pick(o, FIELDS.attempts) };
      if (!isTeacher()) { row.feedback = null; row.reviewed = false; }
      row.updated_at = nowIso();
      db.attempts.push(row); persist();
      return wait(row);
    },
    async updateAttempt(aid, patch) {
      const me = meRow(); need(me);
      const row = db.attempts.find((x) => x.id === aid); need(row && (isTeacher() || row.student_id === me.id));
      let p = pick(patch, FIELDS.attempts);
      if (!isTeacher()) { delete p.feedback; delete p.feedback_at; delete p.reviewed; }
      Object.assign(row, p, { updated_at: nowIso() }); persist();
      return wait(row);
    },
    async deleteAttempt(aid) { need(isTeacher()); db.attempts = db.attempts.filter((a) => a.id !== aid); persist(); },

    async listSessions({ from, to, student_id } = {}) {
      const me = meRow(); need(me);
      let rows = db.sessions.filter((s) => isTeacher() || s.student_id === me.id);
      if (from) rows = rows.filter((s) => new Date(s.starts_at) >= new Date(from));
      if (to) rows = rows.filter((s) => new Date(s.starts_at) < new Date(to));
      if (student_id) rows = rows.filter((s) => s.student_id === student_id);
      rows.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
      return wait(rows);
    },
    // Works like the database trigger: a lesson marked as done (or missed, if
    // missed lessons are charged) is recorded as held and taken from the balance.
    async saveSession(o) {
      need(isTeacher());
      const before = o.id ? db.sessions.find((s) => s.id === o.id) : null;
      const oldStatus = before ? before.status : null;
      const row = await upsert(db.sessions, o, 's', FIELDS.sessions);
      syncHeld(db.sessions.find((s) => s.id === row.id), oldStatus);
      persist();
      return wait(db.sessions.find((s) => s.id === row.id));
    },
    async addSessions(list) {
      need(isTeacher());
      const rows = list.map((o) => ({ id: id('s'), created_at: nowIso(), status: 'scheduled', ...pick(o, FIELDS.sessions) }));
      db.sessions.push(...rows);
      rows.forEach((r) => syncHeld(r, null));
      persist();
      return wait(rows);
    },
    async deleteSession(sid) {
      need(isTeacher());
      db.sessions = db.sessions.filter((s) => s.id !== sid);
      db.held_lessons.forEach((h) => { if (h.session_id === sid) h.session_id = null; });
      persist();
    },

    async createRequest(o) { db.booking_requests.unshift({ id: id('r'), created_at: nowIso(), status: 'new', ...pick(o, FIELDS.booking_requests) }); persist(); },
    async listRequests() { need(isTeacher()); return wait(db.booking_requests); },
    updateRequest(rid, patch) { need(isTeacher()); return upsert(db.booking_requests, { ...patch, id: rid }, 'r', FIELDS.booking_requests); },
    async deleteRequest(rid) { need(isTeacher()); db.booking_requests = db.booking_requests.filter((r) => r.id !== rid); persist(); },

    async listWords(student_id) { const me = meRow(); need(me && (isTeacher() || me.id === student_id)); return wait(db.words.filter((w) => w.student_id === student_id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))); },
    saveWord(o) { const me = meRow(); need(me); if (!o.id && !isTeacher()) o = { ...o, student_id: me.id }; return upsert(db.words, o, 'w', FIELDS.words); },
    async deleteWord(wid) { const me = meRow(); const w = db.words.find((x) => x.id === wid); need(w && (isTeacher() || w.student_id === me?.id)); db.words = db.words.filter((x) => x.id !== wid); persist(); },

    async getNotes(sid) { need(isTeacher()); return db.notes[sid] || ''; },
    async saveNotes(sid, body) { need(isTeacher()); db.notes[sid] = body; persist(); },

    // ----- balances -----
    async listPayments({ student_id } = {}) {
      const me = meRow(); need(me);
      let rows = db.payments.filter((p) => isTeacher() || p.student_id === me.id);
      if (student_id) rows = rows.filter((p) => p.student_id === student_id);
      rows.sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)) || String(b.created_at).localeCompare(String(a.created_at)));
      return wait(rows);
    },
    savePayment(o) { need(isTeacher()); return upsert(db.payments, o, 'p', FIELDS.payments); },
    async deletePayment(pid) { need(isTeacher()); db.payments = db.payments.filter((p) => p.id !== pid); persist(); },
    async listHeld({ student_id } = {}) {
      const me = meRow(); need(me);
      let rows = db.held_lessons.filter((h) => isTeacher() || h.student_id === me.id);
      if (student_id) rows = rows.filter((h) => h.student_id === student_id);
      rows.sort((a, b) => String(b.held_on).localeCompare(String(a.held_on)));
      return wait(rows);
    },
    saveHeld(o) { need(isTeacher()); return upsert(db.held_lessons, { status: 'held', ...o }, 'h', FIELDS.held_lessons); },
    async deleteHeld(hid) { need(isTeacher()); db.held_lessons = db.held_lessons.filter((h) => h.id !== hid); persist(); },

    // ----- emails (nothing is sent in demo mode) -----
    async emailStatus() { need(isTeacher()); return { demo: true, key_set: false, cron: false, queued: 0, sent_today: 0, failed: 0 }; },
    async listEmails() { need(isTeacher()); return []; },
    async sendTestEmail() { need(isTeacher()); throw new Error('Demo mode: emails are not sent.'); },
    async retryEmails() { need(isTeacher()); return 0; },
  };

  function syncHeld(s, oldStatus) {
    if (!s) return;
    const charged = (st) => st === 'done' || (st === 'missed' && db.settings.charge_missed === true);
    const nowCharged = s.student_id && charged(s.status);
    const wasCharged = oldStatus && charged(oldStatus);
    if (nowCharged && !wasCharged && !db.held_lessons.some((h) => h.session_id === s.id)) {
      const p = db.profiles.find((x) => x.id === s.student_id);
      const price = p && p.lesson_price != null && p.lesson_price !== '' ? Number(p.lesson_price) : Number(db.settings.default_lesson_price) || 0;
      db.held_lessons.push({ id: id('h'), created_at: nowIso(), student_id: s.student_id, session_id: s.id, lesson_id: null, held_on: s.starts_at, minutes: s.minutes, price, title: s.title, note: '', status: s.status === 'missed' ? 'missed' : 'held' });
    } else if (!nowCharged && wasCharged) {
      db.held_lessons = db.held_lessons.filter((h) => h.session_id !== s.id);
    }
  }
  return api;
}

export async function createApi(cfg) {
  // "?demo" in the address (https://dashaenglish.com/?demo) opens the website with
  // sample data kept in this browser only, to try out changes. Real data is not touched.
  const demo = new URLSearchParams(location.search).has('demo');
  if (!demo && cfg.supabaseUrl && cfg.supabaseKey) return createLiveApi(cfg);
  return createDemoApi(cfg);
}

import { S, refresh } from './core.js';
import { ask, html, openModal, toast } from './ui.js';

const ICONS = {
  Education: '📘 book|📚 books|🎓 graduation|✍️ writing|📝 notes|📐 ruler|🔬 microscope',
  Languages: '🔤 alphabet|🔠 uppercase|🗣️ speaking|🎧 listening|📖 reading|🈯 translation|🌐 world',
  Communication: '💬 conversation|💭 thought|📞 phone|✉️ mail|📣 announcement|🎙️ microphone',
  Relationships: '🤝 handshake|💞 affection|🫂 hug|👥 people|🫶 care|💌 letter',
  Psychology: '🧠 brain|🧩 puzzle|🪞 reflection|💡 idea|🧘 mindfulness|🔍 discovery',
  'Personal growth': '⭐ star|🌱 growth|🎯 goal|🪜 steps|🌟 achievement|🏆 trophy',
  Business: '💼 briefcase|🤵 professional|📊 analytics|📋 clipboard|🏢 office|📅 planning',
  Finance: '📈 investing|💰 money|💳 card|🪙 coin|🧾 receipt|🏦 bank',
  Travel: '✈️ plane|🧳 luggage|🗺️ map|🧭 compass|🚆 train|🏝️ island',
  Food: '☕ coffee|🍎 apple|🥗 salad|🍜 noodles|🍰 cake|🧑‍🍳 chef',
  Health: '🩺 doctor|💊 medicine|🫀 heart|🛌 sleep|🦷 teeth|💧 water',
  Sports: '⚽ football|🏀 basketball|🎾 tennis|🏊 swimming|🚴 cycling|🏃 running',
  Technology: '💻 computer|📱 mobile|🤖 robot|⌨️ keyboard|🛰️ satellite|⚙️ settings',
  Entertainment: '🎬 film|🎮 gaming|🎤 karaoke|🎪 circus|🍿 popcorn|🎲 dice',
  'Art and culture': '🎨 painting|🎭 theatre|🎻 music|🖼️ gallery|📷 photography|🏛️ museum',
  Environment: '♻️ recycling|🌍 earth|🌿 sustainability|🌎 globe|🚲 bicycle|🔋 energy',
  Cities: '🏙️ skyline|🌉 bridge|🚇 subway|🚦 traffic|🏘️ homes|🏪 shop',
  Nature: '🌳 tree|🌻 sunflower|⛰️ mountain|🌊 ocean|🦋 butterfly|🐾 animals',
  'Seasonal events': '🎄 Christmas tree|🎁 gift|❄️ snow|🎃 Halloween|🎆 fireworks|🌷 spring|☃️ snowman',
};

export const COLORS = ['#1f4fd1', '#1e8a5a', '#c2410c', '#7c3aed', '#0e7490', '#be185d', '#a16207', '#334155', '#2b5342'];

export function colorPicker(color) {
  return html`<fieldset><legend>Colour</legend><div class="swatches">${[...new Set([...(color ? [color.toLowerCase()] : []), ...COLORS])].map((c) =>
    html`<label class="swatch"><input type="radio" name="color" value="${c}" aria-label="${c}" ${c === color?.toLowerCase() ? 'checked' : ''}><span style="background:${c}"></span></label>`)}</div></fieldset>`;
}

export function iconPicker(value) {
  return html`<fieldset class="icon-picker"><legend>Icon</legend>
    <label>Selected or custom emoji<input name="emoji" maxlength="32" value="${value || '📘'}" required></label>
    <details><summary>Browse icons</summary>
      <label>Search icons<input type="search" data-input="icon-search" placeholder="For example, books"></label>
      <div class="icon-picker-list">${Object.entries(ICONS).map(([category, icons]) => html`
        <section><h3>${category}</h3><div class="swatches">${icons.split('|').map((item) => {
          const [emoji, ...words] = item.split(' ');
          const label = words.join(' ');
          return html`<button class="btn" type="button" data-on="icon-select" data-icon="${emoji}" data-label="${category.toLowerCase()} ${item.toLowerCase()}" aria-label="${label}" title="${label}">${emoji}</button>`;
        })}</div></section>`)}</div>
      <p data-no-icons hidden>No icons match.</p>
    </details>
  </fieldset>`;
}

export const iconPickerEvents = {
  on: { 'icon-select'(el) { el.form.elements.emoji.value = el.dataset.icon; } },
  input: {
    'icon-search'(el) {
      const picker = el.closest('.icon-picker');
      const term = el.value.trim().toLowerCase();
      let results = 0;
      for (const group of picker.querySelectorAll('section')) {
        let matches = 0;
        for (const button of group.querySelectorAll('[data-icon]')) {
          button.hidden = !button.dataset.label.includes(term);
          if (!button.hidden) matches++;
        }
        group.hidden = !matches;
        results += matches;
      }
      picker.querySelector('[data-no-icons]').hidden = !!results;
    },
  },
};

export function nextSort(rows) {
  return Math.max(-1, ...rows.map((row) => row.sort)) + 1;
}

export function moduleDialog(course, module) {
  const row = module || { title: '', description: '', emoji: '📘', color: course.color, published: false };
  const modal = openModal({
    title: module ? 'Edit module' : 'Add module',
    body: html`<form class="form" data-submit="save">
      <label>Title<input name="title" value="${row.title}" required maxlength="200"></label>
      <label>Description <span class="opt">optional</span><textarea name="description" rows="2" maxlength="1000">${row.description}</textarea></label>
      ${iconPicker(row.emoji)}${colorPicker(row.color)}
      <label class="check"><input type="checkbox" name="published" ${row.published ? 'checked' : ''}> Publish module</label>
      <div class="row-end"><button class="btn btn-primary" type="submit">Save module</button></div>
    </form>`,
    ...iconPickerEvents,
    submit: {
      async save(d) {
        await S.api.saveModule({ id: module?.id, course_id: course.id, title: d.title.trim(), description: d.description.trim(),
          emoji: d.emoji.trim() || '📘', color: d.color || COLORS[0], published: d.published,
          ...(!module && { sort: nextSort(course.course_modules) }) });
        modal.close(); toast('Module saved'); refresh();
      },
    },
  });
}

export function moveToModule(course, lesson) {
  const modal = openModal({
    title: `Move ${lesson.title} to a module`,
    body: html`<form class="form" data-submit="save">
      <label>Location<select name="module">
        <option value="">Ungrouped lessons</option>
        ${course.course_modules.map((m) => html`<option value="${m.id}" ${m.id === lesson.module_id ? 'selected' : ''}>${m.title}</option>`)}
      </select></label>
      <div class="row-end"><button class="btn btn-primary" type="submit">Move lesson</button></div>
    </form>`,
    submit: {
      async save(d) {
        const target = d.module || null;
        if (target !== (lesson.module_id || null)) {
          const sort = nextSort(course.lessons.filter((l) => (l.module_id || null) === target));
          await S.api.saveLesson({ id: lesson.id, module_id: target, sort });
        }
        modal.close(); refresh();
      },
    },
  });
}

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const teacherZone = () => localStorage.getItem('lesson-release-zone') || S.me?.timezone || localZone();
const zoneList = () => [...new Set([teacherZone(), localZone(), 'UTC', ...(Intl.supportedValuesOf?.('timeZone') || [])])];

function localStamp(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function releaseInstant(value, zone) {
  const local = Date.parse(value + 'Z');
  if (!Number.isFinite(local)) throw new Error('Choose a release date and time.');
  // Test offsets on both sides of potential daylight-saving transitions.
  const offsets = new Set([-36, 0, 36].map((hours) => {
    const sample = local + hours * 3600000;
    return Date.parse(localStamp(new Date(sample), zone) + 'Z') - sample;
  }));
  const candidates = [...offsets].map((offset) => new Date(local - offset)).filter((date) => localStamp(date, zone) === value);
  if (candidates.length !== 1) throw new Error('That time is skipped or repeated in this time zone. Choose another time.');
  return candidates[0].toISOString();
}

export function availabilityText(row, zone, prerequisiteTitle) {
  const when = row.available_at ? new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', ...(zone ? { timeZone: zone } : {}),
  }).format(new Date(row.available_at)) : '';
  if (row.state === 'scheduled') return `Scheduled for ${when}${zone ? ` (${zone})` : ''}`;
  if (row.state === 'waiting') return prerequisiteTitle ? `Waiting for completion of ${prerequisiteTitle}` : 'Waiting for prerequisite';
  if (row.state === 'unassigned') return 'Unassigned';
  if (row.state === 'hidden') return 'Assigned · hidden from student';
  return when && zone ? `Available · released ${when} (${zone})` : 'Available';
}

function releaseControls(lessons, assignment, ids) {
  const zone = teacherZone();
  const release = assignment?.available_at ? 'schedule' : assignment?.prerequisite_lesson_id ? 'prerequisite' : 'now';
  return html`<label>Availability<select name="release" data-change="release">
    <option value="now" ${release === 'now' ? 'selected' : ''}>Open now</option>
    <option value="schedule" ${release === 'schedule' ? 'selected' : ''}>Schedule release</option>
    <option value="prerequisite" ${release === 'prerequisite' ? 'selected' : ''}>After completion</option>
  </select></label>
  <div class="form" data-release="schedule" ${release !== 'schedule' ? 'hidden' : ''}>
    <label>Date and time<input type="datetime-local" name="when" value="${assignment?.available_at ? localStamp(new Date(assignment.available_at), zone) : ''}"></label>
    <label>Time zone<select name="zone">${zoneList().map((z) => html`<option value="${z}" ${z === zone ? 'selected' : ''}>${z}</option>`)}</select></label>
  </div>
  <label data-release="prerequisite" ${release !== 'prerequisite' ? 'hidden' : ''}>Prerequisite lesson
    <select name="prerequisite"><option value="">Choose a lesson</option>${lessons.filter((l) => !ids.includes(l.id)).map((l) =>
      html`<option value="${l.id}" ${l.id === assignment?.prerequisite_lesson_id ? 'selected' : ''}>${l.title}</option>`)}</select>
  </label>`;
}

function releaseChanged(el) {
  for (const item of el.form.querySelectorAll('[data-release]')) item.hidden = item.dataset.release !== el.value;
}

function releaseFields(d) {
  if (d.release === 'schedule') return { at: releaseInstant(d.when, d.zone) };
  if (d.release === 'prerequisite') {
    if (!d.prerequisite) throw new Error('Choose a prerequisite lesson.');
    return { prerequisite: d.prerequisite };
  }
  return {};
}

function filterRows(el) {
  const query = el.value.trim().toLowerCase();
  for (const row of el.form.querySelectorAll('[data-match]')) row.hidden = !row.dataset.match.includes(query);
  for (const group of el.form.querySelectorAll('[data-access-group]')) {
    group.hidden = !group.querySelector('[data-match]:not([hidden])');
    if (query && !group.hidden) group.open = true;
  }
}

function checkVisible(el, checked) {
  for (const box of el.form.querySelectorAll('[data-match]:not([hidden]) input[type="checkbox"]:not(:disabled)')) box.checked = checked;
}

function selectionTools(label, deselect = true) {
  return html`<label>${label}<input type="search" data-input="filter-access"></label>
    <div class="row-gap"><button class="btn btn-sm" type="button" data-on="select-access">Select all</button>
      ${deselect ? html`<button class="btn btn-sm" type="button" data-on="deselect-access">Deselect all</button>` : ''}</div>`;
}

async function editRelease(course, student, lesson, assignment, parent) {
  const modal = openModal({
    title: `Release for ${lesson.title}`,
    body: html`<form class="form" data-submit="release">${releaseControls(course.lessons, assignment, [lesson.id])}
      <div class="row-end"><button class="btn btn-primary" type="submit">Save release</button></div></form>`,
    change: { release: releaseChanged },
    submit: {
      async release(d) {
        await S.api.changeLessonAccess({ course: course.id, students: [student], add: [lesson.id], expected: 'selected', replace: true, ...releaseFields(d) });
        if (d.release === 'schedule') localStorage.setItem('lesson-release-zone', d.zone);
        modal.close(); parent.close(); toast('Release saved'); await manageLessonAccess(course, student);
      },
    },
  });
}

export async function manageLessonAccess(course, student) {
  const [enrollments, catalog] = await Promise.all([S.api.listEnrollments(), S.api.lessonCatalog(course.id, student)]);
  const enrollment = enrollments.find((e) => e.course_id === course.id && e.student_id === student);
  if (!enrollment) throw new Error('Enroll the student in this program first.');
  const mode = enrollment.access_mode || 'full';
  const story = Object.keys(course.story_rules || {}).length > 0;
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const initial = new Set(catalog.filter((row) => mode === 'selected' ? row.state !== 'unassigned' : row.state !== 'hidden').map((row) => row.id));
  const titles = new Map(course.lessons.map((l) => [l.id, l.title]));
  const groups = [...course.course_modules, { id: null, title: 'Ungrouped lessons' }];
  const modal = openModal({
    title: `Manage access · ${course.title}`,
    wide: true,
    body: html`<form class="form" data-submit="save-access">
      <label>Program access<select name="mode" data-change="access-mode">
        <option value="full" ${mode === 'full' ? 'selected' : ''}>Full access</option>
        <option value="selected" ${mode === 'selected' ? 'selected' : ''} ${story ? 'disabled' : ''}>Selected lessons</option>
      </select></label>
      ${story ? html`<p class="muted">Story programs use Full access so students can follow every route.</p>` : ''}
      <p class="muted" data-access-preview ${mode !== 'full' ? 'hidden' : ''}>Full access includes newly published lessons. To review a different lesson list, choose Selected lessons.</p>
      <fieldset class="form" data-access-picker ${mode === 'full' ? 'disabled' : ''}><legend>Lessons</legend>
        ${selectionTools('Search lessons')}
        ${groups.map((g) => {
          const lessons = course.lessons.filter((l) => (l.module_id || null) === g.id);
          if (!lessons.length) return '';
          return html`<details class="access-group" data-access-group ${!g.id ? 'open' : ''}><summary>${g.title}</summary>
            ${g.id ? html`<button class="btn btn-sm" type="button" data-on="select-module">Select all in module</button>` : ''}
            ${lessons.map((l) => {
              const row = byId.get(l.id);
              return html`<div class="access-row" data-match="${l.title.toLowerCase()}">
                <label class="check"><input type="checkbox" name="lessons" value="${l.id}" data-multi ${initial.has(l.id) ? 'checked' : ''}>
                  <span>${l.title}<span class="muted small access-status">${row ? availabilityText(row, teacherZone(), titles.get(row.prerequisite_lesson_id)) : 'Unassigned'}${row?.completed ? ' · Completed' : ''}</span></span></label>
                ${mode === 'selected' && initial.has(l.id) ? html`<button class="btn btn-sm" type="button" data-on="edit-release" data-id="${l.id}">Edit release</button>` : ''}
              </div>`;
            })}</details>`;
        })}
      </fieldset>
      <div class="row-end"><button class="btn btn-primary" type="submit">Save access</button></div>
    </form>`,
    input: { 'filter-access': filterRows },
    change: {
      'access-mode'(el) {
        el.form.querySelector('[data-access-picker]').disabled = el.value === 'full';
        el.form.querySelector('[data-access-preview]').hidden = el.value !== 'full';
      },
    },
    on: {
      'select-access': (el) => checkVisible(el, true),
      'deselect-access': (el) => checkVisible(el, false),
      'select-module'(el) {
        for (const box of el.closest('details').querySelectorAll('input[type="checkbox"]')) box.checked = true;
      },
      'edit-release'(el) {
        const ids = [...el.form.querySelectorAll('[name=lessons]:checked')].map((box) => box.value);
        if (el.form.elements.mode.value !== mode || ids.length !== initial.size || ids.some((id) => !initial.has(id))) {
          throw new Error('Save your access changes before editing a release.');
        }
        return editRelease(course, student, course.lessons.find((l) => l.id === el.dataset.id), byId.get(el.dataset.id), modal);
      },
    },
    submit: {
      async 'save-access'(d) {
        const selected = new Set(d.lessons || []);
        if (mode === 'full' && d.mode === 'selected') {
          const keep = course.lessons.filter((l) => selected.has(l.id)).map((l) => l.title);
          const remove = course.lessons.filter((l) => initial.has(l.id) && !selected.has(l.id)).map((l) => l.title);
          const confirmed = await ask('Confirm selected lessons', { ok: 'Switch to Selected lessons', detail:
            `Keep assigned (${keep.length}): ${keep.join(', ') || 'None'}. Remove current access (${remove.length}): ${remove.join(', ') || 'None'}. Future lessons need to be assigned individually.` });
          if (!confirmed) return;
        }
        const add = d.mode === 'selected' ? [...selected].filter((id) => mode === 'full' || !initial.has(id)) : [];
        const remove = d.mode === 'selected' ? [...initial].filter((id) => !selected.has(id)) : [];
        await S.api.changeLessonAccess({ course: course.id, students: [student], expected: mode, mode: d.mode, add, remove });
        modal.close(); toast('Access saved'); refresh();
      },
    },
  });
}

export async function assignToStudents(course, lessons, profiles, enrollments) {
  if (!lessons.length) throw new Error('Add a lesson before assigning this module.');
  const ids = lessons.map((l) => l.id);
  const enrolled = enrollments.filter((e) => e.course_id === course.id);
  const candidates = profiles.filter((p) => p.status === 'active' && p.role === 'student' && enrolled.some((e) => e.student_id === p.id));
  const status = await Promise.all(candidates.map(async (p) => {
    const full = enrolled.find((e) => e.student_id === p.id).access_mode !== 'selected';
    const rows = full ? [] : await S.api.lessonCatalog(course.id, p.id);
    const assigned = ids.filter((id) => rows.some((row) => row.id === id && row.state !== 'unassigned')).length;
    return { ...p, full, assigned };
  }));
  const modal = openModal({
    title: 'Assign to students',
    wide: true,
    body: html`<form class="form" data-submit="assign">
      <p>${lessons.length === 1 ? lessons[0].title : `${lessons.length} current lessons`}</p>
      ${selectionTools('Search students', false)}
      <div>${status.map((p) => html`<label class="check access-row" data-match="${(p.full_name || p.email).toLowerCase()}">
        <input type="checkbox" name="students" value="${p.id}" data-multi ${p.full || p.assigned === ids.length ? 'disabled' : ''}>
        <span>${p.full_name || p.email}<span class="muted small access-status">${p.full ? 'Already has Full access' :
          p.assigned ? `${p.assigned} of ${ids.length} already assigned` : 'Unassigned'}</span></span></label>`)}
        ${!status.length ? html`<p>No active students are enrolled in this program.</p>` : ''}
      </div>
      ${releaseControls(course.lessons, null, ids)}
      <div class="row-end"><button class="btn btn-primary" type="submit">Assign lessons</button></div>
    </form>`,
    input: { 'filter-access': filterRows },
    change: { release: releaseChanged },
    on: { 'select-access': (el) => checkVisible(el, true) },
    submit: {
      async assign(d) {
        if (!d.students?.length) throw new Error('Select at least one eligible student.');
        await S.api.changeLessonAccess({ course: course.id, students: d.students, add: ids, ...releaseFields(d) });
        if (d.release === 'schedule') localStorage.setItem('lesson-release-zone', d.zone);
        modal.close(); toast('Lessons assigned');
      },
    },
  });
}

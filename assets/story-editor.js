import { S, refresh } from './core.js';
import { ask, html, openModal, toast } from './ui.js';
import { adventStoryRules } from './story.js';

function validateRules(course, rules) {
  const sources = new Set();
  const parents = new Map();
  for (const [section, rule] of Object.entries(rules)) {
    const source = course.lessons.find((l) => l.materials.some((m) => m.id === section));
    if (!source || sources.has(source.id)) throw new Error('Choose one story decision section per lesson.');
    sources.add(source.id);
    for (const { lesson } of Object.values(rule.options)) {
      if (!lesson) continue;
      if (!course.lessons.some((l) => l.id === lesson) || parents.has(lesson)) {
        throw new Error('Assign each destination lesson to one choice in this program.');
      }
      parents.set(lesson, source.id);
    }
  }
  for (const target of parents.keys()) {
    const seen = new Set();
    for (let lesson = target; lesson; lesson = parents.get(lesson)) {
      if (seen.has(lesson)) throw new Error('Choose destinations that do not loop back to earlier decisions.');
      seen.add(lesson);
    }
  }
}

export function storyEditor(course, decisions, name) {
  const rules = course.story_rules || {};
  const sections = course.lessons.flatMap((l) => l.materials.map((m) => ({ ...m, lessonTitle: l.title })));
  const lessonName = (id) => course.lessons.find((l) => l.id === id)?.title || 'Next chapter coming soon';
  const sectionName = (id) => {
    const section = sections.find((m) => m.id === id);
    return section ? section.lessonTitle + ' / ' + section.title : 'Removed section';
  };
  const save = async (updated) => {
    validateRules(course, updated);
    const current = await S.api.listStoryDecisions(course.id);
    if (current.some((d) => !Object.hasOwn(updated[d.material_id]?.options || {}, d.choice))) {
      throw new Error('A student has already confirmed this choice. Reset their story choices before removing it.');
    }
    await S.api.saveCourse({ id: course.id, story_rules: updated });
    toast('Story decisions updated');
    refresh();
  };

  function dialog(sectionId = '') {
    const rule = rules[sectionId];
    const entries = Object.entries(rule?.options || { a: { label: '' }, b: { label: '' } });
    if (rule && !rule.embedded) entries.push(['', { label: '' }]);
    const choices = sections.filter((m) => m.kind === 'exercise' && (!rules[m.id] || m.id === sectionId));
    const modal = openModal({
      title: rule ? 'Edit story decision' : 'Add a story decision',
      body: html`<form class="form" data-submit="save">
        <label>Decision section<select name="section" required ${rule ? 'disabled' : ''}>
          <option value="">Choose a section</option>
          ${choices.map((m) => html`<option value="${m.id}" ${m.id === sectionId ? 'selected' : ''}>${sectionName(m.id)}</option>`)}
        </select></label>
        ${rule?.embedded ? '' : html`<label class="check"><input type="checkbox" name="only" ${rule?.only ? 'checked' : ''}> This section has no graded or written work</label>`}
        ${entries.map(([key, option], i) => html`<fieldset class="form"><legend>Choice ${i + 1}</legend>
          <label>Choice text<input name="label${i}" maxlength="250" value="${option.label}" ${rule?.embedded ? 'readonly' : ''}></label>
          <label>Next lesson<select name="lesson${i}">
            <option value="">Next chapter coming soon</option>
            ${course.lessons.map((l) => html`<option value="${l.id}" ${option.lesson === l.id ? 'selected' : ''}>${l.title}</option>`)}
          </select></label>
        </fieldset>`)}
        <div class="row-end"><button class="btn btn-primary" type="submit">Save decision</button></div>
      </form>`,
      submit: {
        async save(data) {
          const id = sectionId || data.section;
          const options = Object.fromEntries(entries.flatMap(([key], i) => {
            const label = data['label' + i].trim();
            return label ? [[key || crypto.randomUUID(), { label, lesson: data['lesson' + i] || null }]] : [];
          }));
          if (Object.keys(options).length < 2) throw new Error('Enter at least two choices.');
          await save({ ...rules, [id]: { options, only: rule?.embedded ? rule.only : !!data.only, embedded: !!rule?.embedded } });
          modal.close();
        },
      },
    });
  }

  const studentsWithDecisions = [...new Set(decisions.map((d) => d.student_id))];
  return {
    html: html`<section>
      <div class="row-between"><h2 class="section-title">Story decisions</h2>
        <div class="row-gap">
          ${sections.some((m) => m.url?.includes('2_discuss.html')) && !Object.values(rules).some((r) => r.embedded)
            ? html`<button class="btn btn-sm" data-on="story-advent">Set up Advent branching</button>` : ''}
          <button class="btn btn-sm" data-on="story-add">Add a story decision</button>
        </div>
      </div>
      ${Object.entries(rules).map(([id, rule]) => html`<div class="notice">
        <strong>${sectionName(id)}</strong>
        <ul>${Object.values(rule.options).map((option) => html`<li>${option.label} → ${lessonName(option.lesson)}</li>`)}</ul>
        <div class="row-gap">
          <button class="btn btn-sm" data-on="story-edit" data-id="${id}">Edit decision</button>
          <button class="btn btn-sm" data-on="story-remove" data-id="${id}">Remove decision</button>
        </div>
      </div>`)}
      ${studentsWithDecisions.length ? html`<h3>Confirmed student choices</h3>` : ''}
      ${studentsWithDecisions.map((id) => html`<details class="notice">
        <summary>${name(id)}</summary>
        <ul>${decisions.filter((d) => d.student_id === id).map((d) => html`
          <li><strong>${sectionName(d.material_id)}</strong><br>
            ${rules[d.material_id]?.options[d.choice]?.label || d.choice}
            ${Object.entries(d.predictions).map(([q, answer]) => html`<span class="muted small"> · Prediction ${q}: ${answer}</span>`)}
          </li>`)}</ul>
        <button class="btn btn-sm" data-on="story-reset" data-id="${id}">Reset this student's story choices</button>
      </details>`)}
    </section>`,
    on: {
      'story-add': () => dialog(),
      'story-edit': (el) => dialog(el.dataset.id),
      async 'story-advent'() {
        const preset = adventStoryRules(course.lessons);
        if (Object.keys(preset).some((id) => rules[id])) throw new Error('Remove the existing rules for these sections before setting up Advent branching.');
        await save({ ...rules, ...preset });
      },
      async 'story-remove'(el) {
        if (!(await ask('Remove this story decision?', { ok: 'Remove decision', detail: 'Its destination lessons will become visible based on their published status.' }))) return;
        const updated = { ...rules };
        delete updated[el.dataset.id];
        await save(updated);
      },
      async 'story-reset'(el) {
        const id = el.dataset.id;
        if (!(await ask('Reset all story choices for ' + name(id) + '?', { ok: 'Reset story choices', detail: 'This student can choose their path again. Their exercise results are kept.' }))) return;
        await S.api.resetStoryDecisions(course.id, id);
        toast('Story choices reset');
        refresh();
      },
    },
  };
}

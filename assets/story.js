// Shared by the demo access rules and the lesson room.
export const STORY_INSTRUCTION = 'Your choice will determine what happens in the next chapter.';
export const STORY_PENDING = 'Your choice has been saved. The next chapter is coming soon!';

export function withStoryDecisions(courses, decisions) {
  for (const course of courses) {
    for (const lesson of course.lessons) {
      for (const material of lesson.materials) {
        const rule = course.story_rules?.[material.id];
        if (rule) {
          material.story = rule;
          material.decision = decisions.find((d) => d.course_id === course.id && d.material_id === material.id);
        }
      }
    }
  }
  return courses;
}

export function storyPathOpen(course, lesson, decisions, seen = []) {
  if (!lesson?.published || seen.includes(lesson.id)) return false;
  return Object.entries(course.story_rules || {}).every(([section, rule]) => {
    if (!Object.values(rule.options).some((option) => option.lesson === lesson.id)) return true;
    const decision = decisions.find((d) => d.course_id === course.id && d.material_id === section);
    const source = course.lessons.find((l) => l.materials.some((m) => m.id === section));
    return rule.options[decision?.choice]?.lesson === lesson.id
      && storyPathOpen(course, source, decisions, [...seen, lesson.id]);
  });
}

export function storyDestination(course, material, decision = material.decision) {
  const id = material.story?.options[decision?.choice]?.lesson;
  return course.lessons.find((l) => l.id === id);
}

export function bindStoryControls(container, { material, teacher, confirm, destination, navigate, lessonHref }) {
  const button = container.querySelector('[data-story-confirm]');
  const status = container.querySelector('[data-story-status]');
  const groups = [...container.querySelectorAll('[data-story-prediction], [data-story-options]')];
  let decision = material.decision;
  let choice = decision?.choice;
  let predictions = { ...decision?.predictions };
  let saving = false;
  let active = true;

  function paint() {
    for (const group of groups) {
      const key = group.dataset.storyPrediction;
      for (const option of group.querySelectorAll('[data-story-option]')) {
        const selected = option.dataset.storyOption === (key ? predictions[key] : choice);
        option.disabled = saving || (!!decision && !teacher);
        if (option.type === 'radio') option.checked = selected;
        else {
          option.classList.toggle('selected', selected);
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-pressed', String(selected));
        }
      }
    }
    button.disabled = saving || (!decision && (!choice || groups.some((g) => g.dataset.storyPrediction && !predictions[g.dataset.storyPrediction])));
  }

  function showSaved() {
    const next = destination(decision);
    status.textContent = next ? 'Your choice has been saved.' : STORY_PENDING;
    // In an exercise frame, use the app's router through the parent callback.
    if (next) {
      const link = status.ownerDocument.createElement('a');
      link.href = lessonHref(next.id);
      link.textContent = 'Next lesson';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(next.id);
      });
      status.append(' ', link);
    }
    button.hidden = true;
  }

  function select(event) {
    const option = event.target.closest('[data-story-option]');
    if (!option || saving || decision) return;
    const group = option.closest('[data-story-prediction], [data-story-options]');
    if (!group) return;
    const key = group.dataset.storyPrediction;
    if (key) predictions[key] = option.dataset.storyOption;
    else choice = option.dataset.storyOption;
    paint();
  }

  async function save() {
    if (button.disabled || decision) return;
    if (teacher) { status.textContent = 'Open Student view to try this story choice.'; return; }
    saving = true;
    paint();
    try {
      decision = await confirm(choice, predictions);
      if (!active) return;
      choice = decision.choice;
      predictions = decision.predictions;
      showSaved();
    } catch (error) {
      if (active) status.textContent = error.message || 'Could not save your choice. Try again.';
    } finally {
      saving = false;
      if (active) paint();
    }
  }

  status.textContent = '';
  if (decision) showSaved();
  paint();
  container.addEventListener('click', select);
  container.addEventListener('change', select);
  button.addEventListener('click', save);
  return () => {
    active = false;
    container.removeEventListener('click', select);
    container.removeEventListener('change', select);
    button.removeEventListener('click', save);
  };
}

const ADVENT = [
  ['Part 3/2_discuss.html', true, {
    boyfriend: ['I want a new boyfriend.', 'Part 4/boyfriend option/1-boyfriend-listening.html'],
    car: ['I want a new car.', 'Part 4/car option/1-car-discussion.html'],
  }],
  ['Part 4/boyfriend option/2-boyfriend-reading.html', false, {
    boyfriend: ['I wish my boyfriend were more handsome and had more money.'],
    prettier: ['I wish I were prettier.'],
  }],
  ['Part 4/car option/3-car-listening.html', true, {
    'sports-car': ['Version 1 — Sports car'],
    'big-house': ['Version 2 — Big house'],
  }],
];

export function adventStoryRules(lessons) {
  const sections = lessons.flatMap((lesson) => lesson.materials.map((m) => ({ ...m, lesson: lesson.id })));
  const find = (path) => {
    const suffix = '/miro-exercises/Christmas advent/' + path;
    const matches = sections.filter((m) => {
      try { return decodeURIComponent(new URL(m.url, 'https://dashaenglish.com').pathname) === suffix; }
      catch { return false; }
    });
    if (matches.length !== 1) throw new Error('Add exactly one section for ' + path + ' before setting up Advent branching.');
    return matches[0];
  };
  return Object.fromEntries(ADVENT.map(([path, only, options]) => [
    find(path).id,
    { only, embedded: true, options: Object.fromEntries(Object.entries(options).map(([key, [label, target]]) => [
      key, { label, lesson: target ? find(target).lesson : null },
    ])) },
  ]));
}

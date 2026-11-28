import assert from 'node:assert/strict';
import { createDemoApi } from '../assets/api.js';
import { releaseInstant } from '../assets/program-management.js';
import { courseStats, progressIndex } from '../assets/core.js';
import { completePreviewSection, confirmPreviewDecision, resetStoryPreview, storyPreviewCourse } from '../assets/story-preview.js';

assert.equal(releaseInstant('2026-11-27T15:30', 'America/New_York'), '2026-11-27T20:30:00.000Z');
assert.equal(releaseInstant('2026-11-27T15:30', 'Asia/Almaty'), '2026-11-27T10:30:00.000Z');
assert.throws(() => releaseInstant('2026-03-08T02:30', 'America/New_York'), /skipped or repeated/);
assert.throws(() => releaseInstant('2026-11-01T01:30', 'America/New_York'), /skipped or repeated/);

const group = new Map();
globalThis.localStorage = {
  getItem: (key) => group.get(key) ?? null,
  setItem: (key, value) => group.set(key, value),
  removeItem: (key) => group.delete(key),
};
const teacher = 'u-dasha';
const student = 'u-maria';
const courseId = 'c-advent';
const routes = [
  ['boyfriend', 'boyfriend', 'one-boyfriend'],
  ['boyfriend', 'boyfriend', 'husband'],
  ['boyfriend', 'prettier', 'know-spanish'],
  ['boyfriend', 'prettier', 'old-body'],
  ['car', 'big-house', 'new-house'],
  ['car', 'big-house', 'beautiful-view'],
  ['car', 'sports-car', 'two-cars'],
  ['car', 'sports-car', 'one-sports-car'],
];

for (const route of routes) {
  group.clear();
  const api = createDemoApi({});
  const current = async () => (await api.tree()).find((c) => c.id === courseId);
  api.demoSwitch(teacher);
  const full = await current();
  assert.equal(full.lessons.length, 18);
  assert.equal(full.lessons.flatMap((l) => l.materials).length, 39);
  assert.equal(full.color, '#2b5342');
  await assert.rejects(api.changeLessonAccess({
    course: courseId, students: [student], expected: 'full', mode: 'selected', add: [full.lessons[0].id],
  }), /Story programs require Full access/);

  const finale = full.lessons.at(-1);
  const tryPreview = () => storyPreviewCourse(full, teacher);
  assert.equal(tryPreview().lessons.length, 3);
  const previewChoice = full.lessons[2].materials.find((m) => m.story);
  confirmPreviewDecision(full, teacher, previewChoice.id, route[0], {});
  completePreviewSection(teacher, courseId, previewChoice.id);
  assert.equal(tryPreview().lessons.length, 4);
  resetStoryPreview(teacher, courseId);
  assert.equal(tryPreview().lessons.length, 3);
  assert.equal((await api.listStoryDecisions(courseId)).length, 0);

  api.demoSwitch(student);
  const complete = async (lesson, omitLast = false) => {
    for (const material of omitLast ? lesson.materials.slice(0, -1) : lesson.materials) {
      if (material.story?.only) continue;
      await api.createAttempt({ material_id: material.id, material_title: material.title, status: 'completed' });
    }
  };
  const choose = async (lesson, choice) => {
    const material = lesson.materials.find((m) => m.story);
    assert.ok(material);
    const decision = await api.confirmStoryDecision({ course_id: courseId, material_id: material.id, choice, predictions: {} });
    assert.equal(decision.choice, choice);
    const other = Object.keys(material.story.options).find((key) => key !== choice);
    const repeated = await api.confirmStoryDecision({ course_id: courseId, material_id: material.id, choice: other, predictions: {} });
    assert.equal(repeated.choice, choice);
    return material.story.options[choice].lesson;
  };
  let open = await current();
  assert.equal(open.lessons.length, 3);
  await assert.rejects(api.createAttempt({ material_id: finale.materials[0].id, status: 'completed' }), /do not have access/);
  await complete(open.lessons[0]);
  await complete(open.lessons[1]);
  for (const [i, choice] of route.entries()) {
    const lesson = open.lessons.at(-1);
    const target = await choose(lesson, choice);
    await complete(lesson);
    open = await current();
    assert.equal(open.lessons.length, i + 4);
    assert.equal(open.lessons.at(-1).id, target);
  }
  await complete(open.lessons.at(-1), true);
  assert.equal((await current()).lessons.length, 6);
  const lastSection = open.lessons.at(-1).materials.at(-1);
  await api.createAttempt({ material_id: lastSection.id, material_title: lastSection.title, status: 'completed' });
  open = await current();
  assert.equal(open.lessons.length, 7);
  assert.equal(open.lessons.at(-1).id, finale.id);
  await complete(open.lessons.at(-1));
  const attempts = await api.listAttempts({ student_id: student });
  assert.deepEqual(courseStats(await current(), progressIndex(attempts)), { done: 7, total: 7 });
}
console.log('All eight Advent routes, shared finale, seven-lesson progress and teacher preview reset passed.');

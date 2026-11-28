// A teacher's preview has its own browser storage and uses the demo path rules.
import { storyPathOpen, withStoryDecisions } from './story.js';

const key = (teacherId, courseId) => `english-studio-story-preview:${teacherId}:${courseId}`;

function readDecisions(teacherId, courseId) {
  const stored = JSON.parse(localStorage.getItem(key(teacherId, courseId)) || '[]');
  return Array.isArray(stored) ? stored : [];
}

const completionKey = (teacherId, courseId) => key(teacherId, courseId) + ':completed';
const completed = (teacherId, courseId) => new Set(JSON.parse(localStorage.getItem(completionKey(teacherId, courseId)) || '[]'));

export function completePreviewSection(teacherId, courseId, materialId) {
  const sections = completed(teacherId, courseId);
  sections.add(materialId);
  localStorage.setItem(completionKey(teacherId, courseId), JSON.stringify([...sections]));
}

export function hasStoryPreview(course) {
  return Object.keys(course?.story_rules || {}).length > 0;
}

function publishedModules(course) {
  const course_modules = (course.course_modules || []).filter((m) => m.published);
  return { ...course, course_modules, lessons: course.lessons.filter((l) => !l.module_id || course_modules.some((m) => m.id === l.module_id)) };
}

export function storyPreviewCourse(course, teacherId) {
  course = publishedModules(course);
  const decisions = readDecisions(teacherId, course.id);
  const preview = {
    ...course,
    lessons: course.lessons.filter((lesson) => storyPathOpen(course, lesson, decisions, completed(teacherId, course.id)))
      .map((lesson) => ({ ...lesson, materials: lesson.materials.map((material) => ({ ...material })) })),
  };
  return withStoryDecisions([preview], decisions)[0];
}

export function confirmPreviewDecision(course, teacherId, materialId, choice, predictions) {
  course = publishedModules(course);
  const decisions = readDecisions(teacherId, course.id);
  const source = course.lessons.find((lesson) => lesson.materials.some((material) => material.id === materialId));
  if (!storyPathOpen(course, source, decisions, completed(teacherId, course.id)) || !Object.hasOwn(course.story_rules?.[materialId]?.options || {}, choice)) {
    throw new Error('This story choice is no longer available. Return to Student view and try again.');
  }
  const existing = decisions.find((decision) => decision.material_id === materialId);
  if (existing) return existing;
  const decision = { course_id: course.id, material_id: materialId, choice, predictions };
  localStorage.setItem(key(teacherId, course.id), JSON.stringify([...decisions, decision]));
  return decision;
}

export function resetStoryPreview(teacherId, courseId) {
  localStorage.removeItem(key(teacherId, courseId));
  localStorage.removeItem(completionKey(teacherId, courseId));
}

export function previewRoute(courseId, page, id) {
  return `preview-${page}-${courseId}/${id}`;
}

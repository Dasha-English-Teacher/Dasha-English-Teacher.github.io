// A teacher's preview has its own browser storage and uses the demo path rules.
import { storyPathOpen, withStoryDecisions } from './story.js';

const key = (teacherId, courseId) => `english-studio-story-preview:${teacherId}:${courseId}`;

function readDecisions(teacherId, courseId) {
  const stored = JSON.parse(localStorage.getItem(key(teacherId, courseId)) || '[]');
  return Array.isArray(stored) ? stored : [];
}

export function hasStoryPreview(course) {
  return Object.keys(course?.story_rules || {}).length > 0;
}

export function storyPreviewCourse(course, teacherId) {
  const decisions = readDecisions(teacherId, course.id);
  const preview = {
    ...course,
    lessons: course.lessons.filter((lesson) => storyPathOpen(course, lesson, decisions))
      .map((lesson) => ({ ...lesson, materials: lesson.materials.map((material) => ({ ...material })) })),
  };
  return withStoryDecisions([preview], decisions)[0];
}

export function confirmPreviewDecision(course, teacherId, materialId, choice, predictions) {
  const decisions = readDecisions(teacherId, course.id);
  const source = course.lessons.find((lesson) => lesson.materials.some((material) => material.id === materialId));
  if (!storyPathOpen(course, source, decisions) || !Object.hasOwn(course.story_rules?.[materialId]?.options || {}, choice)) {
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
}

export function previewRoute(courseId, page, id) {
  return `preview-${page}-${courseId}/${id}`;
}

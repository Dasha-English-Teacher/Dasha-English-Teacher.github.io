import { nextSort } from './program-management.js';
// Exercise library: Dasha's HTML exercises on GitHub, grouped by folder.
// A folder can become a lesson in one step: every file in it becomes a
// section, in the order of the file names (1-intro.html, 2-match-up.html, ...).
import { html, icon, toast, openModal, copyText, plural } from './ui.js';
import { S, go, refresh, loadLibrary, siteAddress, normUrl, folderOf, niceTitle, byName } from './core.js';

// ---------- folders ----------
export function groupFolders(items) {
  const groups = new Map();
  for (const x of items) {
    const folder = folderOf(x.file);
    const key = `${x.repo}|${folder}`;
    if (!groups.has(key)) groups.set(key, { key, repo: x.repo, folder, items: [] });
    groups.get(key).items.push(x);
  }
  const list = [...groups.values()];
  list.forEach((g) => g.items.sort((a, b) => byName(a.file, b.file)));
  return list.sort((a, b) => (a.repo === b.repo ? (a.folder === '' ? -1 : b.folder === '' ? 1 : byName(a.folder, b.folder)) : byName(a.repo, b.repo)));
}

const manyRepos = (groups) => new Set(groups.map((g) => g.repo)).size > 1;
export const folderLabel = (g, many = false) => `${many ? `${g.repo.split('/')[1]}: ` : ''}${g.folder || 'Main folder (not in a subfolder)'}`;
const folderTitle = (g) => (g.folder ? niceTitle(g.folder.split('/').pop()) : 'New lesson');

// Section title from the file name: "2-match-up.html" -> "Match up"
export const sectionTitle = (x) => niceTitle(x.file);

async function addFiles(lesson, files) {
  const start = lesson.materials ? lesson.materials.length : 0;
  await Promise.all(files.map((x, i) => S.api.saveMaterial({ lesson_id: lesson.id, kind: 'exercise', title: sectionTitle(x), url: x.url, body: '', sort: start + i })));
}

export async function createLessonFromFolder(course, group, title, module = null) {
  const module_id = module?.id || null;
  const sort = nextSort(course.lessons.filter((l) => (l.module_id || null) === module_id));
  const lesson = { course_id: course.id, module_id, title, description: '', published: true, sort };
  const sections = group.items.map((x, sort) => ({ kind: 'exercise', title: sectionTitle(x), url: x.url, body: '', sort }));
  return S.api.importLesson(lesson, sections);
}

const fileList = (files) => html`<ol class="folder-preview">${files.map((x) => html`<li><strong>${sectionTitle(x)}</strong> <span class="muted small">${x.file.split('/').pop()}</span></li>`)}</ol>`;

// New lesson from a folder. With a program: the lesson goes there. Without: choose one.
export async function lessonFromFolderDialog({ course = null, tree = null, group = null, module = null } = {}) {
  tree = tree || (await S.api.tree());
  const lib = await loadLibrary();
  const groups = groupFolders(lib.items).filter((g) => g.items.length);
  if (!groups.length) {
    openModal({ title: 'New lesson from a folder', body: html`<p>${lib.error || 'No exercise files found on GitHub yet.'}</p>` });
    return;
  }
  const many = manyRepos(groups);
  let chosen = group ? groups.find((g) => g.key === group.key) || group : groups.find((g) => g.folder) || groups[0];
  const body = () => html`<form class="form" data-submit="create">
    ${course ? html`<p class="muted">The lesson is added at the end of <strong>${module?.title || course.title}</strong>.</p>`
      : html`<label>Program<select name="course" required>${tree.map((c) => html`<option value="${c.id}">${c.title}</option>`)}</select></label>`}
    <label>Folder on GitHub<select name="folder" data-change="folder">${groups.map((g) => html`<option value="${g.key}" ${g.key === chosen.key ? 'selected' : ''}>${folderLabel(g, many)} (${plural(g.items.length, 'file')})</option>`)}</select></label>
    <label>Lesson title<input name="title" required maxlength="200" value="${folderTitle(chosen)}"></label>
    <p class="small">These files become the sections of the lesson, in this order:</p>
    <div id="folder-files">${fileList(chosen.items)}</div>
    <p class="muted small">The order comes from the file names. Start them with numbers (1-intro.html, 2-match-up.html) to choose the order. You can rename and reorder sections afterwards.</p>
    <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">Create the lesson</button></div>
  </form>`;
  const m = openModal({
    title: 'New lesson from a GitHub folder',
    wide: true,
    body: body(),
    change: {
      folder(el) {
        chosen = groups.find((g) => g.key === el.value) || chosen;
        document.getElementById('folder-files').innerHTML = fileList(chosen.items).toString();
        const t = el.form.querySelector('input[name="title"]');
        if (t) t.value = folderTitle(chosen);
      },
    },
    submit: {
      async create(d) {
        const target = course || tree.find((c) => c.id === d.course);
        if (!target) { toast('Choose a program.', 'error'); return; }
        await createLessonFromFolder(target, chosen, d.title.trim(), module);
        m.close();
        toast(`Lesson "${d.title.trim()}" created with ${plural(chosen.items.length, 'section')}`);
        if (course) refresh(); else go(`edit-program-${target.id}`);
      },
    },
  });
}

// Add one or more files to a lesson the teacher chooses.
export function addToLessonDialog(tree, files) {
  const withLessons = tree.filter((c) => c.lessons.length);
  if (!withLessons.length) {
    openModal({ title: 'Add to a lesson', body: html`<p>Create a program with at least one lesson first.</p><div class="row-end"><a class="btn btn-primary" href="#programs">Go to Programs</a></div>` });
    return;
  }
  const single = files.length === 1;
  const lessonOptions = (cid) => (withLessons.find((c) => c.id === cid)?.lessons || []).map((l) => html`<option value="${l.id}">${l.title}</option>`);
  const m = openModal({
    title: single ? 'Add to a lesson' : `Add ${files.length} files to a lesson`,
    body: html`<form class="form" data-submit="add">
      ${single ? html`<label>Section title<input name="title" value="${sectionTitle(files[0])}" required maxlength="300"></label>` : fileList(files)}
      <label>Program<select name="course" data-change="course">${withLessons.map((c) => html`<option value="${c.id}">${c.title}</option>`)}</select></label>
      <label>Lesson<select name="lesson" id="lesson-pick">${lessonOptions(withLessons[0].id)}</select></label>
      <p class="muted small">${single ? 'It is added as the last section of the lesson.' : 'They are added as the last sections of the lesson, in this order.'}</p>
      <div class="row-end"><button class="btn" type="button" data-on="close">Cancel</button><button class="btn btn-primary" type="submit">Add</button></div></form>`,
    change: { course(el) { document.getElementById('lesson-pick').innerHTML = html`${lessonOptions(el.value)}`.toString(); } },
    submit: {
      async add(d) {
        const lesson = withLessons.flatMap((c) => c.lessons).find((l) => l.id === d.lesson);
        if (!lesson) return;
        if (single) await S.api.saveMaterial({ lesson_id: lesson.id, kind: 'exercise', title: d.title.trim(), url: files[0].url, body: '', sort: lesson.materials.length });
        else await addFiles(lesson, files);
        m.close();
        toast(`Added to "${lesson.title}"`);
        refresh();
      },
    },
  });
}

// The program editor marks sections whose file is no longer on GitHub
// (renamed, moved or deleted), so they can be fixed before students notice.
export async function flagMissingFiles(root = document) {
  const lib = await loadLibrary();
  if (lib.error || !lib.items.length) return;
  const have = new Set(lib.items.map((x) => normUrl(x.url)));
  const prefixes = [...new Set(lib.items.map((x) => { const n = normUrl(x.url); return n.slice(0, n.length - x.file.length); }))];
  root.querySelectorAll('[data-check-url]').forEach((el) => {
    const n = normUrl(siteAddress(el.dataset.checkUrl));
    if (!prefixes.some((p) => n.startsWith(p)) || have.has(n)) return;
    const box = el.querySelector('.ed-mat-main');
    if (box && !box.querySelector('.chip-warn')) box.insertAdjacentHTML('beforeend', html`<span class="chip chip-warn" title="The file was renamed, moved or deleted on GitHub. Students see an empty page. Edit the link or remove this section.">File not found on GitHub</span>`.toString());
  });
}

// Grouped list for the "Add a section" dialog.
export function pickerList(lib, q) {
  if (!lib) return html`<p class="muted">Loading your exercises from GitHub…</p>`;
  if (lib.error && !lib.items.length) return html`<p class="notice notice-warn small">${lib.error}</p>`;
  const row = (x, showFolder) => html`<li><div><strong>${sectionTitle(x)}</strong><span class="muted small">${showFolder ? x.file : x.file.split('/').pop()}</span></div>
    <div class="row-gap"><a class="btn btn-sm btn-ghost" href="${x.url}" target="_blank" rel="noopener">Preview</a><button class="btn btn-sm btn-primary" data-on="pick" data-url="${x.url}" data-title="${sectionTitle(x)}">Add</button></div></li>`;
  if (q) {
    const hits = lib.items.filter((x) => `${x.title} ${x.file}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => byName(a.file, b.file));
    return hits.length ? html`<ul class="pick-list">${hits.map((x) => row(x, true))}</ul>` : html`<p class="muted">No exercises match.</p>`;
  }
  const groups = groupFolders(lib.items);
  const many = manyRepos(groups);
  return html`${groups.map((g, i) => html`<details class="lib-group" ${i < 3 || groups.length <= 4 ? 'open' : ''}>
    <summary class="lib-group-head">${icon('folder')}<strong>${folderLabel(g, many)}</strong><span class="count">${g.items.length}</span>
      ${g.items.length > 1 ? html`<button class="btn btn-sm" type="button" data-on="pick-all" data-key="${g.key}">Add all ${g.items.length}</button>` : ''}</summary>
    <ul class="pick-list">${g.items.map((x) => row(x, false))}</ul></details>`)}`;
}

// ---------- the Exercise library page ----------
export async function libraryView() {
  const [lib, tree] = await Promise.all([loadLibrary(), S.api.tree()]);
  const usedIn = new Map();
  for (const c of tree) for (const l of c.lessons) for (const mat of l.materials) {
    if (!mat.url) continue;
    const key = normUrl(siteAddress(mat.url));
    usedIn.set(key, [...(usedIn.get(key) || []), `${c.title}, ${l.title}`]);
  }
  const groups = groupFolders(lib.items);
  const many = manyRepos(groups);
  let q = '';
  const fileRow = (x, showFolder) => {
    const used = usedIn.get(normUrl(x.url)) || [];
    return html`<li><div class="lib-main"><strong>${sectionTitle(x)}</strong><span class="muted small">${showFolder ? x.file : x.file.split('/').pop()}</span>
      <span class="small ${used.length ? '' : 'muted'}">${used.length ? `Used in: ${used.join('; ')}` : 'Not used in a lesson yet'}</span></div>
      <div class="row-gap"><a class="btn btn-sm btn-ghost" href="${x.url}" target="_blank" rel="noopener">${icon('external')} Preview</a>
        <button class="btn btn-sm btn-ghost" data-on="copy" data-text="${x.url}" title="Copy the link, for example for Miro">${icon('copy')} Link</button>
        <button class="btn btn-sm" data-on="add" data-url="${x.url}">Add to a lesson</button></div></li>`;
  };
  const list = () => {
    if (!lib.items.length) return html`<p class="muted empty-sm">No HTML exercises found in your GitHub folders.</p>`;
    if (q) {
      const hits = lib.items.filter((x) => `${x.title} ${x.file}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => byName(a.file, b.file));
      return hits.length ? html`<ul class="lib-list">${hits.map((x) => fileRow(x, true))}</ul>` : html`<p class="muted empty-sm">No exercises match.</p>`;
    }
    return html`${groups.map((g) => html`<section class="lib-folder">
      <div class="lib-folder-head">${icon('folder')}<h2>${folderLabel(g, many)}</h2><span class="count">${g.items.length}</span>
        <div class="row-gap">${g.folder ? html`<button class="btn btn-sm btn-primary" data-on="folder-lesson" data-key="${g.key}">Make a lesson from this folder</button>` : ''}
          ${g.items.length > 1 ? html`<button class="btn btn-sm" data-on="folder-add" data-key="${g.key}">Add all to a lesson</button>` : ''}</div></div>
      <ul class="lib-list">${g.items.map((x) => fileRow(x, false))}</ul></section>`)}`;
  };
  const byKey = (key) => groups.find((g) => g.key === key);
  const byUrl = (url) => lib.items.find((x) => x.url === url);
  return {
    title: 'Exercise library',
    html: html`
      <div class="page-head row-between"><div><h1>Exercise library</h1>
        <p class="lede">Your HTML exercises on GitHub (${S.settings.exercise_repos}), by folder. The same exercise can be used in several lessons.</p></div>
        <button class="btn" data-on="reload">Refresh</button></div>
      ${lib.error ? html`<p class="notice notice-warn small">${lib.error}</p>` : ''}
      <details class="notice tips"><summary><strong>How to keep exercises tidy on GitHub</strong></summary>
        <ul>
          <li>Put the files of one lesson in one folder, inside a folder for the program, for example <code>phrasal-verbs/01-get-and-take/</code>. The folder name becomes the lesson title ("Get and take").</li>
          <li>Start file names with a number, in the order of the lesson: <code>1-intro.html</code>, <code>2-match-up.html</code>, <code>3-fill-in-the-gaps.html</code>. The rest of the name becomes the section title.</li>
          <li>Then press <strong>Make a lesson from this folder</strong> here: every file becomes a section, in that order.</li>
          <li>To upload a folder on GitHub: open the repository, <strong>Add file</strong>, <strong>Upload files</strong>, and drag the whole folder from your computer.</li>
          <li>Do not rename or move a file after it is used in a lesson: the lesson would lose it. Upload a new file instead. If it happens, the program editor shows "File not found on GitHub".</li>
          <li>If one exercise links to another, keep both files in the same folder and link by file name. When both are sections of the lesson, the website switches to the right section.</li>
        </ul></details>
      <input type="search" class="search-wide" placeholder="Search ${plural(lib.items.length, 'exercise')}" data-input="q" aria-label="Search exercises">
      <div id="lib-list">${list()}</div>`,
    input: { q(el) { q = el.value; document.getElementById('lib-list').innerHTML = list().toString(); } },
    on: {
      async reload() { await loadLibrary(true); refresh(); },
      copy: (el) => copyText(el.dataset.text),
      add(el) { const x = byUrl(el.dataset.url); if (x) addToLessonDialog(tree, [x]); },
      'folder-add'(el) { const g = byKey(el.dataset.key); if (g) addToLessonDialog(tree, g.items); },
      'folder-lesson'(el) { const g = byKey(el.dataset.key); if (g) lessonFromFolderDialog({ tree, group: g }); },
    },
  };
}

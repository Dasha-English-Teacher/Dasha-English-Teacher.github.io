// The embedded lesson owns navigation. Standalone exercise controls stay in the file.
export function prepareExercise(doc, frame, onEdit) {
  const declared = doc.body.dataset.lessonMode;
  const check = doc.querySelector('[data-lesson-check], button#check, button#checkAll, button#check-all')
    || [...doc.querySelectorAll('button')].find((button) => /^[✓✔]?\s*check (?:(?:my |all |the )?answers|all|everything)[.!]?$/i.test(button.textContent.trim()));
  for (const control of doc.querySelectorAll('[data-lesson-standalone]')) control.hidden = true;
  if (check && declared !== 'written') {
    check.setAttribute('data-lesson-check', '');
    check.hidden = true;
  }
  const edit = (event) => {
    if (event.type === 'click' && !event.target.closest('.choice, .option, .slot, .chip, .tf-choice, [data-value], [data-lesson-edit], #again, #reset')) return;
    if (event.target.closest('[data-story-decision]')) return;
    onEdit();
  };
  for (const type of ['input', 'change', 'click', 'drop']) doc.addEventListener(type, edit);

  const style = doc.createElement('style');
  style.textContent = `
    [hidden][data-lesson-standalone], [hidden][data-lesson-check], button[hidden][id] { display: none !important; }
    html, body { min-height: 0 !important; overflow-wrap: anywhere; }
    fieldset { min-inline-size: 0; }
    audio, img, video, textarea { max-width: 100%; }
    textarea, input:not([type=radio]):not([type=checkbox]), select { font-size: max(16px, 1em); }
    @media (max-width: 480px) {
      audio { min-width: 0; }
    }
  `;
  doc.head.append(style);

  // Resize to content on the same origin. Cross-origin frames keep native scrolling.
  const resize = () => {
    const body = doc.body;
    const height = Math.ceil(body.getBoundingClientRect().bottom + (parseFloat(doc.defaultView.getComputedStyle(body).marginBottom) || 0));
    if (height > 0) frame.style.height = height + 'px';
  };
  frame.classList.add('sec-frame-fit');
  const observer = new ResizeObserver(resize);
  observer.observe(doc.body);
  resize();
  const written = !!doc.querySelector('textarea, [contenteditable=true], input:not([type]), input[type=text]');
  return {
    mode: declared || (check ? 'graded' : written ? 'written' : 'passive'),
    async check() {
      check?.click();
      // Give reportResult's queued message time to deliver its richer answer list.
      await new Promise((resolve) => setTimeout(resolve, 60));
    },
    destroy() {
      observer.disconnect();
      for (const type of ['input', 'change', 'click', 'drop']) doc.removeEventListener(type, edit);
    },
  };
}

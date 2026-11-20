/* Add this to an exercise so it reports the score to the website:
 *   <script src="https://dasha-english-teacher.github.io/assets/report.js"></script>
 * Then, when the student checks their answers:
 *   reportResult(correctCount, totalCount);
 * Optional: pass the answers too, so the teacher sees them:
 *   reportResult(7, 10, [{ q: 'Question text', a: 'Student answer', ok: true }, ...]);
 * If the exercise has a "Show answers" button, call:
 *   reportAnswerKeyShown();
 * The functions do nothing when the exercise is opened outside the website.
 */
(function () {
  function send(msg) {
    try {
      if (window.parent && window.parent !== window) {
        msg.source = 'english-studio';
        window.parent.postMessage(msg, '*');
      }
    } catch (e) { /* ignore */ }
  }
  window.reportResult = function (score, total, answers) {
    send({ type: 'result', score: Number(score), total: Number(total), answers: Array.isArray(answers) ? answers : undefined });
  };
  window.reportAnswerKeyShown = function () { send({ type: 'revealed' }); };
})();

# Make new exercises send their score

Your current exercises already work with the website: it reads the score they show on the page.
For new exercises, add this paragraph to your request when you ask an AI to create one:

```text
Add this line just before </body>:
<script src="https://dasha-english-teacher.github.io/assets/report.js"></script>
When the student presses the main "Check answers" button, call reportResult(correctCount, totalCount).
If you can, pass the answers as a third argument: an array of objects like
{ q: "question text", a: "student's answer", ok: true or false }.
If there is a "Show answers" button, call reportAnswerKeyShown() when it is pressed.
Also show the score on the page as "Score: X / Y".
```

That's all. The exercise still works on its own (for example, when you open the file directly); the report functions simply do nothing there.

See `example-exercise.html` in this folder for a small working example.

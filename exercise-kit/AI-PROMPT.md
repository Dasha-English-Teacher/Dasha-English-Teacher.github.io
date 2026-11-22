# Instructions for the AI that makes exercises

- `CHATGPT-INSTRUCTIONS.md`: the rules for making an exercise. Upload it to the ChatGPT project's files (see `docs/CHATGPT-PROJECT-INSTRUCTIONS.md`).
- `example-exercise.html`: a small exercise (choose from a list) that follows every rule.
- `example-word-bank.html`: tap or drag words into gaps; works on phones.

New exercises load three shared files from the website:
`assets/theme.css` (colors and fonts, the same as the website), `assets/exercise.css` (ready parts: cards, buttons, word bank, right and wrong answers)
and `assets/report.js` (sends the score and the answers to the website).

Older exercises keep working: the website reads the score they show on the page.

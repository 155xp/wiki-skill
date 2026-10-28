# Explainer and study modes

Frontmatter `mode: explainer` (default) or `mode: study`. Study adds callout blocks, worked examples, practice problems with hidden answers and a common-mistakes list.

## Sub-features
Unknown mode values fall back to explainer with a warning.

## How to get to it (user POV)
Set `mode` in the note's frontmatter and render.

## Driving it with drive.js
`node .cursor/skills/verify-wiki-skill/drive.js examples/speculative-decoding-study-guide.md`. Expect `mode` `study` and sections including Worked examples and Common mistakes. The explainer example reports `mode` `explainer`.

## Gotchas
Mode never shows as text on the page; check `article.article[data-mode]`.

# Render a note to one page

`node renderer/render.js note.md > out.html` writes a page with the CSS, script and images inlined.

## Sub-features
Title and description, infobox from frontmatter, Contents from H2/H3, tables, code, figures (SVG and images embedded), light and dark from `prefers-color-scheme`.

## How to get to it (user POV)
Write a note, run the command, open the file in a browser.

## Driving it with drive.js
`node .cursor/skills/verify-wiki-skill/drive.js test/fixtures/verify/full.md --width 390 --scheme dark`. Expect exit 0, `overflowX` 0, `rendererWarnings` empty, background `rgb(19, 19, 20)` in dark and `rgb(251, 250, 249)` in light.

## Gotchas
`missing-image.md` must warn on stderr and still render, so drive.js exits 1 for it by design. Run it to confirm the warning text, not for a pass.

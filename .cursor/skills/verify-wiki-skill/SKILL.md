---
name: verify-wiki-skill
description: Verify the wiki-skill Markdown renderer (renderer/render.js) by rendering notes and driving the output page in Playwright Chromium at desktop and phone widths, light and dark. Use after changing the renderer, the CSS, page.js, the template, the examples, or SKILL.md rules that change rendered output.
---

# Verify wiki-skill

The product is a CLI that turns one Obsidian-friendly Markdown note into one self-contained HTML page: `node renderer/render.js note.md > out.html`. What a reader touches is the page in a browser. The second surface is the note itself opened in Obsidian (see `features/obsidian.md`).

## Launch

There is no server. Install once from the repo root:

```
npm install
npx playwright install chromium
```

It is ready when `node renderer/render.js examples/speculative-decoding.md > /dev/null` exits 0 with nothing on stderr. Every drive renders its own HTML file, so parallel runs never share state. Pass a different `--out` per run when runs overlap.

## Doctor

```
node -e "require('playwright'); require('markdown-it'); require('gray-matter')" && node renderer/render.js test/fixtures/verify/full.md > /dev/null && echo ok
```

`ok` with an empty stderr means the checkout is worth driving. Any stderr line is a renderer warning and counts as a failure.

## Drive

`drive.js` (next to this file) renders a note, opens it in headless Chromium and reports what a reader would see:

```
node .cursor/skills/verify-wiki-skill/drive.js <note.md> [--width 1440|390] [--scheme light|dark] [--reduce] [--popover] [--jump] [--out verify-out]
```

- `--popover` hovers the first footnote marker for 900ms and records whether `.fn-preview[data-open]` is showing, plus a viewport screenshot.
- `--jump` clicks the first footnote marker and records `location.hash` and `scrollY`.
- `--reduce` sets `prefers-reduced-motion: reduce`.

It exits 1 on a renderer warning, horizontal overflow, any `.wikilink.missing` element, or a popover that did not open. Stable handles: `article.article[data-mode]`, `nav.toc a`, `a.wikilink`, `sup a[href^="#fn"]`, `.fn-preview[data-open]`, `.jump-flash`, `table.infobox`, `#fnN .ref-text`.

Fixtures live in `test/fixtures/verify/` (one per edge case: broken links and See also pruning, empty infobox field, missing image, no footnotes, no headings, no infobox, full, explainer). The feature map in `features/` lists the journeys.

The full automated suite is `npm test` (node:test: render, design and interaction tests in Playwright). Screenshot sets: `node scripts/screenshots.js`, `node scripts/crops.js`, `python3 scripts/compare.py <frames-dir>`. Motion at 60fps: `scripts/motion/` (needs Xvfb and ffmpeg; see `docs/motion/README.md`).

## Evidence

Each drive writes `<out>/<note>-<width>-<scheme>[-reduce]{.html,.png,.json}` and `-popover.png` / `-jump.png` when asked. `verify-out/` is gitignored, so screenshots meant as public evidence are copied to `docs/screenshots/`. Proof standards:

- Render through the real CLI and look at the real page, never at markdown-it tokens alone.
- Capture the action and the result: hover then popover, click then hash and scroll position.
- Check both widths and both schemes for any CSS change, and `--reduce` for any motion change.
- Open every screenshot you cite. A passing exit code alone does not prove the page looks right.

## Cleanup

Playwright closes its own browser. Delete scratch output with `rm -rf verify-out` only after copying any evidence you need. If you started Xvfb or Obsidian for the motion or Obsidian journeys, kill those by the PID you recorded, never by name.

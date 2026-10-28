# wiki-skill

An agent skill for writing Wikipedia-style reference articles, and a small renderer that turns those articles into self-contained web pages.

The Markdown note is the source of truth. It opens cleanly in Obsidian or any Markdown viewer; the renderer builds the article page from it.

## Layout

- `skill/SKILL.md`: how to write an article: neutral voice, lead first, mechanism before history, worked examples, a glossary, and inline citations to real sources only.
- `renderer/`: `render.js` (Markdown to HTML), `template.html` and `style.css` (the page, light and dark through `prefers-color-scheme`).
- `examples/speculative-decoding.md`: a complete example article; `docs/speculative-decoding.html` is its rendered page.
- `docs/reference-notes.md`: measurements of the reference design (type, colours, layout).
- `docs/screenshots/`: rendered pages at 1440 and 390 px in light and dark, compared side by side with the reference.
- `scripts/screenshots.js`: regenerates the screenshots with Playwright (`node scripts/screenshots.js`).
- `test/`: renderer tests (`npm test`).

## Use

```sh
npm install
node renderer/render.js examples/speculative-decoding.md > article.html
npm test
```

`--articles <dir>` sets the folder used to resolve wikilinks; it defaults to the article's own folder.

## Article format

```markdown
---
title: Speculative decoding
note: "One muted line under the title."
infobox:
  - "What: one-line definition"
  - "Introduced: authors (year)"
tags: [llm-inference]
---

**Speculative decoding** is ... [^leviathan]

## Why it works

... links to [[Transformer]] ...

![Caption alt](figures/step.svg "Figure caption")

## Glossary

- **Drafter**: the cheap proposer of candidate tokens.

[^leviathan]: Leviathan, Kalman, Matias. "Fast Inference from Transformers via Speculative Decoding." arXiv:2211.17192. https://arxiv.org/abs/2211.17192
```

| Markdown | Page |
|---|---|
| `title`, `note` frontmatter | Serif title with a hairline, muted note line |
| `infobox` frontmatter (list of `"Label: value"` or a map) | Infobox floated beside the lead |
| Text before the first `##` | Lead |
| `##` and `###` headings | Numbered sections and a numbered Contents box |
| `[^label]` footnotes | Bracketed citations and a numbered References section with back links |
| `[[Page]]`, `[[Page\|text]]` | Links to `/page`; pages that do not exist yet get a distinct missing style |
| A paragraph with only a local `.svg` image | Inline SVG figure with the image title as caption |
| Tables | Bordered tables; below 40em each row stacks with its column headers as labels |
| `## Glossary` list | Rendered as ordinary Markdown |

The output is a single HTML file with inline CSS and no external requests.

## License

MIT

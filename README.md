# wiki-skill

An agent skill for writing Wikipedia-style articles in two modes, explainer (the default, for products, systems and concepts) and study (for a class or a test), and a small renderer that turns those articles into self-contained web pages.

The Markdown note is the source of truth. It opens cleanly in Obsidian or any Markdown viewer; the renderer builds the article page from it.

## Layout

- `skill/SKILL.md`: how to pick the mode and write the article. Explainer: plain-language lead, how it works in narrative order, one flow diagram, one walk-through, reference details at the end. Study: intuition, procedure, examples easy to hard, wrong/right mistakes, practice problems with hidden solutions, takeaways and exam tips. Both: citations to real sources only.
- `renderer/`: `render.js` (Markdown to HTML), `template.html`, `style.css` (light and dark through `prefers-color-scheme`), `page.js` (footnote previews, instant anchor jumps with a highlight) and `fonts/` (Schibsted Grotesk, SIL OFL, embedded into each page).
- `examples/speculative-decoding.md` (explainer) and `examples/speculative-decoding-study-guide.md` (study): complete example articles; `docs/*.html` are their rendered pages (`npm run render:example`).
- `docs/reference-notes.md`: measurements of the reference design (type, colours, layout).
- `docs/screenshots/`: rendered pages at 1440 and 390 px in light and dark, compared side by side with the reference.
- `scripts/screenshots.js`: regenerates the screenshots with Playwright (`node scripts/screenshots.js`).
- `test/`: renderer unit tests plus Playwright design and interaction tests over the fixtures in `test/fixtures/verify/` (`npm test`).

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
mode: study
description: "One muted line under the title."
infobox:
  The idea: A small model guesses; the big model checks all guesses in one step
  Memory phrase: Draft cheap, verify once
image: figures/step.svg
caption: Optional infobox image caption
tags: [llm-inference]
---

**Speculative decoding** makes a big model write faster without changing what it writes.[^leviathan]

## Intuition

... links to [[Transformer]] and [[Transformer#Attention]] ...

![Figure caption](figures/step.svg "Figure caption")

## The rule

The ==drafter== proposes and the <mark class="alt">target</mark> verifies.

## Common mistakes

> [!wrong] "Quality drops a little."
> Treating it as a quality trade.

> [!right] The output is exactly the target's.
> The acceptance rule preserves the distribution.

## Practice problems

**1.** How many tokens does one step produce if two of four drafts are accepted?

> [!solution]- Show solution
> Three.

## Key takeaways

> [!takeaways] Key takeaways
> - Lossless.

## Glossary

- **Drafter**: the cheap proposer of candidate tokens.

[^leviathan]: Leviathan, Kalman, Matias. "Fast Inference from Transformers via Speculative Decoding." arXiv:2211.17192. https://arxiv.org/abs/2211.17192
```

| Markdown | Page |
|---|---|
| `mode: explainer` (default) or `mode: study` | `data-mode` on the article; picks the outline in SKILL.md |
| `title`, `description` (or `note`) frontmatter | Serif title with a hairline, muted description line |
| `infobox` frontmatter (a map or a list of `"Label: value"`), optional `image` and `caption` | Infobox beside the lead at desktop width, after the lead on a phone; empty values hide their row; the image is the first row |
| Text before the first `##` | Lead |
| `##` and `###` headings | Sections and a numbered Contents box (headings themselves are unnumbered) |
| `[^label]` footnotes | `[n]` citations with a hover preview, and a References section with `^` or `^ a b` back-links before the citation text |
| `[[Page]]`, `[[Page\|text]]`, `[[Page#Heading]]` | Links to `/page` or `/page#heading`; a link to a page that does not exist yet is plain text |
| `## See also` list of `[[links]]` | Entries with no page behind them are dropped; the section is hidden when none are left |
| `==text==`, `<mark class="alt">text</mark>` | Two highlight colours |
| Study mode: `> [!wrong]` directly followed by `> [!right]` | Wrong and right side by side, stacked on a phone |
| Study mode: `> [!solution]- Title` | A collapsed `<details>` solution |
| Study mode: `> [!takeaways]`; any mode: `> [!tip]`, other `[!type]` | Boxed callouts; a plain `>` stays a quotation |
| A paragraph with only an image (`![alt](path "caption")` or `![[file.png]]`) | Captioned figure; SVG inlined, rasters embedded; a missing image is dropped with a warning |
| Tables | Bordered tables; on a phone each row stacks with its column headers as labels |

The output is a single HTML file with inline CSS and no external requests. A footnote cited without a definition stays plain text, and a definition that is never cited is dropped; both print a warning on stderr.

## License

MIT

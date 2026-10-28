---
name: wiki-article
description: Write a Wikipedia-style reference article as an Obsidian-friendly Markdown note, then render it to a self-contained HTML page. Use when asked to explain a technical topic as an encyclopedia entry, a wiki page, or a reference article with citations.
---

# Writing a wiki-style article

The output is one Markdown file. It must read cleanly as a plain note in Obsidian or any Markdown viewer, and it must render to a full article page with `node renderer/render.js article.md > article.html`. The Markdown file is the source of truth; never edit the generated HTML.

`examples/speculative-decoding.md` is a complete worked example of everything below.

## Voice

- Neutral and encyclopedic. Describe the subject; do not address the reader, sell the subject, or praise the sources.
- Third person, present tense for how things work, past tense for history.
- No first person, no "we", no rhetorical questions, no exclamation marks.
- Prefer a precise number with its source over an adjective. "2x to 3x on T5-XXL" beats "dramatically faster".
- Plain words. Define a term the first time it appears, in bold, and add it to the Glossary.
- No emojis, no icons, no decorative section labels.

## Structure

1. **Frontmatter** (YAML): `title`, `slug`, `note`, `infobox`, plus any metadata (`tags`, `aliases`, `created`). See the format below.
2. **Lead**: one to three paragraphs before the first heading. The first sentence names the subject in bold and says what it is. The lead must stand alone: someone who reads only the lead should know what the thing is, why it matters, and where it came from. Cite the lead's key claims.
3. **Mechanism first**: the first section explains why or how the thing works, before history, variants or tooling.
4. **Body sections**: `##` for sections, `###` for subsections. Do not number headings yourself; the renderer numbers them and builds the Contents box.
5. **Worked example**: at least one small, fully computed example a reader can check by hand, with the arithmetic shown.
6. **Limitations or criticism**: where the method fails or what it trades away.
7. **Glossary**: a `## Glossary` section as a plain Markdown list, `- **Term**: definition.`
8. **References**: footnote definitions at the end of the file. The renderer turns them into a numbered References section; do not write a References heading yourself.

Use tables for comparisons with more than two dimensions, fenced code blocks for algorithms and formulas, and lists only for genuinely parallel items.

## Citations

- Cite inline with Markdown footnotes: `...preserves the output distribution.[^leviathan]` Place the marker after punctuation.
- Every footnote must point to a real, existing source you opened while writing: a paper (arXiv id and URL), official documentation, or a repository. Never cite from memory alone, never guess a URL, never invent a paper, author, venue or number.
- Quote figures exactly as the source reports them and attribute them ("the paper reports ..."). Do not present your own estimates as measurements.
- Reuse the same footnote label for repeated citations of one source.
- Reference format: `[^label]: Authors. "Title." Venue Year. arXiv:id. URL`

## Wikilinks

Link related concepts with `[[Page name]]` or `[[Page name|shown text]]`. The renderer links them to `/<slug>` (lowercase, hyphenated). Links to articles that do not exist yet render in a distinct "missing" style, so link freely to concepts worth an article of their own; do not link common words.

## Frontmatter format

```yaml
---
title: Speculative decoding
slug: speculative-decoding
note: "One muted line shown under the title: scope, date written, and any caveat."
infobox:
  - "What: one-line definition"
  - "Introduced: authors (year)"
  - "Related: neighbouring techniques"
tags: [llm-inference]
created: 2026-10-28
---
```

Infobox rows are `"Label: value"` strings (quote them, since the value may contain a colon). Keep values plain text: Obsidian shows frontmatter as properties and does not render Markdown inside them (the renderer would, but the note should read cleanly in both). Keep it to four to eight rows of hard facts; the infobox is a summary card, not a second lead. A YAML map (`Label: value` pairs) also works, and `infobox_caption` overrides the caption, which defaults to the title.

## Checklist before finishing

- The lead stands alone and its first sentence defines the subject.
- The first section explains the mechanism.
- There is a worked example with checkable numbers.
- Every factual claim that is not common knowledge has a footnote, and every footnote URL was opened.
- The Glossary covers every bolded term.
- `node renderer/render.js article.md > out.html` runs without errors, and the Contents numbering matches the headings.

---
name: wiki-article
description: Write a Wikipedia-style article as an Obsidian-friendly Markdown note, in explainer mode (default, for products, systems and concepts) or study mode (for a class or test), then render it to a self-contained HTML page. Use when asked to explain a topic as a wiki page, encyclopedia entry, explainer or study guide with citations.
---

# Writing a wiki-style article

## Decision checklist

Work through this before and after writing. Each item is expanded further down.

1. **Mode.** Pick by intent: `mode: explainer` is the default for products, systems and concepts; `mode: study` only when the article is for a class, a course or test prep. When in doubt, explainer.
2. **Visibility.** Articles you write are private by default: `visibility: private`. Set `visibility: public` only when the owner explicitly says the article should be public.
3. **Sources first.** Read the real repos, files, papers and docs before writing. Cite every claim that is not common knowledge to a source you opened. Never invent a fact, number, URL, author or quote; if a fact is not in your sources, leave it out.
4. **Style.** No emojis. No em dashes (use a comma, colon, parentheses or a new sentence). No eyebrow labels above headings. No 01/02/03 numbering; the renderer's Contents numbering (1, 1.1, 2) is the only numbering. No icons.
5. **Quality bar.** A plain-language lead a newcomer understands on first read, intuition before definitions or formalism, and at least one fully worked walk-through with concrete values.
6. **Components.** When the content is structurally a comparison, use the component for it rather than prose (see Components).
7. **Publish.** Frontmatter has `title`, `slug`, `mode` and `visibility`; the render runs with no warnings; then follow Publishing exactly.

The output is one Markdown file. It must read cleanly as a plain note in Obsidian or any Markdown viewer, and it must render to a full article page with `node renderer/render.js article.md > article.html`. The Markdown file is the source of truth; never edit the generated HTML.

## Pick the mode first

Every article is written in one of two modes. Pick it from the request before writing, and record it in the frontmatter as `mode: explainer` or `mode: study` (missing means explainer).

- **explainer** (the default): for products, systems, techniques and concepts. The reader wants to understand what the thing is, why it exists and how it works. Use this unless the request says otherwise.
- **study**: only when the article is for a class, a course, an exam, a test or interview preparation ("study guide", "help me learn this for my exam", "practice problems"). The reader needs to be able to do it, not just follow it.

When in doubt, write an explainer. Never add practice problems, mistakes or takeaways to an explainer.

Both modes keep the Wikipedia look (title, description line, infobox, Contents, numbered references) and the same clarity rules: short paragraphs, whitespace, few inline citations in the body, References at the bottom.

`examples/speculative-decoding.md` is a complete explainer and `examples/speculative-decoding-study-guide.md` a complete study article on the same topic.

## Voice

- Plain and neutral. Explain the subject; do not sell it or praise the sources.
- Present tense for how things work, past tense for history. Avoid "we", rhetorical questions and exclamation marks. "You" is fine inside a walk-through, a procedure or a practice problem.
- Prefer a precise number with its source over an adjective. "2x to 3x on T5-XXL" beats "dramatically faster".
- Plain words. Define a term the first time it appears, in bold, and add it to the Glossary.
- Short paragraphs: two to four sentences, one idea each. Leave the whitespace in.
- No emojis, no icons, no decorative section labels, no 01/02/03 markers.

## Explainer outline

1. **Frontmatter**: `title`, `slug`, `mode: explainer`, `description`, `infobox`, plus metadata. See the format below.
2. **Lead**: plain language. The first sentence names the subject in bold and says what it is; the next says why it exists (the problem it solves). One or two citations at most.
3. **Intuition** (`## Intuition`): a short analogy or picture of why the thing works, plus only the background needed to see the problem it solves.
4. **How it works** (`## How it works`): the mechanism in narrative order, the way it actually runs, start to finish. Name the moving parts, then walk through them, with a numbered list when there are discrete stages.
5. **One flow diagram**, inside How it works: a single clear figure of the flow (boxes and arrows, an SVG next to the note), with a caption that reads on its own.
6. **One worked walk-through** (`## Walk-through`): a single concrete run with real values, every step shown, ending with what came out.
7. **Further sections** the topic needs: variants, comparisons, design choices.
8. **Reference details** at the end (`## Reference details`, with `###` subsections): tooling and support, limitations, history and attribution, glossary.
9. **References**: footnote definitions at the end of the file.

No Common mistakes, Practice problems, Key takeaways, quiz or exam-tips sections in an explainer.

## Study outline

1. **Frontmatter**: as above with `mode: study`. The infobox becomes a quick-reference card: the rule in one line, a memory phrase, when to use it, one tiny example.
2. **Lead**: one or two sentences a student gets on first read. No history in the lead.
3. **Intuition** (`## Intuition`): an analogy or picture before any formalism, with a diagram when it helps.
4. **The rule** (`## The rule`): the precise statement, its parts highlighted the way they will be in the examples.
5. **Procedure** (`## Procedure`): the method as numbered steps.
6. **Worked examples** (`## Worked examples`): at least three, easy to hard, as `### Example 1: ...`, every step shown, highlights consistent with The rule.
7. **Common mistakes** (`## Common mistakes`): wrong and right side by side, one pair per mistake.
8. **Practice problems** (`## Practice problems`): four or five, easy to hard, each with a collapsed worked solution.
9. **Key takeaways** (`## Key takeaways`): a takeaways box of three to six bullets, then an exam tips box.
10. **Further sections**, then **History** near the end, then **Glossary**.
11. **References**.

## Shared rules

Use `##` for sections and `###` for subsections. Do not number headings; the renderer builds the numbered Contents box. Do not write a References heading; the renderer adds it. Use tables for comparisons with more than two dimensions, fenced code blocks for algorithms and formulas, and lists only for genuinely parallel items. The glossary is a plain list, `- **Term**: definition.`

## Study-mode blocks

These components exist for study mode. Do not use wrong/right pairs, solutions or takeaways boxes in an explainer; highlights may be used sparingly in either mode. All of them are plain Obsidian syntax, so the note reads the same in Obsidian as on the rendered page.

Highlights. Use two colours, consistently: the first for the outer or primary part, the second for the inner or secondary part. Say in the prose which is which.

```markdown
The ==drafter== proposes tokens and the <mark class="alt">target</mark> checks them.
```

`==text==` is the first colour; `<mark class="alt">text</mark>` is the second. Do not highlight whole sentences.

Wrong and right, side by side (stacked on a phone). Put the two callouts directly after each other with no text between them:

```markdown
> [!wrong] "It approximates the big model, so quality drops."
> Treating speculative decoding as a quality-for-speed trade.

> [!right] The output is exactly the target's.
> The acceptance rule makes the final distribution identical to the target's.
```

Practice problem with a collapsed solution (`-` after the type means closed by default):

```markdown
**1.** The drafter proposes four tokens and the target accepts the first two. How many tokens does this step produce?

> [!solution]- Show solution
> Three: the two accepted tokens plus the one the target writes itself.
```

Key takeaways and tips:

```markdown
> [!takeaways] Key takeaways
> - The output distribution is unchanged.
> - Speed comes from verifying many guesses in one pass.

> [!tip] Exam and interview tips
> - Say "lossless" and explain why in one sentence.
```

Other callout types (`[!note]`, `[!warning]`) render as quiet boxes. A plain `>` blockquote stays a quotation.

## Citations

- Cite with Markdown footnotes: `...preserves the output distribution.[^leviathan]` Place the marker after punctuation.
- Keep markers light in narrative and teaching sections (How it works, the walk-through, Intuition, examples, practice): cite a claim once where it is first made, not on every line. History, numbers and comparisons always carry citations.
- Every footnote must point to a real, existing source you opened while writing: a paper (arXiv id and URL), official documentation, or a repository. Never cite from memory alone, never guess a URL, never invent a paper, author, venue or number.
- Quote figures exactly as the source reports them and attribute them ("the paper reports ..."). Do not present your own estimates as measurements.
- Reuse the same footnote label for repeated citations of one source; the reference then shows "^ a b" back-links to each citing spot.
- Reference format: `[^label]: Authors. "Title." Venue Year. arXiv:id. URL`

## Wikilinks

Link related concepts with `[[Page name]]`, `[[Page name|shown text]]` or `[[Page name#Heading]]`. The renderer links them to `/<slug>` (lowercase, hyphenated) and `/<slug>#<heading-id>`. A link to an article that does not exist yet renders as plain body text (no colour, underline or pointer), so linking ahead is harmless: link concepts worth an article of their own, and the link lights up once that article is published. Do not link common words.

Wikilinks point at titles, while files are named by slug. Put the title in `aliases` (`aliases: ["Speculative decoding (study guide)"]`) so Obsidian resolves `[[Title]]` to the slug-named file too. Titles must also work as file names and link targets: no `: / \ # ^ [ ] |`. Use parentheses for qualifiers, as in "Topic (study guide)".

A `## See also` section is a plain list of `[[wikilinks]]`, one per entry, optionally followed by a short phrase. Entries whose page does not exist are dropped from the rendered page, and the whole section is hidden when none are left, so only list pages that exist or are about to.

## Figures

- `![Caption text](figures/diagram.svg "Caption text")` or the Obsidian embed `![[diagram.svg]]`. Keep image files next to the note, or in `figures/`, `attachments/`, `images/` or `assets/`.
- A paragraph holding only an image becomes a captioned figure. SVG is inlined; PNG, JPEG, GIF and WebP are embedded so the HTML stays one file.
- A missing image is dropped with a warning on stderr; fix the path before finishing.

## Components

Renderer components and when to use each. More components and their syntax will be documented here (wiki#6); until then the available ones are wikilinks, figures, tables, footnotes, highlights, callouts, and the study-mode blocks above.

- Use a component whenever the content is structurally a comparison (a table, or a wrong/right pair in study mode), a flow (a figure), or a set of steps (a numbered list), instead of describing the structure in prose.

## Publishing

Articles are published to wiki.enci.dev from the `155xp/wiki` repository.

1. Frontmatter must have `title`, `slug` (lowercase, hyphenated; it becomes the URL), `mode` (`explainer` or `study`) and `visibility` (`private` unless the owner said public), plus `description` and `infobox`.
2. Run `node renderer/render.js article.md > /tmp/check.html` and fix every warning on stderr (missing footnotes, missing images, unknown mode).
3. **Public articles** (`visibility: public`, only with the owner's explicit say-so): copy the note to `articles/<slug>.md` in a clone of https://github.com/155xp/wiki, commit and push to `main` (or run `./publish.sh <file.md>` there, which copies, builds, commits and pushes). Vercel deploys it to `https://wiki.enci.dev/<slug>`. Check with `curl -sI https://wiki.enci.dev/<slug>` (expect 200).
4. **Private articles** (`visibility: private`, or the field missing; the default for anything you write): never commit them to `155xp/wiki`; that repository is public. Run the same `./publish.sh <file.md>`; it reads the field and publishes to the private repository `155xp/wiki-private` instead, which syncs it to private storage. The page then exists at `https://wiki.enci.dev/<slug>` for the signed-in owner only; everyone else gets a 404, and it is left out of the index and sitemap.

   > [!warning] Placeholder: private publish path (wiki#4)
   > The private path is owned by wiki#4 and may still change. Before relying on it, confirm that `publish.sh` in your clone routes private files to `155xp/wiki-private`; if it does not, keep the article local and tell the owner where the file is. Update this block when wiki#4 closes.

5. The owner can flip any article public or private live with the toggle on the page, without a new commit. Do not change visibility on your own.

6. Images referenced by the note go next to it (or in `figures/`) and are embedded by the renderer, so the published page is one file.

## Frontmatter format

```yaml
---
title: Speculative decoding
slug: speculative-decoding
aliases: [Speculative decoding, Speculative sampling]
mode: explainer
visibility: private
description: "One muted line shown under the title: scope, date written, and any caveat."
infobox:
  What it is: A way to make a large language model generate text faster with no change to its output
  How: A small model drafts several tokens; the large model checks them all in one pass
  Typical speedup: 2x to 3x for single-sequence decoding
  Introduced: "Leviathan, Kalman and Matias (2022)"
image: figures/diagram.svg
caption: "Optional infobox image caption"
tags: [llm-inference]
created: 2026-10-28
---
```

- `aliases`: always include the title, so `[[Title]]` links resolve in Obsidian to the slug-named file; add other names people search for.
- `mode`: `explainer` (default) or `study`. Any other value falls back to explainer with a warning. It never shows on the page.
- `visibility`: `private` (default for articles an agent writes) or `public` (only when the owner says so). Used by the publishing site; see Publishing.
- `infobox`: four to eight short rows. In an explainer, hard facts (what it is, how, key numbers, introduced by, where it is supported); in study mode, the quick-reference card. Keep values short and plain text (Obsidian shows frontmatter as properties); no long formulas that would be cramped or cut off at phone width. Quote a value that contains a colon. Rows with an empty value are skipped. A list of `"Label: value"` strings also works, and `infobox_caption` overrides the caption, which defaults to the title.
- `image` and `caption` are optional and show as the first infobox row.

## Checklist before finishing

All articles:

- The mode is set in the frontmatter and matches the request; `visibility` is set (private unless the owner said public).
- No emojis, no em dashes, no eyebrow labels, no 01/02 numbering.
- The first sentence of the lead defines the subject in plain words; nothing in the infobox is cut off at phone width.
- Every factual claim that is not common knowledge has a footnote, and every footnote URL was opened.
- History and attribution are near the end, not in the lead.
- The Glossary covers every bolded term.
- `node renderer/render.js article.md > out.html` runs with no warnings, and the note reads cleanly in Obsidian.

Explainer:

- Intuition comes before the mechanism; How it works follows the order things actually happen, with exactly one flow diagram.
- There is one walk-through with concrete values and its result.
- Reference details (tooling, limitations, history, glossary) are at the end.
- No mistakes, practice, takeaways or exam-tips sections.

Study:

- Intuition comes before the formal rule; the procedure is a numbered list.
- At least three worked examples, easy to hard, highlights consistent with The rule.
- Common mistakes are wrong/right pairs; practice problems have collapsed solutions; there is a takeaways box and exam tips.

# Reference notes

Measurements taken from the reference screen recording: 57 extracted frames at 1728 × 1080 plus the source video. Every frame was viewed on contact sheets; frames 9, 22 and 34 were also examined at full size. Colours were sampled with PIL from the frame pixels, so text colours are anti-aliased peaks rather than declared CSS values. The reference is dark only; the light palette below is derived, not sampled.

## Page structure (top to bottom)

1. Serif article title, a 1px hairline rule under it.
2. A muted one-line note under the title.
3. Lead paragraphs in a sans body face, with the infobox floated right and top-aligned with the first lead line.
4. A bordered Contents box on the left under the lead: bold centred heading, numbered links, the box only as wide as its widest entry.
5. Numbered serif H2 section headings ("1. Why it works"), each with a hairline rule under it, and H3 subsections.
6. Bordered tables with a raised header row, monospaced code blocks on a raised surface, inline figures with muted captions.
7. A Glossary section and a References section at the end.

Sections in the reference article: Why it works, Verification rule, Tokens per step, Verification variants, Drafter families, How drafters are trained, Worked example, Libraries and engines, Batching and MoE effects, Research frontier, Learning path, Glossary, References. Contents numbering runs 1 to 14.

## Colours

| Role | Dark (sampled) | Light (derived) |
|---|---|---|
| Page background | `#161616` | `#ffffff` |
| Raised surface: infobox cells, Contents box, code blocks, table header, inline code | `#1c1c1c` | `#f6f6f6` |
| Borders and hairlines | `#303030` | `#d4d4d4` |
| Body text | `#ededed` (peak `#f3f3f3`) | `#1a1a1a` |
| Title | `#e1e1e1` (peak `#efefef`) | `#111111` |
| Muted text: note, captions | `#9a9a9a` to `#a1a1a1` | `#5f5f5f` |
| Links | `#8ab4f8` (sampled `#8ab4ff`) | `#1a56c4` |
| Missing-article link | not in reference | `#c53d2d` (dark `#f98473`) |
| "Yes" cell text in tables | `#4dbc9b` | `#13795b` |
| "No" cell text in tables | `#f98473` | `#c53d2d` |

The light palette keeps the same roles and roughly the same contrast steps: surface one step off the page, border clearly visible but quiet, muted text near 6:1 on white, links a saturated blue that meets 4.5:1.

Infobox rows are separated by page-coloured gaps (`#161616`) between `#1c1c1c` cells, which reads as 1px row borders at normal zoom.

## Type

Measured in frame pixels, then converted assuming a 16px body (about 1.41 frame px per CSS px):

| Measure | Frame px | CSS estimate |
|---|---|---|
| Title glyph run (cap top to descender) | 45 | title about 33px; 2.1 × body |
| Body glyph run | 21 | 16px |
| Lead line pitch | 36 | line-height about 1.6 |
| Note glyph run / pitch | 18 / 31 | about 14px, line-height 1.55 |
| Contents entry pitch | about 35.5 | about 25px per entry |

Title and H2s are a serif; body, infobox, Contents and note are a sans; code is monospaced.

## Layout

| Measure | Frame px | CSS estimate |
|---|---|---|
| Lead text column, left edge to right edge | 225 to 1192 | about 685px text beside the infobox |
| Infobox | 1232 to 1682 (about 450) | about 320px wide |
| Gap between lead and infobox | about 40 | about 28px |
| Contents box | 225 to 700 (about 475) | shrink-wrapped, about 335px here |
| Full article content width | about 1458 | about 1030px |
| Title rule | y 210 to 211 | 1px |

At narrow widths the infobox should stack above the lead at full width, and the Contents box should remain shrink-wrapped but never exceed the viewport.

# Wikilinks and See also pruning

`[[Page]]`, `[[Page|text]]`, `[[Page#Heading]]` link to `/<slug>`. A page that does not exist renders as plain body text. See also drops entries with no page and hides the section when none are left.

## Sub-features
Known pages come from files next to the note plus their frontmatter `slug`, `title` and `aliases`.

## How to get to it (user POV)
Link ahead to a page you have not written; read the rendered paragraph and the See also list.

## Driving it with drive.js
`node .cursor/skills/verify-wiki-skill/drive.js test/fixtures/verify/broken-link.md`. Expect `missingLinkElements` 0, every `wikilinks` href pointing at an existing page (`/full`), and `See also` in `sections` holding only the Full entry. The See also list must not contain "Never written" (it still appears as plain text in the infobox row, which is correct).

## Gotchas
The known set depends on the note's directory, so copy a fixture together with its neighbours.

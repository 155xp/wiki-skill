# Footnote popover and jumps

Hovering a citation marker shows the reference after 700ms (125ms enter, 100ms exit, instant for a second marker within 300ms). Clicking jumps instantly to the reference and flashes it for 700ms. Repeated citations show "^ a b" back-links.

## Sub-features
Popover shows the reference text only, no back-links. Reduced motion keeps an opacity fade and drops the scale.

## How to get to it (user POV)
Hover or tap a superscript number in the body.

## Driving it with drive.js
`node .cursor/skills/verify-wiki-skill/drive.js examples/speculative-decoding.md --popover --jump`. Expect `popoverVisible` true, `jumpTarget` `#fn1`, `scrolledTo` greater than 0, and the popover screenshot showing citation text over the body.

## Gotchas
Timing claims need `test/interaction.test.js` or the 60fps recording in `docs/motion/`; a screenshot cannot prove durations.

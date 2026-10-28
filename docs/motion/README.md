# Motion evidence

`motion.mp4` is a 60fps screen recording (Xvfb 1440x900, headed Chromium, ffmpeg x11grab) of `docs/speculative-decoding.html` driven by `scripts/motion/drive.js`, first with no motion preference and then with `prefers-reduced-motion: reduce`. `scripts/motion/analyze.py` matches each logged action to frames and reports which frames changed in the affected region. Raw output is in `analysis.txt`. One frame is about 16.7ms, so each timing below is accurate to one frame.

| Interaction | Target | Measured | Reduced motion |
|---|---|---|---|
| Link hover colour | 160ms | 10 frames, about 160ms | 1 frame (no transition) |
| Link leave colour | 160ms | 10 frames, about 160ms | 1 frame |
| Footnote popover first open | 700ms delay, then 125ms enter from scale(0.97) | first change at +700ms, 8 frames | first change at +717ms, 8 frames (opacity only) |
| Popover on a second marker within 300ms | instant | 2 frames | 3 frames |
| Popover close | 100ms | 7 frames, about 100ms | 6 frames |
| Contents, footnote and back-link jumps | instant jump, then a 700ms highlight that fades | one frame changes 23 to 41% of the screen, then under 3.1% per frame for the fade (visible for 32 frames; the eased tail drops below one grey level) | same |
| Tab focus ring | 0ms | 1 frame | 1 frame |

The jump result shows there is no smooth scrolling: the whole page moves in a single frame and only the highlight changes afterwards. Motion durations are also asserted in `test/interaction.test.js` with `Element.getAnimations()` and computed transitions.

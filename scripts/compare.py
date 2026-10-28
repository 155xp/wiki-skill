#!/usr/bin/env python3
"""Side-by-side composites: a reference video frame (left) next to our render (right).
Usage: python3 scripts/compare.py <frames-dir> [screenshots-dir]
Frames are cropped to the browser content area (200,80,1728,1080) of the 1728x1080 frames."""
import os, sys
from PIL import Image

frames = sys.argv[1]
shots = sys.argv[2] if len(sys.argv) > 2 else 'docs/screenshots'
pairs = {'top': 'f_009.png', 'figure': 'f_022.png', 'table': 'f_034.png'}
GAP, H = 24, 900

def frame(name):
    im = Image.open(os.path.join(frames, name)).convert('RGB')
    if im.size == (1728, 1080):
        im = im.crop((200, 80, 1728, 1080))
    return im.resize((round(im.width * H / im.height), H), Image.LANCZOS)

for width in (1440, 390):
    for scheme in ('light', 'dark'):
        for part, f in pairs.items():
            ours = Image.open(os.path.join(shots, f'explainer-{width}-{scheme}-{part}.png')).convert('RGB')
            if ours.height != H:
                ours = ours.resize((round(ours.width * H / ours.height), H), Image.LANCZOS)
            ref = frame(f)
            bg = (19, 19, 20) if scheme == 'dark' else (251, 250, 249)
            out = Image.new('RGB', (ref.width + GAP + ours.width, H), bg)
            out.paste(ref, (0, 0))
            out.paste(ours, (ref.width + GAP, 0))
            path = os.path.join(shots, f'compare-{width}-{scheme}-{part}.png')
            out.save(path, optimize=True)
            print(path, out.size)

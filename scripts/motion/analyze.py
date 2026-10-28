import json, subprocess, numpy as np
# Run from docs/motion/ after recording: needs log.json and rec.mkv (ffmpeg x11grab, 60fps) there.
W, H = 1440, 900
log = json.load(open('log.json'))
proc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', 'rec.mkv', '-vf', 'fps=60', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
frames = []
prev = None
diffs = []  # per frame: full-res abs diff map summarised later on demand
store = []
while True:
    b = proc.stdout.read(W * H)
    if len(b) < W * H: break
    f = np.frombuffer(b, np.uint8).reshape(H, W).astype(np.int16)
    frames.append(f[300:600, 300:1100].mean())
    if prev is None: store.append(None)
    else:
        d = np.abs(f - prev)
        # downsample diff to 8x8 blocks (max) to keep memory small
        store.append(d.reshape(H // 4, 4, W // 4, 4).max(axis=(1, 3)).astype(np.uint8))
    prev = f
n = len(frames)
bright = np.array(frames)
# calibration: frames where the screen is almost black
dark = np.where(bright < 10)[0]
runs = np.split(dark, np.where(np.diff(dark) > 1)[0] + 1)
print([(int(r[0]),len(r)) for r in runs]); cal = [r[0] for r in runs if 10 < len(r) < 30]
OY = 87  # browser toolbar height in the capture
print('frames', n, 'calibration black runs start at frames', cal)
blocks = {}
for i, motion in enumerate(['no-preference', 'reduce']):
    t_on = [e['t'] for e in log if e['name'] == 'cal-on' and e['motion'] == motion][0]
    blocks[motion] = (cal[i], t_on)

def frame_of(e):
    f0, t0 = blocks[e['motion']]
    return f0 + round((e['t'] - t0) * 60 / 1000)

def changes(start, count, region=None, thr=1):
    out = []
    for k in range(start, min(start + count, n)):
        d = store[k]
        if d is None: continue
        if region:
            x0, y0, x1, y1 = [max(0, int(v // 4)) for v in (region[0], region[1] + OY, region[2], region[3] + OY)]
            d = d[y0:y1, x0:x1]
        out.append(k if (d >= thr).any() else None)
    return [k for k in out if k is not None]

def runs_of(ks):
    if not ks: return []
    rs, s, p = [], ks[0], ks[0]
    for k in ks[1:]:
        if k > p + 2: rs.append((s, p)); s = k
        p = k
    rs.append((s, p)); return rs

def report(e, count, region=None, label=''):
    f = frame_of(e)
    rs = runs_of(changes(f - 3, count, region))
    desc = ', '.join(f'+{(a - f) * 1000 / 60:.0f}ms..+{(b - f) * 1000 / 60:.0f}ms ({b - a + 1} frames)' for a, b in rs)
    print(f"{e['motion']:13s} {e['name']:11s} {label:28s} {desc}")

for e in log:
    r = e.get('r')
    if e['name'] in ('link-hover', 'link-leave'):
        report(e, 40, (r['x'] - 4, r['y'] - 4, r['x'] + r['w'] + 4, r['y'] + r['h'] + 4), 'link region')
    elif e['name'] in ('pop-hover', 'pop-peer', 'pop-leave', 'pop-leave2'):
        report(e, 110, (r['x'] - 500, r['y'] + r['h'] + 6, r['x'] + 500, r['y'] + 320), 'popover area below marker')
    elif e['name'] in ('toc-jump', 'fn-jump', 'back-jump'):
        report(e, 70, None, 'whole screen')
        f = frame_of(e)
        ks = changes(f - 3, 10)
        print('   changed-pixel share of the first frames:', [f"{(store[k] >= 1).mean():.3f}" for k in ks[:6]])
    elif e['name'] == 'tab':
        report(e, 20, None, 'whole screen')

// Drives headed Chromium on an Xvfb display while ffmpeg records it at 60fps.
// Logs each action with Date.now() so frames can be matched to actions.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '../../docs/speculative-decoding.html');
const log = [];
const mark = (name, extra = {}) => log.push({ name, t: Date.now(), ...extra });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--kiosk', '--window-position=0,0', '--window-size=1440,900', '--disable-gpu-vsync'] });
  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: null, colorScheme: 'light', reducedMotion: motion });
    const p = await ctx.newPage();
    await p.goto(file);
    await p.evaluate(() => document.fonts.ready);
    await wait(800);
    const rect = async (sel, n = 0) => p.evaluate(([s, i]) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [sel, n]);
    // calibration: a full-screen black overlay toggled on and off
    await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cal'; d.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999'; document.body.appendChild(d); });
    mark('cal-on', { motion });
    await wait(300);
    await p.evaluate(() => document.getElementById('cal').remove());
    mark('cal-off', { motion });
    await wait(500);
    // link hover
    const link = await rect('.lead a.wikilink');
    await p.mouse.move(link.x + 10, link.y + link.h / 2);
    mark('link-hover', { motion, r: link });
    await wait(600);
    await p.mouse.move(1400, 880);
    mark('link-leave', { motion, r: link });
    await wait(600);
    // popover: first open waits 700ms, then a peer inside the skip window, then exit
    const c0 = await rect('sup.cite a', 0);
    const c1 = await rect('sup.cite a', 1);
    await p.mouse.move(c0.x + c0.w / 2, c0.y + c0.h / 2);
    mark('pop-hover', { motion, r: c0 });
    await wait(1500);
    await p.mouse.move(1400, 880);
    mark('pop-leave', { motion, r: c0 });
    await wait(150);
    await p.mouse.move(c1.x + c1.w / 2, c1.y + c1.h / 2);
    mark('pop-peer', { motion, r: c1 });
    await wait(1000);
    await p.mouse.move(1400, 880);
    mark('pop-leave2', { motion, r: c1 });
    await wait(1200);
    // contents jump + flash
    await p.click('.toc a >> nth=2');
    mark('toc-jump', { motion });
    await wait(1500);
    // footnote jump + back-link
    await p.evaluate(() => window.scrollTo(0, 0));
    await wait(500);
    await p.click('sup.cite a >> nth=0');
    mark('fn-jump', { motion });
    await wait(1500);
    await p.click('.references li >> nth=0 >> .backrefs a >> nth=1');
    mark('back-jump', { motion });
    await wait(1500);
    // keyboard focus tour
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.mouse.move(1400, 880);
    await wait(500);
    for (let i = 0; i < 4; i++) {
      await p.keyboard.press('Tab');
      mark('tab', { motion, i });
      await wait(500);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.resolve(__dirname, '../../docs/motion/log.json'), JSON.stringify(log, null, 1));
})();

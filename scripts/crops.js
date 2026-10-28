#!/usr/bin/env node
'use strict';
// 3x element crops and link/marker states (rest, hover, pressed, focus-visible), light and dark.
// Usage: node scripts/crops.js [outdir]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { renderArticle } = require('../renderer/render.js');

const out = path.resolve(process.argv[2] || 'docs/screenshots/crops');
fs.mkdirSync(out, { recursive: true });
const fixtures = path.resolve('test/fixtures/verify');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-crops-'));
const broken = path.join(tmp, 'broken-link.html');
fs.writeFileSync(broken, renderArticle(fs.readFileSync(path.join(fixtures, 'broken-link.md'), 'utf8'), { articlesDir: fixtures, baseDir: fixtures, onWarn: () => {} }));
const explainer = path.resolve('docs/speculative-decoding.html');
const study = path.resolve('docs/speculative-decoding-study-guide.html');

const pad = (b, p = 12) => ({ x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: b.width + 2 * p, height: b.height + 2 * p });

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    const shot = async (name, sel, padding) => {
      const el = p.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      await p.screenshot({ path: path.join(out, `${name}-${scheme}.png`), clip: pad(b, padding) });
    };
    await p.goto('file://' + explainer);
    await shot('infobox', '.infobox');
    await shot('contents', '.toc');
    await shot('marker', 'sup.cite', 40);
    await shot('backlinks', '.references li');
    // link and marker states
    for (const [what, sel] of [['link', '.lead a.wikilink'], ['marker', 'sup.cite a']]) {
      const el = p.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const clip = pad(await el.boundingBox(), 24);
      await p.mouse.move(2, 2);
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(out, `state-${what}-rest-${scheme}.png`), clip });
      await el.hover();
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(out, `state-${what}-hover-${scheme}.png`), clip });
      await p.mouse.down();
      await p.screenshot({ path: path.join(out, `state-${what}-pressed-${scheme}.png`), clip });
      await p.mouse.move(2, 2);
      await p.mouse.up();
      await p.goto('file://' + explainer);
      await el.scrollIntoViewIfNeeded();
      // keyboard focus: focus the element through the keyboard path
      await p.evaluate((s) => { const t = document.querySelector(s); t.setAttribute('tabindex', '-1'); t.focus(); t.removeAttribute('tabindex'); }, sel);
      await p.keyboard.press('Shift+Tab');
      await p.keyboard.press('Tab');
      await p.waitForTimeout(50);
      await p.screenshot({ path: path.join(out, `state-${what}-focus-${scheme}.png`), clip });
      await p.keyboard.press('Escape');
    }
    await p.goto('file://' + broken);
    await shot('links-existing-vs-missing', '.lead p');
    await shot('see-also-pruned', '#see-also', 80);
    await ctx.close();
    const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 3 });
    const q = await narrow.newPage();
    await q.goto('file://' + explainer);
    let el = q.locator('table:not(.infobox)').first();
    await el.scrollIntoViewIfNeeded();
    await q.screenshot({ path: path.join(out, `table-390-${scheme}.png`), clip: pad(await el.boundingBox(), 8) });
    await q.goto('file://' + study);
    el = q.locator('pre').first();
    await el.scrollIntoViewIfNeeded();
    await q.screenshot({ path: path.join(out, `code-390-${scheme}.png`), clip: pad(await el.boundingBox(), 8) });
    await narrow.close();
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fs.readdirSync(out).length, 'crops in', out);
})();

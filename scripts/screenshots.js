#!/usr/bin/env node
'use strict';
// Screenshots of the rendered examples at 1440 and 390, light and dark, plus
// viewport crops used for the side-by-side comparisons and interaction close-ups.
// Usage: node scripts/screenshots.js [outdir]
const path = require('node:path');
const { chromium } = require('playwright');

const out = path.resolve(process.argv[2] || 'docs/screenshots');
const pages = {
  explainer: path.resolve('docs/speculative-decoding.html'),
  study: path.resolve('docs/speculative-decoding-study-guide.html'),
};

async function scrollTo(p, sel) {
  await p.evaluate((s) => {
    const el = document.querySelector(s);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24);
  }, sel);
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, file] of Object.entries(pages)) {
    for (const width of [1440, 390]) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme });
        const p = await ctx.newPage();
        await p.goto('file://' + file);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const base = path.join(out, `${name}-${width}-${scheme}`);
        await p.screenshot({ path: `${base}.png`, fullPage: true });
        await p.screenshot({ path: `${base}-top.png` });
        await scrollTo(p, 'table:not(.infobox)');
        await p.screenshot({ path: `${base}-table.png` });
        await scrollTo(p, '.figure');
        await p.screenshot({ path: `${base}-figure.png` });
        if (name === 'study') {
          await scrollTo(p, '.compare, .callout');
          await p.screenshot({ path: `${base}-blocks.png` });
        }
        await scrollTo(p, '#references');
        await p.screenshot({ path: `${base}-refs.png` });
        console.log(`${base} horizontal-overflow=${overflow}px`);
        await ctx.close();
      }
    }
  }
  // interaction close-ups on the explainer at 1440
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto('file://' + pages.explainer);
    const cite = p.locator('sup.cite a').first();
    await cite.scrollIntoViewIfNeeded();
    await cite.hover();
    await p.waitForTimeout(1000);
    const box = await cite.boundingBox();
    await p.screenshot({ path: path.join(out, `interaction-popover-${scheme}.png`), clip: { x: Math.max(0, box.x - 420), y: Math.max(0, box.y - 260), width: 900, height: 560 } });
    await p.mouse.move(5, 5);
    await p.waitForTimeout(400);
    await cite.click();
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(out, `interaction-flash-${scheme}.png`) });
    await ctx.close();
  }
  await browser.close();
})();

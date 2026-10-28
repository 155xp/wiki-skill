#!/usr/bin/env node
'use strict';
// Full-page screenshots of the rendered example at 1440 and 390, light and dark.
// Usage: node scripts/screenshots.js [page.html] [outdir]
const path = require('node:path');
const { chromium } = require('playwright');

const page = path.resolve(process.argv[2] || 'docs/speculative-decoding.html');
const out = path.resolve(process.argv[3] || 'docs/screenshots');

(async () => {
  const browser = await chromium.launch();
  for (const width of [1440, 390]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      });
      const p = await ctx.newPage();
      await p.goto('file://' + page);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = path.join(out, `render-${width}-${scheme}.png`);
      await p.screenshot({ path: file, fullPage: true });
      await p.screenshot({ path: path.join(out, `render-${width}-${scheme}-top.png`) });
      console.log(`${file} horizontal-overflow=${overflow}px`);
      await ctx.close();
    }
  }
  await browser.close();
})();

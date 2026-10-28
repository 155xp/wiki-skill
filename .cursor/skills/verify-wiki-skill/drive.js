#!/usr/bin/env node
// Render one Markdown note and drive the page in Playwright Chromium.
// usage: node .cursor/skills/verify-wiki-skill/drive.js <note.md> [--width 1440] [--scheme light|dark]
//        [--reduce] [--popover] [--jump] [--out verify-out]
// Writes <out>/<name>-<width>-<scheme>.html, .png (full page), report JSON, and
// -popover.png / -jump.png when asked. Exits 1 if the renderer warned or a check failed.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const note = args.find((a) => a.endsWith('.md'));
if (!note) { console.error('usage: drive.js <note.md> [--width N] [--scheme light|dark] [--reduce] [--popover] [--jump] [--out dir]'); process.exit(2); }
const width = Number(opt('width', '1440'));
const scheme = opt('scheme', 'light');
const out = path.resolve(opt('out', 'verify-out'));
fs.mkdirSync(out, { recursive: true });
const base = path.join(out, `${path.basename(note, '.md')}-${width}-${scheme}${flag('reduce') ? '-reduce' : ''}`);

const repo = path.resolve(__dirname, '../../..');
const res = spawnSync('node', [path.join(repo, 'renderer/render.js'), path.resolve(note)], { encoding: 'utf8' });
if (res.status !== 0) { console.error(res.stderr); process.exit(1); }
const html = res.stdout;
const warnings = res.stderr.trim();
fs.writeFileSync(base + '.html', html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: flag('reduce') ? 'reduce' : 'no-preference' });
  await page.goto('file://' + base + '.html');
  const report = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    mode: document.querySelector('article.article')?.dataset.mode,
    background: [document.documentElement, document.body, document.querySelector('main')].map((e) => getComputedStyle(e).backgroundColor).find((c) => c !== 'rgba(0, 0, 0, 0)'),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    sections: [...document.querySelectorAll('article h2')].map((h) => h.textContent),
    tocEntries: document.querySelectorAll('nav.toc a').length,
    wikilinks: [...document.querySelectorAll('a.wikilink')].map((a) => a.getAttribute('href')),
    missingLinkElements: document.querySelectorAll('.wikilink.missing').length,
    footnoteMarkers: document.querySelectorAll('sup a[href^="#fn"]').length,
  }));
  report.rendererWarnings = warnings;
  await page.screenshot({ path: base + '.png', fullPage: true });
  if (flag('popover') && report.footnoteMarkers) {
    const m = page.locator('sup a[href^="#fn"]').first();
    await m.scrollIntoViewIfNeeded();
    await m.hover();
    await page.waitForTimeout(900);
    report.popoverVisible = await page.evaluate(() => [...document.querySelectorAll('[role="tooltip"], .fn-popover, .popover')].some((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0'));
    await page.screenshot({ path: base + '-popover.png' });
  }
  if (flag('jump') && report.footnoteMarkers) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('sup a[href^="#fn"]').first().click();
    await page.waitForTimeout(100);
    report.jumpTarget = await page.evaluate(() => location.hash);
    report.scrolledTo = await page.evaluate(() => scrollY);
    await page.screenshot({ path: base + '-jump.png' });
  }
  fs.writeFileSync(base + '.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  const failed = report.rendererWarnings || report.overflowX > 0 || report.missingLinkElements > 0 || report.popoverVisible === false;
  process.exit(failed ? 1 : 0);
})();

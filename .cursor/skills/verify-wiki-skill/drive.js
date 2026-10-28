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
    hasContents: !!document.querySelector('nav.toc'),
    tocTexts: [...document.querySelectorAll('nav.toc a')].map((a) => a.textContent.trim()),
    hasReferences: [...document.querySelectorAll('article h2')].some((h) => h.textContent.trim() === 'References'),
    hasSeeAlso: [...document.querySelectorAll('article h2')].some((h) => h.textContent.trim() === 'See also'),
    infoboxRows: document.querySelectorAll('table.infobox tr th + td').length,
    emptyInfoboxRows: [...document.querySelectorAll('table.infobox tr td')].filter((td) => !td.textContent.trim() || /^[\u2014-]$/.test(td.textContent.trim())).length,
    hasInfobox: !!document.querySelector('table.infobox'),
    figures: document.querySelectorAll('article figure').length,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
  }));
  report.rendererWarnings = warnings;
  await page.screenshot({ path: base + '.png', fullPage: true });
  if (flag('popover') && report.footnoteMarkers) {
    const m = page.locator('sup a[href^="#fn"]').first();
    await m.scrollIntoViewIfNeeded();
    await m.hover();
    await page.waitForTimeout(900);
    report.popoverVisible = await page.evaluate(() => !!document.querySelector('.fn-preview[data-open]'));
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
  // --expect '{"hasContents":false}' asserts report fields; --allow-warning <regex> accepts expected renderer warnings
  const expect = JSON.parse(opt('expect', '{}'));
  const allow = opt('allow-warning');
  const badWarnings = warnings.split('\n').filter((l) => l && !(allow && new RegExp(allow).test(l)));
  const mismatches = Object.entries(expect).filter(([k, v]) => JSON.stringify(report[k]) !== JSON.stringify(v)).map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(report[k])}`);
  if (allow && !warnings) mismatches.push('expected a renderer warning matching ' + allow);
  mismatches.forEach((m) => console.error('FAIL ' + m));
  badWarnings.forEach((w) => console.error('FAIL renderer warning: ' + w));
  const failed = badWarnings.length || mismatches.length || report.overflowX > 0 || report.missingLinkElements > 0 || report.brokenImages > 0 || report.emptyInfoboxRows > 0 || report.popoverVisible === false;
  process.exit(failed ? 1 : 0);
})();

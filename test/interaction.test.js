'use strict';
// Browser checks of the rendered example: tokens, type, footnote previews, anchor jumps.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');
const { renderArticle } = require('../renderer/render.js');

const src = path.join(__dirname, '..', 'examples', 'speculative-decoding.md');
const out = path.join(os.tmpdir(), `wiki-skill-interaction-${process.pid}.html`);
fs.writeFileSync(out, renderArticle(fs.readFileSync(src, 'utf8'), { articlesDir: path.dirname(src), baseDir: path.dirname(src) }));
const url = 'file://' + out;

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); fs.rmSync(out, { force: true }); });

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference', ...opts });
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

const preview = (page) => page.locator('.fn-preview');
const visible = (page) => page.evaluate(() => {
  const el = document.querySelector('.fn-preview');
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && !el.hidden && el.matches('[data-open]');
});

test('page and link tokens: light #FBFAF9 / link #3366cc, dark #131314', async () => {
  const { ctx, page } = await open();
  const light = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).backgroundColor,
    link: getComputedStyle(document.querySelector('.lead a, .cite a')).color,
  }));
  assert.equal(light.bg, 'rgb(251, 250, 249)');
  assert.equal(light.link, 'rgb(51, 102, 204)');
  await ctx.close();
  const d = await open({ colorScheme: 'dark' });
  const dark = await d.page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert.equal(dark, 'rgb(19, 19, 20)');
  await d.ctx.close();
});

test('body text is 17px/1.65 at 1440 and 16px/1.6 at 390', async () => {
  for (const [width, size, lh] of [[1440, '17px', '28.05px'], [390, '16px', '25.6px']]) {
    const { ctx, page } = await open({ viewport: { width, height: 900 } });
    const got = await page.evaluate(() => {
      const p = document.querySelector('.lead p');
      const cs = getComputedStyle(p);
      return [cs.fontSize, cs.lineHeight];
    });
    assert.deepEqual(got, [size, lh], `at ${width}`);
    await ctx.close();
  }
});

test('anchor jumps are instant, update the hash and flash the target for 700ms', async () => {
  const { ctx, page } = await open();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  const link = page.locator('.toc a').nth(2);
  const id = (await link.getAttribute('href')).slice(1);
  await link.click();
  const y0 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(400);
  const y1 = await page.evaluate(() => window.scrollY);
  assert.ok(y0 > 0 && y0 === y1, `jump is instant (${y0} vs ${y1})`);
  assert.equal(await page.evaluate(() => location.hash), '#' + id);
  // one highlight: an overlay tint fading opacity 1 -> 0 over 700ms cubic-bezier(0.25, 0.1, 0.25, 1)
  const flashes = () => page.evaluate((i) => {
    const target = document.getElementById(i);
    return document.getAnimations()
      .filter((a) => a.playState === 'running' || a.playState === 'pending')
      .map((a) => {
        const el = a.effect.target;
        const kf = a.effect.getKeyframes();
        return {
          duration: a.effect.getTiming().duration,
          easing: a.effect.getTiming().easing,
          kfEasing: kf.map((k) => k.easing),
          opacity: kf.map((k) => k.opacity),
          props: [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))],
          onTarget: !!el && (el === target || target.contains(el) || el.contains(target) || el.dataset.flashFor === i),
          time: Number(a.currentTime),
        };
      })
      .filter((a) => a.props.includes('opacity') && a.onTarget);
  }, id);
  const f1 = await flashes();
  assert.equal(f1.length, 1, `one flash, got ${JSON.stringify(f1)}`);
  assert.equal(Number(f1[0].duration), 700);
  const easing = [f1[0].easing, ...f1[0].kfEasing].join(' ');
  assert.match(easing, /cubic-bezier\(0\.25, 0\.1, 0\.25, 1\)|\bease\b/, easing);
  assert.equal(Number(f1[0].opacity[0]), 1);
  assert.equal(Number(f1[0].opacity[f1[0].opacity.length - 1]), 0);
  assert.deepEqual(f1[0].props, ['opacity'], 'flash animates opacity only');
  // re-clicking restarts the flash
  await page.waitForTimeout(300);
  await link.click();
  const f2 = await flashes();
  assert.equal(f2.length, 1, 'still one flash');
  assert.ok(f2[0].time < 200, `flash restarted, currentTime ${f2[0].time}`);
  await ctx.close();
});

test('footnote preview: 700ms hover delay, skip window for peers, anchored to the marker', async () => {
  const { ctx, page } = await open();
  const cites = page.locator('sup.cite a');
  await cites.nth(0).scrollIntoViewIfNeeded();
  await cites.nth(0).hover();
  await page.waitForTimeout(350);
  assert.equal(await visible(page), false, 'not open before 700ms');
  await page.waitForTimeout(600);
  assert.equal(await visible(page), true, 'open after 700ms');
  const id = (await cites.nth(0).getAttribute('href')).slice(1);
  const note = (await page.locator(`#${id} .ref-text`).innerText()).trim();
  const shown = (await preview(page).innerText()).trim();
  assert.ok(shown.startsWith(note.slice(0, 20)), `shows the note text first (${shown.slice(0, 30)})`);
  assert.doesNotMatch(shown, /^\^|\^\s*a\s+b/, 'no back-links in the preview');
  // transform-origin sits at the marker, not the popover centre
  const geo = await page.evaluate(() => {
    const p = document.querySelector('.fn-preview');
    const a = document.activeElement && document.activeElement.closest('sup') ? document.activeElement : document.querySelector('sup.cite a:hover') || document.querySelector('sup.cite a');
    const pr = p.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const [ox, oy] = getComputedStyle(p).transformOrigin.split(' ').map(parseFloat);
    return { originX: pr.left + ox, originY: pr.top + oy, markerX: ar.left + ar.width / 2, markerTop: ar.top, markerBottom: ar.bottom };
  });
  assert.ok(Math.abs(geo.originX - geo.markerX) < 24, `origin x at marker ${JSON.stringify(geo)}`);
  assert.ok(Math.min(Math.abs(geo.originY - geo.markerTop), Math.abs(geo.originY - geo.markerBottom)) < 24, `origin y at marker ${JSON.stringify(geo)}`);
  // a peer within the 300ms skip window opens at once, with no animation
  await page.mouse.move(0, 0);
  await page.waitForTimeout(80);
  const n = await cites.count();
  let peer = 1;
  for (; peer < n; peer++) if (await cites.nth(peer).isVisible()) break;
  await cites.nth(peer).scrollIntoViewIfNeeded().catch(() => {});
  await cites.nth(peer).hover();
  await page.waitForTimeout(60);
  assert.equal(await visible(page), true, 'peer opens without delay');
  await ctx.close();
});

test('keyboard focus opens the preview immediately with no animation; Escape closes it', async () => {
  const { ctx, page } = await open();
  await page.locator('sup.cite a').first().focus();
  await page.waitForTimeout(30);
  assert.equal(await visible(page), true, 'open on focus');
  const running = await page.evaluate(() => document.querySelector('.fn-preview').getAnimations().length);
  assert.equal(running, 0, 'no animation on keyboard open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await visible(page), false, 'Escape closes');
  await ctx.close();
});

test('footnote marker and back-link jumps are instant and the back-link returns to its own citing spot', async () => {
  const { ctx, page } = await open();
  const second = page.locator('a[id="fnref1:1"]');
  await second.scrollIntoViewIfNeeded();
  await second.click();
  assert.equal(await page.evaluate(() => location.hash), '#fn1');
  const y0 = await page.evaluate(() => scrollY);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => scrollY), y0, 'instant');
  await page.locator('#fn1 a.backref[href="#fnref1:1"]').click();
  assert.equal(await page.evaluate(() => location.hash), '#fnref1:1');
  const top = await page.evaluate(() => document.getElementById('fnref1:1').getBoundingClientRect().top);
  assert.ok(top >= 0 && top < 200, `landed at its own citation (${top})`);
  await ctx.close();
});

test('reduced motion: the flash stays an opacity-only fade', async () => {
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  const link = page.locator('.toc a').nth(1);
  await link.click();
  const anims = await page.evaluate(() => document.getAnimations().map((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x)))));
  assert.ok(anims.length >= 1, 'flash still shows');
  for (const props of anims) assert.deepEqual([...new Set(props)], ['opacity']);
  await ctx.close();
});

test('reduced motion: the preview never scales, it only fades', async () => {
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  const a = page.locator('sup.cite a').first();
  await a.scrollIntoViewIfNeeded();
  await a.hover();
  await page.waitForFunction(() => document.querySelector('.fn-preview[data-open]'), null, { timeout: 2000 });
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(await page.evaluate(() => getComputedStyle(document.querySelector('.fn-preview')).transform));
    await page.waitForTimeout(15);
  }
  for (const t of samples) assert.ok(t === 'none' || /^matrix\(1, 0, 0, 1,/.test(t), `no scale under reduced motion: ${t}`);
  await ctx.close();
});

test('touch: tapping a citation jumps to the reference without a preview', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(url);
  const a = page.locator('sup.cite a').first();
  await a.scrollIntoViewIfNeeded();
  const href = await a.getAttribute('href');
  await a.tap();
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => location.hash), href);
  assert.equal(await visible(page), false);
  await ctx.close();
});

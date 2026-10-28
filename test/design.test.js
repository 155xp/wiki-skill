'use strict';
// Browser checks of grokpot's renderer design criteria (wiki/design-criteria-renderer.md)
// and learning mode, run against the verify fixtures in test/fixtures/verify.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');
const { renderArticle } = require('../renderer/render.js');

const fixtures = path.join(__dirname, 'fixtures', 'verify');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-design-'));
const urls = {};
for (const f of fs.readdirSync(fixtures).filter((n) => n.endsWith('.md'))) {
  const html = renderArticle(fs.readFileSync(path.join(fixtures, f), 'utf8'), { articlesDir: fixtures, baseDir: fixtures, onWarn: () => {} });
  const out = path.join(tmp, f.replace(/\.md$/, '.html'));
  fs.writeFileSync(out, html);
  urls[f.replace(/\.md$/, '')] = 'file://' + out;
}
const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'style.css'), 'utf8');

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function open(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference', ...opts });
  const page = await ctx.newPage();
  await page.goto(urls[name]);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
const style = (page, sel, props) => page.evaluate(([s, p]) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return Object.fromEntries(p.map((k) => [k, cs[k]]));
}, [sel, props]);
const box = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height };
}, sel);
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('body font is Schibsted Grotesk, embedded in the page', async () => {
  assert.match(css, /@font-face[\s\S]*Schibsted Grotesk[\s\S]*url\(["']?fonts\/schibsted-grotesk-latin-wght-normal\.woff2/);
  const { ctx, page } = await open('full');
  assert.match((await style(page, '.lead p', ['fontFamily'])).fontFamily, /^"?Schibsted Grotesk/);
  assert.equal(await page.evaluate(() => document.fonts.check('17px "Schibsted Grotesk"')), true);
  assert.equal(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Schibsted Grotesk' && f.status === 'loaded')), true);
  await ctx.close();
});

test('title and H2 are serif 400 with one hairline; H3 is sans bold with no rule; headings unnumbered', async () => {
  const { ctx, page } = await open('full');
  const h1 = await style(page, 'h1.title', ['fontFamily', 'fontWeight', 'borderBottomWidth', 'borderBottomStyle']);
  assert.match(h1.fontFamily, /Georgia|Libertine|serif/i);
  assert.equal(h1.fontWeight, '400');
  assert.equal(h1.borderBottomWidth, '1px');
  const h2 = await style(page, 'article h2[id]:not(.toc-title)', ['fontFamily', 'fontWeight', 'borderBottomWidth']);
  assert.match(h2.fontFamily, /Georgia|Libertine|serif/i);
  assert.equal(h2.fontWeight, '400');
  assert.equal(h2.borderBottomWidth, '1px');
  const h3 = await style(page, 'article h3', ['fontFamily', 'fontWeight', 'borderBottomWidth']);
  assert.match(h3.fontFamily, /Schibsted Grotesk/);
  assert.ok(Number(h3.fontWeight) >= 600, `h3 weight ${h3.fontWeight}`);
  assert.equal(h3.borderBottomWidth, '0px');
  const texts = await page.$$eval('article h2[id]:not(.toc-title), article h3', (els) => els.map((e) => e.textContent.trim()));
  for (const t of texts) assert.doesNotMatch(t, /^\d/, `heading "${t}" is unnumbered`);
  // no other dividers
  assert.equal(await page.$$eval('hr', (e) => e.length), 0);
  await ctx.close();
});

test('description is one muted line under the title', async () => {
  const { ctx, page } = await open('full');
  const note = await style(page, '.note', ['color']);
  const text = await style(page, '.lead p', ['color']);
  assert.notEqual(note.color, text.color);
  const b = await box(page, '.note');
  const h = await box(page, 'h1.title');
  assert.ok(b.top >= h.bottom - 1, 'under the title');
  await ctx.close();
});

test('colour tokens: canvas, text, raised boxes and borders in light and dark', async () => {
  const want = {
    light: { canvas: [251, 250, 249], text: [32, 33, 34], raised: [248, 249, 250], border: [162, 169, 177] },
    dark: { canvas: [19, 19, 20], text: [237, 237, 237], raised: [28, 28, 28], border: [48, 48, 48] },
  };
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await open('full', { colorScheme: scheme });
    const w = want[scheme];
    assert.deepEqual(rgb((await style(page, 'html', ['backgroundColor'])).backgroundColor), w.canvas, `${scheme} canvas`);
    assert.deepEqual(rgb((await style(page, '.lead p', ['color'])).color), w.text, `${scheme} text`);
    for (const sel of ['table.infobox', 'nav.toc']) {
      const s = await style(page, sel, ['backgroundColor', 'borderTopColor', 'borderTopWidth']);
      assert.deepEqual(rgb(s.backgroundColor), w.raised, `${scheme} ${sel} background`);
      assert.deepEqual(rgb(s.borderTopColor), w.border, `${scheme} ${sel} border`);
      assert.equal(s.borderTopWidth, '1px');
    }
    await ctx.close();
  }
});

test('links: existing #3366cc / #8ab4f8, no underline at rest, underline on hover, colour-only 160ms transition; missing pages are plain text', async () => {
  for (const [scheme, link, text] of [['light', [51, 102, 204], [32, 33, 34]], ['dark', [138, 180, 248], [237, 237, 237]]]) {
    const { ctx, page } = await open('broken-link', { colorScheme: scheme });
    const a = await style(page, '.lead a.wikilink', ['color', 'textDecorationLine', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction']);
    assert.deepEqual(rgb(a.color), link, `${scheme} link colour`);
    assert.equal(a.textDecorationLine, 'none');
    assert.equal(a.transitionProperty, 'color');
    assert.equal(a.transitionDuration, '0.16s');
    assert.equal(a.transitionTimingFunction, 'cubic-bezier(0.25, 0.46, 0.45, 0.94)');
    const ext = await style(page, 'a[href^="https://example.org"]', ['color']);
    assert.deepEqual(rgb(ext.color), link, 'external links look the same');
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('a[href^="https://example.org"]'), '::after').content);
    assert.ok(after === 'none' || after === 'normal' || after === '""', `no external-link icon (${after})`);
    // a [[link]] to a page that does not exist is plain body text: no element, no red, no underline, no pointer
    const m = await page.evaluate(() => {
      const p = document.querySelector('.lead p');
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) if (node.data.includes('an article nobody wrote yet')) break;
      const el = node.parentElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, cls: el.className, title: el.title, color: cs.color, deco: cs.textDecorationLine, cursor: cs.cursor };
    });
    assert.equal(m.tag, 'P', `missing link text sits directly in the paragraph (${m.tag}.${m.cls})`);
    assert.deepEqual(rgb(m.color), text, `${scheme} missing link uses the body colour`);
    assert.equal(m.deco, 'none');
    assert.ok(m.cursor === 'auto' || m.cursor === 'text' || m.cursor === 'default', m.cursor);
    assert.equal(await page.$$eval('.wikilink.missing, [title="Not written yet"]', (els) => els.length), 0);
    await page.hover('.lead a.wikilink');
    await page.waitForTimeout(250);
    assert.equal((await style(page, '.lead a.wikilink', ['textDecorationLine'])).textDecorationLine, 'underline');
    await ctx.close();
  }
  assert.match(css, /@media\s*\(hover:\s*hover\)[\s\S]*:hover/);
  assert.doesNotMatch(css, /:visited\s*\{[^}]*color:\s*(?!var\(--link\)|inherit)/);
});

test('[[Page#Heading]] links resolve to the section', async () => {
  const { ctx, page } = await open('broken-link');
  assert.equal(await page.$eval('.lead a.wikilink[href*="#"]', (a) => a.getAttribute('href')), '/full#worked-examples');
  await ctx.close();
});

test('1440: fixed left margin, 65-75ch measure, infobox in the right column beside the lead', async () => {
  const lefts = [];
  for (const width of [1440, 1920]) {
    const { ctx, page } = await open('full', { viewport: { width, height: 900 } });
    lefts.push((await box(page, '.lead p')).left);
    if (width === 1440) {
      const ch = await page.evaluate(() => {
        const p = document.querySelector('.lead p');
        const c = document.createElement('canvas').getContext('2d');
        const cs = getComputedStyle(p);
        c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return { ch: c.measureText('0').width, w: p.getBoundingClientRect().width };
      });
      const measure = ch.w / ch.ch;
      assert.ok(measure >= 65 && measure <= 75, `measure ${measure.toFixed(1)}ch`);
      const lead = await box(page, '.lead');
      const ib = await box(page, 'table.infobox');
      assert.ok(ib.left >= lead.right - 1, `infobox right of the lead (${ib.left} vs ${lead.right})`);
      assert.ok(Math.abs(ib.top - lead.top) < 40, 'infobox beside the lead, top-aligned');
      const em = parseFloat((await style(page, 'table.infobox', ['fontSize'])).fontSize);
      assert.ok(ib.width / em > 19 && ib.width / em < 25, `infobox about 22em (${(ib.width / em).toFixed(1)}em)`);
      assert.ok(lead.left < width / 4, 'left-aligned, not centred');
    }
    await ctx.close();
  }
  assert.equal(lefts[0], lefts[1], 'left margin does not move with viewport width');
});

test('1440: contents hugs its widest entry; references are 0.9em', async () => {
  const { ctx, page } = await open('full');
  const toc = await box(page, 'nav.toc');
  const widest = await page.$$eval('nav.toc a', (as) => Math.max(...as.map((a) => a.getBoundingClientRect().right)));
  const lead = await box(page, '.lead p');
  assert.ok(toc.width < lead.width * 0.7, `toc ${toc.width} hugs content`);
  assert.ok(widest <= toc.right, 'entries fit');
  const ref = parseFloat((await style(page, '.reference-list', ['fontSize'])).fontSize);
  const body = parseFloat((await style(page, '.lead p', ['fontSize'])).fontSize);
  assert.ok(Math.abs(ref - body * 0.9) < 0.3, `references ${ref}px vs body ${body}px`);
  const cite = await style(page, 'sup.cite a', ['color']);
  assert.deepEqual(rgb(cite.color), [51, 102, 204]);
  await ctx.close();
});

test('390: one column with 16px padding, infobox full width after the lead, then contents; nothing scrolls sideways', async () => {
  for (const name of Object.keys(urls)) {
    const { ctx, page } = await open(name, { viewport: { width: 390, height: 844 } });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, `${name}: scrollWidth ${sw}`);
    const wide = await page.$$eval('article *', (els) => els.filter((e) => e.getBoundingClientRect().right > 390.5 && getComputedStyle(e).position !== 'fixed' && !e.closest('.fn-preview')).map((e) => e.tagName + '.' + e.className).slice(0, 3));
    assert.deepEqual(wide, [], `${name}: nothing past the right edge`);
    if (name === 'full') {
      const p = await box(page, '.lead p');
      assert.equal(Math.round(p.left), 16);
      assert.equal(Math.round(390 - p.right), 16);
      const ib = await box(page, 'table.infobox');
      const lead = await box(page, '.lead');
      const toc = await box(page, 'nav.toc');
      assert.ok(Math.round(ib.width) === 358 && Math.round(ib.left) === 16, `infobox full width ${JSON.stringify(ib)}`);
      assert.ok(ib.top >= lead.bottom - 1, 'infobox after the lead');
      assert.ok(toc.top >= ib.bottom - 1 && Math.round(toc.width) === 358, 'contents after the infobox, full width');
      assert.equal((await style(page, 'pre', ['whiteSpace'])).whiteSpace, 'pre-wrap');
    }
    await ctx.close();
  }
});

test('infobox: only filled rows, no metadata rows, no infobox means a full-width lead', async () => {
  let r = await open('empty-infobox-field');
  assert.deepEqual(await r.page.$$eval('table.infobox th', (t) => t.map((x) => x.textContent)), ['The idea', 'Tiny example']);
  assert.equal(await r.page.$$eval('table.infobox td', (t) => t.filter((x) => !x.textContent.trim() || x.textContent.trim() === '\u2014').length), 0);
  await r.ctx.close();
  r = await open('no-infobox');
  assert.equal(await r.page.$$eval('table.infobox', (t) => t.length), 0);
  const p = await box(r.page, '.lead p');
  const full = await open('full');
  const fp = await box(full.page, '.lead p');
  assert.ok(Math.abs(p.left - fp.left) < 1 && p.width >= fp.width - 1, 'lead keeps the full body measure');
  await r.ctx.close();
  await full.ctx.close();
});

test('images: figure within the column, never upscaled, width/height/lazy, muted 0.9em caption under it; infobox image on top', async () => {
  const { ctx, page } = await open('missing-image');
  const figs = await page.$$eval('article figure.figure', (f) => f.length);
  assert.equal(figs, 1, 'missing images leave no figure');
  const img = await page.$eval('figure.figure img', (i) => ({ w: i.getBoundingClientRect().width, nw: i.naturalWidth, lazy: i.loading, wa: i.getAttribute('width'), ha: i.getAttribute('height') }));
  assert.ok(img.w <= img.nw, 'not upscaled');
  assert.equal(img.lazy, 'lazy');
  assert.ok(img.wa && img.ha);
  const cap = await style(page, 'figure.figure figcaption', ['fontSize', 'textAlign', 'color']);
  const body = parseFloat((await style(page, '.lead p', ['fontSize'])).fontSize);
  assert.ok(Math.abs(parseFloat(cap.fontSize) - body * 0.9) < 0.3);
  assert.ok(cap.textAlign === 'left' || cap.textAlign === 'start');
  assert.notEqual(cap.color, (await style(page, '.lead p', ['color'])).color);
  const ci = await box(page, 'figure.figure img');
  const cc = await box(page, 'figure.figure figcaption');
  assert.ok(cc.top >= ci.bottom - 1, 'caption under the image');
  const first = await page.$eval('table.infobox tbody tr', (tr) => tr.querySelector('.infobox-image') !== null);
  assert.equal(first, true, 'infobox image is the first row');
  await ctx.close();
});

test('blockquotes are indented muted text; callouts have no coloured left bar', async () => {
  const html = renderArticle('---\ntitle: Q\n---\nLead.\n\n> A plain quote.\n', { known: new Set() });
  const f = path.join(tmp, 'quote.html');
  fs.writeFileSync(f, html);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('file://' + f);
  const q = await style(page, 'blockquote', ['borderLeftWidth', 'marginLeft', 'paddingLeft', 'color']);
  assert.equal(q.borderLeftWidth, '0px');
  assert.ok(parseFloat(q.marginLeft) + parseFloat(q.paddingLeft) > 0, 'indented');
  assert.notEqual(q.color, (await style(page, '.lead p', ['color'])).color, 'muted');
  await ctx.close();
  const r = await open('full');
  const bars = await r.page.$$eval('.callout', (els) => els.map((e) => { const cs = getComputedStyle(e); return [cs.borderLeftWidth, cs.borderTopWidth, cs.borderLeftColor, cs.borderTopColor]; }));
  assert.ok(bars.length > 0);
  for (const [lw, tw, lc, tc] of bars) assert.ok(lw === tw && lc === tc, `no left bar: ${lw}/${tw} ${lc}/${tc}`);
  await r.ctx.close();
});

test('focus ring: keyboard only, two-layer box-shadow with a canvas gap, 3:1 contrast, no transition', async () => {
  const { ctx, page } = await open('full');
  await page.keyboard.press('Tab');
  const s = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { tag: document.activeElement.tagName, shadow: cs.boxShadow, dur: cs.transitionDuration, prop: cs.transitionProperty }; });
  assert.equal(s.tag, 'A');
  const layers = s.shadow.split(/,(?![^(]*\))/).map((x) => x.trim());
  assert.equal(layers.length, 2, s.shadow);
  assert.match(layers[0], /rgb\(251, 250, 249\).*0px 0px 0px 2px|0px 0px 0px 2px.*rgb\(251, 250, 249\)/);
  assert.match(layers[1], /0px 0px 0px 4px/);
  const ring = rgb(layers[1]);
  assert.ok(contrast(ring, [251, 250, 249]) >= 3, 'ring contrast');
  assert.ok(!/box-shadow/.test(s.prop) || /^0s/.test(s.dur), 'focus ring appears in 0ms');
  await page.mouse.click(5, 5);
  const link = page.locator('.lead a').first();
  await link.click({ modifiers: [] , trial: false }).catch(() => {});
  const afterClick = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
  assert.equal(afterClick, 'none', 'no ring after a mouse click');
  await ctx.close();
});

test('motion: only transform and opacity animate (link colour excepted); never transition: all', async () => {
  assert.doesNotMatch(css, /transition(-property)?\s*:\s*all\b/);
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { ctx, page } = await open('full', { reducedMotion });
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of [document.documentElement, ...document.querySelectorAll('*')]) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const props = cs.transitionProperty.split(',').map((x) => x.trim());
          const durs = cs.transitionDuration.split(',').map((x) => parseFloat(x));
          props.forEach((p, i) => {
            const d = durs[i % durs.length];
            if (d > 0 && !['transform', 'opacity', 'color', 'visibility'].includes(p)) out.push(`${el.tagName}${pseudo || ''}:${p}`);
            if (d > 0.2) out.push(`${el.tagName}${pseudo || ''}:${p} ${d}s`);
          });
        }
      }
      return [...new Set(out)].slice(0, 5);
    });
    assert.deepEqual(bad, [], `${reducedMotion}: ${bad.join(', ')}`);
    await ctx.close();
  }
});

test('popover motion: 125ms ease-out scale from 0.97; reduced motion is a 125ms opacity fade', async () => {
  let r = await open('full');
  await r.page.locator('sup.cite a').first().hover();
  await r.page.waitForSelector('.fn-preview', { state: 'attached' });
  const s = await style(r.page, '.fn-preview', ['transitionProperty', 'transitionDuration', 'transitionTimingFunction']);
  assert.match(s.transitionProperty, /transform/);
  assert.match(s.transitionProperty, /opacity/);
  for (const d of s.transitionDuration.split(',')) assert.ok(parseFloat(d) <= 0.125 + 1e-6, `duration ${s.transitionDuration}`);
  assert.match(s.transitionDuration, /0\.125s/);
  assert.match(s.transitionTimingFunction, /ease-out|cubic-bezier\(0(\.\d+)?, 0(\.\d+)?, 0\.\d+, 1\)|cubic-bezier\(0\.\d+, 0\.\d+, 0\.\d+, 1\)/);
  assert.match(css, /scale\(0?\.97\)/);
  await r.ctx.close();
  r = await open('full', { reducedMotion: 'reduce' });
  await r.page.locator('sup.cite a').first().hover();
  await r.page.waitForSelector('.fn-preview[data-open]', { timeout: 2000 });
  const m = await style(r.page, '.fn-preview', ['transitionProperty', 'transitionDuration', 'transform']);
  assert.doesNotMatch(m.transitionProperty, /transform/);
  assert.match(m.transitionProperty, /opacity/);
  assert.match(m.transitionDuration, /0\.125s/);
  await r.ctx.close();
});

test('learning mode: wrong/right side by side at 1440 and stacked at 390', async () => {
  let r = await open('full');
  const pair = await r.page.$eval('.compare', (c) => [...c.children].map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, b: b.bottom, cls: e.className }; }));
  assert.equal(pair.length, 2);
  assert.ok(Math.abs(pair[0].t - pair[1].t) < 2 && pair[1].l > pair[0].l + 50, 'side by side');
  const titles = await r.page.$eval('.compare', (c) => [...c.querySelectorAll('.callout-title')].map((t) => getComputedStyle(t).color));
  assert.notEqual(titles[0], titles[1], 'wrong and right are told apart');
  await r.ctx.close();
  r = await open('full', { viewport: { width: 390, height: 844 } });
  const st = await r.page.$eval('.compare', (c) => [...c.children].map((e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, w: b.width }; }));
  assert.ok(st[1].t >= st[0].b - 1, 'stacked at 390');
  await r.ctx.close();
});

test('learning mode: solutions are closed <details> that open on click', async () => {
  const { ctx, page } = await open('full');
  const d = page.locator('details.callout-solution').first();
  assert.equal(await d.evaluate((e) => e.open), false);
  const inner = d.locator('p').first();
  assert.equal(await inner.isVisible(), false);
  await d.locator('summary').click();
  assert.equal(await inner.isVisible(), true);
  await ctx.close();
});

test('learning mode: takeaways box is raised; highlights are visible and readable in both schemes', async () => {
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await open('full', { colorScheme: scheme });
    const t = await style(page, '.callout-takeaways', ['backgroundColor', 'borderTopWidth']);
    assert.equal(t.borderTopWidth, '1px');
    assert.notEqual(t.backgroundColor, (await style(page, 'html', ['backgroundColor'])).backgroundColor);
    const a = await style(page, 'mark:not(.alt)', ['backgroundColor', 'color']);
    const b = await style(page, 'mark.alt', ['backgroundColor', 'color']);
    assert.notEqual(a.backgroundColor, b.backgroundColor, 'two highlight colours');
    for (const m of [a, b]) {
      assert.notEqual(m.backgroundColor, 'rgba(0, 0, 0, 0)');
      assert.ok(contrast(rgb(m.color), rgb(m.backgroundColor)) >= 4.5, `${scheme} highlight contrast`);
    }
    await ctx.close();
  }
});

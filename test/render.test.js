'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderArticle, slugify } = require('../renderer/render.js');

const dir = path.join(__dirname, 'fixtures', 'articles');
const src = fs.readFileSync(path.join(dir, 'sample.md'), 'utf8');
const html = renderArticle(src, { articlesDir: dir });

test('contents box numbers h2 and h3 headings in order', () => {
  const toc = html.match(/<nav class="toc"[\s\S]*?<\/nav>/);
  assert.ok(toc, 'contents box exists');
  const entries = [...toc[0].matchAll(/<span class="toc-num">([\d.]+)<\/span>\s*<span class="toc-text">([^<]+)<\/span>/g)]
    .map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(entries, [
    '1 First section',
    '1.1 A subsection',
    '2 Second section',
    '3 Glossary',
    '4 References',
  ]);
});

test('section headings are not numbered; numbers appear only in the contents box', () => {
  assert.match(html, /<h2 id="first-section">First section<\/h2>/);
  assert.match(html, /<h3 id="a-subsection">A subsection<\/h3>/);
  assert.match(html, /<h2 id="references">References<\/h2>/);
  assert.doesNotMatch(html.match(/<article[\s\S]*<\/article>/)[0].replace(/<nav class="toc"[\s\S]*?<\/nav>/, ''), /sec-num/);
  assert.match(html, /<a href="#first-section">/);
});

test('footnotes become a numbered References section with backlinks', () => {
  const refs = html.match(/<section class="references"[\s\S]*?<\/section>/);
  assert.ok(refs, 'references section exists');
  assert.match(refs[0], /<h2 id="references">References<\/h2>/);
  const items = refs[0].match(/<li id="fn\d+"/g) || [];
  assert.equal(items.length, 2);
  assert.match(refs[0], /href="https:\/\/example\.org\/first"/);
  // inline citations are bracketed superscripts that link to the reference
  assert.match(html, /<sup class="cite"><a href="#fn1" id="fnref1">\[1\]<\/a><\/sup>/);
  // reused footnote keeps the same number
  assert.match(html, /<sup class="cite"><a href="#fn1" id="fnref1:1">\[1\]<\/a><\/sup>/);
  assert.doesNotMatch(html, /footnotes-sep|<hr class="footnotes/);
});

test('wikilinks resolve to /<slug>; a link to a page that does not exist is plain text', () => {
  assert.match(html, /<a class="wikilink" href="\/existing-article">Existing article<\/a>/);
  // a missing target renders as the bare label: no element, no class, no title, never a dead link
  assert.match(html, /[^>"]a missing one[^<"]/);
  assert.doesNotMatch(html.slice(html.indexOf('<article')), /wikilink missing|Not written yet/);
  assert.doesNotMatch(html, /href="\/missing-topic"/);
});

test('wikilinks inside code are left alone', () => {
  const out = renderArticle('---\ntitle: T\n---\n\nUse `[[not a link]]` here.\n');
  assert.match(out, /<code>\[\[not a link\]\]<\/code>/);
});

test('frontmatter fills title, note line and infobox rows', () => {
  assert.match(html, /<title>Sample article<\/title>/);
  assert.match(html, /<h1 class="title">Sample article<\/h1>/);
  assert.match(html, /<p class="note">A short note line under the title\.<\/p>/);
  const box = html.match(/<table class="infobox"[\s\S]*?<\/table>/);
  assert.ok(box, 'infobox exists');
  assert.match(box[0], /<caption>Sample article<\/caption>/);
  assert.match(box[0], /<th scope="row">What<\/th>\s*<td>A <strong>test<\/strong> fixture<\/td>/);
  assert.match(box[0], /<th scope="row">Origin<\/th>/);
});

test('infobox also accepts a key/value map and an explicit caption', () => {
  const out = renderArticle('---\ntitle: T\ninfobox_caption: Box\ninfobox:\n  Key: Value\n---\n\nLead.\n');
  assert.match(out, /<caption>Box<\/caption>/);
  assert.match(out, /<th scope="row">Key<\/th>\s*<td>Value<\/td>/);
});

test('lead is everything before the first h2 and sits next to the infobox, before the contents box', () => {
  const lead = html.indexOf('class="lead"');
  const box = html.indexOf('class="infobox"');
  const toc = html.indexOf('class="toc"');
  const first = html.indexOf('id="first-section"');
  assert.ok(lead > 0 && box > 0 && toc > lead && toc < first);
});

test('glossary stays plain markdown content', () => {
  assert.match(html, /<h2 id="glossary">[\s\S]*?<strong>Term<\/strong>/);
});

test('output is self-contained: inline CSS, light and dark via prefers-color-scheme, no external assets', () => {
  assert.match(html, /<style>[\s\S]*prefers-color-scheme: ?dark[\s\S]*<\/style>/);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

test('slugify', () => {
  assert.equal(slugify('Speculative decoding'), 'speculative-decoding');
  assert.equal(slugify('  KV cache (attention) '), 'kv-cache-attention');
});

test('CLI renders a file to stdout', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('node', [path.join(__dirname, '..', 'renderer', 'render.js'), path.join(dir, 'sample.md')], { encoding: 'utf8' });
  assert.match(out, /^<!doctype html>/i);
  assert.match(out, /class="wikilink" href="\/existing-article"/);
});

test('a standalone local .svg image becomes an inline figure with its caption', () => {
  const fig = html.match(/<figure class="figure">[\s\S]*?<\/figure>/);
  assert.ok(fig, 'figure exists');
  assert.match(fig[0], /<svg[^>]*viewBox="0 0 10 10"/);
  assert.match(fig[0], /<figcaption>A tiny figure caption<\/figcaption>/);
  assert.doesNotMatch(fig[0], /<script|<\?xml|<img/);
  assert.doesNotMatch(html, /<p>\s*<figure/);
});

test('table cells carry their column header as data-label for narrow layouts', () => {
  const t = renderArticle('Lead.\n\n## S\n\n| Name | Value |\n|---|---|\n| a | **1** |\n', { known: new Set() });
  assert.match(t, /<td data-label="Name">a<\/td>/);
  assert.match(t, /<td data-label="Value"><strong>1<\/strong><\/td>/);
});

test('infobox hides rows whose value is missing, null or empty, and drops the box when no rows remain', () => {
  const out = renderArticle('---\ntitle: T\ninfobox:\n  Kept: one\n  Blank: ""\n  Nothing:\n---\nLead.\n', { known: new Set() });
  assert.match(out, /<th scope="row">Kept<\/th>/);
  assert.doesNotMatch(out, /Blank|Nothing/);
  const none = renderArticle('---\ntitle: T\ninfobox:\n  Blank: ""\n---\nLead.\n', { known: new Set() });
  assert.doesNotMatch(none, /class="infobox"/);
});

test('uncited and undefined footnotes are dropped or left plain, each with a renderer warning', () => {
  const warnings = [];
  const out = renderArticle('---\ntitle: T\n---\nLead[^u].\n\n[^d]: defined only\n', {
    known: new Set(),
    onWarn: (w) => warnings.push(w),
  });
  assert.doesNotMatch(out, /defined only/);
  assert.doesNotMatch(out, /id="references"/);
  assert.match(out, /Lead\[\^u\]\./);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some((w) => /\[\^u\]/.test(w) && /no definition/.test(w)));
  assert.ok(warnings.some((w) => /\[\^d\]/.test(w) && /never cited/.test(w)));
});

test('reference back-links come before the citation text, Wikipedia style', () => {
  const refs = html.match(/<section class="references"[\s\S]*?<\/section>/)[0];
  const li1 = refs.match(/<li id="fn1">([\s\S]*?)<\/li>/)[1];
  const li2 = refs.match(/<li id="fn2">([\s\S]*?)<\/li>/)[1];
  const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // cited twice: "^ a b" then the text
  assert.match(text(li1), /^\^ a b \S/);
  assert.ok(li1.indexOf('href="#fnref1"') < li1.indexOf('example.org/first'));
  assert.match(li1, /href="#fnref1:1"/);
  // cited once: a single "^" link, then the text
  assert.match(text(li2), /^\^ \S/);
  assert.match(li2, /<a class="backref" href="#fnref2"[^>]*>\^<\/a>/);
});

test('page ships an inline script for footnote previews and no smooth scrolling', () => {
  assert.match(html, /<script>[\s\S]*fn-preview[\s\S]*<\/script>/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /scroll-behavior:\s*smooth/);
});

test('[[Page#Heading]] resolves to the article URL with the heading anchor', () => {
  const out = renderArticle('Lead [[Existing article#Some heading|see]] and [[Existing article#Other]].\n', { known: new Set(['existing-article']) });
  assert.match(out, /<a class="wikilink" href="\/existing-article#some-heading">see<\/a>/);
  assert.match(out, /<a class="wikilink" href="\/existing-article#other">Existing article#Other<\/a>|<a class="wikilink" href="\/existing-article#other">Existing article &gt; Other<\/a>|<a class="wikilink" href="\/existing-article#other">[^<]+<\/a>/);
});

test('duplicate headings get unique anchors with -2', () => {
  const out = renderArticle('Lead.\n\n## Example\n\nA\n\n## Example\n\nB\n', { known: new Set() });
  assert.match(out, /<h2 id="example">Example<\/h2>/);
  assert.match(out, /<h2 id="example-2">Example<\/h2>/);
  assert.match(out, /<a href="#example-2">/);
});

test('no headings means no contents box; no footnotes means no references', () => {
  const out = renderArticle('---\ntitle: T\n---\nJust a lead.\n', { known: new Set() });
  assert.doesNotMatch(out, /class="toc"/);
  assert.doesNotMatch(out, /id="references"/);
});

test('metadata keys never become infobox rows; infobox image and caption render at the top', () => {
  const warnings = [];
  const out = renderArticle('---\ntitle: T\nslug: t\ntags: [a]\naliases: [b]\ndate: 2026-01-01\nimage: figures/tiny.svg\ncaption: A tiny picture\ninfobox:\n  Idea: "[[Existing article]] in one line"\n---\nLead.\n', {
    articlesDir: dir, baseDir: dir, onWarn: (w) => warnings.push(w),
  });
  const box = out.match(/<table class="infobox"[\s\S]*?<\/table>/)[0];
  assert.doesNotMatch(box, /slug|tags|aliases|date/i);
  assert.match(box, /<a class="wikilink" href="\/existing-article">Existing article<\/a> in one line/);
  const img = box.indexOf('infobox-image');
  assert.ok(img > 0 && img < box.indexOf('<th scope="row">Idea'), 'image row comes first');
  assert.match(box, /A tiny picture/);
  assert.deepEqual(warnings, []);
});

test('raster images become lazy figures with width and height; missing images drop with a warning', () => {
  const warnings = [];
  const out = renderArticle('Lead.\n\n![A dot](figures/dot.png "One red dot")\n\n![[dot.png]]\n\n![Gone](figures/nope.png)\n\n![[nope.png]]\n', {
    articlesDir: dir, baseDir: dir, onWarn: (w) => warnings.push(w),
  });
  const figs = out.match(/<figure class="figure">[\s\S]*?<\/figure>/g) || [];
  assert.equal(figs.length, 2);
  assert.match(figs[0], /<img src="data:image\/png;base64,[^"]+" alt="A dot" width="3" height="2" loading="lazy" decoding="async">/);
  assert.match(figs[0], /<figcaption>One red dot<\/figcaption>/);
  assert.match(figs[1], /<img src="data:image\/png;base64,[^"]+"[^>]*width="3" height="2" loading="lazy"/);
  assert.doesNotMatch(out, /nope\.png/);
  assert.equal(warnings.filter((w) => /nope\.png/.test(w)).length, 2);
});

test('study mode: ==highlight== and <mark class="alt"> become marks, Obsidian syntax intact', () => {
  const out = renderArticle('Take ==the outer== then <mark class="alt">the inner</mark>, not `==code==`.\n', { known: new Set() });
  assert.match(out, /<mark>the outer<\/mark>/);
  assert.match(out, /<mark class="alt">the inner<\/mark>/);
  assert.match(out, /<code>==code==<\/code>/);
  const bad = renderArticle('Raw <mark onclick="x">no</mark> <script>1</script>\n', { known: new Set() });
  assert.doesNotMatch(bad, /<mark onclick|<script>1/);
});

test('study mode: adjacent [!wrong] and [!right] callouts render side by side', () => {
  const out = renderArticle('Lead.\n\n> [!wrong] Wrong\n> Drop the inner derivative.\n\n> [!right] Right\n> Multiply by it.\n', { known: new Set() });
  const cmp = out.match(/<div class="compare">[\s\S]*?<\/div>\s*<\/div>|<div class="compare">[\s\S]*<\/aside>\s*<\/div>/);
  assert.ok(cmp, 'compare wrapper exists');
  assert.match(cmp[0], /<aside class="callout callout-wrong"[^>]*>[\s\S]*Wrong[\s\S]*Drop the inner derivative/);
  assert.match(cmp[0], /<aside class="callout callout-right"[^>]*>[\s\S]*Right[\s\S]*Multiply by it/);
  assert.ok(cmp[0].indexOf('callout-wrong') < cmp[0].indexOf('callout-right'));
  assert.doesNotMatch(out, /<blockquote/);
  assert.doesNotMatch(out, /\[!wrong\]|\[!right\]/);
});

test('study mode: a folded [!solution]- callout becomes <details> with a summary', () => {
  const out = renderArticle('Lead.\n\n> [!solution]- Show solution\n> The answer is **4**.\n', { known: new Set() });
  assert.match(out, /<details class="callout callout-solution">\s*<summary>Show solution<\/summary>[\s\S]*The answer is <strong>4<\/strong>[\s\S]*<\/details>/);
  assert.doesNotMatch(out, /<details[^>]*open/);
  const open = renderArticle('> [!solution]+ Shown\n> Yes.\n', { known: new Set() });
  assert.match(open, /<details class="callout callout-solution" open>/);
});

test('study mode: [!takeaways] renders a key takeaways box; plain blockquotes stay blockquotes', () => {
  const out = renderArticle('Lead.\n\n> [!takeaways] Key takeaways\n> - One\n> - Two\n\n> Just a quote.\n', { known: new Set() });
  assert.match(out, /<aside class="callout callout-takeaways"[^>]*>\s*<p class="callout-title">Key takeaways<\/p>[\s\S]*<li>One<\/li>[\s\S]*<\/aside>/);
  assert.match(out, /<blockquote>\s*<p>Just a quote\.<\/p>\s*<\/blockquote>/);
});

test('callout without a title uses the type name', () => {
  const out = renderArticle('> [!tip]\n> Watch units.\n', { known: new Set() });
  assert.match(out, /<aside class="callout callout-tip"[^>]*>\s*<p class="callout-title">Tip<\/p>/);
});

test('mode frontmatter: explainer by default, study when asked, unknown values warn and fall back', () => {
  const warnings = [];
  const plain = renderArticle('Lead.\n', { known: new Set() });
  assert.match(plain, /<article class="article" data-mode="explainer">/);
  const study = renderArticle('---\nmode: study\n---\nLead.\n', { known: new Set() });
  assert.match(study, /<article class="article" data-mode="study">/);
  const odd = renderArticle('---\nmode: quiz\n---\nLead.\n', { known: new Set(), onWarn: (w) => warnings.push(w) });
  assert.match(odd, /data-mode="explainer"/);
  assert.ok(warnings.some((w) => /mode "quiz"/.test(w)), warnings.join('|'));
  assert.doesNotMatch(study, /<th scope="row">mode/i, 'mode never shows in the infobox');
  const priv = renderArticle('---\nvisibility: private\n---\nLead.\n', { known: new Set() });
  assert.doesNotMatch(priv.slice(priv.indexOf('<article')), /visibility|private/i, 'visibility is publishing metadata, not page content');
});

test('examples: the explainer follows the explainer outline and the study guide carries the study blocks', () => {
  const exDir = path.join(__dirname, '..', 'examples');
  const render = (f) => {
    const warnings = [];
    const out = renderArticle(fs.readFileSync(path.join(exDir, f), 'utf8'), { articlesDir: exDir, baseDir: exDir, onWarn: (w) => warnings.push(w) });
    return { out, warnings };
  };
  const ex = render('speculative-decoding.md');
  assert.deepEqual(ex.warnings, []);
  assert.match(ex.out, /data-mode="explainer"/);
  const h2 = [...ex.out.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map((m) => m[1]);
  for (const want of ['Intuition', 'How it works', 'Walk-through', 'Reference details']) assert.ok(h2.includes(want), `explainer has ${want}: ${h2}`);
  assert.ok(h2.indexOf('Intuition') < h2.indexOf('How it works') && h2.indexOf('How it works') < h2.indexOf('Walk-through') && h2.indexOf('Walk-through') < h2.indexOf('Reference details'));
  assert.equal((ex.out.match(/<figure class="figure">/g) || []).length, 1, 'one flow diagram');
  assert.doesNotMatch(ex.out.slice(ex.out.indexOf('<article')), /class="compare"|callout-solution|callout-takeaways|Practice problems|Common mistakes|Key takeaways/);
  const st = render('speculative-decoding-study-guide.md');
  assert.deepEqual(st.warnings, []);
  assert.match(st.out, /data-mode="study"/);
  for (const want of ['class="compare"', 'callout-solution', 'callout-takeaways', 'callout-tip', '<mark>', '<mark class="alt">']) assert.ok(st.out.includes(want), want);
  assert.match(ex.out, /<a class="wikilink" href="\/speculative-decoding-study-guide">/);
  assert.match(st.out, /<a class="wikilink" href="\/speculative-decoding">/);
});

test('See also drops entries with no page behind them, and hides the section when none are left', () => {
  const known = new Set(['real-page', 'other-page']);
  const some = renderArticle('Lead.\n\n## Body\n\nText.\n\n## See also\n\n- [[Real page]]\n- [[Ghost page]]\n- [[Other page|Another]], a related idea\n- [External](https://example.org)\n\n## Glossary\n\n- **A**: b.\n', { known });
  const sec = some.slice(some.indexOf('id="see-also"'), some.indexOf('id="glossary"'));
  assert.match(sec, /<a class="wikilink" href="\/real-page">Real page<\/a>/);
  assert.match(sec, /href="\/other-page">Another<\/a>, a related idea/);
  assert.match(sec, /href="https:\/\/example.org"/);
  assert.doesNotMatch(sec, /Ghost page/);
  assert.equal((sec.match(/<li>/g) || []).length, 3);
  assert.match(some, /<span class="toc-text">See also<\/span>/);
  const none = renderArticle('Lead.\n\n## Body\n\nText.\n\n## See also\n\n- [[Ghost page]]\n- [[Nobody|Nothing here]]\n\n## Glossary\n\n- **A**: b.\n', { known });
  assert.doesNotMatch(none, /See also|see-also|Ghost page|Nothing here/);
  assert.match(none, /<span class="toc-text">Glossary<\/span>/);
  assert.match(none, /id="glossary"/);
  const last = renderArticle('Lead.\n\n## Body\n\nText.\n\n## See also\n\n- [[Ghost page]]\n', { known });
  assert.doesNotMatch(last, /See also|Ghost page/);
  // outside See also, a missing link in a list item stays as plain text
  const body = renderArticle('Lead.\n\n## Body\n\n- Compare [[Ghost page]].\n', { known });
  assert.match(body, /<li>Compare Ghost page\.<\/li>/);
});

test('infobox as a list of "Label: value" strings: rows in order, empty values hidden; the examples use it so Obsidian shows a clean list property', () => {
  const out = renderArticle('---\ntitle: T\ninfobox:\n  - "First: one"\n  - "Released:"\n  - "Ratio: 2:1 at best"\n---\nLead.\n', { known: new Set() });
  const box = out.match(/<table class="infobox"[\s\S]*?<\/table>/)[0];
  const labels = [...box.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['First', 'Ratio']);
  assert.match(box, /2:1 at best/);
  const matter = require('gray-matter');
  for (const f of ['speculative-decoding.md', 'speculative-decoding-study-guide.md']) {
    const data = matter(fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8')).data;
    assert.ok(Array.isArray(data.infobox) && data.infobox.every((r) => typeof r === 'string'), `${f} infobox is a list of strings`);
  }
});

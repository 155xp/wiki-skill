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

test('section headings carry the same numbers and anchors as the contents box', () => {
  assert.match(html, /<h2 id="first-section"><span class="sec-num">1<\/span> First section<\/h2>/);
  assert.match(html, /<h3 id="a-subsection"><span class="sec-num">1\.1<\/span> A subsection<\/h3>/);
  assert.match(html, /<a href="#first-section">/);
});

test('footnotes become a numbered References section with backlinks', () => {
  const refs = html.match(/<section class="references"[\s\S]*?<\/section>/);
  assert.ok(refs, 'references section exists');
  assert.match(refs[0], /<h2 id="references"><span class="sec-num">4<\/span> References<\/h2>/);
  const items = refs[0].match(/<li id="fn\d+"/g) || [];
  assert.equal(items.length, 2);
  assert.match(refs[0], /href="https:\/\/example\.org\/first"/);
  // inline citations are bracketed superscripts that link to the reference
  assert.match(html, /<sup class="cite"><a href="#fn1" id="fnref1">\[1\]<\/a><\/sup>/);
  // reused footnote keeps the same number
  assert.match(html, /<sup class="cite"><a href="#fn1" id="fnref1:1">\[1\]<\/a><\/sup>/);
  assert.doesNotMatch(html, /footnotes-sep|<hr class="footnotes/);
});

test('wikilinks resolve to /<slug> and missing targets get the missing style', () => {
  assert.match(html, /<a class="wikilink" href="\/existing-article">Existing article<\/a>/);
  assert.match(html, /<a class="wikilink missing" href="\/missing-topic" title="Missing topic \(article not written yet\)">a missing one<\/a>/);
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

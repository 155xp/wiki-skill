#!/usr/bin/env node
'use strict';
// Markdown article -> self-contained Wikipedia-style HTML page.
// Usage: node renderer/render.js article.md [--articles <dir>] > out.html

const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');

const TEMPLATE = path.join(__dirname, 'template.html');
const STYLE = path.join(__dirname, 'style.css');

function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Slugs of articles that exist next to this one: file names plus frontmatter slug/title/aliases.
function knownSlugs(dir) {
  const known = new Set();
  if (!dir || !fs.existsSync(dir)) return known;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    known.add(slugify(f.slice(0, -3)));
    try {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.slug) known.add(slugify(data.slug));
      if (data.title) known.add(slugify(data.title));
      for (const a of [].concat(data.aliases || [])) known.add(slugify(a));
    } catch {
      // unreadable frontmatter: the file name still counts
    }
  }
  return known;
}

// [[Target]] and [[Target|label]] -> <a class="wikilink" href="/target">
function wikilinks(md, known) {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', start + 2);
    if (end < 0) return false;
    const inner = src.slice(start + 2, end);
    if (!inner.trim() || inner.includes('\n') || inner.includes('[')) return false;
    if (!silent) {
      const [target, label] = inner.split('|');
      const page = target.split('#')[0].trim();
      const token = state.push('wikilink', '', 0);
      token.meta = { target: page, label: (label || target).trim(), slug: slugify(page) };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, label, slug } = tokens[idx].meta;
    if (known.has(slug)) {
      return `<a class="wikilink" href="/${slug}">${escapeHtml(label)}</a>`;
    }
    return `<a class="wikilink missing" href="/${slug}" title="${escapeHtml(target)} (article not written yet)">${escapeHtml(label)}</a>`;
  };
}

// Number h2/h3 headings (1, 1.1, 2 ...), give them stable ids, and collect the Contents entries.
function numberedHeadings(md) {
  md.core.ruler.push('numbered_headings', (state) => {
    const toc = [];
    const used = new Set(['references', 'contents']);
    let h2 = 0;
    let h3 = 0;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open' || (t.tag !== 'h2' && t.tag !== 'h3')) continue;
      const inline = tokens[i + 1];
      const text = inline.children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');
      let id = slugify(text) || 'section';
      let n = 2;
      while (used.has(id)) id = `${slugify(text)}-${n++}`;
      used.add(id);
      let num;
      if (t.tag === 'h2') {
        h2 += 1;
        h3 = 0;
        num = String(h2);
      } else {
        h3 += 1;
        num = `${h2}.${h3}`;
      }
      t.attrSet('id', id);
      const span = new state.Token('html_inline', '', 0);
      span.content = `<span class="sec-num">${num}</span> `;
      inline.children.unshift(span);
      toc.push({ level: t.tag === 'h2' ? 2 : 3, num, id, text });
    }
    state.env.toc = toc;
    state.env.h2count = h2;
  });
}

function referencesRules(md) {
  const r = md.renderer.rules;
  r.footnote_ref = (tokens, idx) => {
    const id = tokens[idx].meta.id + 1;
    const sub = tokens[idx].meta.subId;
    const refid = sub > 0 ? `${id}:${sub}` : `${id}`;
    return `<sup class="cite"><a href="#fn${id}" id="fnref${refid}">[${id}]</a></sup>`;
  };
  r.footnote_block_open = (tokens, idx, options, env) => {
    const num = (env.h2count || 0) + 1;
    return `<section class="references" aria-labelledby="references">\n<h2 id="references"><span class="sec-num">${num}</span> References</h2>\n<ol class="reference-list">\n`;
  };
  r.footnote_block_close = () => '</ol>\n</section>\n';
  r.footnote_open = (tokens, idx) => `<li id="fn${tokens[idx].meta.id + 1}">`;
  r.footnote_close = () => '</li>\n';
  // Wikipedia style: "^" for a source cited once, "^ a b" for one cited several times.
  r.footnote_anchor = (tokens, idx, options, env) => {
    const id = tokens[idx].meta.id + 1;
    const sub = tokens[idx].meta.subId;
    const refid = sub > 0 ? `${id}:${sub}` : `${id}`;
    const uses = env.footnotes.list[id - 1].count || 1;
    const link = (text) => `<a class="backref" href="#fnref${refid}" aria-label="Back to citation ${id}">${text}</a>`;
    if (uses === 1) return ` ${link('^')}`;
    return `${sub === 0 ? ' <span class="backref-caret">^</span>' : ''} ${link(String.fromCharCode(97 + sub))}`;
  };
}

function infoboxRows(data) {
  const raw = data.infobox;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((row) => {
      if (row && typeof row === 'object') {
        const [k] = Object.keys(row);
        return [k, row[k]];
      }
      const s = String(row);
      const i = s.indexOf(':');
      return i < 0 ? ['', s] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    });
  }
  return Object.entries(raw);
}

function renderArticle(source, opts = {}) {
  const { data, content } = matter(source);
  const known = opts.known || knownSlugs(opts.articlesDir);
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  md.use(footnote);
  wikilinks(md, known);
  numberedHeadings(md);
  referencesRules(md);

  const env = {};
  const tokens = md.parse(content, env);
  // References count as the last numbered section when footnotes exist.
  const hasRefs = tokens.some((t) => t.type === 'footnote_block_open');
  const toc = env.toc.slice();
  if (hasRefs) toc.push({ level: 2, num: String(env.h2count + 1), id: 'references', text: 'References' });
  const bodyHtml = md.renderer.render(tokens, md.options, env);

  const split = bodyHtml.search(/<h2[ >]/);
  const leadHtml = split < 0 ? bodyHtml : bodyHtml.slice(0, split);
  const restHtml = split < 0 ? '' : bodyHtml.slice(split);

  const title = data.title || 'Untitled';
  const rows = infoboxRows(data);
  const inline = (s) => md.renderInline(String(s ?? ''), {});
  const infobox = rows.length
    ? `<table class="infobox">\n<caption>${escapeHtml(data.infobox_caption || title)}</caption>\n<tbody>\n${rows
        .map(([k, v]) => `<tr>\n<th scope="row">${escapeHtml(k)}</th>\n<td>${inline(v)}</td>\n</tr>`)
        .join('\n')}\n</tbody>\n</table>\n`
    : '';

  const tocHtml = toc.length
    ? `<nav class="toc" aria-labelledby="toc-title">\n<h2 class="toc-title" id="toc-title">Contents</h2>\n${tocList(toc)}</nav>\n`
    : '';

  const note = data.note ? `<p class="note">${inline(data.note)}</p>\n` : '';
  const article = [
    '<article class="article">',
    `<header class="article-header">\n<h1 class="title">${escapeHtml(title)}</h1>\n${note}</header>`,
    `<div class="lead-block">\n${infobox}<div class="lead">\n${leadHtml}</div>\n${tocHtml}</div>`,
    restHtml,
    '</article>',
  ].join('\n');

  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const style = fs.readFileSync(STYLE, 'utf8');
  return template
    .replace(/\{\{title\}\}/g, escapeHtml(title))
    .replace('{{description}}', escapeHtml(data.description || stripTags(data.note || '')))
    .replace('{{style}}', () => style)
    .replace('{{article}}', () => article);
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/[*_`[\]]/g, '');
}

function tocList(toc) {
  let out = '<ol>\n';
  let open = false;
  for (const e of toc) {
    const item = `<a href="#${e.id}"><span class="toc-num">${e.num}</span> <span class="toc-text">${escapeHtml(e.text)}</span></a>`;
    if (e.level === 2) {
      if (open) out += '</ol></li>\n';
      else if (out !== '<ol>\n') out += '</li>\n';
      open = false;
      out += `<li>${item}`;
    } else {
      if (!open) {
        out += '\n<ol>\n';
        open = true;
      }
      out += `<li>${item}</li>\n`;
    }
  }
  out += open ? '</ol></li>\n' : '</li>\n';
  return out + '</ol>\n';
}

module.exports = { renderArticle, slugify, knownSlugs };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    process.stderr.write('usage: node renderer/render.js article.md [--articles dir] > out.html\n');
    process.exit(1);
  }
  const ai = args.indexOf('--articles');
  const articlesDir = ai >= 0 ? args[ai + 1] : path.dirname(path.resolve(file));
  process.stdout.write(renderArticle(fs.readFileSync(file, 'utf8'), { articlesDir }));
}

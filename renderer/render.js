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
const SCRIPT = path.join(__dirname, 'page.js');
const FONTS = path.join(__dirname, 'fonts');

// url(fonts/x.woff2) in the stylesheet -> a data: URI, so the page needs no other files.
function inlineFonts(css) {
  return css.replace(/url\((['"]?)fonts\/([\w.-]+\.woff2)\1\)/g, (all, q, name) => {
    const file = path.join(FONTS, name);
    if (!fs.existsSync(file)) return all;
    return `url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')})`;
  });
}

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

// [[Target]], [[Target|label]] and [[Target#Heading]] -> <a class="wikilink" href="/target#heading">.
// A target with no article becomes a non-navigating span, never a dead link.
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
      const bar = inner.indexOf('|');
      const target = bar < 0 ? inner : inner.slice(0, bar);
      const label = bar < 0 ? '' : inner.slice(bar + 1);
      const hash = target.indexOf('#');
      const page = (hash < 0 ? target : target.slice(0, hash)).trim();
      const heading = hash < 0 ? '' : target.slice(hash + 1).trim();
      const shown = label.trim() || (heading ? `${page} § ${heading}` : page);
      const token = state.push('wikilink', '', 0);
      token.meta = { target: page, heading, label: shown, slug: slugify(page) };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { label, slug, heading } = tokens[idx].meta;
    if (known.has(slug)) {
      const anchor = heading ? `#${slugify(heading)}` : '';
      return `<a class="wikilink" href="/${slug}${anchor}">${escapeHtml(label)}</a>`;
    }
    // a page that does not exist yet: plain body text, no element at all
    return escapeHtml(label);
  };
}

// "See also": drop entries whose only links are [[wikilinks]] to pages that do not exist,
// and hide the section (heading and Contents entry) when nothing is left in it.
function seeAlso(md, known) {
  const isLive = (c) => c.type === 'link_open' || (c.type === 'wikilink' && known.has(c.meta.slug));
  md.core.ruler.push('see_also', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const h = tokens[i];
      if (h.type !== 'heading_open' || h.tag !== 'h2') continue;
      const text = tokens[i + 1].children.filter((c) => c.type === 'text').map((c) => c.content).join('').trim().toLowerCase();
      if (text !== 'see also') continue;
      const start = i + 3; // after heading_open, inline, heading_close
      let end = start;
      while (end < tokens.length && !(tokens[end].type === 'heading_open' && (tokens[end].tag === 'h1' || tokens[end].tag === 'h2')) && tokens[end].type !== 'footnote_block_open') end++;
      const section = tokens.slice(start, end);
      const kept = [];
      for (let j = 0; j < section.length; j++) {
        const t = section[j];
        if (t.type === 'list_item_open') {
          let k = j + 1;
          while (!(section[k].type === 'list_item_close' && section[k].level === t.level)) k++;
          const children = section.slice(j, k + 1).filter((x) => x.type === 'inline').flatMap((x) => x.children || []);
          const hasWiki = children.some((c) => c.type === 'wikilink');
          if (hasWiki && !children.some(isLive)) { j = k; continue; }
          kept.push(...section.slice(j, k + 1));
          j = k;
          continue;
        }
        kept.push(t);
      }
      // remove lists that ended up empty
      const pruned = [];
      for (let j = 0; j < kept.length; j++) {
        const t = kept[j];
        const next = kept[j + 1];
        if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && next && next.type === t.type.replace('_open', '_close')) { j++; continue; }
        pruned.push(t);
      }
      if (pruned.length === 0) {
        tokens.splice(i, end - i);
        i -= 1;
      } else {
        tokens.splice(start, end - start, ...pruned);
      }
    }
  });
}

// ==text== and <mark class="name">text</mark> -> <mark>. Obsidian shows both as highlights.
function highlights(md) {
  const nested = (state, open, close, from, to, after) => {
    state.push('html_inline', '', 0).content = open;
    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = from;
    state.posMax = to;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;
    state.push('html_inline', '', 0).content = close;
    state.pos = after;
  };
  md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.startsWith('==', start)) {
      if (src.charCodeAt(start + 2) === 0x20 || src.charCodeAt(start + 2) === 0x3d) return false;
      const end = src.indexOf('==', start + 2);
      if (end < 0 || end === start + 2 || src.charCodeAt(end - 1) === 0x20 || end > state.posMax) return false;
      if (src.slice(start, end).includes('\n\n')) return false;
      if (!silent) nested(state, '<mark>', '</mark>', start + 2, end, end + 2);
      else state.pos = end + 2;
      return true;
    }
    if (src.charCodeAt(start) !== 0x3c) return false;
    const m = /^<mark(?: class="([a-z][a-z0-9-]*)")?>/.exec(src.slice(start, state.posMax));
    if (!m) return false;
    const end = src.indexOf('</mark>', start + m[0].length);
    if (end < 0 || end > state.posMax) return false;
    if (!silent) nested(state, m[1] ? `<mark class="${m[1]}">` : '<mark>', '</mark>', start + m[0].length, end, end + 7);
    else state.pos = end + 7;
    return true;
  });
}

// Obsidian callouts. "> [!type] Title" becomes <aside class="callout callout-type">;
// "> [!type]- Title" (folded) or "+" (open) becomes <details>/<summary>.
// A [!wrong] callout directly followed by a [!right] one is wrapped in <div class="compare">.
function callouts(md) {
  md.core.ruler.push('callouts', (state) => {
    const t = state.tokens;
    const done = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'blockquote_open') continue;
      const para = t[i + 1];
      const inl = t[i + 2];
      if (!para || para.type !== 'paragraph_open' || !inl || inl.type !== 'inline') continue;
      const firstLine = inl.content.split('\n')[0];
      const m = /^\[!([A-Za-z][\w-]*)\]([+-]?)\s*(.*)$/.exec(firstLine);
      if (!m) continue;
      let depth = 0;
      let close = -1;
      for (let j = i; j < t.length; j++) {
        if (t[j].type === 'blockquote_open') depth += 1;
        else if (t[j].type === 'blockquote_close' && --depth === 0) { close = j; break; }
      }
      if (close < 0) continue;
      const type = m[1].toLowerCase();
      const fold = m[2];
      const titleText = m[3].trim() || type.charAt(0).toUpperCase() + type.slice(1);
      const title = md.renderInline(titleText, {});
      const kids = inl.children || [];
      const br = kids.findIndex((k) => k.type === 'softbreak' || k.type === 'hardbreak');
      const openTok = new state.Token('html_block', '', 0);
      const closeTok = new state.Token('html_block', '', 0);
      if (fold) {
        openTok.content = `<details class="callout callout-${type}"${fold === '+' ? ' open' : ''}>\n<summary>${title}</summary>\n`;
        closeTok.content = '</details>\n';
      } else {
        openTok.content = `<aside class="callout callout-${type}" data-callout="${type}">\n<p class="callout-title">${title}</p>\n`;
        closeTok.content = '</aside>\n';
      }
      openTok.meta = { callout: type };
      closeTok.meta = { calloutEnd: type };
      t[close] = closeTok;
      if (br < 0) {
        t.splice(i, 4, openTok); // drop blockquote_open + the title-only paragraph
        close -= 3;
      } else {
        inl.children = kids.slice(br + 1);
        inl.content = inl.content.slice(inl.content.indexOf('\n') + 1);
        t[i] = openTok;
      }
      done.push(openTok);
    }
    // pair [!wrong] + [!right]
    for (let i = 0; i < t.length; i++) {
      if (!t[i].meta || t[i].meta.calloutEnd !== 'wrong') continue;
      const next = t[i + 1];
      if (!next || !next.meta || next.meta.callout !== 'right') continue;
      let start = i;
      while (start >= 0 && !(t[start].meta && t[start].meta.callout === 'wrong')) start -= 1;
      let end = i + 1;
      while (end < t.length && !(t[end].meta && t[end].meta.calloutEnd === 'right')) end += 1;
      if (start < 0 || end >= t.length) continue;
      const a = new state.Token('html_block', '', 0);
      a.content = '<div class="compare">\n';
      const b = new state.Token('html_block', '', 0);
      b.content = '</div>\n';
      t.splice(end + 1, 0, b);
      t.splice(start, 0, a);
      i = end + 2;
    }
  });
}

// Give h2/h3 headings unique ids (a repeat gets -2, -3 ...) and collect Contents entries.
// Headings themselves stay unnumbered; numbers (1, 1.1, 2) appear only in Contents.
function sectionHeadings(md) {
  md.core.ruler.push('section_headings', (state) => {
    const toc = [];
    const used = new Set(['references', 'contents', 'toc-title']);
    let h2 = 0;
    let h3 = 0;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open' || (t.tag !== 'h2' && t.tag !== 'h3')) continue;
      const inline = tokens[i + 1];
      const text = inline.children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');
      const base = slugify(text) || 'section';
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      let num;
      if (t.tag === 'h2') {
        h2 += 1;
        h3 = 0;
        num = String(h2);
      } else {
        h3 += 1;
        num = h2 ? `${h2}.${h3}` : `0.${h3}`;
      }
      t.attrSet('id', id);
      toc.push({ level: t.tag === 'h2' ? 2 : 3, num, id, text });
    }
    state.env.toc = toc;
    state.env.h2count = h2;
  });
}

const RASTER = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

// Pixel size of a PNG, JPEG, GIF or WebP file, read from its header.
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o += 1; continue; }
      const marker = buf[o + 1];
      const len = buf.readUInt16BE(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) };
      }
      o += 2 + len;
    }
  }
  return null;
}

// Find a local image the way a note links it: a relative path, or an Obsidian embed name
// looked up next to the note, in figures/ or attachments/, or anywhere below the note's folder.
function resolveImage(baseDir, ref, embed) {
  if (!baseDir || !ref || /^[a-z]+:|^\//i.test(ref)) return null;
  const root = path.resolve(baseDir);
  let name;
  try { name = decodeURI(ref); } catch { name = ref; }
  const inside = (f) => (f === root || f.startsWith(root + path.sep)) && fs.existsSync(f) && fs.statSync(f).isFile();
  const direct = path.resolve(root, name);
  if (inside(direct)) return direct;
  if (!embed) return null;
  for (const sub of ['figures', 'attachments', 'images', 'assets']) {
    const f = path.resolve(root, sub, name);
    if (inside(f)) return f;
  }
  const base = path.basename(name);
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 2000) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      seen += 1;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) stack.push(f);
      else if (e.name === base) return f;
    }
  }
  return null;
}

// Markup for one local image file: SVG is inlined (scripts stripped), rasters become a data: URI
// <img> with width, height and lazy loading, so the page stays one self-contained file.
function imageMarkup(file, alt, width) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.svg') {
    return fs.readFileSync(file, 'utf8')
      .replace(/<\?xml[^>]*>\s*/g, '')
      .replace(/<!DOCTYPE[^>]*>\s*/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+="[^"]*"/gi, '')
      .trim();
  }
  if (!RASTER[ext]) return null;
  const buf = fs.readFileSync(file);
  const size = imageSize(buf);
  if (!size) return null;
  let { width: w, height: h } = size;
  if (width && width < w) {
    h = Math.round((h * width) / w);
    w = width;
  }
  return `<img src="data:${RASTER[ext]};base64,${buf.toString('base64')}" alt="${escapeHtml(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
}

const IMAGE_EXT = /\.(svg|png|jpe?g|gif|webp)$/i;

// ![[image.png]] and ![[image.png|alt or width]] -> an image token, like ![alt](image.png).
function imageEmbeds(md) {
  md.inline.ruler.before('wikilink', 'image_embed', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (!src.startsWith('![[', start)) return false;
    const end = src.indexOf(']]', start + 3);
    if (end < 0) return false;
    const inner = src.slice(start + 3, end);
    const [name, extra = ''] = inner.split('|');
    if (!IMAGE_EXT.test(name.trim()) || inner.includes('\n')) return false;
    if (!silent) {
      const tok = state.push('image', 'img', 0);
      tok.attrs = [['src', name.trim()], ['alt', '']];
      tok.children = [];
      const alt = /^\d+(x\d+)?$/.test(extra.trim()) ? '' : extra.trim();
      tok.content = alt;
      tok.meta = { embed: true, width: /^\d+/.test(extra.trim()) ? parseInt(extra, 10) : 0 };
    }
    state.pos = end + 2;
    return true;
  });
}

// A paragraph holding only an image becomes <figure> with a caption from the title (or alt text).
// Any local image that cannot be found is dropped with a warning, never left as a broken <img>.
function figures(md, baseDir, warn) {
  md.core.ruler.push('figures', (state) => {
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'inline' || !t[i].children) continue;
      const kids = t[i].children;
      const solo = t[i - 1] && t[i - 1].type === 'paragraph_open' && kids.filter((k) => !(k.type === 'text' && !k.content.trim())).length === 1 && kids.some((k) => k.type === 'image');
      for (let k = kids.length - 1; k >= 0; k--) {
        const img = kids[k];
        if (img.type !== 'image') continue;
        const src = img.attrGet('src') || '';
        if (/^[a-z]+:|^\/\//i.test(src)) continue; // remote images are left to the browser
        const embed = !!(img.meta && img.meta.embed);
        const file = resolveImage(baseDir, src, embed);
        const alt = img.content || '';
        const markup = file && imageMarkup(file, alt, img.meta && img.meta.width);
        if (!markup) {
          warn(`image ${src} not found${file ? ' or unreadable' : ''}; figure dropped`);
          kids.splice(k, 1);
          continue;
        }
        if (solo) {
          const caption = img.attrGet('title') || (embed ? '' : alt);
          const tok = new state.Token('html_block', '', 0);
          tok.content = `<figure class="figure">\n${markup}\n${caption ? `<figcaption>${md.renderInline(caption, {})}</figcaption>\n` : ''}</figure>\n`;
          t.splice(i - 1, 3, tok);
          i -= 1;
          break;
        }
        const tok = new state.Token('html_inline', '', 0);
        tok.content = markup;
        kids[k] = tok;
      }
      // a paragraph left empty after dropping its only image goes too
      if (t[i] && t[i].type === 'inline' && t[i].children && !t[i].children.some((c) => c.type !== 'text' || c.content.trim())
        && t[i - 1] && t[i - 1].type === 'paragraph_open' && t[i + 1] && t[i + 1].type === 'paragraph_close') {
        t.splice(i - 1, 3);
        i -= 2;
      }
    }
  });
}

// Copy each column header onto its body cells (data-label) so narrow screens can stack rows.
function tableLabels(md) {
  md.core.ruler.push('table_labels', (state) => {
    let headers = [];
    let col = 0;
    let inHead = false;
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      if (tok.type === 'thead_open') { inHead = true; headers = []; }
      else if (tok.type === 'thead_close') inHead = false;
      else if (tok.type === 'tr_open') col = 0;
      else if (tok.type === 'th_open' && inHead) {
        headers.push((t[i + 1].children || []).filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join(''));
      } else if (tok.type === 'td_open') {
        if (headers[col]) tok.attrSet('data-label', headers[col]);
        col += 1;
      }
    }
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
  r.footnote_block_open = () =>
    '<section class="references" aria-labelledby="references">\n<h2 id="references">References</h2>\n<ol class="reference-list">\n';
  r.footnote_block_close = () => '</ol>\n</section>\n';
  // Wikipedia style, back-links first: "^" for a source cited once, "^ a b" for one cited
  // several times, each letter returning to its own citing spot. Then the citation text.
  r.footnote_open = (tokens, idx, options, env) => {
    const id = tokens[idx].meta.id + 1;
    const uses = env.footnotes.list[id - 1].count || 1;
    const link = (refid, text, label) => `<a class="backref" href="#fnref${refid}" aria-label="${label}">${text}</a>`;
    const back = uses === 1
      ? link(id, '^', `Back to citation ${id}`)
      : `<span class="backref-caret" aria-hidden="true">^</span> ${Array.from({ length: uses }, (_, sub) =>
        link(sub ? `${id}:${sub}` : id, String.fromCharCode(97 + sub), `Back to citation ${id}${String.fromCharCode(97 + sub)}`)).join(' ')}`;
    return `<li id="fn${id}"><span class="backrefs">${back}</span> <span class="ref-text">`;
  };
  r.footnote_close = () => '</span></li>\n';
  r.footnote_anchor = () => '';
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

function present(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

// Lists footnotes cited without a definition and definitions never cited.
function footnoteWarnings(content) {
  const text = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const defined = new Set([...text.matchAll(/^\[\^([^\]\s]+)\]:/gm)].map((m) => m[1]));
  const cited = new Set([...text.matchAll(/\[\^([^\]\s]+)\](?!:)/g)].map((m) => m[1]));
  const out = [];
  for (const id of cited) if (!defined.has(id)) out.push(`footnote [^${id}] is cited but has no definition; left as plain text`);
  for (const id of defined) if (!cited.has(id)) out.push(`footnote [^${id}] is defined but never cited; dropped`);
  return out;
}

// Article modes (skill/SKILL.md): explainer is the default; study adds the learning blocks.
const MODES = ['explainer', 'study'];

function renderArticle(source, opts = {}) {
  const { data, content } = matter(source);
  const known = opts.known || knownSlugs(opts.articlesDir);
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  md.use(footnote);
  wikilinks(md, known);
  const warn = opts.onWarn || (() => {});
  const baseDir = opts.baseDir || opts.articlesDir;
  imageEmbeds(md);
  highlights(md);
  seeAlso(md, known);
  sectionHeadings(md);
  referencesRules(md);
  tableLabels(md);
  figures(md, baseDir, warn);
  callouts(md);
  footnoteWarnings(content).forEach((w) => warn(w));

  const env = {};
  const tokens = md.parse(content, env);
  // References count as the last numbered section when footnotes exist.
  const hasRefs = tokens.some((t) => t.type === 'footnote_block_open');
  const toc = env.toc.slice();
  // No section headings means no Contents box, even when References exist.
  if (hasRefs && toc.length) toc.push({ level: 2, num: String(env.h2count + 1), id: 'references', text: 'References' });
  const bodyHtml = md.renderer.render(tokens, md.options, env);

  const split = bodyHtml.search(/<h2[ >]/);
  const leadHtml = split < 0 ? bodyHtml : bodyHtml.slice(0, split);
  const restHtml = split < 0 ? '' : bodyHtml.slice(split);

  const title = data.title || 'Untitled';
  const rows = infoboxRows(data).filter(([, v]) => present(v));
  const inline = (s) => md.renderInline(String(s ?? ''), {});
  let imageRow = '';
  if (present(data.image)) {
    const file = resolveImage(baseDir, String(data.image), true);
    const markup = file && imageMarkup(file, data.caption ? stripTags(data.caption) : title);
    if (markup) {
      imageRow = `<tr>\n<td colspan="2" class="infobox-image">${markup}${present(data.caption) ? `<div class="infobox-caption">${inline(data.caption)}</div>` : ''}</td>\n</tr>\n`;
    } else warn(`infobox image ${data.image} not found; image dropped`);
  }
  const infobox = rows.length || imageRow
    ? `<table class="infobox">\n<caption>${escapeHtml(data.infobox_caption || title)}</caption>\n<tbody>\n${imageRow}${rows
        .map(([k, v]) => `<tr>\n<th scope="row">${inline(k)}</th>\n<td>${inline(v)}</td>\n</tr>`)
        .join('\n')}\n</tbody>\n</table>\n`
    : '';

  const tocHtml = toc.length
    ? `<nav class="toc" aria-labelledby="toc-title">\n<h2 class="toc-title" id="toc-title">Contents</h2>\n${tocList(toc)}</nav>\n`
    : '';

  const modeRaw = present(data.mode) ? String(data.mode).trim().toLowerCase() : 'explainer';
  const mode = MODES.includes(modeRaw) ? modeRaw : 'explainer';
  if (mode !== modeRaw) warn(`mode "${data.mode}" is not one of ${MODES.join(', ')}; using explainer`);
  const lede = present(data.description) ? data.description : data.note;
  const note = present(lede) ? `<p class="note">${inline(lede)}</p>\n` : '';
  const article = [
    `<article class="article" data-mode="${mode}">`,
    `<header class="article-header">\n<h1 class="title">${escapeHtml(title)}</h1>\n${note}</header>`,
    `<div class="lead-block">\n${infobox}<div class="lead">\n${leadHtml}</div>\n${tocHtml}</div>`,
    restHtml,
    '</article>',
  ].join('\n');

  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const style = inlineFonts(fs.readFileSync(STYLE, 'utf8'));
  const script = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8') : '';
  return template
    .replace(/\{\{title\}\}/g, escapeHtml(title))
    .replace('{{description}}', escapeHtml(data.description || stripTags(data.note || '')))
    .replace('{{style}}', () => style)
    .replace('{{script}}', () => script.replace(/<\/script/gi, '<\\/script'))
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
  process.stdout.write(renderArticle(fs.readFileSync(file, 'utf8'), {
    articlesDir,
    baseDir: path.dirname(path.resolve(file)),
    onWarn: (w) => process.stderr.write(`warning: ${w}\n`),
  }));
}

/* Footnote previews and instant anchor jumps with a one-shot flash. No dependencies. */
(function () {
  'use strict';

  var OPEN_DELAY = 700; // first preview in a group waits this long
  var SKIP_WINDOW = 300; // a peer opened within this long after a close opens at once
  var CLOSE_GRACE = 120; // time to move the pointer from the marker onto the preview
  var FLASH_MS = 700;
  var FLASH_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
  var EDGE = 16; // viewport margin for the preview
  var GAP = 6; // space between marker and preview

  var doc = document;
  var root = doc.documentElement;

  function byHash(hash) {
    var id = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    if (!id) return null;
    try { id = decodeURIComponent(id); } catch (e) { /* keep it raw */ }
    // ids like "fnref1:1" are not valid selectors, so never use querySelector here
    return doc.getElementById(id);
  }

  /* ---------- Flash: one overlay tint over the jump target, opacity 1 -> 0 ---------- */

  var flashEl = null;
  var flashAnim = null;

  function flash(target) {
    if (!target) return;
    if (flashAnim) flashAnim.cancel();
    if (!flashEl) {
      flashEl = doc.createElement('div');
      flashEl.className = 'jump-flash';
      flashEl.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(flashEl);
    }
    var r = target.getBoundingClientRect();
    var padX = 6;
    var padY = 2;
    var left = Math.max(0, r.left - padX);
    var right = Math.min(root.clientWidth, r.right + padX);
    flashEl.dataset.flashFor = target.id;
    flashEl.style.left = left + window.scrollX + 'px';
    flashEl.style.top = r.top - padY + window.scrollY + 'px';
    flashEl.style.width = Math.max(0, right - left) + 'px';
    flashEl.style.height = r.height + padY * 2 + 'px';
    if (typeof flashEl.animate !== 'function') return;
    flashAnim = flashEl.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FLASH_MS,
      easing: FLASH_EASING,
      fill: 'forwards',
    });
  }

  /* ---------- Anchor jumps: instant, hash updated, focus moved, then the flash ---------- */

  function land(target) {
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
    var focusable = target.matches('a[href], button, input, select, textarea, summary, [tabindex]');
    if (!focusable) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    flash(target);
  }

  doc.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var target = byHash(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    preview.cancel();
    preview.close(true);
    var hash = '#' + target.id;
    if (location.hash !== hash) history.pushState(null, '', hash);
    land(target);
  });

  window.addEventListener('hashchange', function () {
    var t = byHash(location.hash);
    if (t) land(t);
  });

  // Back/Forward between pushed hashes: the browser restores the scroll, we only flash.
  window.addEventListener('popstate', function () {
    var t = byHash(location.hash);
    if (t) flash(t);
  });

  /* ---------- Footnote preview popover ---------- */

  // Reduced motion is handled in CSS (the preview fades instead of scaling).
  var coarse = window.matchMedia ? window.matchMedia('(hover: none), (pointer: coarse)') : { matches: false };

  var preview = (function () {
    var el = doc.createElement('div');
    el.className = 'fn-preview';
    el.id = 'fn-preview';
    el.setAttribute('role', 'tooltip');
    doc.body.appendChild(el);

    var marker = null; // the sup.cite a the preview belongs to
    var openTimer = 0;
    var closeTimer = 0;
    var closedAt = -Infinity;

    function isOpen() { return el.hasAttribute('data-open'); }

    function fill(a) {
      var li = byHash(a.getAttribute('href'));
      el.textContent = '';
      if (!li) return false;
      // The note text only: the citation and its links, without the "^ a b" back-links.
      var text = li.querySelector('.ref-text');
      if (!text) return false;
      el.appendChild(text.cloneNode(true));
      return true;
    }

    function place(a) {
      var m = a.getBoundingClientRect();
      var vw = root.clientWidth;
      var vh = window.innerHeight;
      var w = el.offsetWidth;
      var h = el.offsetHeight;
      var cx = m.left + m.width / 2;
      var left = Math.min(Math.max(EDGE, cx - w / 2), Math.max(EDGE, vw - EDGE - w));
      var below = m.bottom + GAP + h <= vh - EDGE || m.top - GAP - h < EDGE;
      var top = below ? m.bottom + GAP : m.top - GAP - h;
      el.dataset.side = below ? 'below' : 'above';
      el.style.left = left + window.scrollX + 'px';
      el.style.top = top + window.scrollY + 'px';
      // scale from the marker: its centre x, and the edge facing the preview
      el.style.transformOrigin = cx - left + 'px ' + (below ? -GAP : h + GAP) + 'px';
    }

    function open(a, instant) {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      if (marker && marker !== a) marker.removeAttribute('aria-describedby');
      if (!fill(a)) return;
      marker = a;
      if (instant) el.setAttribute('data-instant', '');
      else el.removeAttribute('data-instant');
      place(a);
      el.setAttribute('data-open', '');
      a.setAttribute('aria-describedby', el.id);
    }

    function close(now) {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      if (!isOpen()) return;
      el.removeAttribute('data-instant');
      el.removeAttribute('data-open');
      if (now) el.setAttribute('data-instant', '');
      if (marker) marker.removeAttribute('aria-describedby');
      marker = null;
      closedAt = performance.now();
    }

    function cancel() {
      clearTimeout(openTimer);
    }

    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { close(false); }, CLOSE_GRACE);
    }

    function isTouch(e) {
      return (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') || coarse.matches;
    }

    function citeFrom(node) {
      return node && node.closest ? node.closest('sup.cite a[href^="#"]') : null;
    }

    doc.addEventListener('pointerover', function (e) {
      var a = citeFrom(e.target);
      if (!a || isTouch(e)) return;
      clearTimeout(closeTimer);
      if (marker === a && isOpen()) return;
      clearTimeout(openTimer);
      // already showing a peer, or one closed moments ago: open at once, no animation
      if (isOpen() || performance.now() - closedAt < SKIP_WINDOW) {
        open(a, true);
        return;
      }
      openTimer = setTimeout(function () { open(a, false); }, OPEN_DELAY);
    });

    doc.addEventListener('pointerout', function (e) {
      var a = citeFrom(e.target);
      if (!a || a.contains(e.relatedTarget)) return;
      clearTimeout(openTimer);
      if (isOpen() && marker === a && !el.contains(e.relatedTarget)) scheduleClose();
    });

    el.addEventListener('pointerenter', function () { clearTimeout(closeTimer); });
    el.addEventListener('pointerleave', function (e) {
      if (marker && marker.contains(e.relatedTarget)) return;
      scheduleClose();
    });

    // Keyboard focus opens at once with no animation; a mouse-click focus does nothing.
    doc.addEventListener('focusin', function (e) {
      var a = citeFrom(e.target);
      if (!a || el.contains(a)) return;
      var keyboard = false;
      try { keyboard = a.matches(':focus-visible'); } catch (err) { keyboard = false; }
      if (keyboard && !coarse.matches) open(a, true);
    });

    doc.addEventListener('focusout', function (e) {
      var a = citeFrom(e.target);
      if (!a || a !== marker) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      close(true);
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      var a = marker;
      close(false);
      if (a && el.contains(doc.activeElement)) a.focus({ preventScroll: true });
    });

    // Keep it attached to its marker if the layout shifts under it.
    window.addEventListener('resize', function () { if (isOpen() && marker) place(marker); });

    return { open: open, close: close, cancel: cancel };
  })();

  /* ---------- Initial hash: jump there and flash once the page is laid out ---------- */

  function initialHash() {
    var t = byHash(location.hash);
    if (t) land(t);
  }
  if (location.hash) {
    if (doc.readyState === 'complete') initialHash();
    else window.addEventListener('load', initialHash, { once: true });
  }
})();

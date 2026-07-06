/**
 * Fix Engine — browser overlay (drop-in, no build step).
 *
 * Include once in your app during development:
 *   <script>window.FIX_ENGINE = { endpoint: "http://localhost:4599" };</script>
 *   <script src="http://localhost:4599/fix-engine.js" defer></script>
 *
 * Then: Alt+click any element → a small box opens → type one line → Enter.
 * The capture pins the element AND its context (route, tab, selector chain,
 * nearby text, rect, and — if you tagged containers with data-area/data-src —
 * the source file) so an agent skips the discovery round-trip.
 *
 * Tag your big containers ONCE for pinpoint file targeting:
 *   <section data-area="dashboard/inbox" data-src="src/views/Inbox.tsx"> … </section>
 * Where untagged, capture falls back to route + nearby text.
 */
(function () {
  "use strict";
  if (window.__FIX_ENGINE_LOADED__) return;
  window.__FIX_ENGINE_LOADED__ = true;

  var CFG = window.FIX_ENGINE || {};
  var ENDPOINT = (CFG.endpoint || "http://localhost:4599").replace(/\/$/, "");
  var MAX_TEXT = 200;

  // ---- context capture ------------------------------------------------------

  function cssFor(el) {
    if (el.id) return el.tagName.toLowerCase() + "#" + el.id;
    var sel = el.tagName.toLowerCase();
    var cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean);
    if (cls.length) sel += "." + cls.slice(0, 2).join(".");
    var parent = el.parentElement;
    if (parent) {
      var sameTag = Array.prototype.filter.call(
        parent.children,
        function (c) { return c.tagName === el.tagName; },
      );
      if (sameTag.length > 1) sel += ":nth-of-type(" + (sameTag.indexOf(el) + 1) + ")";
    }
    return sel;
  }

  function taggedAncestor(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.hasAttribute && (node.hasAttribute("data-area") || node.hasAttribute("data-src") ||
          node.hasAttribute("data-source"))) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function selectorChain(el, stopAt) {
    var chain = [];
    var node = el;
    while (node && node !== document.body) {
      chain.unshift(cssFor(node));
      if (node === stopAt) break;
      node = node.parentElement;
    }
    return chain;
  }

  function inferTabState(el) {
    // Best-effort: aria-selected tab, or an enclosing [role=tabpanel] / [data-active-tab].
    var panel = el.closest ? el.closest('[role="tabpanel"],[data-active-tab]') : null;
    if (panel) {
      return panel.getAttribute("data-active-tab") || panel.id ||
        panel.getAttribute("aria-label") || undefined;
    }
    var selected = document.querySelector('[role="tab"][aria-selected="true"]');
    if (selected) return (selected.textContent || "").trim().slice(0, 60) || undefined;
    return undefined;
  }

  function captureContext(el) {
    var r = el.getBoundingClientRect();
    var tagged = taggedAncestor(el);
    return {
      route: location.pathname + location.hash,
      tabState: inferTabState(el),
      selectorChain: selectorChain(el, tagged || undefined),
      anchor: cssFor(el),
      tag: el.tagName.toLowerCase(),
      nearbyText: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      area: tagged ? tagged.getAttribute("data-area") || undefined : undefined,
      sourceFile: tagged
        ? tagged.getAttribute("data-src") || tagged.getAttribute("data-source") || undefined
        : undefined,
      ts: Date.now(),
    };
  }

  // ---- UI -------------------------------------------------------------------

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text != null) n.textContent = text;
    return n;
  }

  var badge = el(
    "div",
    "position:fixed;right:14px;bottom:14px;z-index:2147483646;background:#111;color:#fff;" +
      "font:600 12px system-ui;padding:6px 10px;border-radius:20px;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.3);user-select:none;opacity:.85",
    "🔧 fix: …",
  );
  badge.title = "Alt+click any element to file a fix. Click to open the board.";
  badge.onclick = function () { window.open(ENDPOINT + "/kanban", "_blank"); };
  function mountBadge() { document.body.appendChild(badge); refreshBadge(); }

  function refreshBadge() {
    fetch(ENDPOINT + "/api/summary")
      .then(function (r) { return r.json(); })
      .then(function (s) { badge.textContent = "🔧 " + s.inbox + " · ⏳ " + s.in_progress; })
      .catch(function () { badge.textContent = "🔧 offline"; });
  }

  var openBox = null;
  function closeBox() { if (openBox) { openBox.remove(); openBox = null; } }

  function openFixBox(clientX, clientY, ctx, target) {
    closeBox();
    var prevOutline = target.style.outline;
    target.style.outline = "2px solid #e11";

    var box = el(
      "div",
      "position:fixed;z-index:2147483647;background:#1b1b1b;color:#fff;font:13px system-ui;" +
        "padding:10px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.45);width:280px;" +
        "left:" + Math.min(clientX, window.innerWidth - 300) + "px;top:" +
        Math.min(clientY, window.innerHeight - 130) + "px",
    );
    var label = el(
      "div",
      "font-size:11px;opacity:.6;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
      (ctx.sourceFile || ctx.area || ctx.route) + "  ·  " + ctx.tag,
    );
    var ta = el(
      "textarea",
      "width:100%;box-sizing:border-box;background:#0e0e0e;color:#fff;border:1px solid #333;" +
        "border-radius:6px;padding:6px;resize:vertical;min-height:52px;font:13px system-ui",
    );
    ta.placeholder = "What to fix? (Enter to file, Esc to cancel)";
    var hint = el("div", "font-size:11px;opacity:.5;margin-top:6px", "Enter = file · Shift+Enter = newline");

    box.appendChild(label);
    box.appendChild(ta);
    box.appendChild(hint);
    document.body.appendChild(box);
    openBox = box;
    ta.focus();

    function cleanup() { target.style.outline = prevOutline; closeBox(); }

    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); cleanup(); }
      else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        var note = ta.value.trim();
        if (!note) return cleanup();
        fetch(ENDPOINT + "/api/fix", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: note, context: ctx }),
        }).then(refreshBadge).catch(function () {});
        cleanup();
      }
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      if (!e.altKey) return;
      var t = e.target;
      if (!t || t === badge || (openBox && openBox.contains(t))) return;
      e.preventDefault();
      e.stopPropagation();
      openFixBox(e.clientX, e.clientY, captureContext(t), t);
    },
    true,
  );

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeBox(); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBadge);
  } else {
    mountBadge();
  }
  setInterval(refreshBadge, 4000);
})();

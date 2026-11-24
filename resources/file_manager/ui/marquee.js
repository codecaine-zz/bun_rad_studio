// Rubber-band (marquee) selection: drag a selection rectangle in empty list/icon/details space to select items.
import { $, h } from "./dom.js";
import { emit, state } from "./state.js";
import { paneOf, setActivePane } from "./pane.js";
import { isModifier } from "./util.js";

function rectsIntersect(a, b) {
  return (
    a.right >= b.left &&
    a.left <= b.right &&
    a.bottom >= b.top &&
    a.top <= b.bottom
  );
}

/**
 * Selects all `.row` elements in `pane` ("left" | "right" or pane object) whose bounding client rect intersects `box`
 * (`{ left, top, right, bottom }`). Returns the array of matched row keys.
 */
export function selectRowsInRect(
  pane,
  box,
  {
    additive = false,
    toggle = false,
    baseSelection = null,
    cachedRows = null,
    scrollDeltaX = 0,
    scrollDeltaY = 0,
  } = {},
) {
  const p = typeof pane === "string" ? paneOf(pane) : pane;
  const list =
    p.side === "right" ? document.getElementById("dual-list") : $("#list");
  if (!list) return [];
  const initial = baseSelection ? new Set(baseSelection) : new Set(p.selection);
  const next = additive || toggle ? new Set(initial) : new Set();
  const hits = [];
  if (Array.isArray(cachedRows)) {
    for (const entry of cachedRows) {
      const r =
        scrollDeltaX || scrollDeltaY
          ? {
              left: entry.left - scrollDeltaX,
              top: entry.top - scrollDeltaY,
              right: entry.right - scrollDeltaX,
              bottom: entry.bottom - scrollDeltaY,
            }
          : entry;
      if (rectsIntersect(r, box)) {
        hits.push(entry.key);
        if (toggle && initial.has(entry.key)) next.delete(entry.key);
        else next.add(entry.key);
      }
    }
  } else {
    for (const row of list.querySelectorAll(".row")) {
      const key = row.dataset?.key;
      if (!key) continue;
      const r = row.getBoundingClientRect();
      if (rectsIntersect(r, box)) {
        hits.push(key);
        if (toggle && initial.has(key)) next.delete(key);
        else next.add(key);
      }
    }
  }
  const prevFocus = p.focusKey;
  const nextFocus = hits.length ? hits[hits.length - 1] : p.focusKey;
  const sameSelection =
    next.size === p.selection.size &&
    [...next].every((k) => p.selection.has(k)) &&
    prevFocus === nextFocus;
  p.selection = next;
  if (hits.length) {
    p.focusKey = nextFocus;
    if (!p.anchorKey) p.anchorKey = hits[0];
  }
  if (!sameSelection) emit("selection");
  return hits;
}

export function wireMarquee(pane = "left") {
  const side = typeof pane === "string" ? pane : pane.side;
  const wrap =
    side === "right" ? document.getElementById("dual-wrap") : $("#list-wrap");
  if (!wrap || wrap.dataset.marqueeWired === "1") return;
  wrap.dataset.marqueeWired = "1";

  let suppressNextClick = false;
  wrap.addEventListener(
    "click",
    (e) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  wrap.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const rect = wrap.getBoundingClientRect();
    if (
      e.clientX >= rect.left + wrap.clientWidth ||
      e.clientY >= rect.top + wrap.clientHeight
    ) {
      return;
    }
    if (
      e.target instanceof Element &&
      e.target.closest(".row, button, input, a, .group-header")
    )
      return;
    const startX = e.clientX;
    const startY = e.clientY;
    const additive = e.shiftKey;
    const toggle = isModifier(e, state.platform);
    const baseSelection = new Set(paneOf(side).selection);
    let boxEl = null;
    let dragging = false;
    let cachedRows = null;
    let startScrollTop = 0;
    let startScrollLeft = 0;
    let latestX = startX;
    let latestY = startY;
    let rafId = 0;

    const flushMove = () => {
      rafId = 0;
      if (!dragging || !boxEl) return;
      const left = Math.min(startX, latestX);
      const top = Math.min(startY, latestY);
      const right = Math.max(startX, latestX);
      const bottom = Math.max(startY, latestY);
      boxEl.style.left = `${left}px`;
      boxEl.style.top = `${top}px`;
      boxEl.style.width = `${right - left}px`;
      boxEl.style.height = `${bottom - top}px`;
      const scrollDeltaX = (wrap.scrollLeft || 0) - startScrollLeft;
      const scrollDeltaY = (wrap.scrollTop || 0) - startScrollTop;
      selectRowsInRect(
        side,
        { left, top, right, bottom },
        {
          additive,
          toggle,
          baseSelection,
          cachedRows,
          scrollDeltaX,
          scrollDeltaY,
        },
      );
    };

    const onMove = (ev) => {
      latestX = ev.clientX;
      latestY = ev.clientY;
      const dx = latestX - startX;
      const dy = latestY - startY;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      if (!dragging) {
        dragging = true;
        setActivePane(side);
        startScrollTop = wrap.scrollTop || 0;
        startScrollLeft = wrap.scrollLeft || 0;
        const listEl =
          side === "right" ? document.getElementById("dual-list") : $("#list");
        cachedRows = [];
        if (listEl) {
          for (const row of listEl.querySelectorAll(".row")) {
            const key = row.dataset?.key;
            if (!key) continue;
            const r = row.getBoundingClientRect();
            cachedRows.push({
              key,
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
            });
          }
        }
        boxEl = h("div", { class: "marquee-box", "aria-hidden": "true" });
        document.body.append(boxEl);
      }
      if (typeof requestAnimationFrame === "function") {
        if (!rafId) rafId = requestAnimationFrame(flushMove);
      } else {
        flushMove();
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (rafId) {
        if (typeof cancelAnimationFrame === "function")
          cancelAnimationFrame(rafId);
        rafId = 0;
        flushMove();
      }
      cachedRows = null;
      if (boxEl) {
        boxEl.remove();
        boxEl = null;
      }
      if (dragging) {
        suppressNextClick = true;
        const listEl =
          side === "right" ? document.getElementById("dual-list") : $("#list");
        listEl?.focus?.({ preventScroll: true });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

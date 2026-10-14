// The snippet engine: turns text like "for (let ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}" into plain text plus "tab stops"
// (places the caret jumps between with Tab). DOM-free, so it is unit-tested.
//
//   $1 or ${1}       a stop            ${1:name}   a stop with default text (can nest: ${1:a ${2:b}})
//   same number again = a mirror: it shows whatever is typed in the first one      $0 = where the caret ends up
//   \$  \}  \\       a literal $ } or backslash

const MAX_SNIPPET = 20_000;

function parseNodes(src, state, stopAtBrace) {
  const nodes = [];
  let text = "";
  const flush = () => { if (text) { nodes.push({ t: "text", s: text }); text = ""; } };
  while (state.i < src.length) {
    const c = src[state.i];
    if (c === "\\" && "$}\\".includes(src[state.i + 1] ?? "")) { text += src[state.i + 1]; state.i += 2; continue; }
    if (c === "}" && stopAtBrace) break;
    if (c === "$" && state.depth < 8) {
      const m = /^\$(\d{1,3})/.exec(src.slice(state.i, state.i + 5));
      if (m) { flush(); nodes.push({ t: "stop", n: Number(m[1]), kids: null }); state.i += m[0].length; continue; }
      const b = /^\$\{(\d{1,3})(:|\})/.exec(src.slice(state.i, state.i + 8));
      if (b) {
        flush();
        state.i += b[0].length;
        const n = Number(b[1]);
        if (b[2] === "}") { nodes.push({ t: "stop", n, kids: null }); continue; }
        state.depth++;
        const kids = parseNodes(src, state, true);
        state.depth--;
        if (src[state.i] === "}") state.i++;
        nodes.push({ t: "stop", n, kids });
        continue;
      }
    }
    text += c;
    state.i++;
  }
  flush();
  return nodes;
}

const flat = (nodes) => nodes.map((n) => (n.t === "text" ? n.s : n.kids ? flat(n.kids) : "")).join("");

/**
 * @param {string} src snippet source
 * @param {{indent?: string, unit?: string}} [opts] indent = the current line's leading whitespace (added after each newline);
 *   unit = what a tab in the snippet becomes (default: keep it as a tab)
 * @returns {{text: string, stops: {n: number, ranges: {start: number, end: number}[]}[]}}
 *   stops are in visiting order (1, 2, 3 ... then $0, which is the end of the text when the snippet has no $0)
 */
export function expandSnippet(src, opts = {}) {
  const { indent = "", unit = "\t" } = opts;
  const source = String(src).slice(0, MAX_SNIPPET);
  const nodes = parseNodes(source, { i: 0, depth: 0 }, false);
  const defaults = new Map();
  const collect = (list) => {
    for (const n of list) {
      if (n.t !== "stop") continue;
      if (n.kids && !defaults.has(n.n)) defaults.set(n.n, n.kids);
      if (n.kids) collect(n.kids);
    }
  };
  collect(nodes);
  const shape = (s) => s.replaceAll("\r", "").replaceAll("\n", `\n${indent}`).replaceAll("\t", unit);
  let out = "";
  const found = new Map();
  const render = (list, depth) => {
    for (const n of list) {
      if (n.t === "text") { out += shape(n.s); continue; }
      const start = out.length;
      const kids = n.kids ?? (depth < 4 ? defaults.get(n.n) ?? null : null);
      if (kids) render(kids, depth + 1);
      const ranges = found.get(n.n) ?? [];
      ranges.push({ start, end: out.length });
      found.set(n.n, ranges);
    }
  };
  render(nodes, 0);
  const stops = [...found.keys()].filter((n) => n !== 0).sort((a, b) => a - b).map((n) => ({ n, ranges: found.get(n) }));
  stops.push({ n: 0, ranges: found.get(0)?.slice(0, 1) ?? [{ start: out.length, end: out.length }] });
  return { text: out, stops };
}

/** Plain text of a snippet with every stop replaced by its default (for the preview shown next to a snippet). */
export function snippetPreview(src) {
  const nodes = parseNodes(String(src).slice(0, MAX_SNIPPET), { i: 0, depth: 0 }, false);
  const defaults = new Map();
  const collect = (list) => list.forEach((n) => { if (n.t === "stop" && n.kids) { if (!defaults.has(n.n)) defaults.set(n.n, n.kids); collect(n.kids); } });
  collect(nodes);
  const out = (list, depth) => list.map((n) => (n.t === "text" ? n.s : depth > 4 ? "" : out(n.kids ?? defaults.get(n.n) ?? [], depth + 1))).join("");
  return out(nodes, 0);
}

/**
 * A live snippet: keeps the stop ranges in step with the document while the person types, and keeps mirrors equal to
 * the stop being edited. Positions are document offsets.
 */
export function createSnippetSession(expanded, base) {
  const stops = expanded.stops.map((s) => ({ n: s.n, ranges: s.ranges.map((r) => ({ start: r.start + base, end: r.end + base })) }));
  let index = 0;
  const session = {
    get index() { return index; },
    get done() { return index < 0; },
    get count() { return stops.length; },
    current() { return index < 0 ? null : stops[index].ranges[0]; },
    /** Range to select for the current stop (null when finished). */
    select() { return session.current() ? { ...session.current() } : null; },
    /** Moves to the next (or previous) stop and returns its range; arriving at $0 or moving past the end finishes the session. */
    move(step) {
      if (index < 0) return null;
      const to = index + step;
      if (to < 0) return session.select();
      if (to >= stops.length) { index = -1; return null; }
      index = to;
      const range = { ...stops[index].ranges[0] };
      if (stops[index].n === 0) index = -1;
      return range;
    },
    /** Is this position still inside the snippet's text? */
    contains(pos) {
      if (index < 0) return false;
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of stops) for (const r of s.ranges) { lo = Math.min(lo, r.start); hi = Math.max(hi, r.end); }
      return pos >= lo && pos <= hi;
    },
    /**
     * Tell the session the document changed: `from..to` was replaced by `insertLen` characters; `text` is the new
     * document. Returns the edits (descending positions, in the new document's coordinates) that bring mirrors up to date.
     */
    change(text, from, to, insertLen) {
      if (index < 0) return [];
      const delta = insertLen - (to - from);
      const live = new Set(stops[index].ranges);
      for (const s of stops) {
        for (const r of s.ranges) {
          const mine = live.has(r);
          if (r.end < from || (r.end === from && !(mine && from === to))) continue;
          if (r.start >= to && !(r.start === from && r.end === from && mine)) { r.start += delta; r.end += delta; continue; }
          if (r.start >= to && r.start === from) { r.end += delta; continue; }
          r.start = Math.min(r.start, from);
          r.end = r.end >= to ? r.end + delta : from + insertLen;
        }
      }
      const [main, ...mirrors] = stops[index].ranges;
      const value = text.slice(main.start, main.end);
      const targets = mirrors.filter((r) => text.slice(r.start, r.end) !== value).sort((a, b) => a.start - b.start);
      if (!targets.length) return [];
      const edits = targets.map((r) => ({ from: r.start, to: r.end, insert: value, range: r }));
      const size = (e) => e.insert.length - (e.to - e.from);
      for (const s of stops) {
        for (const r of s.ranges) {
          const mine = edits.find((e) => e.range === r);
          let before = 0;
          for (const e of edits) if (e.to <= (mine ? mine.from : r.start) && e !== mine) before += size(e);
          if (mine) { r.start += before; r.end = r.start + value.length; continue; }
          let inside = 0;
          for (const e of edits) if (e.from >= r.start && e.to <= r.end && e.to > r.start) inside += size(e);
          r.start += before;
          r.end += before + inside;
        }
      }
      return edits.map(({ from, to, insert }) => ({ from, to, insert })).reverse();
    },
  };
  return session;
}

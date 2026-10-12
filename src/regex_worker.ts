import { runRegexSync, replaceSync } from "./regex_tools";

// Runs regex work off the main thread so a catastrophic pattern can be terminated by a timeout.
const g = globalThis as any;
g.onmessage = (e: MessageEvent) => {
  const d = e.data;
  try {
    if (d.op === "replace") g.postMessage(replaceSync(d.pattern, d.flags, d.corpus, d.subst));
    else g.postMessage(runRegexSync(d.pattern, d.flags, d.corpus, d.limit));
  } catch (err: any) {
    g.postMessage({ matches: [], capped: false, ms: 0, text: d.corpus ?? "", count: 0, error: String(err?.message || err) });
  }
};

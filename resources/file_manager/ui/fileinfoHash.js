// "More info": fingerprints of a file (MD5, SHA-1, SHA-256, SHA-512, CRC32 by default; SHA-3, BLAKE2 and the fast checksums
// can be ticked), worked out on demand with progress, a Cancel button, and a box to compare with a fingerprint you were given.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { copyButton } from "./fileinfoRender.js";

/**
 * @param {string} path
 * @param {{ onChange?: () => void }} [options]
 */
export function hashSection(path, { onChange } = {}) {
  let rows = [];
  let skipped = [];
  let taskId = "";
  let timer = 0;
  let stopped = false;
  let kinds = null;
  let pendingAutoCompare = false;
  let matchedId = null;
  const ticked = new Set();

  const status = h("p", {
    class: "fi-hash-status",
    role: "status",
    "aria-live": "polite",
  });
  const progress = h("progress", {
    class: "fi-progress",
    max: "100",
    value: "0",
    hidden: true,
    "aria-label": "How far the fingerprints are",
  });
  const results = h("div", { class: "fi-hash-results" });
  const compareResult = h("p", {
    class: "fi-compare-result",
    role: "status",
    "aria-live": "polite",
  });
  const input = h("input", {
    type: "text",
    class: "text-input fi-compare-input",
    spellcheck: "false",
    autocomplete: "off",
    placeholder: "Paste a fingerprint, like sha256:9f86d0…",
    "aria-label": "A fingerprint to compare with",
    title:
      "Paste the fingerprint from the download page. Spaces, capitals and a name like sha256: in front are fine.",
  });
  const compare = h(
    "button",
    {
      type: "button",
      class: "btn",
      disabled: true,
      title: "Check whether the fingerprint you pasted matches this file",
      onclick: () => void check(),
    },
    "Compare",
  );
  const pasteVerify = h(
    "button",
    {
      type: "button",
      class: "btn fi-paste-verify",
      title:
        "Paste a checksum from your clipboard and verify it against this file automatically",
      onclick: async () => {
        let clip = "";
        try {
          clip = (await navigator.clipboard?.readText?.()) || "";
        } catch {}
        if (!clip) {
          try {
            const res = await call("pastetext", {});
            clip = res?.text || "";
          } catch {}
        }
        if (!clip.trim()) {
          compareResult.textContent =
            "Your clipboard is empty — copy a checksum first, then click Paste & Verify.";
          compareResult.className = "fi-compare-result fi-warn";
          return;
        }
        input.value = clip.trim();
        compare.disabled = !input.value.trim();
        await check();
      },
    },
    "📋 Paste & Verify",
  );
  const comparer = h(
    "div",
    { class: "fi-compare" },
    input,
    compare,
    pasteVerify,
    compareResult,
  );
  const cancel = h(
    "button",
    {
      type: "button",
      class: "btn",
      hidden: true,
      title: "Stop working out the fingerprints",
      onclick: () => stop(),
    },
    "Cancel",
  );
  const kindsBox = h(
    "details",
    { class: "fi-kinds" },
    h(
      "summary",
      {
        title:
          "Choose which kinds of fingerprint to work out. The usual five are ticked. Each extra kind makes a big file take a little longer.",
      },
      "More kinds…",
    ),
    h("div", { class: "fi-kinds-body" }),
  );
  kindsBox.addEventListener("toggle", () => kindsBox.open && loadKinds());
  const start = h(
    "button",
    {
      type: "button",
      class: "btn",
      title:
        "Work out MD5, SHA-1, SHA-256, SHA-512 and CRC32 of this file (open More kinds… to choose others). Big files take a while; you can cancel.",
      onclick: () => begin(),
    },
    "Calculate fingerprints",
  );

  input.addEventListener("input", () => {
    compare.disabled = !input.value.trim();
    if (!input.value.trim()) {
      matchedId = null;
      compareResult.textContent = "";
      applyMatchedHighlight();
    }
  });
  input.addEventListener("paste", () => {
    queueMicrotask(() => {
      compare.disabled = !input.value.trim();
      if (input.value.trim()) void check();
    });
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !compare.disabled) {
      e.preventDefault();
      void check();
    }
  });

  async function loadKinds() {
    if (kinds) return;
    try {
      kinds = await call("info/hashkinds");
    } catch {
      kindsBox.lastElementChild.replaceChildren(
        h("p", { class: "fi-warn" }, "The list of kinds couldn't be loaded."),
      );
      return;
    }
    for (const id of kinds.defaults) ticked.add(id);
    const groups = [
      ["classic", "The usual kinds"],
      ["more", "More secure kinds"],
      ["legacy", "Old and broken (only for old systems)"],
      ["fast", kinds.fastTitle],
    ];
    kindsBox.lastElementChild.replaceChildren(
      ...groups.map(([group, title]) =>
        h(
          "fieldset",
          { class: "fi-kinds-group" },
          h(
            "legend",
            { class: group === "fast" || group === "legacy" ? "fi-warn" : "" },
            title,
          ),
          kinds.kinds
            .filter((k) => k.group === group)
            .map((k) => {
              const box = h("input", {
                type: "checkbox",
                dataset: { kindId: k.id },
                title: k.hint,
                onchange: () =>
                  box.checked ? ticked.add(k.id) : ticked.delete(k.id),
              });
              box.checked = ticked.has(k.id);
              return h(
                "label",
                { class: "fi-kind", title: k.hint },
                box,
                ` ${k.label}`,
              );
            }),
        ),
      ),
    );
  }

  function table(list, caption) {
    return h(
      "table",
      { class: "fi-table fi-hash-table" },
      h("caption", { class: "sr-only" }, caption),
      h(
        "colgroup",
        {},
        h("col", { class: "fi-col-label" }),
        h("col", {}),
        h("col", { class: "fi-col-act" }),
      ),
      h(
        "thead",
        { class: "sr-only" },
        h(
          "tr",
          {},
          h("th", { scope: "col" }, "Kind"),
          h("th", { scope: "col" }, "Fingerprint"),
          h("th", { scope: "col" }, "Copy"),
        ),
      ),
      h(
        "tbody",
        {},
        list.map((r) => {
          const isMatch = Boolean(matchedId && r.id === matchedId);
          return h(
            "tr",
            {
              class: `fi-row${isMatch ? " fi-hash-row-match" : ""}`,
              dataset: { hashId: r.id },
              "aria-current": isMatch ? "true" : null,
            },
            h(
              "th",
              { scope: "row", class: "fi-label", title: r.hint },
              r.label,
            ),
            h("td", { class: "fi-value fi-mono" }, r.value),
            h(
              "td",
              { class: "fi-act" },
              copyButton(r.label, () => r.value),
            ),
          );
        }),
      ),
    );
  }

  function draw() {
    results.replaceChildren();
    if (!rows.length) return;
    const fast = rows.filter((r) => r.group === "fast");
    results.append(
      table(
        rows.filter((r) => r.group !== "fast"),
        "Fingerprints of the file",
      ),
    );
    if (fast.length)
      results.append(
        h(
          "p",
          { class: "fi-warn" },
          kinds?.fastTitle ??
            "Fast checksums (to spot accidental changes only, NOT secure)",
        ),
        table(fast, "Fast checksums of the file"),
      );
    if (skipped.length)
      results.append(
        h(
          "ul",
          { class: "fi-hash-skipped" },
          skipped.map((x) => h("li", {}, `${x.label}: ${x.reason}`)),
        ),
      );
  }

  async function begin() {
    stopped = false;
    start.disabled = true;
    cancel.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = "Working it out…";
    if (!pendingAutoCompare) compareResult.textContent = "";
    try {
      taskId = (
        await call("info/hash", {
          path,
          algorithms: kinds && ticked.size ? [...ticked] : undefined,
        })
      ).task.id;
    } catch (err) {
      finish(err instanceof ApiError ? err.message : "That didn't start.");
      return;
    }
    poll();
  }

  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    let task;
    try {
      task = (await call("info/task", { id: taskId })).task;
    } catch (err) {
      return finish(
        err instanceof ApiError ? err.message : "Lost track of the job.",
      );
    }
    if (task.state === "running") {
      progress.max = Math.max(1, task.total);
      progress.value = task.done;
      status.textContent = task.total
        ? `Working it out… ${Math.floor((task.done / task.total) * 100)}%`
        : "Working it out…";
      timer = setTimeout(poll, 250);
    } else if (task.state === "done") {
      rows = task.result.rows;
      skipped = task.result.skipped ?? [];
      finish(
        `Done. ${rows.length} fingerprints of ${task.result.size.toLocaleString("en-US")} bytes.`,
      );
      comparer.hidden = false;
      compare.disabled = !input.value.trim();
      draw();
      onChange?.();
      if (pendingAutoCompare && input.value.trim()) {
        pendingAutoCompare = false;
        void check();
      }
    } else
      finish(
        task.state === "cancelled"
          ? "Stopped."
          : task.error || "That didn't work.",
      );
  }

  function finish(message) {
    clearTimeout(timer);
    start.disabled = false;
    start.textContent = rows.length
      ? "Calculate again"
      : "Calculate fingerprints";
    cancel.hidden = true;
    progress.hidden = true;
    status.textContent = message;
  }

  function stop() {
    stopped = true;
    pendingAutoCompare = false;
    if (taskId) call("info/cancel", { id: taskId }).catch(() => {});
    finish("Stopped.");
  }

  function applyMatchedHighlight() {
    for (const tr of results.querySelectorAll("tr[data-hash-id]")) {
      const isMatch = Boolean(matchedId && tr.dataset.hashId === matchedId);
      tr.classList.toggle("fi-hash-row-match", isMatch);
      if (isMatch) tr.setAttribute("aria-current", "true");
      else tr.removeAttribute("aria-current");
      const badge = tr.querySelector(".fi-hash-match-badge");
      if (badge) badge.hidden = !isMatch;
    }
  }

  const PREFIX_ALIASES = {
    sha2256: "sha256",
    sha2512: "sha512",
    sha2384: "sha384",
    sha2224: "sha224",
    crc: "crc32",
  };

  async function ensurePrefixedKindTicked(expectedText) {
    const prefix = /^([a-z][a-z0-9\-/]*)\s*(?:\([^)\r\n]*\)\s*=|[:=(])/i.exec(
      String(expectedText || "").trim(),
    );
    if (!prefix) return null;
    await loadKinds();
    if (!kinds?.kinds) return null;
    const rawNorm = prefix[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    const norm = PREFIX_ALIASES[rawNorm] || rawNorm;
    const hit = kinds.kinds.find(
      (k) =>
        k.id.toLowerCase().replace(/[^a-z0-9]/g, "") === norm ||
        k.label.toLowerCase().replace(/[^a-z0-9]/g, "") === norm,
    );
    if (hit) {
      ticked.add(hit.id);
      const box = kindsBox.querySelector(`input[data-kind-id="${hit.id}"]`);
      if (box) box.checked = true;
      return hit.id;
    }
    return null;
  }

  async function check() {
    if (!input.value.trim()) return;
    const neededId = await ensurePrefixedKindTicked(input.value);
    if (!rows.length || (neededId && !rows.some((r) => r.id === neededId))) {
      pendingAutoCompare = true;
      compareResult.textContent =
        "Calculating fingerprints to verify your pasted checksum…";
      compareResult.className = "fi-compare-result";
      if (!start.disabled) await begin();
      return;
    }
    compareResult.textContent = "";
    try {
      const fileName = String(path || "")
        .split(/[\\/]/)
        .pop();
      const r = await call("info/compare", {
        expected: input.value,
        rows: rows.map(({ id, value }) => ({ id, value })),
        ...(fileName ? { fileName } : {}),
      });
      matchedId = r.matched || null;
      applyMatchedHighlight();
      compareResult.textContent = `${r.matched ? "✔ Match. " : "✖ No match. "}${r.hint}`;
      compareResult.className = `fi-compare-result ${r.matched ? "fi-good" : "fi-warn"}`;
    } catch (err) {
      matchedId = null;
      applyMatchedHighlight();
      compareResult.textContent =
        err instanceof ApiError ? err.message : "That didn't work.";
      compareResult.className = "fi-compare-result fi-warn";
    }
  }

  const el = h(
    "section",
    { class: "fi-group fi-hashes", dataset: { group: "hashes" } },
    h(
      "h3",
      {
        class: "fi-title",
        title:
          "A fingerprint (hash) is a short code worked out from the whole file. Two files with the same fingerprint are the same file, so it proves a download wasn't damaged or changed.",
      },
      "Fingerprints (hashes)",
    ),
    h("div", { class: "fi-hash-actions" }, start, cancel, progress),
    kindsBox,
    status,
    results,
    comparer,
  );

  return {
    el,
    /** The rows for the report (empty until calculated). */
    group: () => ({
      id: "hashes",
      title: "Fingerprints (hashes)",
      hint: "Short codes worked out from the whole file.",
      rows: rows.map((r) => ({ label: r.label, value: r.value, hint: r.hint })),
    }),
    /** Stops any running work (when the window closes). */
    dispose() {
      stopped = true;
      clearTimeout(timer);
      if (taskId && !rows.length)
        call("info/cancel", { id: taskId }).catch(() => {});
    },
  };
}

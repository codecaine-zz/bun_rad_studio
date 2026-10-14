// "Find" tool of the Power tools panel. (Placeholder until the tool is built.)
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "find", label: "Find", icon: "🔎", tip: "Advanced file search: patterns, filters, contents, duplicates, bulk actions",
  mount(root) {
    root.append(h("p", { class: "pw-hint" }, "Coming soon."));
  },
});

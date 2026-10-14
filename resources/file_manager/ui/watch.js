// "Watch" tool of the Power tools panel. (Placeholder until the tool is built.)
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "watch", label: "Watch", icon: "👀", tip: "Run a command whenever files change",
  mount(root) {
    root.append(h("p", { class: "pw-hint" }, "Coming soon."));
  },
});

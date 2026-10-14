// "IP info" tool of the Power tools panel. (Placeholder until the tool is built.)
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "ip", label: "IP info", icon: "🌍", tip: "Look up an IP address or domain, and subnet tools",
  mount(root) {
    root.append(h("p", { class: "pw-hint" }, "Coming soon."));
  },
});

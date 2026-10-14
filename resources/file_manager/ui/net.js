// "Network" tool of the Power tools panel. (Placeholder until the tool is built.)
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "net", label: "Network", icon: "📡", tip: "Ports, DNS, TLS certificates and connection checks",
  mount(root) {
    root.append(h("p", { class: "pw-hint" }, "Coming soon."));
  },
});

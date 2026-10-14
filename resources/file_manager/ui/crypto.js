// "Crypto" tool of the Power tools panel. (Placeholder until the tool is built.)
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "crypto", label: "Crypto", icon: "🔐", tip: "Hashes, encryption, tokens, passwords and encoders",
  mount(root) {
    root.append(h("p", { class: "pw-hint" }, "Coming soon."));
  },
});

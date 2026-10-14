// "Calculator" tool of the Power tools panel: the Universal Calculator and IntuitionLab suite, inside the File Manager.
import { mountEmbedded } from "./embed.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "calc", label: "Calculator", icon: "🧮", tip: "Scientific, graphing, programmer and unit calculators, plus the maths and physics lab",
  mount(root) {
    return mountEmbedded(root, {
      id: "calc", title: "Universal Calculator",
      note: "The Universal Calculator and IntuitionLab suite. It works on this computer; maths typesetting is loaded from the internet when you have it.",
    });
  },
});

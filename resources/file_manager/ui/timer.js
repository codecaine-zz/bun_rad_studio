// "Timer" tool of the Power tools panel: the interval timer and calisthenics suite, inside the File Manager.
import { mountEmbedded } from "./embed.js";
import { registerPowerTab } from "./power.js";

registerPowerTab({
  id: "timer", label: "Timer", icon: "⏱️", tip: "Interval timer for workouts, study sprints and cooking, with sound cues and music",
  mount(root) {
    return mountEmbedded(root, {
      id: "timer", title: "Interval Timer",
      note: "The Interval Timer suite. It keeps running when you switch to another tool. Fonts, sound and the music player load from the internet when you have it.",
    });
  },
});

import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `world_time_zones_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const worldTimeZonesStudioTips: HelpTips = {
  "#search-input": "Type part of a city or region name, such as London or New York, or a UTC offset such as +5:30, to show only the matching time zone cards. Clear the box to see all of them.",
  "#toggle-format-btn": "Switch the clocks between the 12-hour format (with AM/PM) and the 24-hour format. The button shows the format you will get when you press it.",
};

/** Controls that need no tip, each with a reason. */
export const worldTimeZonesStudioSkip: SkipRule[] = [];

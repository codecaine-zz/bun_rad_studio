/**
 * Help tooltips for every studio window that is not a game.
 *
 * One small script is added to a page. It gives each button, field, select and tab a tooltip that says what it
 * does, taken from a help dictionary for that app (`src/shared/help/<appId>.ts`) or, failing that, from the
 * control's own `title`. The tooltip is shown after a short pause over a control and at once when a control gets
 * the keyboard focus, so it works for people who do not use a mouse. It is plain text, themed by the page's own
 * colors, and described to screen readers with `aria-describedby`.
 *
 * Dictionary keys (the first that matches wins, in this order):
 *   #id           the element's id
 *   aria:Label    its aria-label
 *   text:Label    its visible text (case and leading icons or emoji ignored)
 *   text^:Start   its visible text starts with this (for labels that carry a changing count)
 *   ph:Hint       its placeholder
 *   name:field    its name attribute
 *   .class        one of its classes
 *
* The matching code (`helpMatch.ts`) and the in-page code (`helpEngine.ts`) are ordinary functions. They are copied as source into the page, and the tests
 * run the very same functions on each app's generated HTML, so what the tests check is what the user gets.
 */
import { HELP_TIPS } from "./help";

import { runHelpEngine } from "./helpEngine";
import { INTERACTIVE_SELECTOR, matchTip, normalizeLabel, type ElementInfo, type HelpTips } from "./helpMatch";

export { INTERACTIVE_SELECTOR, matchTip, normalizeLabel };
export type { ElementInfo, HelpTips };

/** The script text for one app's page. */
export function helpScript(tips: HelpTips): string {
  const json = JSON.stringify(tips).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<script>(function(){\n${normalizeLabel.toString()}\n${matchTip.toString()}\n${runHelpEngine.toString()}\nrunHelpEngine(${json}, ${JSON.stringify(INTERACTIVE_SELECTOR)});\n})();</script>`;
}

/** Adds the help script to a page, once, just before the closing body tag. */
export function injectHelp(html: string, appId: string | undefined): string {
  if (html.includes("studio-tip")) return html;
  const tips = (appId && HELP_TIPS[appId]) || {};
  const script = helpScript(tips);
  const marked = `<!-- studio-help:${(appId ?? "").replace(/[^A-Za-z0-9_-]/g, "")} -->${script}`;
  const i = html.lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + marked + html.slice(i) : html + marked;
}

export { HELP_TIPS };

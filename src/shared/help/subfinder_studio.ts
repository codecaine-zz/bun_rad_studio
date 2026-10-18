import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `subfinder_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const subfinderStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Save the window size, theme and what you typed or ticked in the boxes, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_domain": "The website to look up, such as example.com. A leading https:// or a trailing path is removed for you. Press Enter to start.",
  "#txt_timeout": "Meant as the seconds to wait for each source. The current search ignores this box, so changing it has no effect.",
  "#txt_ports": "Meant as the ports to check on each host, such as 80,443. The current search ignores this box, so the Open Ports column stays empty.",
  "#btn_start": "Search public sources (certificate logs, HackerTarget) and a list of common names such as www or mail for subdomains of the target. Needs internet and can take a while; results fill the table below.",
  "#chk_active": "ON: keep only subdomains that resolve to an IP address in DNS (the name lookup system). OFF: also list names that were found but do not resolve.",
  "#chk_probe": "ON: also ask each host over HTTP and show its status code, such as 200. Slower. OFF: skip this step.",
  "#chk_wildcard": "Meant to flag names that only resolve because the domain answers every name (wildcard DNS). The current search ignores this box.",
  "#btn_copy_list": "Replace the output console with the host names found, one per line, ready to select and copy. It does not use the clipboard itself.",
  "#btn_export_json": "Replace the output console with the full results as JSON text (host, IPs, sources, HTTP status). Nothing is written to a file.",
  "#btn_clear": "Empty the results table and the output console.",
  "#console_subs": "Progress messages and results of the search. Copy and Export buttons write their text here.",
};

/** Controls that need no tip, each with a reason. */
export const subfinderStudioSkip: SkipRule[] = [];

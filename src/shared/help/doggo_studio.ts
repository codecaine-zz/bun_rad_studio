import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `doggo_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const doggoStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_target": "The website name or IP address to look up, such as example.com or 8.8.8.8. Press Enter to run the query. An IP address is looked up in reverse (PTR) automatically.",
  "#dd_type": "The kind of DNS record to ask for: A is an IPv4 address, AAAA an IPv6 address, MX the mail servers, TXT free text, NS the name servers. ALL (Parallel) asks for A, AAAA, MX, TXT and NS together.",
  "#txt_ns": "Optional. The DNS server to ask instead of your computer's default, for example @1.1.1.1 or 8.8.8.8. Leave empty to use the default. It is ignored when DoH is on. Press Enter to run the query.",
  "#btn_query": "Ask DNS for the record type chosen above and list the answers in the table and the raw output. The window also runs this once when it opens.",
  "#chk_doh": "ON sends the question over HTTPS to the DoH endpoint below instead of normal DNS. OFF uses normal DNS (UDP) and the Nameserver box.",
  "#chk_reverse": "ON turns a lookup into a reverse (PTR) lookup, which finds the name that belongs to an IP address. Typing an IP address as the target does this by itself.",
  "#txt_doh_url": "The address of a DNS-over-HTTPS server, such as https://cloudflare-dns.com/dns-query. Only used when DoH is on.",
  "#btn_query_all": "Look up A, AAAA, MX, TXT and NS records for the target at once, whatever the Record Type says, and list all answers together.",
  "#btn_export_json": "Show the latest result as JSON in the raw output box so you can copy it. Nothing is saved to a file.",
  "#btn_clear": "Empty the target box, the answers table and the raw output. The summary figures at the top keep their last values.",
  "#console_doggo": "The raw answer from the last lookup, or an error message. You can select and copy text from it.",
};

/** Controls that need no tip, each with a reason. */
export const doggoStudioSkip: SkipRule[] = [
];

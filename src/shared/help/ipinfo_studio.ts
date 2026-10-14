import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `ipinfo_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const ipinfoStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_target": "What to look up: an IP address (1.1.1.1), a website name (github.com) or a CIDR range (192.168.1.0/24). Press Enter to run. Empty means your own public IP. Several tools below also read this box.",
  "#txt_token": "Optional. Your personal ipinfo.io access token, sent with lookups to the ipinfo.io service. It is not needed for occasional lookups; a token helps if the free limit is reached.",
  "#btn_search": "Look up the target. An IP or website shows its place, provider (ASN) and time zone from ipinfo.io. A CIDR range shows the subnet details instead. Private addresses are not sent online.",
  "#btn_my_ip": "Find the public IP address your internet connection shows to websites, and show where it is registered. This needs an internet connection.",
  "#btn_calc_subnet": "Work out the facts of the CIDR range in the target box, such as 192.168.1.0/24: network and broadcast address, netmask, first and last usable host, and how many hosts fit.",
  "#btn_local_ifaces": "List the network adapters of this computer with their IP and MAC addresses. Click a row in the table to look that address up.",
  "#btn_open_map": "Open the place of the last looked-up IP in Google Maps in your web browser. Look up an IP first; private addresses have no place.",
  "#btn_copy_json": "Copy the last result (an IP lookup or subnet) as JSON text to the clipboard and show it in the output box below.",
  "#btn_copy_csv": "Copy the last result as one header line and one value line (CSV, which spreadsheets can open) to the clipboard and show it in the output box below.",
  "#btn_clear": "Empty the target box, the summary line, the table and the output box.",
  "#txt_bulk": "Type or paste many targets here, one IP or website name per line. Lines starting with # are ignored. Only the first 50 different targets are used.",
  "#btn_bulk_load": "Choose a text file and put its lines into the bulk list. Replaces what is in the list now.",
  "#btn_bulk_run": "Look up every target in the bulk list one after another, then show one table row per target. Many targets can take a while and the window waits until it is done.",
  "#btn_copy_ip": "Copy the IP address of the current result to the clipboard (for a subnet, its network address).",
  "#btn_copy_table": "Copy the table above as tab-separated text, ready to paste into a spreadsheet.",
  "#btn_save_results": "Save the current result to a file you choose. Name it .csv for a spreadsheet file, or .json for JSON. Needs something in the table.",
  "#btn_open_ipinfo": "Open the ipinfo.io page of the current IP in your web browser.",
  "#btn_open_bgp": "Open a BGP page for the current IP in your web browser, showing the network (ASN) that owns it and how it is routed.",
  "#txt_check_ip": "An IP address to test against the CIDR range in the target box, such as 192.168.1.77.",
  "#btn_in_cidr": "Say whether the Test IP is inside the CIDR range typed in the target box (for example 192.168.1.0/24). Both boxes must be filled in.",
  "#txt_split_prefix": "The size of the smaller blocks, as a number from 0 to 32. It must be bigger than the target's own prefix; for 10.0.0.0/16, 24 gives /24 blocks.",
  "#btn_split_cidr": "Cut the CIDR range in the target box into smaller ranges of the size in the box on the left. At most the first 256 blocks are listed.",
  "#btn_ip_formats": "Show the IPv4 address in the target box in other forms: whole number, hexadecimal, binary, octal and its reverse-DNS name.",
  "#btn_mask_convert": "Convert between a prefix length and a netmask. Type /24 or 24 in the target box to get 255.255.255.0, or a mask to get its prefix.",
  "text^:https://maps.google.com": "A link to the looked-up place in Google Maps. It opens in your web browser.",
  "#btn_clear_history": "Forget the list of recent lookups. This only clears the list, not your results.",
  "#console_ipinfo": "The text version of the latest result: summary and raw JSON for a lookup, or the list for subnets, interfaces and bulk runs. You can select and copy text from it.",
};

/** Controls that need no tip, each with a reason. */
export const ipinfoStudioSkip: SkipRule[] = [];

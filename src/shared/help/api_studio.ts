import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `api_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const apiStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme and everything in the boxes below (URL, headers, body, variables, options) so it is still here next time you open this app. The auth type and credential are saved too.",
  "#btn_save_req_file": "Save this request (method, URL, headers, query, body, variables and auth type) to a .apireq.json file you can share or reopen later. The token or password is not written to the file.",
  "#btn_load_req_file": "Load a request from a saved .apireq.json file and fill in the boxes below. If it used authentication you must type the token or password again.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#dd_presets": "Pick a ready-made example request (JSONPlaceholder, GitHub, HTTPBin). It fills in the URL and method, sometimes the headers or body too, and sends the request straight away.",
  "#dd_auth": "How to prove who you are to the server. None sends nothing. The other choices turn the text in the box on the right into an Authorization header (Bearer token or Basic user:pass) or an X-API-Key header.",
  "#txt_auth": "The secret for the chosen auth type: a token for Bearer, user:password for Basic, or the key for API Key Header. It is ignored when Auth Mode is None and is not written to request files.",
  "#btn_copy_curl": "Copy this request as a cURL command (a command-line way to send the same request) to the clipboard, with variables and auth filled in. The command is also written to the log at the bottom.",
  "#dd_method": "The HTTP method: GET reads data, POST creates it, PUT replaces it, PATCH changes part of it, DELETE removes it, HEAD fetches only headers, OPTIONS asks what is allowed. The body is not sent for GET, HEAD or OPTIONS.",
  "#txt_url": "The address to call, such as https://api.example.com/items. Without http:// or https:// the app adds https:// (http:// for localhost). You can use variables like {{baseUrl}}/todos/1.",
  "#txt_headers": "Extra request headers, one per line as Name: Value, for example Accept: application/json. Variables such as {{token}} are filled in before sending.",
  "#btn_send": "Send the request with the method, URL, headers, query and body above. The reply appears in the response box and headers table, and the request is added to the history.",
  "#btn_bench": "Send the same request many times (Benchmark requests, at most 200, several at once) and show average, minimum, p50/p95/p99 and maximum times in the log. Asks first for methods that can change data.",
  "#txt_query": "URL query parameters, one key=value per line, for example page=1. They are added to the URL after a ?. Variables are allowed.",
  "#txt_req_body": "The data to send with POST, PUT, PATCH or DELETE, usually JSON. Not sent for GET, HEAD or OPTIONS. A Content-Type header is added for you if you did not set one.",
  "#btn_format_body": "Re-indent the request body so the JSON is easy to read. Shows a message if the body is not valid JSON and leaves it as it is.",
  "#txt_vars": "Your own named values, one NAME=value per line. Write {{NAME}} in the URL, headers, query, body or auth to use one. Built in: {{$uuid}}, {{$timestamp}} and {{$randomInt}}. Sending stops if a name is undefined.",
  "#chk_follow": "ON: follow redirects (the server says the page moved) to the new address. OFF: stop at the first reply.",
  "#chk_insecure": "ON: accept servers with an invalid or self-signed TLS certificate. Unsafe on the public internet; use only for servers you trust. OFF: refuse them.",
  "#chk_pretty": "ON: show JSON responses indented and easy to read. OFF: show the response exactly as received.",
  "#txt_timeout": "How many seconds to wait for a reply before giving up. A number from 1 to 300; the default is 10.",
  "#txt_bench_n": "How many requests the benchmark sends in total. A number from 1 to 200.",
  "#txt_bench_c": "How many benchmark requests are in flight at the same time. A number from 1 to 20.",
  "#txt_curl_import": "Paste a cURL command here, for example from Chrome DevTools (right-click a request, Copy as cURL). Then press Import cURL.",
  "#btn_import_curl": "Read the pasted cURL command and fill in the method, URL, headers, body and options above. It empties the query box and sets the auth type if the command had a login.",
  "#btn_copy_resp": "Copy the full response body to the clipboard. Does nothing until a request has been sent.",
  "#btn_export_resp": "Save the full response body to a file (api_response.json by default). Does nothing until a request has been sent.",
  "#btn_clear_resp": "Empty the response box and the response headers table.",
  "#txt_filter": "A query to pick part of the JSON response, for example .title or .items | map(.name). Leave it empty to show the whole response.",
  "#btn_apply_filter": "Apply the filter to the last response and show only the matching part in the response box. With an empty filter it shows the whole response again.",
  "#txt_resp_body": "The response body from the last request. It is a normal text box, so you can select or edit it, but Copy and Export use the original response.",
  "#btn_clear_history": "Remove all entries from the request history list. The request boxes are not changed.",
  "#api_console": "A log of requests, responses, benchmark results, generated cURL commands and errors. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const apiStudioSkip: SkipRule[] = [
];

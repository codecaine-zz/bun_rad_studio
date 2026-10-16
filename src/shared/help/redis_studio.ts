import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `redis_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const redisStudioTips: HelpTips = {
  // ---- Header and key list ----
  "text:Seed Sample DB": "Writes about 14 demo keys (strings, hashes, a list, sets, sorted sets, a stream, a HyperLogLog and a bitmap) into the current database. Demo keys with the same names are overwritten.",
  "text:Host / DB": "Opens the connection window to point Redis Studio at another Redis server (a redis:// address) and choose its database number.",
  "text:Add Key": "Opens a form to create a new key: pick its type, name, starting value and an optional expiry time.",
  "#btnFullscreen": "Makes the window fill the whole screen. Press it again, or use the shortcut keys, to go back.",
  "#dbSelect": "Switches to another of the server's 16 databases (DB 0 to 15). The key list and counters reload for that database.",
  "#searchPattern": "Filters the key list with a glob pattern: * matches anything, ? one character. For example auth:* lists keys that start with auth:. Export and Delete Matching also use this pattern.",
  "#keySort": "Chooses how the key list is ordered: as found, by name, by type or by soonest expiry (TTL).",
  "#autoRefresh": "Re-reads the key list on its own every 5, 10 or 30 seconds, so you can watch keys appear or expire. Off by default.",
  "text:Export": "Saves the keys that match the search pattern (all keys if it is empty) to a JSON file in your Downloads folder. Only strings, hashes, lists, sets and sorted sets are exported.",
  "text:Import": "Loads keys from a Redis Studio export file into the current database. The toolbar button opens the import window; the button inside that window runs the import.",
  "text:Delete Matching": "Deletes every key that matches the pattern in the search box. You must type the pattern again to confirm. This cannot be undone.",
  "text^:Flush DB": "Deletes EVERY key in the current database. You must type FLUSH in a confirmation window first. This cannot be undone.",

  // ---- Main tabs ----
  "text:Key & Data Editor": "Shows the key you picked in the list: its type, expiry and contents, with tools to edit it.",
  "text:Interactive CLI Console": "A command line for running any Redis command (such as GET, HGETALL or INFO) and seeing the result.",
  "text:Server Telemetry & Metrics": "Shows live server numbers: memory use, operations per second, cache hit ratio, version and uptime.",
  "text:Pub / Sub Live Monitor": "Publish messages to a channel and watch messages arrive on channels you subscribe to.",
  "text:Slowlog & Clients": "Lists the slowest recent commands on the server and the clients currently connected to it.",

  // ---- Key header and editor ----
  "text:Copy Name": "Copies this key's name to the clipboard.",
  "text:Duplicate": "Makes a copy of this key under a new name that you enter. It never overwrites an existing key. In the name window, this button creates the copy.",
  "text:Set TTL": "Opens a window to set how many seconds this key lives before Redis deletes it, or to remove its expiry.",
  "text:Rename": "Renames this key. The header button opens a window for the new name; the button inside it applies the change. An existing key with the new name is overwritten.",
  "text:Delete": "In the key header: deletes this whole key after you confirm. Beside a hash field, list element, set member or sorted-set member it deletes just that item after you confirm.",
  "text:Save Changes": "Writes your edits back to the key: the text of a String, or every changed hash value, list element, set member, or sorted-set score/member. Streams, HyperLogLogs and bitmaps are not edited here.",
  "text:Prettify JSON": "Re-indents the text in the editor as neat JSON. Shows an error if the text is not valid JSON. Nothing is saved until you press Save Changes.",
  "text:Copy Value": "Copies the text in the editor to the clipboard.",
  "#stringEditor": "The value of this String key. Edit it, then press Save Changes to write it back to Redis.",
  ".hash-field-input": "The value of this hash field. Edit it, then press Save Changes to write it back to Redis.",
  ".list-item-input": "This list element. Edit it, then press Save Changes to write it back (LSET).",
  ".set-member-input": "This set member. Edit it, then press Save Changes; the old member is removed and the new one added.",
  ".zset-score-input": "This member's score. Edit it, then press Save Changes to re-rank the member.",
  ".zset-member-input": "This sorted-set member's name. Edit it, then press Save Changes; the member is renamed and keeps the score shown.",
  "text:Add Field": "Asks for a field name and value, then adds the field to this hash right away.",
  "text:Push Element": "Asks for a value and adds it to the end of this list right away (RPUSH).",
  "text:Add Member": "Asks for a value and adds it to this set right away (SADD).",
  "text:Add Ranked Item": "Asks for a member name and score, then adds it to this sorted set right away (ZADD).",
  "#hllNewItemInput": "An item (such as a user ID or IP address) to count in this HyperLogLog. Adding the same item twice does not raise the count.",
  "text:PFADD Element": "Adds the item to this HyperLogLog (PFADD). The estimated unique count updates if the item is new.",
  "#bitmapOffsetInput": "The position of the bit to change, counting from 0. For example 15 is the sixteenth bit.",
  "#bitmapValueInput": "The value to write to that bit: 1 turns it on, 0 clears it.",
  "text:SETBIT": "Writes the chosen value to the bit at the given offset (SETBIT) and refreshes the key.",

  // ---- CLI console ----
  "text:1. Server Information": "Runs INFO SERVER: version, operating system, uptime and configuration of the Redis server.",
  "text:2. Memory Telemetry": "Runs INFO MEMORY: how much memory Redis uses, its peak and fragmentation.",
  "text:3. Keyspace Overview": "Runs DBSIZE: the number of keys in the current database.",
  "text:4. All Scanned Keys": "Runs KEYS *: lists every key name in the current database. Slow on very large databases.",
  "text:5. Active Clients": "Runs CLIENT LIST: shows the connections currently open to the server.",
  "text:6. Slow Query Log": "Runs SLOWLOG GET 10: the ten most recent commands that took longer than the slow-query threshold.",
  "text:7. Current Time": "Runs TIME: the server's clock as a Unix timestamp plus microseconds.",
  "text:8. Latency Ping": "Runs PING: the server answers PONG, and the time shown tells you how quick the round trip was.",
  "#cliInput": "Type a Redis command such as GET mykey or ZRANGE myzset 0 -1 WITHSCORES and press Enter. The up and down arrow keys recall earlier commands. Risky commands ask for confirmation.",
  "text:Run": "Runs the command you typed (Enter does the same) and prints the result in the console above.",
  "text:Run anyway": "Confirms and runs the dangerous command you typed, such as FLUSHALL or CONFIG SET. This can delete data or change the server.",

  // ---- Pub/Sub ----
  "text:Clear Feed": "Empties the message list on screen. The server remembers the last 200 messages, so they come back at the next refresh (every 2 seconds).",
  "#pubChannel": "The channel to send the message to. Anyone subscribed to this channel receives it.",
  "#pubPayload": "The message to send: plain text or JSON.",
  "text:Publish Broadcast": "Sends the message to the channel (PUBLISH) and adds it to the feed on the left.",
  "#subChannelInput": "The channel to listen to. Messages published to it by any client then appear in the feed.",
  "text:Subscribe Live": "Starts listening to the channel, so new messages appear in the live feed. It stays subscribed until you connect to another server.",

  // ---- Add Key window ----
  "#newKeyType": "The kind of value to create. String holds text. For Hash the form creates nothing, and List, Set and Sorted Set store the whole text as one item; use the CLI tab for those.",
  "#newKeyName": "The name of the key. Colons group keys into folders by convention, such as cache:user:101.",
  "#newKeyValue": "The value to store. For a String, any text or JSON. For List, Set and Sorted Set the whole text is stored as a single item; commas do not split it.",
  "#newKeyTtl": "Optional lifetime in seconds. The key is deleted automatically after that time. Leave empty to keep it until you delete it.",
  "text:Create Key": "Creates the key with the name, value and expiry you entered, then opens it in the editor.",

  // ---- Connection window ----
  "#connectUrlInput": "The Redis server address, for example redis://127.0.0.1:6379 or redis://:password@host:6379/0.",
  "#connectDbSelect": "The database number (0 to 15) to use on the new connection.",
  "text:Connect": "Connects to the server with a test ping, then switches to it. Any pub/sub subscriptions from the old connection are dropped.",

  // ---- Import window ----
  "#importFile": "Choose a .json file made by the Export button. Its text is loaded into the box below.",
  "#importText": "The export JSON to import. Choose a file above or paste the text here.",
  "#importOverwrite": "When ticked, keys that already exist are deleted and replaced by the imported ones. When not ticked they are skipped.",

  // ---- Expiry and rename windows ----
  "#ttlSecondsInput": "Seconds until the key expires. Enter -1 to remove the expiry so the key lives until deleted.",
  "text:Update TTL": "Sets the expiry you typed on this key. -1 removes the expiry.",
  "#renameInput": "The new name for the key. If another key already has that name, it is replaced.",

  // ---- Shared and dialog buttons ----
  "text:Cancel": "Closes this window or dialog without making any change.",
  "text:Delete keys": "Confirms and deletes all keys that match the pattern. This cannot be undone.",
  "ph:FLUSH": "Type FLUSH in capital letters to confirm that every key in this database should be deleted.",
};

/** Controls that need no tip, each with a reason. */
export const redisStudioSkip: SkipRule[] = [
  { text: "✕", why: "window close buttons marked with a cross; the symbol is universally understood" },
];

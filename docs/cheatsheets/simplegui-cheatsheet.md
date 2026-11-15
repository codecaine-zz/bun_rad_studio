# SimpleGUI desktop RAD cheat sheet

A complete, beginner-friendly step-by-step cheat sheet for building cross-platform desktop applications with **SimpleGUI** (`src/simplegui.ts`). SimpleGUI ships **310 canonical built-in themes** (`getThemeNames()`, or **385** registry keys including aliases via `getThemeKeys()`, with **167 futuristic FX shader themes**), **35 enterprise UI components**, **SweetAlert2-style modal dialogs**, **tabs and multi-view switching**, **live keystroke search filtering**, **charts and real-time telemetry**, **OS-standard state persistence**, and a **headless `bun test` runner**.

---

## How SimpleGUI Works in 60 Seconds

### The 4 Golden Rules

1. **Create a window:** Call `const win = newSimpleWindow("App Title", 1040, 720, options)` (or `createWindow(...)` / `newWindow(...)`).
2. **Declare controls top-to-bottom:** Controls stack vertically by default. Wrap side-by-side groups in `win.row(() => ...)`, multi-column layouts in `win.grid(cols, gap, () => ...)`, or titled containers in `win.card("Title", () => ...)`.
3. **Give interactive controls an `.id("myId")` (or leading ID argument):**
   - **Read / write text safely:** `win.getText("txtName")` and `win.setText("lblStatus", "Saved!")` (plain-text HTML-escaped).
   - **Read / write booleans and numbers:** `win.getBool("chkAgree")` / `win.setChecked("chkAgree", true)`, `win.getInt("sldVol")` / `win.getFloat("numRate")`.
   - **React to users:** Callbacks receive `(w, value)` where `w` is your `SimpleWindow` and `value` is the updated control payload.
4. **Launch at the bottom (and guard for tests):** Call `if (import.meta.main) win.run()` so `bun test` can import your window builder headlessly without spawning a native WebView window.

### Control Lifecycle and Callback Diagram

```text
  1. Window Init                2. Build Tree & IDs             3. Event Loop / Headless Test
  +-----------------------+     +-------------------------+     +---------------------------------+
  | newSimpleWindow(...)  | --> | win.addInput("Hint")    | --> | User clicks / types OR test:    |
  | createWindow(...)     |     |    .id("txtUser")       |     |   await win.triggerClick("btn") |
  |                       |     |    .onChange((w, v) =>) |     |   await win.triggerChange(...)  |
  +-----------------------+     +-------------------------+     +---------------------------------+
                                            |                                   |
                                            v                                   v
                                  registers spec +                   invokes (w, val) handler:
                                  formValuesStore["txtUser"]         w.setText("lblOut", ...)
                                                                     w.setValue("tblRows", ...)
                                                                                |
                                                                                v
  5. Clean Exit                 4. Native Render & IPC Sync
  +-----------------------+     +-------------------------+
  | onClose((w) => ...)   | <-- | win.run()               | <-- updates formValuesStore +
  | autoSaveState -> disk |     | WebView IPC DOM updates |     pushes live DOM changes
  +-----------------------+     +-------------------------+
```

### 3 Import Scenarios

Choose the import block that matches where your script runs:

**1. Installed package or downstream app (`package.json` dependency):**

```typescript
import { newSimpleWindow, createWindow, simplegui } from "bun-rad-studio/simplegui";
```

**2. Script at the repository root (e.g., `app.ts`):**

```typescript
import { newSimpleWindow, createWindow } from "./src/simplegui";
```

**3. Script inside a nested folder (e.g., `examples/rad_tutorial/app.ts` or `demos/app.ts`):**

```typescript
import { newSimpleWindow, createWindow } from "../../src/simplegui";
```

---

## Contents

- [How SimpleGUI Works in 60 Seconds](#how-simplegui-works-in-60-seconds)
- [Step 1: Window creation and lifecycle](#step-1-window-creation-and-lifecycle)
- [Step 2: Layout and container systems](#step-2-layout-and-container-systems)
- [Step 3: Fluent method chaining (`SimpleControlRef`)](#step-3-fluent-method-chaining-simplecontrolref)
- [Step 4: Standard controls and compound form builders](#step-4-standard-controls-and-compound-form-builders)
- [Step 5: Tabs, segmented controls, and multi-view switching](#step-5-tabs-segmented-controls-and-multi-view-switching)
- [Step 6: Live search filtering and dynamic tables](#step-6-live-search-filtering-and-dynamic-tables)
- [Step 7: Charts, gauges, sparklines, and live telemetry](#step-7-charts-gauges-sparklines-and-live-telemetry)
- [Step 8: VLang parity, Studio extended, and 35 enterprise components](#step-8-vlang-parity-studio-extended-and-35-enterprise-components)
- [Step 9: Reactive state, two-way binding, and OS persistence](#step-9-reactive-state-two-way-binding-and-os-persistence)
- [Step 10: Menus, context menus, SweetAlert2 `fire()`, modals, and file pickers](#step-10-menus-context-menus-sweetalert2-fire-modals-and-file-pickers)
- [Step 11: 310 built-in themes and 167 FX shader themes](#step-11-310-built-in-themes-and-167-fx-shader-themes)
- [Step 12: Pro SimpleGUI RAD tips and tricks](#step-12-pro-simplegui-rad-tips-and-tricks)
- [Complete full-featured Studio Workspace Template](#complete-full-featured-studio-workspace-template)

---

## Step 1: Window creation and lifecycle

> 📖 **Learn more:** [Window Creation (`SIMPLEGUI_API.md#window-creation`)](../SIMPLEGUI_API.md#window-creation) · [Window Options Table (`SIMPLEGUI_API.md#window-options-table`)](../SIMPLEGUI_API.md#window-options-table) · [Window State & Lifecycle (`SIMPLEGUI_API.md#window-state-methods`)](../SIMPLEGUI_API.md#window-state-methods) · [Quick Start (`SIMPLEGUI_API.md#quick-start`)](../SIMPLEGUI_API.md#quick-start)

### Window Factory Overloads

`newSimpleWindow`, `createWindow`, `newWindow`, `new_simple_window`, and `new SimpleWindow(...)` all share the exact same overloads:

```typescript
import { newSimpleWindow, createWindow, newWindow } from "./src/simplegui"; // or "../../src/simplegui" inside nested folders

// 1. No arguments -> title: "SimpleGUI Application", width: 800, height: 600, fullscreen: true
const w1 = createWindow();

// 2. Single options object (Windowed because width/height are passed -> fullscreen: false)
const w2 = createWindow({
  title: "Developer Studio",
  width: 1080,
  height: 760,
  theme: "apple_dark",
  appId: "dev_studio_v1",
});

// 3. Title + options object (No width/height -> defaults to fullscreen: true)
const w3 = newWindow("Kiosk Monitor", { theme: "midnight", alwaysOnTop: true });

// 4. Classic positional form: (title?, width?, height?, options?)
const w4 = newSimpleWindow("Release Console", 1040, 720, {
  theme: "nord",
  padding: 20,
  spacing: 12,
  effects: "full",
});
```

### Windowed vs. Fullscreen & Explicit Option Precedence

- **Why passing `width` / `height` opens windowed:** Whenever you pass an explicit numeric `width` or `height` (positional or inside `{ width, height }`) without explicitly setting `fullscreen`, SimpleGUI sets `fullscreen = false` (windowed mode). If you omit both dimensions and omit `fullscreen`, SimpleGUI defaults to `fullscreen = true`.
- **How explicit options interact with `session.json` and `form_state.json`:** Any `width`, `height`, `theme`, `background_color`, `font_color`, or `fullscreen` explicitly passed to the factory (or set via `setSize()`, `setTheme()`, `setFullscreen()` before `run()`) is pinned in `_explicitWindowOptions`. When `restoreWindowSession()` (`session.json`) or `restoreAppFormState()` (`form_state.json`) runs, **saved form inputs and reactive state still restore**, while your pinned `theme`, `fullscreen`, `width`, and `height` are never overwritten by old session files or global `~/.config/simplegui/theme.txt`. Unpinned windows (`createWindow("My App", { appId: "my_app" })`) restore saved dimensions and theme as well.

### `SimpleWindowOptions` (`WindowOptions`) Table

| Option | Type | Default | Plain-English Meaning |
|---|---|---|---|
| `title` | `string` | `"SimpleGUI Application"` | Native OS window title bar text |
| `width` | `number` | `800` (pinned if passed) | Initial window width in pixels; passing it makes `fullscreen` default to `false` |
| `height` | `number` | `600` (pinned if passed) | Initial window height in pixels; passing it makes `fullscreen` default to `false` |
| `minWidth` / `minHeight` | `number` | — | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor) |
| `maxWidth` / `maxHeight` | `number` | — | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor) |
| `x` / `y` | `number` | — | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor) |
| `resizable` | `boolean` | `true` | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor; `getResizable()` returns `true`) |
| `frameless` | `boolean` | `false` | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor) |
| `center` | `boolean` | `false` | Declared compatibility option (not read by constructor — call `win.center()` at runtime to center the window) |
| `fullscreen` | `boolean` | `true` (if no dims) / `false` (if dims) | Open native fullscreen or windowed |
| `theme` | `string` | Saved theme or `"midnight"` | Any canonical/alias key from the built-in theme catalog |
| `background_color` | `string` | Theme canvas color | Explicit CSS hex background override |
| `font_color` | `string` | Theme foreground color | Explicit CSS hex foreground text override |
| `padding` | `number` | `20` | Inner canvas margin around top-level layouts in pixels |
| `spacing` | `number` | `12` | Default vertical/horizontal gap between stacked controls in pixels |
| `alwaysOnTop` | `boolean` | `false` | Keep floating window above other desktop windows |
| `appId` / `app_id` | `string` | `""` (auto-derived) | Unique namespace folder under OS config/state dirs; when omitted, `getAppId()` derives a snake_case slug from `title` (falling back to `argv[1]` basename or `"default_app"`) |
| `helpId` | `string` | `""` | Optional help identifier metadata for documentation links |
| `autoSave` / `auto_save` / `autoSaveState` / `auto_save_state` | `boolean` | `true` | Automatically persist eligible control values & session state on close |
| `responsive` | `boolean` | `true` | Enable responsive flex/grid reflow across window widths |
| `debug` | `boolean` | `false` | Declared compatibility option (`SimpleWindowOptions` only — not read by constructor) |
| `hosted` | `boolean` | `false` | Declared compatibility option (not read by constructor — use `win.hostInBrowser(...)` to serve in browser) |
| `effects` | `"full" \| "reduced" \| "off"` | `"full"` | Visual FX shader layer mode for futuristic FX shader themes (`isFxTheme(name)`) |

### Runtime Window Lifecycle

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow({
  title: "Release Monitor v1.0",
  width: 960,
  height: 640,
  theme: "nord", // Pinned in _explicitWindowOptions -> overrides saved session theme
  appId: "release_monitor",
});

win.setTitle("Release Monitor — Live"); // Updates titlebar at runtime
win.center();                           // Center on active monitor
win.setEffects("reduced");              // "full" | "reduced" (glass without motion) | "off"
win.setSize(1024, 680);                 // Resize window programmatically
win.setFullscreen(false);               // Query with win.isFullscreen() / toggleFullscreen()
win.setAlwaysOnTop(true);               // Pin floating window above desktop windows
win.setMinimizable(true);               // Compatibility stub (Cmd/Ctrl/Alt+M minimizes native window)
win.addStatusBar("statusBar", "Ready", "v1.0");
win.setOpacity(0.96);                   // Set window opacity (0.0..1.0)
win.evalJS("console.log('WebView booted');");

let ticks = 0;
win.addTimer(2000, (w) => {
  ticks += 1;
  w.setStatusBarText("statusBar", `Heartbeat #${ticks} · Session active`);
});

win.onClose((w) => {                    // Return false to cancel window closure
  w.saveWindowSession();
  w.saveAppFormState();
  return true;
});

if (import.meta.main) {
  win.run();                            // Launch WebView loop (call last!)
}
```

---

## Step 2: Layout and container systems

> 📖 **Learn more:** [Layout Systems (`SIMPLEGUI_API.md#layout-systems`)](../SIMPLEGUI_API.md#layout-systems) · [Typography & Status Bar (`SIMPLEGUI_API.md#5-typography-helpers-addheading-addsubheading-addcaption`)](../SIMPLEGUI_API.md#5-typography-helpers-addheading-addsubheading-addcaption)

### Visual Layout Patterns (ASCII Diagrams)

```text
  1. Vertical Stack (Default)      2. Horizontal Row (row / beginRow)
  +---------------------------+    +-------------------------------------+
  | [Heading]                 |    | [Label] [Input.........] [Save]     |
  | [Input..................] |    +-------------------------------------+
  | [Submit]                  |
  +---------------------------+

  3. Responsive Grid (grid(2, 16))                 4. Titled Card (card / beginCard)
  +----------------------+----------------------+  +---------------------------------+
  | Card 1 (Col 1)       | Card 2 (Col 2)       |  | Card Title                      |
  |  - Field A           |  - Chart             |  |  Caption subtitle               |
  |  - Switch B          |  - Gauge             |  |  [Control 1]  [Control 2]       |
  +----------------------+----------------------+  +---------------------------------+

  5. Dedicated Split / Accordion / Scroll Widgets
  +---------------------------------------------+
  | [addSplitPane]   Left Pane  ||  Right Pane  |
  | [addAccordionGroup]  v Panel 1 / > Panel 2  |
  | [addScrollView]  Scrollable Viewport (y)    |
  +---------------------------------------------+
```

### Style 1: Scoped Auto-Closing Layout Blocks (Recommended)

Scoped helpers (`row`, `card`, `grid`, `section`, `groupBox`, `cardWithTitle`) wrap `begin*` / `end*` inside a `try { ... } finally { ... }` block. Even if an exception is thrown inside the builder callback, `layoutStack` unwinds cleanly so subsequent controls never leak into the wrong container. (`section` and `groupBox` delegate directly to `card(title, callback)`; for vertical stacks inside containers, controls stack vertically by default or inside `beginFlex("column")` / `endFlex()` — note there is no `win.col()` helper.)

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Workspace Settings", 920, 560);

win.section("Workspace Settings", (w) => {
  w.grid(2, 16, (g) => {
    g.card("General", (c) => {
      c.addFormField("Project Name:", "txtProj", "Studio App");
      c.addFormDropdown("Target:", "cmbTarget", ["Staging", "Production"], "Staging");
      c.row((r) => {
        r.addButton("btnSave", "Save", () => c.toast("Saved!"));
        r.addButton("btnReset", "Reset", () => c.resetForm());
      });
    });

    g.groupBox("Notifications & Alerts", (c) => {
      c.beginFlex("column");
        c.addSwitch("chkEmail", "Email alerts", true);
        c.addSwitch("chkSound", "Sound chimes", false);
        c.addSlider("sldRate", 1, 60, 15).width(220);
      c.endFlex();
    });
  });
});

if (import.meta.main) win.run();
```

### Style 2: Paired `begin*` / `end*` Containers, Splitters, Accordions & `.at(x, y)`

Use paired calls when splitting construction across helper functions, and use widget containers (`addSplitPane`, `addAccordionGroup`, `addScrollView`) for interactive splitters, collapsible sections, and fixed-height scroll viewports:

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Cluster Layout", 920, 680);

// Paired begin* / end* layout containers (every begin* has a matching end*)
win.beginGrid(2, 16);
  win.beginCard("Server Config", "Production Cluster");
    win.addFormField("Host:", "txtHost", "localhost");
    win.addFormNumber("Port:", "numPort", 8080);
  win.endCard();

  win.beginGroupBox("Flex Actions");
    win.beginFlex("row", "start", "center"); // alias: beginFlexBox / endFlexBox
      win.addButton("btnPing", "Ping");
      win.addButton("btnLogs", "Logs");
    win.endFlex();
  win.endGroupBox();
win.endGrid();

// Interactive container widgets & absolute positioning
win.addSplitPane("spMain", "Left Explorer", "Right Inspector", {
  initialSplit: 35,
  width: 640,
  height: 180,
});
win.addAccordionGroup([
  { title: "Build Logs", content: "0 errors, 2 warnings", expanded: true },
  { title: "Environment", content: "Bun v1.4+ / macOS" },
]);
win.addScrollView(640, 220);

// Pin exact pixel coordinates when building custom tool palettes or overlays
win.addBadge("bdgLive", "LIVE", "success").at(740, 16).size(72, 24);

if (import.meta.main) win.run();
```

---

## Step 3: Fluent method chaining (`SimpleControlRef`)

> 📖 **Learn more:** [Fluent Method Chaining (`SIMPLEGUI_API.md#method-chaining`)](../SIMPLEGUI_API.md#method-chaining) · [Fluent Methods Table (`SIMPLEGUI_API.md#fluent-methods-table`)](../SIMPLEGUI_API.md#fluent-methods-table) · [Typed Accessors (`SIMPLEGUI_API.md#typed-accessors`)](../SIMPLEGUI_API.md#typed-accessors)

### Two Ways to Create & Identify Controls

Every `add*()` method returns a chainable `SimpleControlRef`:

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Control ID Styles", 640, 360);

// Style A: Fluent nameless + .id("...")
// On addInput("Enter username"), calling .id("txtUser") promotes "Enter username" to placeholder
// if no explicit placeholder was set, and migrates any handlers/values to the new ID!
win.addInput("Enter username")
  .id("txtUser")
  .width(280)
  .tooltip("Your studio handle");

// Style B: Explicit ID-first (id, initialValue, placeholder, onChange?, options?)
win.addInput("txtEmail", "alice@example.com", "you@company.com", (_w, val) => {
  console.log("Email changed:", val);
});

// addTextInput also accepts (placeholder).id(id) or (id, initialValue, placeholder)
win.addTextInput("Filter logs...").id("txtFilter");

if (import.meta.main) win.run();
```

### How to Read & Update Any Control

| Operation | Read Method | Write Method | Important Behavior Verified in `src/simplegui.ts` |
|---|---|---|---|
| **Plain text (safe)** | `win.getText(id)` | `win.setText(id, str)` | HTML-escaped plain text (`textContent`) for labels, inputs, headings, badges, and buttons (`.rad-btn-caption`). On checkboxes/switches, `setText` updates the caption label **without** overwriting `.checked`, and `getText` returns the caption string. |
| **Control value** | `win.getValue(id)` | `win.setValue(id, val)` | Reads/updates `formValuesStore[id]` and live DOM (`input.checked` on booleans, `value`/`textContent` on strings/numbers). |
| **Raw HTML (trusted)** | `ref.html()` | `win.setHtml(id, html)` | Explicit opt-in escape hatch setting `innerHTML` (`_rawHtml = true`). Use only for developer-trusted markup. |
| **Boolean toggle** | `win.getBool(id)` / `win.getChecked(id)` | `win.setBool(id, b)` / `win.setChecked(id, b)` | Reads/sets boolean checkbox/switch state (`toggleChecked(id)` flips and returns the new boolean). |
| **Numbers** | `win.getInt(id)` / `win.getFloat(id)` / `win.getValueInt(id)` | `win.setInt(id, n)` / `win.setFloat(id, n)` | Parses integer (`parseInt` base 10) or float (`parseFloat`), returning `0` on `NaN`. (Use `getInt`/`getFloat`, not `getNumber`.) |
| **Batch read / write** | `win.values()` / `win.getValues(ids?)` / `win.getFormValues(ids?)` | `win.values(dict)` / `win.setValues(dict)` / `win.setFormValues(dict)` / `win.resetForm(defaults?)` | Snapshot all form/input values (including default/empty inputs) or update multiple IDs at once. `clearForm()` empties stored inputs. Also: `setAll`, `getAll`, `setManyTexts`, `getManyTexts`, `setManyChecked`, `setManyNumbers`, `setManyVisibility`, `setManyEnabled`. |
| **Lookup control handle** | `win.control(id)` / `win.ref(id)` | `win.getControl(id)` (`null`) / `win.getRef(id)` (`undefined`) | **`control(id)` throws** `[SimpleGUI] Control '...' not found` immediately on a typo; **`getControl(id)` returns `null`** for optional controls. |

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Read & Update Controls", 720, 460);

// Contrast safe plain text vs raw value vs raw HTML vs typed bool/int/float & batch ops:
win.addLabel("lblPreview", "Initial preview");
win.addHtmlView("<p>Ready</p>", 320, 60).id("htmlBanner");
win.addInput("txtName", "Ada", "Your name");
win.addCheckbox("chkOptIn", "Send release notes", false);
win.addSlider("sldWorkers", 1, 16, 4);

win.addButton("btnInspect", "Inspect Controls", (w) => {
  // 1. Escaped plain text (HTML characters appear literally, safe for untrusted input)
  w.setText("lblPreview", "<b>Safe text</b>");      // getText("lblPreview") => "<b>Safe text</b>"
  // 2. Explicit raw HTML escape hatch (rendered as markup)
  w.setHtml("htmlBanner", "<strong>Deployed</strong> <em>v1.4</em>");
  // 3. Boolean & numeric accessors (use getInt/getFloat — never nonexistent getNumber)
  w.setChecked("chkOptIn", true);
  const optedIn = w.getBool("chkOptIn");             // => true
  const workers = w.getInt("sldWorkers");            // => 4
  const ratio = w.getFloat("sldWorkers") / 16;       // => 0.25
  // 4. Snapshot / batch update + strict vs nullable control lookup
  const snapshot = w.values();                       // { txtName: "Ada", chkOptIn: true, ... }
  w.setValues({ txtName: "Grace", sldWorkers: 8 });
  const required = w.control("txtName");             // Throws on typo
  const optional = w.getControl("doesNotExist");     // Returns null cleanly
  w.toast(`id=${required.getId()}, keys=${Object.keys(snapshot).length}, optIn=${optedIn}, missing=${optional === null}, workers=${workers} (${ratio})`, 2500, "info");
});

if (import.meta.main) win.run();
```

### `SimpleControlRef` Chaining Methods

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Control Chaining", 640, 320);

win.addButton("🚀 Deploy Build", () => {})
  .id("btnDeploy")
  .size(220, 42)              // Or .width(220).height(42) / .at(x, y) / .pos(x, y) / .expandFill(true)
  .bg("#0284c7")              // Sets custom_background=true -> survives win.setTheme(...)!
  .color("#ffffff")           // Sets custom_color=true      -> survives win.setTheme(...)!
  .font(15, "#ffffff", "700") // Size, optional color & weight (also .fontSize(), .bold(), .italic(), .align("center"))
  .borderRadius(8)            // Alias: .radius(8)
  .border(1, "#38bdf8", "solid")
  .cursor("pointer")
  .hover("#0369a1", "#ffffff")
  .style({ letterSpacing: "0.4px" })
  .opacity(95)
  .tooltip("Ship release to staging")
  .enabled(true)              // Also .enable(), .disable(), .disabled(bool), .isEnabled(), .toggleEnabled()
  .visible(true)              // Also .show(), .hide(), .isVisible(), .toggleVisible()
  .onDoubleClick((w) => w.toast("Double-clicked!"))
  .contextMenu(["Dry Run", "Force Push"], (w, act) => w.toast(act));

// Other control-specific fluent methods on SimpleControlRef:
// .getId(), .placeholder(ph), .readOnly(flag), .focus(), .flash(), .highlight(ms)
// .value() / .value(v), .text() / .text(t), .checked() / .checked(b), .html() / .html(raw)
// .setHtml(raw), .clear(), .appendText(s), .appendLine(s), .increment(delta)
// .options(items), .min(v), .max(v), .step(v), .bindState(key), .bindViews(...), .filterTable(...), .bindDetail(...)

if (import.meta.main) win.run();
```

---

## Step 4: Standard controls and compound form builders

> 📖 **Learn more:** [Standard Controls (`SIMPLEGUI_API.md#controls-reference`)](../SIMPLEGUI_API.md#controls-reference) · [Compound Form Builders (`SIMPLEGUI_API.md#7--5-compound-labeled-form-field-builders`)](../SIMPLEGUI_API.md#7--5-compound-labeled-form-field-builders)

### Standard Controls Reference

| Method | Common Signature | `(w, val)` Payload | Read / Write Methods |
|---|---|---|---|
| `addLabel` | `addLabel(text, opts?)` or `addLabel(id, text, onClick?, opts?)` | Optional click text | `getText` / `setText` |
| `addHeading` | `addHeading(title, subtitleOrLevel?)` (`1`–`6`) | — | Adds divider below when vertical |
| `addSubheading` | `addSubheading(text, color?)` | — | Bold `14px` section subheading |
| `addCaption` | `addCaption(text, color?)` | — | Muted `12px` helper text |
| `addDivider` | `addDivider(opts?)` (`addSeparator`, `addDividerLine`) | — | Full-width horizontal divider |
| `addButton` | `addButton(label, onClick?, opts?)` or `addButton(id, label, onClick?, opts?)` | `label: string` on click | `getText` / `setText` |
| `addInput` / `addTextInput` / `addTextField` | `addTextInput(ph, init?, onChange?, opts?)` or `(id, init, ph, onChange?, opts?)` | `string` (current value) | `getText` / `setText` / `clear` |
| `addPasswordInput` | `addPasswordInput(idOrPh?, phOrCb?, onChange?, opts?)` | `string` (masked input) | `getText` / `setText` (never auto-persisted) |
| `addSearchInput` | `addSearchInput(idOrPh?, phOrCb?, onChange?, opts?)` | `string` (live query) | `getText` / `setText` / `.filterTable(...)` |
| `addTextArea` | `addTextArea(ph, init?, onChange?, opts?)` or `(id, init, ph, onChange?, opts?)` | `string` | `getText` / `setText` / `appendLine` |
| `addCheckbox` | `addCheckbox(label, checked?, onChange?, opts?)` or `(id, label, checked?, onChange?)` | `boolean` | `getBool` / `getChecked` / `setChecked` |
| `addSwitch` | `addSwitch(label, checked?, onChange?, opts?)` or `(id, label, checked?, onChange?)` | `boolean` | `getBool` / `getChecked` / `setChecked` |
| `addRadioGroup` | `addRadioGroup(groupName, options[], selected?, onChange?, opts?)` | `string` (selected label) | `getValue` / `setValue` |
| `addDropdown` / `addSelect` | `addDropdown(items[], selected?, onChange?, opts?)` or `(id, items[], ...)` | `string` (chosen option) | `getText` / `setValue` / `setListItems` |
| `addListBox` | `addListBox(items[], selected?, onChange?, opts?)` (+ `.multiSelect()`) | `string` or `string[]` | `getValue` / `getListSelectedTexts` |
| `addSlider` | `addSlider(min, max, val?, onChange?, opts?)` or `(id, min, max, val?, onChange?)` | `number` | `getInt` / `getFloat` / `setInt` |
| `addStepper` | `addStepper(min, max, val?, onChange?, opts?)` or `(id, min, max, val?, onChange?)` | `number` | `getInt` / `setInt` / `.increment()` |
| `addProgressBar` | `addProgressBar(value?, max?, opts?)` or `(id, value?, max?, opts?)` | `number` (`0..max`) | `getProgress` / `setProgress` / `setValue` |
| `addDatePicker` | `addDatePicker(initialDate = "2026-07-27", onChange?, opts?)` | `string` (`YYYY-MM-DD`) | `getValue` / `setValue` |
| `addTimePicker` | `addTimePicker(initialTime = "12:00", onChange?, opts?)` | `string` (`HH:MM`) | `getValue` / `setValue` |
| `addColorWell` | `addColorWell(initialHex = "#0284c7", onChange?, opts?)` | `string` (`#rrggbb`) | `getValue` / `setValue` |
| `addBadge` | `addBadge(idOrText, typeOrText?, typeOrOpts?, opts?)` (`info`\|`success`\|`warning`\|`error`) | — | `getText` / `setText` |
| `addTable` | `addTable(cols[], rows[][], onSelect?, opts?)` or `(id, cols[], rows[][], onSelect?)` | `rowId: string` on click | `setTableRows` / `getTableRows` |
| `addTreeView` | `addTreeView(nodes[], onSelect?, opts?)` (also `addTreeGrid`) | Selected node label | `.expandAll()` / `.collapseAll()` |
| `addCodeView` | `addCodeView(code, language = "typescript", opts?)` | — | `getText` / `setText` |
| `addHtmlView` | `addHtmlView(html, width = 520, height = 220, opts?)` | — | `setHtml` |
| `addImage` | `addImage(src, width = 200, height = 150, opts?)` | — | Renders image URL or path |

> [!TIP]
> Need a freehand drawing surface? Use `win.signaturePad({ penColor, penWidth, saveButton: true })` (Step 8) which renders an interactive HTML `<canvas>` pad and emits PNG data URLs, or embed custom SVG/canvas markup inside `win.addHtmlView(...)`.

### Compound Labeled Form Builders

Every `addForm*` builder wraps a fixed-width `Label` and control inside a horizontal `beginRow()` / `endRow()` pair automatically and returns the input `SimpleControlRef`:

| Builder | Signature | Purpose |
|---|---|---|
| `addFormField` | `addFormField(label, id, value = "")` | Label (`130px`) + single-line text input (`220px`) |
| `addFormTextarea` | `addFormTextarea(label, id, value = "")` | Label + multi-line textarea |
| `addFormPassword` | `addFormPassword(label, id, value = "")` | Label + masked password input |
| `addFormSlider` | `addFormSlider(label, id, value = 50)` | Label + `0..100` slider |
| `addFormNumber` | `addFormNumber(label, id, value = 0)` | Label + `0..9999` numeric stepper |
| `addFormDropdown` | `addFormDropdown(label, id, items, selected = "")` | Label + single-select dropdown |
| `addFormDatePicker` | `addFormDatePicker(label, id, date = "2026-07-27")` | Label + ISO date picker |
| `addFormProgress` | `addFormProgress(label, id, value = 50)` | Label + progress bar |
| `addFormSwitch` | `addFormSwitch(label, id, switchLabel, checked = false)` | Label + toggle switch |
| `addFormLink` | `addFormLink(label, id, linkText, url = "#")` | Label + clickable external link |
| `addFormDropZone` | `addFormDropZone(id, promptText?, opts?)` | Embedded drag-and-drop file drop zone |

> [!NOTE]
> Compound label+control rows in `SimpleWindow` use the `addForm*` family (`addFormField`, `addFormPassword`, `addFormDropdown`, etc., or `win.row(...)` around standalone `add*` controls) — there are no `addLabeledInput` or `addFormRow` methods.

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("User Profile", 820, 560);

const FORM_DEFAULTS = {
  txtFullName: "Ada Lovelace",
  txtApiToken: "my-api-token",
  cmbRole: "Developer",
  sldQuota: 80,
  swtActive: true,
  dtStart: "2026-01-15",
  clrAccent: "#0a84ff",
};

win.card("User Profile (Compound Form + Standalone Pickers)", (w) => {
  w.addFormField("Full Name:", "txtFullName", FORM_DEFAULTS.txtFullName);
  w.addFormPassword("API Token:", "txtApiToken", FORM_DEFAULTS.txtApiToken);
  w.addFormDropdown("Role:", "cmbRole", ["Developer", "Reviewer", "Admin"], FORM_DEFAULTS.cmbRole);
  w.addFormSlider("Daily Quota:", "sldQuota", FORM_DEFAULTS.sldQuota);
  w.addFormDatePicker("Start Date:", "dtStart", FORM_DEFAULTS.dtStart);
  w.addFormSwitch("Access:", "swtActive", "Account Enabled", FORM_DEFAULTS.swtActive);
  w.addFormDropZone("dzAvatar", "Drop avatar PNG or click to browse...");

  w.row((r) => {
    r.addPasswordInput("txtPin", "Enter 2FA code");
    r.addDatePicker(FORM_DEFAULTS.dtStart).id("dtCustom");
    r.addColorPicker("clrAccent", FORM_DEFAULTS.clrAccent); // alias: addColorWell(...)
    r.addSlider("sldRate", 0, 100, 65).width(160);
    r.addButton("btnResetForm", "Reset Defaults", (b) => b.resetForm(FORM_DEFAULTS));
  });
});

if (import.meta.main) win.run();
```

---

## Step 5: Tabs, segmented controls, and multi-view switching

> 📖 **Learn more:** [Dashboard & Navigation Controls (`SIMPLEGUI_API.md#dashboard-controls`)](../SIMPLEGUI_API.md#dashboard-controls) · [Data & Event Binding (`SIMPLEGUI_API.md#data-event-binding`)](../SIMPLEGUI_API.md#data-event-binding)

| Method / Helper | Signature | Behavior |
|---|---|---|
| `addTabs` | `addTabs(tabNames, selectedIdxOrOpts?, opts?)` | Horizontal tab strip (`selectedIndex`, `.closable()`, `.onTabClose()`). |
| `addSegmentedControl` | `addSegmentedControl(idOrItems, itemsOrSelected?, selectedOrOnChange?, onChangeOrOpts?, opts?)` | Pill-style segmented switcher (`value` = active label). |
| `addTabPills` | `addTabPills(id, items, selected = "")` | Pill tab selector shorthand with explicit `id`. |
| `addNavRail` | `addNavRail(items, onSelect?, opts?)` | Vertical icon rail for primary workspace sections. |
| `.bindViews(...)` | `ref.bindViews(viewGroupsMap, onTabChange?)` / `win.bindTabViews(tabsId, viewGroupsMap, onTabChange?)` | Auto-hides inactive control/card IDs on startup and swaps views on every tab switch. Keys may be tab labels or zero-based index strings (`"0"`, `"1"`). |
| `showControls` / `hideControls` | `win.showControls(ids)` / `win.hideControls(ids)` | Batch visibility helpers for custom view containers. |

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Multi-View Workspace", 920, 620);
win.addStatusBar("status_bar", "Ready");

// Multi-view switching with Tabs (.bindViews), Segmented Control & Nav Rail:
win.addNavRail(
  [
    { icon: "📊", label: "Overview", id: "railOverview", active: true },
    { icon: "📈", label: "Telemetry", id: "railMetrics" },
    { icon: "⚙️", label: "Settings", id: "railPrefs" },
  ],
  (w, item) => w.toast(`Rail selected: ${String(item)}`),
);

win.addSegmentedControl(
  "segMode",
  ["Overview", "Telemetry", "Settings"],
  0,
  (w, mode) => w.setStatusBarText("status_bar", `Mode: ${String(mode)}`),
);

win.addTabs(["Overview", "Telemetry", "Settings"], 0).id("mainTabs");

// Create the cards and table referenced by .bindViews(...)
win.beginCard("Overview", "System summary", "cardOverview");
  win.addLabel("lblOverview", "3 healthy services online");
win.endCard();
win.addTable("tblItems", ["Service", "Status"], [
  ["api-gateway", "Running"],
  ["worker-queue", "Paused"],
]);

win.beginCard("Telemetry", "Live throughput", "cardCharts");
  win.addSparkline("spkMain", [18, 24, 21, 29, 34], 42);
win.endCard();

win.beginCard("Settings", "Workspace preferences", "cardPrefs");
  win.addSwitch("chkAutoRefresh", "Auto-refresh every 5s", true);
win.endCard();

win.control("mainTabs").bindViews(
  {
    Overview: ["cardOverview", "tblItems"],
    Telemetry: ["cardCharts"],
    Settings: ["cardPrefs"],
  },
  (w, activeTab, activeIndex) => {
    w.setStatusBarText("status_bar", `Tab #${activeIndex + 1}: ${activeTab}`);
  },
);

if (import.meta.main) win.run();
```

---

## Step 6: Live search filtering and dynamic tables

> 📖 **Learn more:** [Standard Controls & Tables (`SIMPLEGUI_API.md#controls-reference`)](../SIMPLEGUI_API.md#controls-reference) · [Data & Event Binding (`SIMPLEGUI_API.md#data-event-binding`)](../SIMPLEGUI_API.md#data-event-binding)

### Table & Search API Reference

| API | Signature | Description |
|---|---|---|
| `addTable` / `addDataTable` | `addTable(id, headers, rows, onSelect?, opts?)` | Data table (`multiSelect`, `checkboxSelection`, `onSelectionChange`, `sortable`, `resizable`, `onSort`, `onDoubleClick`). |
| `.filterTable(...)` / `bindTableFilter` | `searchRef.filterTable(tableId, sourceRows, optsOrCb?)` | One-line live filter. `sourceRows` can be `any[][]` or `() => any[][]` for mutable arrays. Options: `{ columns?: number[], predicate?, countControlId?, countFormat?, onFilter? }`. |
| `.bindDetail(...)` / `bindMasterDetail` | `tableRef.bindDetail(columnToControlMap, onRowSelect?)` | Clicking a row populates mapped controls using `[col0Id, col1Id]` array OR `{ ColumnHeader: "ctrlId" }` map. |
| Mutate rows | `setTableData`, `setTableRows`, `addTableRow`, `removeTableRow`, `selectTableRow` | Updates `formValuesStore` + live `<tbody>`, preserving scroll position. |
| Inspect & Export | `getTableRows`, `getTableHeaders`, `getTableObjects`, `tableRowCount`, `exportTableCsv(id, path?)`, `exportTableJson(id, path?)` | Converts rows to RFC-4180 CSV or `{ [header]: cell }` JSON (writing to `path` if provided). |

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Service Explorer", 860, 560);

const sourceRows: any[][] = [
  ["101", "api-gateway", "Running", "12ms"],
  ["102", "worker-queue", "Paused", "48ms"],
  ["103", "metrics-sync", "Running", "19ms"],
];

win.row((r) => {
  r.addSearchInput("Filter services...").id("txtSearch");
  r.addBadge("bdgMatches", "3 / 3 services", "info");
});

// Master-detail fields populated automatically when a row is clicked:
win.row((r) => {
  r.addFormField("Selected ID:", "txtSelId", "");
  r.addFormField("Service:", "txtSelName", "");
  r.addFormField("Status:", "txtSelStatus", "");
});

win.addTable("tblServices", ["ID", "Service", "Status", "Latency"], sourceRows)
  .bindDetail({ ID: "txtSelId", Service: "txtSelName", Status: "txtSelStatus" });
// Equivalent window-level call: win.bindMasterDetail("tblServices", { ID: "txtSelId", ... });

win.control("txtSearch").filterTable("tblServices", () => sourceRows, {
  columns: [1, 2],
  countControlId: "bdgMatches",
  countFormat: (matched, total) => `${matched} / ${total} services`,
});

// Export current filtered rows as RFC-4180 CSV or JSON array of objects:
win.row((r) => {
  r.addButton("btnCsv", "Export CSV", (w) => {
    const csv = w.exportTableCsv("tblServices");
    w.copyToClipboard(csv);
    w.toast("Copied CSV to clipboard", 2000, "success");
  });
  r.addButton("btnJson", "Export JSON", (w) => {
    const json = w.exportTableJson("tblServices");
    w.copyToClipboard(json);
    w.toast("Copied JSON to clipboard", 2000, "success");
  });
});

if (import.meta.main) win.run();
```

---

## Step 7: Charts, gauges, sparklines, and live telemetry

> 📖 **Learn more:** [Modern Desktop & Analytics Dashboard Controls (`SIMPLEGUI_API.md#dashboard-controls`)](../SIMPLEGUI_API.md#dashboard-controls) · [Timers API (`SIMPLEGUI_API.md#timers-api`)](../SIMPLEGUI_API.md#timers-api)

### Telemetry & Visualization Reference

| Create Method | Signature | Update Method | Widget Summary |
|---|---|---|---|
| `addChart` | `addChart(id, type = "line", height = 140)` | `setChartData(id, values[])` | SVG `"line"`, `"bar"`, or `"area"` chart |
| `addGauge` | `addGauge(id, title, value = 50)` | `setGaugeValue(id, val)` | Metric comparison gauge bar (`0..100`) |
| `addCircularProgress` | `addCircularProgress(id, value = 50)` | `setCircularProgress(id, pct)` | Radial ring indicator (`0..100%`) |
| `addSparkline` | `addSparkline(id, values[], height = 30)` | `setSparklineData(id, values[])` | Compact inline trend polyline + latest value |
| `addDonutChart` | `addDonutChart(id, title, percent?, subtitle?, opts?)` | `setValue(id, pct)` | Circular donut ring with title & subtitle |
| `addActivityRings` | `addActivityRings(id, rings?, opts?)` | — | Build-time concentric multi-ring SVG (`[{ label, percent, color }]`) |
| `addSegmentDistributionBar` | `addSegmentDistributionBar(id, segments[], opts?)` | — | Proportional stacked horizontal bar (`addSegmentedProgress`) |
| `addMetricCard` | `addMetricCard(id, title, value, badge?, subtitle?)` (also `addKpiCard` / `stat_card`) | `setMetricCardValue(id, val, badge?)` | KPI card (`stat_card`) with title & delta badge (no `addStatCard` method) |
| `addStatGrid` | `addStatGrid(stats[], opts?)` (chain `.id(id)`) | — | Multi-metric summary grid (`{ label, value, delta?, trend? }`) |
| `addActivityFeed` | `addActivityFeed(id, height = 140)` | `addActivityFeedItem(id, time, msg)` | Timestamped event stream |
| `addTimeline` | `addTimeline(id, height = 160)` | `addTimelineItem(id, title, sub, time, status?)` | Vertical milestone timeline |
| `addConsole` | `addConsole(id, height = 120)` | `appendConsole(id, text, level?)`, `clearConsole(id)` | Monospace log stream (`0` info, `1` warn, `2` success, `3` error) |
| `addTimer` | `addTimer(intervalMs, onTick, opts?)` | Disable via `win.setControlEnabled(timerId, false)` | Repeating background interval firing `(w) => ...` |

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Live Telemetry", 820, 580);
const history = [24, 38, 31, 46, 52];

win.grid(2, 12, (g) => {
  g.addMetricCard("cardCpu", "Live CPU", "52%", "+4.1%", "8 cores active");
  g.addProgressBar("prgQueue", 42, 100);
});

win.addChart("chtCpu", "area", 140);
win.setChartData("chtCpu", history);
win.addGauge("ggeCpu", "CPU Load (%)", 52);
win.addCircularProgress("ringMem", 64);
win.addSparkline("spkLatency", [12, 14, 11, 16, 13], 36);

win.addTimer(1000, (w) => {
  const cpu = Math.round(30 + Math.random() * 55);
  history.push(cpu);
  if (history.length > 20) history.shift();

  w.setChartData("chtCpu", history);
  w.setGaugeValue("ggeCpu", cpu);
  w.setCircularProgress("ringMem", Math.min(100, cpu + 10));
  w.setSparklineData("spkLatency", history.slice(-8));
  w.setMetricCardValue("cardCpu", `${cpu}%`);
  w.setProgress("prgQueue", Math.min(100, Math.round(cpu * 1.1)));
});

if (import.meta.main) win.run();
```

---

## Step 8: VLang parity, Studio extended, and 35 enterprise components

> 📖 **Learn more:** [Enterprise Components (`SIMPLEGUI_API.md`)](../SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have) · [VLang Parity & Studio Controls (`SIMPLEGUI_API.md#dashboard-controls`)](../SIMPLEGUI_API.md#dashboard-controls) · Interactive Demo: `bun run demos/27_enterprise_components_demo.ts`

### 1. VLang Parity & Studio Extended Controls (`SimpleWindow`)

| Category | Verified Methods & Signatures | What It Builds |
|---|---|---|
| **Command & Nav** | `addCommandPalette(idOrItems?, itemsOrOnSelect?, onSelect?, opts?)`, `addSplitButton(caption, menuItems, onClick?, opts?)`, `addSidebar(...)`, `addNavRail(items, onSelect?, opts?)`, `addModal(...)` | Searchable `Cmd+K` launcher, split action dropdown button, side navigation, modal panels |
| **Editing & Forms** | `addDiffView(...)`, `addToolBar(idOrItems?, itemsOrCb?, onClick?, opts?)`, `addTokenField(...)` / `addTagInput(...)`, `addMaskedInput(...)`, `addInlineEditableLabel(...)`, `addPinCode(id, digits?)`, `addMarkdownView(id, md, h?)`, `addDropZone(...)`, `addFilePickerField(...)` | Side-by-side diffs, toolbars, tag chips, PIN codes, Markdown docs, drop zones |
| **Selectors & Input** | `addRadioGroup(group, options[], selected?, cb?)`, `addComboBox(...)`, `addPullDown(id, options[], selected?, cb?)`, `addTransferList(...)`, `addRangeSlider(...)`, `addVerticalSlider(...)`, `addKnob(...)`, `addRating(...)` / `addStarRating(...)`, `addStepTracker(id, steps[], step?)`, `addFilterChips(id, chips[])` | Radio groups, dual-list transfers, rotary knobs, star ratings, wizard steps |
| **Layout & Cards** | `addSplitPane(idOrLeft?, leftOrRight?, rightOrOpts?, opts?)`, `addAccordionGroup(items[], opts?)`, `addKanbanBoard(idOrCols, colsOrCb?, onMove?, opts?)`, `addKeyValueCard(id, title, keys[], vals[])`, `addPropertyGrid(id, props, opts?)`, `addResourceMonitor(...)`, `addJsonTree(...)`, `addTerminalView(...)`, `addCarousel(...)` / `addSlideshow(...)` | Drag-and-drop Kanban boards, splitters, property inspectors, JSON trees, terminal views |
| **Named Shorthands** | `inputNamed(id, ph?, def?, cb?)`, `textareaNamed(id, ph?, def?, cb?)`, `tableNamed(id, headers, rows, cb?)`, `addToggle(id, label, checked?)`, `addNumberInput(id, min?, max?, val?)` | Explicit-ID VLang parity helpers |

### 2. All 35 Enterprise Components (`src/simplegui_components.ts`)

Every component accepts `UIOpts` (`{ id, width, height, onChange, onClick, ... }`), can also be invoked generically with `win.ui("<type>", cfg)`, and exposes runtime methods via `win.uiCall(id, method, ...args)`:

| Group | Verified Component Methods (`win.<method>(...)`) | Key Config Options & Runtime Helpers |
|---|---|---|
| **Feedback & Surfaces (5)** | `skeleton(opts)`, `paper(title, text, opts)`, `emptyState(title, text, opts)`, `result(status, title, subtitle, opts)`, `backdrop(opts)` | `skeleton({ variant: "text"\|"circular"\|"rect"\|"rounded", lines, animation })`; `result("success"\|"error"\|"404", ...)`; `showBackdrop(id)` / `hideBackdrop(id)` |
| **Navigation & Overlays (11 + alias)** | `appBar(title, items, opts)`, `bottomNav(items, opts)`, `fab(icon, opts)`, `speedDial(actions, opts)`, `backToTop(opts)`, `scrollProgress(opts)`, `drawer(title, opts)`, `popover(label, opts)`, `hoverCard(label, opts)`, `popconfirm(label, title, opts)`, `tour(steps, opts)`, `anchorLinks(links, opts)` | `drawer` (`anchor: "left"\|"right"\|"top"\|"bottom"`, `items`, `html`, `trigger`, `open`) + `openDrawer`/`closeDrawer`/`toggleDrawer`; `tour(steps)` + `startTour(id, step?)` / `stopTour(id)`; `popconfirm` emits `true`/`false` on `onChange` |
| **Enterprise Inputs (8)** | `autocomplete(options, opts)`, `cascader(options, opts)`, `treeSelect(options, opts)`, `mentions(options, opts)`, `signaturePad(opts)`, `richText(opts)`, `copyButton(label, text, opts)`, `loadingButton(label, opts)` | `autocomplete` (`multiple`, `freeSolo`, `limitTags`, `{ label, value, group, disabled }`); `cascader` (`{ label, value, children }`); `treeSelect` (`multiple`, `leafOnly`, `expandAll`); `copyButton` (`text` or `{ target: "#id" }`); `loadingButton` + `setLoading(id, bool)` |
| **Data Display (11)** | `chips(chips, opts)`, `avatarGroup(avatars, opts)`, `descriptions(title, items, opts)`, `statistic(title, value, opts)`, `countdown(title, opts)`, `watermark(mark, content, opts)`, `masonry(items, opts)`, `imageCompare(before, after, opts)`, `marquee(items, opts)`, `typography(variant, text, opts)`, `virtualList(items, opts)` | `statistic` (`prefix`, `suffix`, `trend`, `precision`, `animate`); `countdown` (`seconds` or `target`, `uiCall(id, "reset", secs)`); `descriptions` (`columns`, `bordered`); `virtualList` (`itemHeight`, `search: true` for 100k+ items) |

### 3. Highlighted Enterprise Component Recipes

#### (a) Enterprise Inputs (`autocomplete`, `cascader`, `treeSelect`, `mentions`, `richText`, `signaturePad`, `copyButton`, `loadingButton`)

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Enterprise Inputs", 860, 680);

win.autocomplete(
  [
    { label: "TypeScript", value: "ts", group: "Languages" },
    { label: "Bun Runtime", value: "bun", group: "Platforms" },
    { label: "SQLite", value: "sqlite", group: "Storage" },
  ],
  { id: "acStack", label: "Tech Stack", multiple: true, freeSolo: true, limitTags: 2 },
).onChange((w, tags) => w.toast(`Selected: ${JSON.stringify(tags)}`));

win.cascader(
  [{ label: "US", value: "us", children: [{ label: "Austin", value: "aus" }] }],
  { id: "casRegion", placeholder: "Pick region..." },
);

win.treeSelect(
  [{ label: "src", value: "src", children: [{ label: "simplegui.ts", value: "sg" }] }],
  { id: "tsFile", leafOnly: true, expandAll: true },
);

win.mentions(["Ada Lovelace", "Grace Hopper"], {
  id: "txtMention",
  trigger: "@",
  placeholder: "Type @ to notify a reviewer...",
});

win.richText({
  id: "rtNotes",
  placeholder: "Write release notes...",
  toolbar: ["bold", "italic", "h2", "quote", "ul", "code", "link", "clear"],
});

win.signaturePad({
  id: "sigApprove",
  penColor: "#0f172a",
  penWidth: 2.5,
  saveButton: true,
});

win.row((r) => {
  r.copyButton("Copy Key", "your-api-key", { id: "btnCopy" });
  r.loadingButton("Deploy", { id: "btnLoad", color: "success" }).onClick((w) => {
    w.setLoading("btnLoad", true);
    setTimeout(() => w.setLoading("btnLoad", false), 1200);
  });
});

if (import.meta.main) win.run();
```

#### (b) Data Display (`virtualList`, `statistic`, `countdown`, `descriptions`, `chips`, `avatarGroup`, `imageCompare`)

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Enterprise Data Display", 900, 720);

const largeLogItems = Array.from({ length: 10_000 }, (_, i) => ({
  primary: `Log entry #${i + 1}`,
  secondary: i % 5 === 0 ? "WARN" : "200 OK",
}));

win.virtualList(largeLogItems, {
  id: "vlLogs",
  height: 220,
  itemHeight: 34,
  search: true,
  onClick: (w, ev) => w.toast(`Clicked: ${ev.item.primary}`),
});

win.grid(2, 12, (g) => {
  g.statistic("Active Users", 12840, { trend: "+14.2%", precision: 0 });
  g.countdown("Release Window", { id: "cdWindow", seconds: 300 });
});
win.addButton("Reset Countdown", (w) => w.uiCall("cdWindow", "reset", 300));

win.descriptions(
  "Service Metadata",
  [["Region", "us-east-1"], ["Runtime", "Bun"], ["Database", "SQLite WAL"]],
  { columns: 3, bordered: true },
);

win.chips(
  [
    { label: "TypeScript", color: "primary" },
    { label: "Bun", color: "success" },
    { label: "Desktop", color: "secondary" },
  ],
  { clickable: true, deletable: true },
);

win.avatarGroup(["Ada Lovelace", "Grace Hopper", "Linus Torvalds", "Ken Thompson"], {
  max: 3,
  size: 36,
});

win.imageCompare("https://example.com/before.png", "https://example.com/after.png", {
  beforeLabel: "Before",
  afterLabel: "After",
  height: 180,
});

if (import.meta.main) win.run();
```

#### (c) Studio & Workflow (`appBar`, `drawer`, `addKanbanBoard`, `addPropertyGrid`, `addCommandPalette`, `addDiffView`, `popconfirm`, `tour`)

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Enterprise Studio & Workflow", 980, 760);

win.appBar("OmniStudio", [{ label: "Workspace", value: "ws" }, { label: "Logs", value: "logs" }], {
  search: true,
  actions: [{ label: "Alerts", icon: "bell", badge: 3 }],
});

win.drawer("Quick Nav", {
  id: "navDrawer",
  anchor: "left",
  items: ["Home", "Builds", "Logs"],
  trigger: "Menu",
});

win.addCommandPalette(
  "cmdQuick",
  ["Open File", "Switch Theme", "Export CSV"],
  (w, cmd) => w.toast(`Command: ${String(cmd)}`),
);

win.addKanbanBoard(
  "kbSprint",
  [
    { title: "Backlog", cards: ["Write tests"] },
    { title: "In Progress", cards: ["Expand docs"] },
  ],
  (w, move) => w.toast(`Moved card: ${JSON.stringify(move)}`),
);

win.addPropertyGrid(
  "pgEnv",
  { Host: "127.0.0.1", Port: "3000", Mode: "WAL" },
  { caption: "Runtime Properties" },
);

win.addDiffView(
  "diffCfg",
  "timeout: 5000\nretries: 2",
  "timeout: 3000\nretries: 5",
  { width: 520, height: 150 },
);

win.row((r) => {
  r.addButton("Open Drawer", (w) => w.openDrawer("navDrawer"));
  r.popconfirm("Delete Cache", "Clear all cached builds?", { okText: "Clear" })
    .onChange((w, confirmed) => confirmed && w.toast("Cache cleared", 1800, "success"));
  r.addButton("Start Tour", (w) => w.startTour("tourOnboard", 0));
});

win.tour(
  [{ target: "cmdQuick", title: "Step 1", text: "Jump to any workspace action." }],
  { id: "tourOnboard" },
);

if (import.meta.main) win.run();
```

---

## Step 9: Reactive state, two-way binding, and OS persistence

> 📖 **Learn more:** [Reactive State Store (`SIMPLEGUI_API.md#reactive-state-store`)](../SIMPLEGUI_API.md#reactive-state-store) · [OS Persistence (`SIMPLEGUI_API.md#app-state-persistence`)](../SIMPLEGUI_API.md#app-state-persistence) · [Auto-Persistence (`SIMPLEGUI_API.md#universal-theme-persistence`)](../SIMPLEGUI_API.md#universal-theme-persistence) · [Two-Way Binding (`SIMPLEGUI_API.md#data-event-binding`)](../SIMPLEGUI_API.md#data-event-binding)

### Form Validation (`validateForm`)

Validate multiple fields declaratively before saving or submitting:

| Rule Key | Type | Meaning |
|---|---|---|
| `required` | `boolean` | Fails if value is empty (`""`, whitespace, `null`, `undefined`, or `[]`) |
| `minLength` / `maxLength` | `number` | Checks `String(val).trim().length` bounds |
| `min` / `max` | `number` | Checks numeric bounds (requires valid number) |
| `pattern` | `RegExp` | Requires regex match when non-empty |
| `validate` | `(val, win) => boolean \| string` | Custom validator function returning `true` or an error message string |
| `label` / `message` | `string` | Custom human-friendly field label or override error text |

- **Options (`validateForm(rules, opts)`):** `{ highlight?: boolean; focusFirst?: boolean; toastOnError?: boolean }` (when running, highlights invalid controls, focuses the first error, and shows a toast if enabled).
- **Return shape:** `{ valid: boolean, errors: Record<string, string>, firstErrorId: string | null, firstInvalidId: string | null, firstErrorMessage: string | null }`.

```typescript
import {
  createWindow,
  getAppConfigFile,
  loadStateFromFile,
  saveStateToFile,
  writeFileAtomic,
} from "./src/simplegui";

const win = createWindow("Service Settings", 760, 560, { appId: "svc_prefs" });

win.addFormField("Username:", "txtUser", "ada");
win.addFormField("Email:", "txtEmail", "ada@example.com");
win.addFormNumber("Port:", "numPort", 8080);

// Two-way binding between an input control and win.stateStore + listener
win.addInput("Workspace label").id("txtWorkspace").bindState("workspace_label");
win.addLabel("lblMirror", "Workspace: default");
win.onStateChange("workspace_label", (w, val) => {
  w.setText("lblMirror", `Workspace: ${String(val)}`);
});

win.addButton("btnSaveCfg", "Validate & Save", (w) => {
  const check = w.validateForm({
    txtUser: { required: true, minLength: 3, label: "Username" },
    txtEmail: { required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email." },
    numPort: { min: 1024, max: 65535, validate: (v) => Number(v) !== 22 || "Port 22 is reserved" },
  });
  if (!check.valid) {
    w.warn("Validation Failed", check.firstErrorMessage || "Fix highlighted fields");
    return;
  }

  // Persist custom JSON state atomically to the OS config file
  const cfgPath = getAppConfigFile("svc_prefs", "profile.json");
  saveStateToFile(cfgPath, {
    user: w.getText("txtUser"),
    email: w.getText("txtEmail"),
    port: w.getText("numPort"),
  });
  writeFileAtomic(getAppConfigFile("svc_prefs", "last_sync.txt"), new Date().toISOString());
  const loaded = loadStateFromFile(cfgPath);
  w.setState("last_saved_user", loaded.user);
  w.toast(`Saved profile for ${loaded.user}`, 2000, "success");
});
```

### Reactive State & Two-Way Control Binding

- **Read / Write:** `win.setState(key, val)`, `win.getState(key, defaultVal?)`, `win.getStateOr(key, fallback)`, `win.hasState(key)`, `win.clearState()`, plus typed helpers `setStateInt`/`getStateInt`, `setStateBool`/`getStateBool`, `setStateFloat`/`getStateFloat`.
- **Subscribe & Sync:** `win.onStateChange(key, (w, val) => ...)` runs immediately if `key` already exists in the store, then on every subsequent change. Chain `.bindState(stateKey)` (or call `win.bindState(ctrlId, stateKey)`) for automatic two-way sync between any input control and `stateStore`.

### OS Directories & Persistence Helpers

SimpleGUI exposes cross-platform standard directory helpers (all accepting an `appName` and expanding `~` / `$ENV` via `resolveUserPath`):

| Helper | macOS | Linux (`XDG_*` or fallback) | Windows |
|---|---|---|---|
| `getAppConfigDir(app)` | `$XDG_CONFIG_HOME/<app>` or `~/.config/<app>` | `$XDG_CONFIG_HOME/<app>` or `~/.config/<app>` | `%APPDATA%\<app>` (`~/AppData/Roaming/<app>`) |
| `getAppStateDir(app)` | `~/Library/Application Support/<app>` | `$XDG_STATE_HOME/<app>` or `~/.local/state/<app>` | `%LOCALAPPDATA%\<app>` (`~/AppData/Local/<app>`) |
| `getAppDataDir(app)` | `~/Library/Application Support/<app>` | `$XDG_DATA_HOME/<app>` or `~/.local/share/<app>` | `%LOCALAPPDATA%\<app>` |
| `getAppCacheDir(app)` | `~/Library/Caches/<app>` | `$XDG_CACHE_HOME/<app>` or `~/.cache/<app>` | `%LOCALAPPDATA%\<app>\Cache` |
| `getAppLogDir(app)` | `~/Library/Logs/<app>` | `<appStateDir>/log` | `%LOCALAPPDATA%\<app>\Logs` |
| `getAppRuntimeDir(app)` | `$XDG_RUNTIME_DIR/<app>` or `<tmpdir>/<app>_runtime` | `$XDG_RUNTIME_DIR/<app>` or `<tmpdir>/<app>_runtime` | `<tmpdir>\<app>_runtime` |

- **Config/State file helpers:** `getAppConfigFile(app, "settings.json")`, `getAppStateFile(app, "state.json")`, `saveStateToFile(path, obj)`, `loadStateFromFile(path)`, `writeFileAtomic(path, content)` (process-unique temp file + atomic rename with `0o600` file permissions on POSIX).
- **Automatic Session & Form Persistence:** `saveWindowSession()` / `restoreWindowSession()` (`session.json`), `saveAppFormState()` / `restoreAppFormState()` (`form_state.json`), `enableAutoSaveState(app, file)`, `clearAppFormState(app)`, `disableAutoSave()` / `enableAutoSave()`.
- **Global Theme File:** `saveTheme(name)` writes `~/.config/simplegui/theme.txt`.
- **Automatic Security Filtering (`shouldPersistControl`):** Passwords (`masked`/`is_password`), IDs containing `password`, `passwd`, `secret`, `token`, `api_key`, `apikey`, `pin`, `otp`, and read-only output/log/console/terminal/preview/diff controls are **never** written to `form_state.json`.

---

## Step 10: Menus, context menus, SweetAlert2 `fire()`, modals, and file pickers

> 📖 **Learn more:** [Dialogs & Alerts (`SIMPLEGUI_API.md#dialogs-alerts`)](../SIMPLEGUI_API.md#dialogs-alerts) · [Menu Bar, Toolbars & Context Menus (`SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus`)](../SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus) · [SweetAlert2 `fire()` Dialog (`SIMPLEGUI_API.md#dialogs-sweetalert2-style`)](../SIMPLEGUI_API.md#dialogs-sweetalert2-style)

### Dialogs, Toasts & SweetAlert2 `fire()`

> [!IMPORTANT]
> Inside running window callbacks (`onClick`, `onChange`, etc.), **always use the trailing callback** parameter (`(result) => ...`) rather than `await` — the native WebView event loop cannot resume `await` promises while a modal callback is waiting.

- **Quick Methods on `win`:**
  - `win.info(titleOrMsg, msg?)`, `win.warn(titleOrMsg, msg?)`, `win.error(titleOrMsg, msg?)`
  - `win.confirm(question, titleOrCb?, cb?)` (alias `ask`), `win.prompt(msg, defaultVal?, title?, cb?)`
  - `win.toast(msgOrOpts, durationMs = 3000, icon?)` (`position`: `"top"` | `"top-start"` | `"top-end"` | `"center"` | `"bottom"` | `"bottom-end"`, etc.)
- **Rich `SimpleWindow` & `SimpleDialogs` (`win.dialogs.*`):**
  - On `win`: `fire(opts, cb?)` (or `fire(title, text, icon, cb?)`), `success`, `question`, `confirmDelete(what, opts?, cb?)`, `inputDialog(type, title, opts?, cb?)`, `selectDialog(title, options, opts?, cb?)`, `queueDialogs(steps, cb?)`, `showLoading(title?, text?)`, `hideLoading()`, `closeDialog()`.
  - On `win.dialogs`: exposes `fire`, `success`, `error`, `warning(...)`, `info`, `question`, `confirm`, `confirmDelete`, `prompt`, `inputDialog`, `selectDialog`, `toast`, `showLoading`, `queue(steps, cb?)`, `close()`, `closeAll()`, `update(opts)`, `isVisible()`, and `win.dialogs.mixin(defaults)`.
  - **Key `DialogOptions`:** `title`, `text` (escaped), `html` (raw), `icon` (`"success"|"error"|"warning"|"info"|"question"`), `toast`, `modal`, `timer`, `timerProgressBar`, `showCancelButton`, `showDenyButton`, `confirmButtonText`, `confirmButtonColor`, `cancelButtonText`, `denyButtonText`, `reverseButtons`, `input` (`"text"|"email"|"password"|"number"|"textarea"|"select"|"radio"|"checkbox"|"date"|"color"|"range"|"file"...`), `inputValue`, `inputPlaceholder`, `inputOptions`, `validate` (`"required"|"email"|"url"|"number"|"integer"` or `{ required, minLength, maxLength, min, max, integer, pattern, message }`), `inputValidator`, `preConfirm`, `progressSteps`, `currentProgressStep`.
  - **`DialogResult`:** `{ isConfirmed: boolean, isDenied: boolean, isDismissed: boolean, value?: T, dismiss?: string }`.
  - **Headless mode (`!win.isRunning()`):** Logs `[Dialog]` / `[Toast]` and resolves `{ isConfirmed: true, isDenied: false, isDismissed: false, value: opts.input ? opts.inputValue : true }` so `bun test` suites never hang!

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Menus & Dialogs", 840, 520);

// Menu Bar, Toolbar, Global Context Menu & Control Context Menu
win.addMenuBar("mainMenu", [
  { label: "File", items: ["📄 New", "📂 Open...", "💾 Save", "---", "🚪 Exit"] },
]);
win.addToolBar("mainTb", ["📄 New", "📂 Open", "💾 Save"], (w, item) => w.toast(String(item)));
win.setGlobalContextMenu(["🔄 Refresh", "🎨 Cycle Theme"]).onGlobalContextMenu((w, act) => {
  if (act.includes("Cycle")) w.cycleTheme();
});

win.addTextInput("Right-click me", "sample text")
  .id("txtSample")
  .contextMenu(["🔤 UPPERCASE", "🧹 Clear"], (w, act) => {
    w.setText("txtSample", act.includes("UPPER") ? w.getText("txtSample").toUpperCase() : "");
  });

// SweetAlert2 fire() dialog + input dialog with validation
win.fire(
  {
    title: "Deploy to Production?",
    text: "All health checks passed.",
    icon: "question",
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: "🚀 Deploy",
    denyButtonText: "📝 Stage Only",
  },
  (res) => {
    if (res.isConfirmed) win.toast("Deploying...", 2000, "success");
    else if (res.isDenied) win.toast("Staged build", 2000, "info");
  },
);

// File & Folder Pickers:
// Default (`native: "auto"`) opens native OS picker first (fallback to webview picker only if native unavailable).
// Force guaranteed in-webview modal pickers with `*_webview_*_dialog` or `{ native: "never" }`:
win.open_webview_file_dialog("Select Database", ".sqlite,.db", (p) => p && win.toast(String(p)));
win.open_webview_folder_dialog("Select Workspace", (dir) => dir && win.toast(String(dir)));
win.save_webview_file_dialog("Save Export", "export.json", (dest) => dest && win.toast(String(dest)));
// Or options-object API: win.openFiles({ native: "never", filter: ["ts", "json"] }, (paths) => {});

if (import.meta.main) win.run();
```

### Multi-Step Dialog Wizards (`win.dialogs.queue`), `confirmDelete`, `selectDialog` & File Pickers

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Dialog Wizards", 780, 420);

win.row((r) => {
  r.addButton("btnWizard", "Run Setup Wizard", (w) => {
    w.dialogs.queue(
      [
        { title: "Step 1: Project", input: "text", inputPlaceholder: "api-service", validate: "required" },
        { title: "Step 2: Maintainer Email", input: "email", validate: "email" },
      ],
      (out) => {
        if (out.completed) {
          w.toast(`Created ${out.results[0]?.value} (${out.results[1]?.value})`, 2200, "success");
        }
      },
    );
  });

  r.addButton("btnRegion", "Pick Region", (w) => {
    w.selectDialog("Deploy Target", { us: "US East", eu: "EU Central", ap: "AP Tokyo" }, (region) => {
      if (region) w.toast(`Target: ${String(region)}`, 1800, "info");
    });
  });

  r.addButton("btnDel", "Delete Archive", (w) => {
    w.confirmDelete("build-cache-2026.zip", { confirmButtonColor: "#dc2626" }, (ok) => {
      if (ok) w.toast("Archive deleted", 1800, "warning");
    });
  });

  r.addButton("btnImport", "Open Config...", (w) => {
    w.open_webview_file_dialog("Choose JSON Config", ".json", (filePath) => {
      if (filePath) w.toast(`Loaded ${filePath}`, 1800, "success");
    });
  });
});

if (import.meta.main) win.run();
```

---

<a id="step-11-133-built-in-themes-and-12-fx-shader-themes"></a>
## Step 11: 310 built-in themes and 167 FX shader themes

> 📖 **Learn more:** [Visual Themes (`SIMPLEGUI_API.md#visual-themes`)](../SIMPLEGUI_API.md#visual-themes) · [Complete Theme Catalog (`THEMES.md`)](../THEMES.md) · [Futuristic FX Shader Themes (`developer/fx-themes.md`)](../developer/fx-themes.md)

While SimpleGUI launched with 133 classic themes and 12 FX shader presets, `getThemeNames()` now returns **310 canonical themes** (`getThemeKeys()` returns **385** registry keys including aliases) spanning developer IDE palettes, clean light themes, OS heritage themes, and **167 futuristic FX shader themes** with glassmorphism, backdrop blur, border sheen, and pointer lighting. (Note: `OS_THEMES` and `FX_THEMES` are internal registries in `src/shared/osThemes.ts` and `src/shared/fxThemes.ts`, not re-exported by `simplegui` — query themes with `getThemeNames()`, `getThemeKeys()`, `getTheme()`, and `isFxTheme()`.)

```typescript
import { createWindow, getTheme, getThemeKeys, getThemeNames, isFxTheme } from "./src/simplegui";

const win = createWindow("Theme & FX Studio", 860, 560, { theme: "midnight" });

// 1-line built-in theme selector dropdown (persists user selection automatically):
win.addThemeSelector("dd_theme", "Theme:");

// Filter all 310 canonical themes and 167 futuristic FX shader themes:
const canonicalNames = getThemeNames();     // 310 canonical themes
const allKeys = getThemeKeys();             // 385 registry keys including aliases
const fxNames = canonicalNames.filter(isFxTheme); // 167 FX shader themes

win.row((r) => {
  r.addDropdown("cmbFx", fxNames.slice(0, 12), fxNames[0], (w, chosen) => {
    w.setTheme(String(chosen));
    const meta = getTheme(String(chosen));
    w.toast(`Applied ${meta.name} (${isFxTheme(String(chosen)) ? "FX Shader" : "Standard"})`);
  });

  r.addSegmentedControl("segFxMode", ["full", "reduced", "off"], 0, (w, mode) => {
    w.setEffects(String(mode) as "full" | "reduced" | "off");
    w.toast(`Shader effects: ${String(mode)}`, 1600, "info");
  });
});

// Unknown theme names safely fall back to theme "Monokai Pro" ("monokai_pro"):
const safeFallback = getTheme("unknown_palette"); // => { name: "Monokai Pro", ... }
```

| Theme Category | Verified Sample Keys | Live Preview Command |
|---|---|---|
| **Brand & Dark Studio** | `codefreelance`, `midnight`, `apple_dark`, `nord`, `dracula`, `tokyo_night`, `one_dark_pro`, `catppuccin`, `monokai_pro`, `oled_black` | `bun run demo:themes codefreelance` |
| **Light & High-Contrast** | `light`, `apple_light`, `github_light`, `nordic_paper`, `solarized_light`, `adwaita_light` | `bun run demo:themes apple_light` |
| **OS Heritage Themes** | `win11_slate`, `win95`, `ubuntu_dark`, `linux_mint`, `mac_os_aqua`, `macintosh_system7`, `amiga`, `commodore64` | `bun run demo:themes win95` |
| **FX Shader Themes (`isFxTheme`)** | `cyberpunk_hologram`, `neon_hud`, `aurora_glass`, `abyss_bloom`, `amber_phosphor`, `apple_studio_display_5k` | `bun run demo:themes neon_hud` |

---

## Step 12: Pro SimpleGUI RAD tips and tricks

> 📖 **Learn more:** [Async Busy State (`SIMPLEGUI_API.md#async-busy-state`)](../SIMPLEGUI_API.md#async-busy-state) · [Batch Operations (`SIMPLEGUI_API.md#batch-operations`)](../SIMPLEGUI_API.md#batch-operations) · [Testing Guide (`testing/index.md`)](../testing/index.md) · [Troubleshooting (`SIMPLEGUI_API.md#troubleshooting`)](../SIMPLEGUI_API.md#troubleshooting)

1. **1-Line Multi-View Navigation (`.bindViews`)**: Chain `.bindViews({ Overview: ["cardMain"], Metrics: ["cardCharts"] })` onto `addTabs(...)` to toggle view groups automatically without manual visibility boilerplate.
2. **1-Line Live Table Search (`.filterTable`) + Debounced Queries**: Chain `.filterTable("tblUsers", rows, { countControlId: "bdgCount" })` onto `addSearchInput(...)` for instant in-memory row filtering. For heavy SQLite or network searches, wrap an `onChange` lookup with a standard `setTimeout`/`clearTimeout` debounce lock.
3. **Batch Updates (`setValues`, `setManyTexts`, `setManyEnabled`)**: Prefer `win.setValues({ a: "1", b: "2" })` / `win.setManyTexts(...)` / `win.setManyEnabled(...)` instead of scattering ad-hoc reads and writes across callbacks, and keep per-control custom `.bg()`/`.color()` styling separate so `win.setTheme(...)` preserves your accents automatically.
4. **Safe Async Buttons (`withBusyState`)**: Wrap async button handlers in `await w.withBusyState(["btnDeploy"], "⏳ Deploying...", async (w, done) => { ... done("Deployed!"); })` to disable controls, show status feedback, and automatically re-enable controls when finished (or call `done(completionStatus)`).
5. **Global Keyboard Shortcuts (`onShortcut`)**: Register chords like `win.onShortcut("ctrl+s", (w) => ...)` and test them headlessly with `await win.triggerShortcut("ctrl+s")`.

### Async Busy State (`withBusyState`) & Shortcuts (`onShortcut` / `triggerShortcut`)

```typescript
import { createWindow } from "./src/simplegui";

const win = createWindow("Deploy Tool", 640, 380, { appId: "deploy_tool" });
win.addStatusBar("status_bar", "Idle");
win.addLabel("lblResult", "Waiting to deploy");

async function runDeploy(w: typeof win) {
  await w.withBusyState(["btnDeploy"], "Deploying release...", async (ctx, done) => {
    await ctx.delay(50); // WebView-safe sleep
    ctx.setText("lblResult", "Deployed v2.4.0");
    done("Deploy complete");
  });
}

win.addButton("btnDeploy", "Deploy (Ctrl+S)", (w) => void runDeploy(w));
win.onShortcut("ctrl+s", (w) => void runDeploy(w));

// Inside bun test:
// await win.triggerShortcut("ctrl+s");
```

### Headless `bun test` Guide (Zero WebView Required)

Export a pure factory function from your module and guard `win.run()` behind `if (import.meta.main)`:

```typescript
// app.ts
import { newSimpleWindow, SimpleWindow } from "./src/simplegui";

export function createAppWindow(): SimpleWindow {
  const win = newSimpleWindow("Greeter", 600, 400, { appId: "greeter_test" });
  win.disableAutoSave();
  win.addInput("Enter name").id("txtName");
  win.addLabel("lblOut", "Waiting");
  win.addButton("btnGo", "Greet", (w) => {
    w.setText("lblOut", `Hello, ${w.getText("txtName")}!`);
  });
  return win;
}

if (import.meta.main) {
  createAppWindow().run();
}
```

Then drive interactions synchronously/headlessly in `bun test`:

```typescript
import { expect, test } from "bun:test";
import { createAppWindow } from "./app";

test("updates greeting on click", async () => {
  const win = createAppWindow();
  await win.triggerChange("txtName", "Ada");
  await win.triggerClick("btnGo");
  expect(win.getText("lblOut")).toBe("Hello, Ada!");
});
```

### "Why Did X Happen?" SimpleGUI Troubleshooting FAQ

| Symptom | Root Cause in `src/simplegui.ts` | Fix |
|---|---|---|
| **Window opened fullscreen unexpectedly** | Omitting both `width` and `height` makes `fullscreen` default to `true`. | Pass explicit dimensions (`newSimpleWindow("App", 1040, 720)`) or `{ fullscreen: false }`. |
| **Saved `session.json` / `form_state.json` didn't change my theme or size** | Explicitly passed `theme`, `width`, `height`, or `fullscreen` options intentionally pin `_explicitWindowOptions` so stale session files can't break layout. | Only pass those options when you want them pinned; input values still restore automatically. Call `win.disableAutoSave()` or `win.clearAppFormState()` when resetting. |
| **`setText("chkAgree", "true")` didn't toggle my checkbox** | `setText` updates the caption label of boolean controls without modifying `.checked`. | Use `win.setChecked("chkAgree", true)` or `win.setBool("chkAgree", true)`. |
| **My HTML tags appeared literally as `<b>Hi</b>`** | `setText()` always escapes HTML via `textContent`; `setValue()` writes `textContent`/`value` on standard controls and only writes `innerHTML` on `html_view` controls. | Use `win.setHtml(id, "<b>Hi</b>")` (or `addHtmlView`) for intentional raw HTML. |
| **`await win.confirm(...)` froze inside a button click** | Native WebView dispatches event handlers synchronously; awaiting a modal promise inside the handler stalls IPC. | Pass the trailing callback instead: `win.confirm("Proceed?", "Confirm", (ok) => { ... })`. |
| **My API key or password input wasn't restored on restart** | `shouldPersistControl()` blocks sensitive IDs (`password`, `token`, `secret`, `api_key`, `pin`) and output consoles/logs for security. | Store non-sensitive preferences in persisted controls or manage secrets via an OS keychain. |
| **Rows or cards scrambled after an error** | Calling `beginRow()`/`beginCard()` without `endRow()`/`endCard()` leaves frames on `layoutStack`. | Prefer scoped `win.row(() => ...)`, `win.card(...)`, and `win.grid(...)` which unwind in `try/finally`. |
| **`getControl("missing")` returned `null` silently** | `getControl(id)` is the non-throwing lookup helper. | Use `win.control(id)` when you want an immediate descriptive error on typos. |

---

## Complete full-featured Studio Workspace Template

Copy-paste this self-contained template directly into `app.ts` and run `bun run app.ts` (or import `createStudioWorkspace()` in `bun test` with zero WebView overhead):

```typescript
import { newSimpleWindow, type SimpleWindow } from "./src/simplegui";

export function createStudioWorkspace(): SimpleWindow {
  const win = newSimpleWindow("OmniStudio RAD Workspace", 1040, 740, {
    theme: "apple_dark",
    padding: 16,
    spacing: 10,
    appId: "omnistudio_template",
  });
  win.disableAutoSave();

  const serviceRows: any[][] = [
    ["101", "api-gateway", "Running", "12ms"],
    ["102", "worker-queue", "Paused", "48ms"],
    ["103", "metrics-sync", "Running", "19ms"],
  ];

  // Top Header + Live Theme Switcher + Bottom Status Bar
  win.addStatusBar("status_bar", "Ready · 3 services");
  win.row((r) => {
    r.addHeading("OmniStudio Workspace", "Tabs, Search, Master-Detail, Charts, Validation & Modals");
    r.addThemeSelector("dd_theme", "Theme:");
  });

  // 1-Line Multi-View Navigation (.bindViews is attached once target views exist below)
  win.addTabs(["Services", "Telemetry", "Settings"], 0).id("wsTabs");

  // Tab 1: Live Keystroke Search (.filterTable) + Master-Detail (.bindDetail) + Add Row
  win.card("Live Search & Filter", (c) => {
    c.id("cardSearch");
    c.row((r) => {
      r.addSearchInput("Filter services...").id("txtFilter");
      r.addBadge("bdgMatches", "3 / 3 services", "info");
    });
  });

  win.addTable("tblServices", ["ID", "Service", "Status", "Latency"], serviceRows)
    .bindDetail({ ID: "txtSelId", Service: "txtSelName", Status: "txtSelStatus" });

  win.control("txtFilter").filterTable("tblServices", () => serviceRows, {
    columns: [1, 2],
    countControlId: "bdgMatches",
    countFormat: (m, t) => `${m} / ${t} services`,
  });

  win.card("Selected Service & Quick Add", (c) => {
    c.id("cardDetail");
    c.row((r) => {
      r.addFormField("ID:", "txtSelId", "101");
      r.addFormField("Service:", "txtSelName", "api-gateway");
      r.addFormField("Status:", "txtSelStatus", "Running");
    });
    c.row((r) => {
      r.addButton("btnAddSvc", "Add Demo Service", (w) => {
        const nextId = String(101 + serviceRows.length);
        const name = w.getText("txtSelName") || `worker-${nextId}`;
        serviceRows.push([nextId, name, "Running", "15ms"]);
        w.setTableRows("tblServices", serviceRows);
        w.setText("bdgMatches", `${serviceRows.length} / ${serviceRows.length} services`);
        w.toast(`Added ${name}`, 1800, "success");
      });
      r.addButton("btnCsv", "Export CSV", (w) => {
        w.copyToClipboard(w.exportTableCsv("tblServices"));
        w.toast("CSV copied to clipboard", 1800, "info");
      });
    });
  });

  // Tab 2: Live Charts, Gauges & Sparklines via Timer
  const loadHistory = [28, 36, 42, 39, 45];
  win.card("Live Telemetry", (c) => {
    c.id("cardTelemetry");
    c.grid(2, 12, (g) => {
      g.addMetricCard("kpiLoad", "CPU Load", "45%", "+3.1%", "Healthy");
      g.addGauge("ggeLoad", "Cluster Utilization (%)", 45);
    });
    c.addChart("chtLoad", "area", 140);
    c.setChartData("chtLoad", loadHistory);
    c.addSparkline("spkTrend", loadHistory, 32);
  });

  win.addTimer(1500, (w) => {
    const next = 30 + (w.getInt("kpiLoad") || 40) % 50;
    loadHistory.push(next);
    if (loadHistory.length > 12) loadHistory.shift();
    w.setChartData("chtLoad", loadHistory);
    w.setGaugeValue("ggeLoad", next);
    w.setSparklineData("spkTrend", loadHistory);
    w.setMetricCardValue("kpiLoad", `${next}%`);
  });

  // Tab 3: Reactive State, Validation, FX Mode & SweetAlert2 fire()
  win.card("Preferences & Validation", (c) => {
    c.id("cardPrefs");
    c.addFormField("Maintainer:", "txtMaintainer", "ada").bindState("maintainer");
    c.addFormField("Alert Email:", "txtEmail", "ada@example.com");
    c.row((r) => {
      r.addButton("btnValidate", "Save Settings", (w) => {
        const res = w.validateForm({
          txtMaintainer: { required: true, minLength: 2 },
          txtEmail: { required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Invalid email" },
        });
        if (!res.valid) return void w.warn("Check Form", res.firstErrorMessage || "Fix invalid fields");
        w.fire({ title: "Saved!", text: `Updated ${w.getText("txtMaintainer")}`, icon: "success" });
      });
      r.addButton("btnReducedFx", "Reduced FX", (w) => w.setEffects("reduced"));
    });
  });

  win.control("wsTabs").bindViews(
    {
      Services: ["cardSearch", "tblServices", "cardDetail"],
      Telemetry: ["cardTelemetry"],
      Settings: ["cardPrefs"],
    },
    (w, tabName) => w.setStatusBarText("status_bar", `View: ${tabName}`),
  );

  win.onShortcut("ctrl+s", (w) => w.toast("Saved workspace state", 1600, "success"));
  return win;
}

if (import.meta.main) {
  createStudioWorkspace().run();
}
```

You can also run the full SQLite-backed OmniStudio Workspace template directly from this repository:

```bash
bun run examples/rad_tutorial/12_full_studio_workspace_template.ts
```

See the full source in [`examples/rad_tutorial/12_full_studio_workspace_template.ts`](../../examples/rad_tutorial/12_full_studio_workspace_template.ts) or [`CHEATSHEET.md`](../../CHEATSHEET.md#template-1-full-featured-simplegui-studio-workspace).

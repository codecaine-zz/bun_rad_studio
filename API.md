# 📖 Bun RAD Studio API & Data Specification

This document provides a comprehensive technical reference for the **Bun RAD Studio** architecture, `FormSpec` JSON data schema, event handler bindings, backend Webview IPC methods, and generated project outputs.

---

## 📑 Table of Contents

1. [FormSpec Data Model Schema](#1-formspec-data-model-schema)
2. [Control Specification Object](#2-control-specification-object)
3. [Supported Component Reference](#3-supported-component-reference)
4. [Webview IPC & Backend Bindings](#4-webview-ipc--backend-bindings)
5. [Code Generators](#5-code-generators)
6. [Exported Project Architecture](#6-exported-project-architecture)

---

## 1. FormSpec Data Model Schema

The entire state of a form layout in Bun RAD Studio is represented as a JSON object called `FormSpec`. This spec is synchronized between the visual canvas, the Object Inspector, code generators, and the Bun backend.

```json
{
  "title": "Customer Registration",
  "width": 840,
  "height": 560,
  "background_color": "#0f172a",
  "font_color": "#f8fafc",
  "padding": 20,
  "spacing": 12,
  "controls": [
    {
      "id": "button_1",
      "control_type": "button",
      "x": 32,
      "y": 48,
      "width": 140,
      "height": 36,
      "text": "Submit Form",
      "font_size": 13,
      "font_color": "#ffffff",
      "background_color": "#0284c7",
      "hover_color": "#0369a1",
      "cursor": "pointer",
      "enabled": true,
      "visible": true,
      "locked": false,
      "tab_order": 1,
      "anchors": { "top": true, "left": true, "right": false, "bottom": false },
      "dock": "none",
      "event_handlers": {
        "onClick": "on_button_1_click"
      }
    }
  ],
  "non_visual_controls": [
    {
      "id": "timer_1",
      "control_type": "timer",
      "interval": 1000,
      "enabled": true,
      "event_handlers": {
        "onTimer": "on_timer_1_tick"
      }
    }
  ]
}
```

### FormSpec Global Fields

| Property | Type | Description | Default |
| --- | --- | --- | --- |
| `title` | `string` | Window title caption | `"New RAD Form"` |
| `width` | `number` | Form layout canvas width in pixels | `840` |
| `height` | `number` | Form layout canvas height in pixels | `560` |
| `background_color` | `string` | Form background color (HEX/RGB) | `"#0f172a"` |
| `font_color` | `string` | Form default text color (HEX/RGB) | `"#f8fafc"` |
| `padding` | `number` | Internal form margin/padding in pixels | `20` |
| `spacing` | `number` | Default control spacing gap | `12` |
| `controls` | `Array<ControlSpec>` | Array of placed visual component objects | `[]` |
| `non_visual_controls` | `Array<ControlSpec>` | Array of non-visual tray controls (Timer, Dialogs, DB) | `[]` |

---

## 2. Control Specification Object

Each component placed on the form canvas or tray is represented by a `ControlSpec` object.

```typescript
interface ControlSpec {
  id: string;                      // Unique identifier (e.g. "button_1", "input_2")
  control_type: string;             // Component widget type name
  x: number;                       // Left position on canvas (px)
  y: number;                       // Top position on canvas (px)
  width: number;                   // Component width (px)
  height: number;                  // Component height (px)
  text?: string;                   // Display caption, label, or text content
  font_size?: number;              // Font size in px (default: 13)
  font_color?: string;             // Text color HEX code
  background_color?: string;       // Component background color HEX code
  hover_color?: string;            // Hover background color HEX code
  hover_text_color?: string;       // Hover text color HEX code
  cursor?: string;                 // Mouse cursor CSS style on hover
  border_radius?: number;          // Corner rounding radius in px (0 for square, 9999 for pill)
  border_width?: number;           // Border stroke thickness in px
  border_color?: string;           // Border stroke color HEX code
  border_style?: "solid" | "dashed" | "dotted" | "double" | "none"; // Border stroke pattern
  box_shadow?: "none" | "subtle" | "medium" | "deep" | "glow"; // Drop shadow elevation or glow
  text_align?: "left" | "center" | "right" | "justify"; // Horizontal text alignment
  opacity?: number;                // Component transparency opacity percentage (0-100)
  placeholder?: string;            // Input placeholder text
  value?: any;                     // Metric, slider value, or stepper number
  checked?: boolean;               // Checkbox, radio, or switch toggle state
  enabled?: boolean;               // Interactive state (true = enabled, false = disabled on window creation)
  visible?: boolean;               // Render visibility state (true = visible)
  locked?: boolean;                // Designer lock state (true = locked against drag)
  tab_order?: number;              // Focus sequence index
  tooltip?: string;                // Hover hint tooltip text
  anchors?: {                      // Delphi/VB style component anchoring
    top?: boolean;
    left?: boolean;
    right?: boolean;
    bottom?: boolean;
  };
  dock?: "none" | "top" | "bottom" | "left" | "right" | "fill"; // Component docking behavior
  data_source?: string;            // MS Access / Delphi Dataset connection binding name
  data_field?: string;             // Dataset column field name binding
  interval?: number;               // Timer interval in ms (for TTimer)
  alert_type?: "info" | "success" | "warning" | "error";
  status?: "active" | "inactive" | "warning" | "error";
  event_handlers?: Record<string, string>; // Map of event names to handler code/names
}

### Supported Event Handlers
The `event_handlers` record can map the following event names to string blocks of JavaScript:
- `onClick`: Triggered when the component is clicked.
- `onChange`: Triggered when an input or state value changes.
- `onDoubleClick`: Triggered when the component is double-clicked.
- `onHover`: Triggered when the mouse pointer enters the component.
- `onHoverExit`: Triggered when the mouse pointer leaves the component.
- `onFocus`: Triggered when the component gains input focus.
- `onBlur`: Triggered when the component loses input focus.
- `onKeyDown`: Triggered when a key is pressed down.
- `onKeyUp`: Triggered when a key is released.
- `onMouseDown`: Triggered when the mouse button is pressed.
- `onMouseUp`: Triggered when the mouse button is released.
- `onTimer`: Triggered periodically for `timer` non-visual components.
```

---

## 3. Supported Component Reference

### Visual Components

| Control Type | Display Name | Default Width × Height | Description |
| --- | --- | --- | --- |
| `button` | Action Button | 150 × 36 px | Clickable action button widget |
| `label` | Label | 150 × 36 px | Text title or caption label |
| `input` | Single Input | 150 × 36 px | Single-line text input field |
| `password` | Password Input | 150 × 36 px | Password text field (masked) |
| `search` | Search Bar | 150 × 36 px | Search input bar |
| `textarea` | Multiline Textarea | 280 × 120 px | Multi-line text input field |
| `checkbox` | Checkbox | 150 × 36 px | Toggle check item with label |
| `radio` | Radio Option | 150 × 36 px | Single-select radio option |
| `switch` | Toggle Switch | 150 × 36 px | Modern iOS/macOS toggle switch |
| `slider` | Range Slider | 150 × 36 px | Range value slider control |
| `number` | Number Input | 150 × 36 px | Numeric value input box |
| `stepper` | Number Stepper | 150 × 36 px | Increment/decrement numeric stepper |
| `date` | Date Picker | 150 × 36 px | Date selection picker |
| `color` | Color Well | 150 × 36 px | Color swatch picker |
| `badge` | Status Badge | 120 × 26 px | Rounded status pill badge |
| `status_indicator` | Status Indicator | 150 × 36 px | Colored LED status dot + label |
| `metric_card` | Metric KPI Card | 180 × 75 px | Executive summary KPI stat box |
| `metric_meter` | Metric Meter | 150 × 36 px | Linear percentage progress meter |
| `progress` | Progress Bar | 150 × 36 px | Horizontal loading progress bar |
| `circular_progress` | Circular Gauge | 100 × 100 px | SVG radial percentage gauge |
| `rating` | Star Rating | 150 × 36 px | 5-star rating component |
| `tag` | Tag Chips | 150 × 36 px | Multi-tag chip array |
| `alert_banner` | Alert Banner | 280 × 44 px | Contextual notification message box |
| `code_view` | Syntax Code View | 280 × 120 px | Interactive monospaced syntax code editor & viewer |
| `drop_zone` | File Drop Zone | 280 × 100 px | Drag-and-drop file upload target |
| `panel` | Panel Box | 280 × 120 px | Container box for grouping controls |
| `table` | Data Grid | 280 × 120 px | Multi-column table data grid |
| `db_grid` | Data-Aware Grid | 320 × 160 px | Access/Delphi DB-bound visual grid |
| `db_navigator` | DB Navigator Bar | 320 × 36 px | Classic DB action buttons bar |
| `db_input` | Data Bound Field | 220 × 44 px | Field-bound database text input |
| `db_dropdown` | Data Bound Select | 220 × 44 px | Field-bound database lookup select |
| `divider` | Separator | 300 × 4 px | Horizontal line divider |
| `form_field` | Labelled Input | 220 × 44 px | Pre-configured label + text field pair |
| `segmented_control` | Segmented Control | 240 × 36 px | Modern tabbed pill segment button selector |
| `tree_view` | Tree View | 220 × 140 px | Hierarchical collapsible directory/node tree explorer |
| `avatar_group` | Avatar Group | 160 × 38 px | Stacked user profile avatars with initials & overflow badge |
| `stat_chart` | Stat Chart Card | 200 × 90 px | Executive KPI metric card with integrated SVG sparkline trend graph |
| `accordion` | Accordion Panel | 280 × 100 px | Interactive collapsible disclosure card panel |
| `breadcrumb` | Breadcrumb Bar | 260 × 32 px | Step-by-step path navigation breadcrumb control |
| `timeline` | Activity Timeline | 280 × 110 px | Vertical step-by-step activity/process event status timeline |
| `toast_card` | Notification Toast | 260 × 64 px | Floating notification toast alert card with status icon & close action |
| `time_picker` | Time Picker | 150 × 36 px | Precision clock time selection input field |
| `rich_select` | Searchable Combobox | 200 × 36 px | Searchable dropdown select combobox with icon & arrow |

### Non-Visual Tray Components

| Control Type | Display Name | Tray Icon | Description |
| --- | --- | --- | --- |
| `timer` | Timer | ⏱️ | Periodic execution timer (`onTimer` event) |
| `open_dialog` | Open File Dialog | 📂 | Native file picker open dialog |
| `save_dialog` | Save File Dialog | 💾 | Native file picker save dialog |
| `db_connection` | Database Connection | 🗄️ | SQLite / JSON dataset connection component |
| `http_client` | REST API Client | 🌐 | Asynchronous HTTP request client |
| `notification` | System Notification | 🔔 | Desktop toast notification trigger |

---

## 4. Webview IPC & Backend Bindings

Bun RAD Studio exposes native IPC methods between the frontend Webview and the Bun runtime using `webview.bind(...)`.

### 1. `runPreview(specJson: string): { success: boolean, error?: string }`
Launches an independent, interactive **Live Preview Window** using the provided `FormSpec` JSON.

### 2. `exportProject(specJson: string): { success: boolean, dir: string }`
Generates a complete, standalone Bun project directory on disk under `./exported_project`.

### 3. `quitApp(): void`
Terminates the main RAD Studio IDE application process.

### Window Event Lifecycle Hooks
Auto-generated TS templates and exported projects support window lifecycle bindings:
- `onFormLoad()`: Triggered on window creation when the UI DOM finishes loading.
- `onFormResize(size: { width: number, height: number })`: Triggered dynamically when the window is resized.
- `onFormClose()`: Triggered right before the application closes / terminates.

### RAD Backend & Client Helper Utilities
Exported TypeScript templates and client scripts include built-in high-level helper functions to read, update, and manipulate all RAD controls dynamically:

| Helper Utility Function | Signature | Description |
| --- | --- | --- |
| `execJS(code)` | `(code: string) => void` | Safely evaluates client-side JavaScript in the webview window (`wv.eval(...)`) |
| `getControlValue(id)` | `(id: string) => any` | Reads current value or text of any UI control |
| `setControlText(id, text)` | `(id: string, text: string) => void` | Dynamically updates caption, label, or text of any UI control |
| `setControlValue(id, value)` | `(id: string, value: any) => void` | Updates input value, slider value, checkbox state, or metric |
| `setControlPlaceholder(id, placeholder)` | `(id: string, placeholder: string) => void` | Dynamically updates placeholder text for input fields, textareas, and code views |
| `setControlEnabled(id, enabled)` | `(id: string, enabled: boolean) => void` | Dynamically enables or disables any UI control at runtime |
| `setControlVisible(id, visible)` | `(id: string, visible: boolean) => void` | Dynamically shows or hides any UI control at runtime |
| `setSegmentedSelected(id, text)` | `(id: string, text: string) => void` | Selects a segment button in a Segmented Control by item name |
| `setStatChart(id, opts)` | `(id: string, opts: { title?, value?, trend? }) => void` | Updates Stat Chart KPI card title, value, and trend percentage badge |
| `setToast(id, title, msg, alertType)` | `(id: string, title: string, msg?: string, alertType?: string) => void` | Updates Notification Toast card title, message body, and alert color |
| `setTimePickerValue(id, timeStr)` | `(id: string, timeStr: string) => void` | Sets Time Picker value (e.g. `"09:41"`) |
| `setAccordionOpen(id, open)` | `(id: string, open: boolean) => void` | Expands (`true`) or collapses (`false`) an Accordion section |
| `setTimelineSteps(id, stepsCSV)` | `(id: string, stepsCSV: string) => void` | Updates Activity Timeline steps from comma-separated string |
| `setBreadcrumbs(id, crumbsCSV)` | `(id: string, crumbsCSV: string) => void` | Updates Breadcrumb navigation items from comma-separated string |
| `setTreeNodes(id, nodesCSV)` | `(id: string, nodesCSV: string) => void` | Updates Tree View directory nodes from comma-separated string |
| `setAvatarGroup(id, avatarsCSV)` | `(id: string, avatarsCSV: string) => void` | Updates Avatar Group stack initials from comma-separated string |
| `setRichSelectText(id, text)` | `(id: string, text: string) => void` | Updates Searchable Combobox display selection label |
| `setAlwaysOnTop(onTop)` | `(onTop: boolean) => void` | Toggles window always-on-top mode floating above all OS windows |
| `setWindowPosition(pos)` | `(pos: WindowPositionPreset \| { x: number, y: number }) => void` | Repositions application window to screen presets (`"center"`, `"upper_left"`, `"upper_right"`, `"top_center"`, `"bottom_left"`, `"bottom_right"`, `"bottom_center"`, `"center_left"`, `"center_right"`) or exact `{ x, y }` screen coordinates |

---

## 5. Code Generators

Bun RAD Studio includes 6 real-time code output generators:

1. **Bun TypeScript Generator (`generateBunTSCode()`)**: Executable TypeScript runner code using `webview-bun` with auto-generated typed backend bindings.
2. **Standalone HTML5 Generator (`generateHTMLCode()`)**: Single-file web application with embedded CSS, JS, Anchors & Docking logic.
3. **React + Tailwind Generator (`generateReactTailwindCode()`)**: Modern React TSX component with Tailwind CSS styling and interactive state.
4. **Vue 3 SFC Generator (`generateVueCode()`)**: Clean Vue 3 Single File Component (`.vue`) using `<script setup>`.
5. **Python CustomTkinter Generator (`generatePythonTkinterCode()`)**: Native desktop Python application code using CustomTkinter.
6. **FormSpec JSON Generator**: Raw formatted `FormSpec` JSON document for importing and saving layouts.

---

## 6. Exported Project Architecture

When you click **Export App**, Bun RAD Studio writes a complete, self-contained project:

```
exported_project/
├── index.ts          # Main Bun Webview runner script
├── index.html        # Rendered HTML5 UI template with all controls
└── package.json      # Dependencies (webview-bun)
```

To run the exported application:
```bash
cd exported_project
bun install
bun run index.ts
```

---

## 7. Interactive Demos Suite (`demos/`)

The repository includes 6 interactive executable demo scripts demonstrating all controls, event listeners, and helper utility wrappers:

| Demo Script | Command | Key Features Demonstrated |
| --- | --- | --- |
| `demos/01_standard_controls.ts` | `bun run demo:standard` | Standard UI controls, `onClick`/`onChange` events, input validation, control locking/unlocking via `setControlEnabled` |
| `demos/02_advanced_modern_controls.ts` | `bun run demo:modern` | All 10 modern visual controls & dedicated helper wrappers (`setSegmentedSelected`, `setStatChart`, `setToast`, `setTimePickerValue`, `setAccordionOpen`, `setTimelineSteps`, `setBreadcrumbs`, `setTreeNodes`, `setAvatarGroup`, `setRichSelectText`) |
| `demos/03_data_and_non_visual.ts` | `bun run demo:data` | Data-Aware `DBGrid`, `DBNavigator`, non-visual `Timer` component (`onTimer` event), monospaced `CodeView`, Progress Bars, Gauges, Ratings |
| `demos/04_window_placement_and_pin.ts` | `bun run demo:window` | Native Window Placement API (`setWindowPosition`), 9 screen placement presets, Always On Top window pinning (`setAlwaysOnTop`), Native Cocoa Fullscreen (`toggleFullscreenNative`), and Quit (`process.exit(0)`) |
| `demos/05_crud_todo_table.ts` | `bun run demo:table` | Dynamic Table Control (`table`), dynamic row addition (`➕ Add Row`), row deletion (`➖ Delete Row`), dynamic column insertion (`📐 Add Col`), column removal (`❌ Remove Col`), search filtering (`txtSearch`), row sorting, KPI stats syncing, and IPC event logging |
| `demos/06_timer_control_studio.ts` | `bun run demo:timer` | Non-Visual Timer Component (`timer`), `onTimer` tick loop events, real-time digital clock, telemetry SVG circular gauges, task cycle progress, countdown stopwatch, start/pause/reset controls, and speed interval slider (100ms–2000ms) |


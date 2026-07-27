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
7. [Interactive Demos Suite (`demos/`)](#7-interactive-demos-suite-demos)
8. [Form Themes & Color Palettes (macOS & Windows 11 Desktop Themes)](#8-form-themes--color-palettes-macos--windows-11-desktop-themes)
9. [Quick Start & Developer Recipes](#9-quick-start--developer-recipes)
10. [SimpleGUI Declarative Module Reference](#10-simplegui-declarative-module-reference)

---


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
  read_only?: boolean;             // Read-only text mode (selectable/copyable, not editable)
  required?: boolean;              // Form field mandatory validation requirement
  max_length?: number;             // Character input length limit
  min_value?: number;              // Numeric lower bound for slider, number input, stepper
  max_value?: number;              // Numeric upper bound for slider, number input, stepper
  step?: number;                   // Numeric step increment interval
  auto_focus?: boolean;            // Focus control automatically on window creation
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

### Supported Event Handlers & Callback Signatures

The `event_handlers` record maps event names to function names or JavaScript strings. Below are the supported event names and the parameters passed to their handlers:

| Event Name | Signature / Passed Parameter | Description | Typical Target Components |
| --- | --- | --- | --- |
| `onClick` | `(valueOrLabel?: string) => void` | Triggered on mouse click. Passes element caption/item label if available | `button`, `metric_card`, `kanban_board`, `shortcut_recorder`, `split_button`, `sparkline_table`, `activity_feed`, `toast_card` |
| `onChange` | `(newValue?: any) => void` | Triggered when state/value changes | `input`, `select`, `checkbox`, `radio`, `switch`, `slider`, `number`, `time_picker`, `file_tree_tabs` |
| `onMenu` | `(actionLabel?: string) => void` | Triggered when split button sub-menu arrow is clicked | `split_button` |
| `onSelect` | `(nodeText?: string) => void` | Triggered when a tree view node or option chip is selected | `tree_view`, `segmented_control` |
| `onDoubleClick` | `() => void` | Triggered on double click | Any visual component |
| `onHover` | `() => void` | Triggered when mouse enters element bounds | Any visual component |
| `onHoverExit` | `() => void` | Triggered when mouse exits element bounds | Any visual component |
| `onFocus` | `() => void` | Triggered when input element gains focus | `input`, `password`, `textarea`, `search`, `code_view` |
| `onBlur` | `() => void` | Triggered when input element loses focus | `input`, `password`, `textarea`, `search`, `code_view` |
| `onKeyDown` | `(keyEvent?: string) => void` | Triggered on key press | `input`, `shortcut_recorder`, `command_palette` |
| `onKeyUp` | `(keyEvent?: string) => void` | Triggered on key release | `input`, `shortcut_recorder`, `command_palette` |
| `onTimer` | `() => void` | Triggered periodically on timer interval | `timer` non-visual component |
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
| `form_password` | Labelled Password | 220 × 44 px | Pre-configured field label + password masked input pair |
| `form_textarea` | Labelled Textarea | 280 × 120 px | Pre-configured field label + multi-line text input |
| `form_dropdown` | Labelled Dropdown | 220 × 44 px | Pre-configured field label + dropdown select menu |
| `form_link` | Labelled Link | 150 × 36 px | Pre-configured field label + hyperlink text |
| `form_checkbox` | Labelled Checkbox | 220 × 44 px | Pre-configured field label + checkbox toggle option |
| `form_radio` | Labelled Radio | 220 × 44 px | Pre-configured field label + radio selection button |
| `form_search` | Labelled Search Bar | 220 × 44 px | Pre-configured field label + search bar input |
| `form_color` | Labelled Color Well | 220 × 44 px | Pre-configured field label + color swatch picker & hex display |
| `form_time` | Labelled Time Picker | 220 × 44 px | Pre-configured field label + clock time picker input |
| `form_stepper` | Labelled Stepper | 220 × 44 px | Pre-configured field label + numeric counter stepper |
| `form_code` | Labelled Code View | 280 × 140 px | Pre-configured field label + monospaced syntax code editor |
| `form_drop_zone` | Labelled Drop Zone | 280 × 120 px | Pre-configured field label + drag-and-drop file upload area |
| `form_switch` | Labelled Switch | 220 × 44 px | Pre-configured field label + toggle switch control |
| `form_slider` | Labelled Slider | 220 × 44 px | Pre-configured field label + range value slider |
| `form_number` | Labelled Number Input | 220 × 44 px | Pre-configured field label + numeric input field |
| `form_date` | Labelled Date Picker | 220 × 44 px | Pre-configured field label + date picker input |
| `form_progress` | Labelled Progress Bar | 220 × 44 px | Pre-configured field label + progress bar gauge |
| `tabs` | Tab Container | 320 × 40 px | Multi-tab navigation bar with active tab selector |
| `tool_bar` | Action Toolbar | 400 × 40 px | Window action toolbar with icon action buttons |
| `status_bar` | Window Status Bar | 400 × 28 px | Bottom desktop window status strip with indicator dot |
| `split_pane` | Split View Panel | 320 × 160 px | Dual-pane split container layout with vertical handle |
| `pagination` | Pagination Bar | 260 × 36 px | Page navigator button strip for data grids & lists |
| `command_palette` | Command Palette | 320 × 40 px | Desktop command launcher search bar |
| `toggle_button` | Icon Toggle Button | 120 × 36 px | Toolbar icon toggle button with active pressed state |
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
| `property_grid` | Property Inspector | 240 × 140 px | Two-column key-value property inspector grid widget |
| `popup_menu` | Popup Menu | 200 × 130 px | Desktop context/popup action menu |
| `calendar_view` | Calendar View | 240 × 180 px | Full month calendar grid view widget |
| `color_swatch` | Color Swatch | 200 × 70 px | Color palette swatch selection grid |
| `file_path_bar` | File Path Bar | 280 × 36 px | Desktop location address/path selector bar |
| `kanban_board` | Kanban Task Board | 340 × 180 px | Multi-column task board with columns (To Do, In Progress, Done) and task cards |
| `shortcut_recorder` | Shortcut Recorder | 180 × 36 px | Desktop hotkey recorder & key combination badge viewer widget |
| `split_button` | Split Action Button | 160 × 36 px | Dual-segment button with primary action label + sub-menu dropdown toggle arrow |
| `sparkline_table` | Sparkline Table | 300 × 130 px | Multi-row data grid with embedded SVG mini trend sparklines and status badges |
| `metric_comparison` | KPI Metric Comparison | 220 × 90 px | Executive KPI card comparing current value vs target with percentage delta |
| `activity_feed` | Activity Feed | 280 × 140 px | Timestamped activity audit log stream with user avatars & status |
| `file_tree_tabs` | Workspace Tab Bar | 320 × 36 px | Multi-file IDE tab bar with file icons, modified state dot (•), and close buttons |

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

#### 🔹 Core Component & Form Mutators

| Helper Utility Function | Signature | Description |
| --- | --- | --- |
| `execJS(code)` | `(code: string) => void` | Safely evaluates client-side JavaScript in the webview window (`wv.eval(...)`) |
| `getControlValue(id)` | `(id: string) => any` | Reads current value or text of any UI control |
| `setControlText(id, text)` | `(id: string, text: string) => void` | Dynamically updates caption, label, or text of any UI control |
| `setControlValue(id, value)` | `(id: string, value: any) => void` | Updates input value, slider value, checkbox state, or metric |
| `setControlPlaceholder(id, placeholder)` | `(id: string, placeholder: string) => void` | Dynamically updates placeholder text for input fields, textareas, and code views |
| `setControlReadOnly(id, readOnly)` | `(id: string, readOnly: boolean) => void` | Dynamically toggles read-only state for text inputs, textareas, and code views |
| `setControlRequired(id, required)` | `(id: string, required: boolean) => void` | Dynamically toggles required state for input fields, textareas, and dropdowns |
| `setControlMaxLength(id, maxLength)` | `(id: string, maxLength: number) => void` | Dynamically updates maximum character length limit for input fields |
| `setControlEnabled(id, enabled)` | `(id: string, enabled: boolean) => void` | Dynamically enables or disables any UI control at runtime |
| `setControlVisible(id, visible)` | `(id: string, visible: visible) => void` | Dynamically shows or hides any UI control at runtime |

#### 🔹 Navigation, Layout & Desktop App Mutators

| Helper Utility Function | Signature | Description |
| --- | --- | --- |
| `setTabsActive(id, tabName)` | `(id: string, tabName: string) => void` | Sets active tab in a Tab Container |
| `setWorkspaceTabs(id, filesCSV)` | `(id: string, filesCSV: string) => void` | Updates IDE workspace file tabs and icons |
| `setStatusBarText(id, statusText)` | `(id: string, statusText: string) => void` | Updates status bar message text |
| `setPaginationPage(id, pageNum)` | `(id: string, pageNum: number \| string) => void` | Selects page number in Pagination Bar |
| `setSegmentedSelected(id, text)` | `(id: string, text: string) => void` | Selects a segment button in a Segmented Control by item name |
| `setToggleButtonState(id, active, labelText)` | `(id: string, active: boolean, labelText?: string) => void` | Toggles icon toggle button state & label |
| `setBreadcrumbs(id, crumbsCSV)` | `(id: string, crumbsCSV: string) => void` | Updates Breadcrumb navigation items from comma-separated string |
| `setTreeNodes(id, nodesCSV)` | `(id: string, nodesCSV: string) => void` | Updates Tree View directory nodes from comma-separated string |
| `setFilePathBarPath(id, pathStr)` | `(id: string, pathStr: string) => void` | Updates location string in Desktop File Path Address Bar |
| `setPopupMenuItems(id, itemsCSV)` | `(id: string, itemsCSV: string) => void` | Updates Desktop Popup Context Menu action items and keyboard shortcuts |

#### 🔹 Productivity Controls & Analytics Mutators

| Helper Utility Function | Signature | Description |
| --- | --- | --- |
| `setKanbanColumns(id, rawCols)` | `(id: string, rawCols: string) => void` | Updates Kanban task board column headers and cards |
| `setShortcutRecorderValue(id, shortcutStr)` | `(id: string, shortcutStr: string) => void` | Updates shortcut recorder displayed key combination badge |
| `setSplitButtonAction(id, textStr)` | `(id: string, textStr: string) => void` | Updates primary action label text of Split Action Button |
| `setSparklineTableData(id, rowsCSV)` | `(id: string, rowsCSV: string) => void` | Updates rows and SVG trend sparklines in Sparkline Data Grid |
| `setMetricComparison(id, opts)` | `(id: string, opts: { title?, curVal?, targetStr?, changeStr? }) => void` | Updates executive KPI card title, current value, target goal, and percentage delta |
| `setActivityFeedItems(id, itemsCSV)` | `(id: string, itemsCSV: string) => void` | Updates activity audit stream items and user initial avatars |
| `setStatChart(id, opts)` | `(id: string, opts: { title?, value?, trend? }) => void` | Updates Stat Chart KPI card title, value, and trend percentage badge |
| `setToast(id, title, msg, alertType)` | `(id: string, title: string, msg?: string, alertType?: string) => void` | Updates Notification Toast card title, message body, and alert color |
| `setTimePickerValue(id, timeStr)` | `(id: string, timeStr: string) => void` | Sets Time Picker value (e.g. `"09:41"`) |
| `setAccordionOpen(id, open)` | `(id: string, open: boolean) => void` | Expands (`true`) or collapses (`false`) an Accordion section |
| `setTimelineSteps(id, stepsCSV)` | `(id: string, stepsCSV: string) => void` | Updates Activity Timeline steps from comma-separated string |
| `setAvatarGroup(id, avatarsCSV)` | `(id: string, avatarsCSV: string) => void` | Updates Avatar Group stack initials from comma-separated string |
| `setRichSelectText(id, text)` | `(id: string, text: string) => void` | Updates Searchable Combobox display selection label |
| `setPropertyGridData(id, properties)` | `(id: string, properties: string \| Record<string, string>) => void` | Updates Property Inspector Grid two-column key-value data |
| `setCalendarDate(id, yearMonthStr)` | `(id: string, yearMonthStr: string) => void` | Updates Month Calendar View header title and date grid |
| `setColorSwatchColor(id, hexColor)` | `(id: string, hexColor: string) => void` | Selects active color chip in Color Swatch palette grid |

#### 🔹 Native Window & OS Integration Utilities

| Helper Utility Function | Signature | Description |
| --- | --- | --- |
| `setAlwaysOnTop(onTop)` | `(onTop: boolean) => void` | Toggles window always-on-top mode floating above all OS windows |
| `setWindowPosition(pos)` | `(pos: WindowPositionPreset \| { x: number, y: number }) => void` | Repositions application window to screen presets (`"center"`, `"upper_left"`, `"upper_right"`, `"top_center"`, `"bottom_left"`, `"bottom_right"`, `"bottom_center"`, `"center_left"`, `"center_right"`) or exact `{ x, y }` screen coordinates |
| `toggleFullscreenNative()` | `() => void` | Toggles native OS window fullscreen/maximized mode (macOS Cocoa, Windows 11 SW_MAXIMIZE, Linux GTK) |

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

The repository includes interactive executable demo scripts demonstrating all controls, event listeners, and helper utility wrappers:

| Demo Script | Command | Key Features Demonstrated |
| --- | --- | --- |
| `demos/01_standard_controls.ts` | `bun run demo:standard` | Standard UI controls, `onClick`/`onChange` events, input validation, control locking/unlocking via `setControlEnabled` |
| `demos/02_advanced_modern_controls.ts` | `bun run demo:modern` | All 10 modern visual controls & dedicated helper wrappers (`setSegmentedSelected`, `setStatChart`, `setToast`, `setTimePickerValue`, `setAccordionOpen`, `setTimelineSteps`, `setBreadcrumbs`, `setTreeNodes`, `setAvatarGroup`, `setRichSelectText`) |
| `demos/03_data_and_non_visual.ts` | `bun run demo:data` | Data-Aware `DBGrid`, `DBNavigator`, non-visual `Timer` component (`onTimer` event), monospaced `CodeView`, Progress Bars, Gauges, Ratings |
| `demos/04_window_placement_and_pin.ts` | `bun run demo:window` | Native Window Placement API (`setWindowPosition`), 9 screen placement presets, Always On Top window pinning (`setAlwaysOnTop`), Native Cocoa Fullscreen (`toggleFullscreenNative`), and Quit (`process.exit(0)`) |
| `demos/05_crud_todo_table.ts` | `bun run demo:table` / `bun run demo:crud` | Dynamic Table Control (`table`), dynamic row addition (`➕ Add Row`), row deletion (`➖ Delete Row`), dynamic column insertion (`📐 Add Col`), column removal (`❌ Remove Col`), search filtering (`txtSearch`), row sorting, KPI stats syncing, and IPC event logging |
| `demos/06_timer_control_studio.ts` | `bun run demo:timer` | Non-Visual Timer Component (`timer`), `onTimer` tick loop events, real-time digital clock, telemetry SVG circular gauges, task cycle progress, countdown stopwatch, start/pause/reset controls, and speed interval slider (100ms–2000ms) |
| `demos/07_labeled_form_and_desktop_controls.ts` | `bun run demo:desktop` / `bun run demo:labeled` | Integrated Labeled Form Controls (`form_field`, `form_password`, `form_search`, `form_checkbox`, `form_radio`, `form_color`, `form_time`, `form_stepper`, `form_code`, `form_drop_zone`), Desktop App UI Controls (`tool_bar`, `command_palette`, `tabs`, `split_pane`, `pagination`, `toggle_button`, `status_bar`), and IPC event logging for all interactive controls |
| `demos/08_analytics_dashboard_template.ts` | `bun run demo:dashboard` | Executive Analytics Dashboard template featuring Metric KPI cards, Stat Charts with SVG sparklines, Alert Banners, Segmented Controls, and Progress Gauges |
| `demos/09_file_explorer_ide_template.ts` | `bun run demo:ide` | Developer File Explorer & Code Studio template featuring Tree View directory navigation, Workspace Tab bar, Monospaced Code View, Search Bar, and Status Bar |
| `demos/10_db_studio_query_editor_template.ts` | `bun run demo:db` | Database Studio & Query Editor template featuring DB Navigator, DB-bound Data Grids, SQL Code View, Property Inspector Grid, and DB Connection tray component |
| `demos/11_app_settings_preferences_template.ts` | `bun run demo:settings` | Desktop Application Settings & Preferences template featuring Tab Containers, Toggle Switches, Range Sliders, Color Wells, Time Pickers, and File Path Address Bar |
| `demos/12_advanced_desktop_app_controls.ts` | `bun run demo:app_controls` | Additional 5 Desktop Application Controls Studio (`property_grid`, `popup_menu`, `calendar_view`, `color_swatch`, `file_path_bar`), backend IPC bindings, and live helper updates |
| `demos/13_productivity_controls_studio.ts` | `bun run demo:productivity` | All 7 Modern Productivity UI Controls Studio featuring Kanban Boards (`kanban_board`), Hotkey Shortcut Recorders (`shortcut_recorder`), Split Action Buttons (`split_button`), Sparkline Data Grids (`sparkline_table`), KPI Metric Comparisons (`metric_comparison`), Activity Audit Feeds (`activity_feed`), and Workspace Tab Bars (`file_tree_tabs`) with live on-form alert feedback and event payload stream |

---

## 8. Form Themes & Color Palettes (macOS & Windows 11 Desktop Themes)

Bun RAD Studio includes an automated visual theme engine (`updateFormTheme()`) that harmonizes application form background, text foreground, container panel background, interactive component backgrounds, and primary action button swatches across built-in presets.

### Theme Harmonization Engine

When a theme is selected in the RAD IDE Inspector or applied programmatically, `getThemeColors(themeName)` resolves a color palette object containing:
- `formBg`: Canvas and root container background HEX code
- `formFg`: Form header, title, and label text HEX code
- `ctrlBg`: Default input, grid, dropdown, and interactive control background HEX code
- `ctrlFg`: Input field text and item label HEX code
- `btnBg`: Primary action button background accent HEX code
- `btnFg`: Primary action button font text HEX code
- `panelBg`: Container box panel background HEX code

---

### macOS Desktop Themes Reference

| Theme Name | Target Aesthetic | `formBg` | `formFg` | `ctrlBg` | `ctrlFg` | `btnBg` | `btnFg` | `panelBg` | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `macOS Sonoma Dark` | macOS Dark Mode | `#1e1e1e` | `#f5f5f7` | `#2c2c2e` | `#ffffff` | `#0a84ff` | `#ffffff` | `#252528` | macOS Sonoma / Ventura Dark theme featuring SF-inspired high contrast typography, translucent gray control surfaces, and Apple System Blue accent. |
| `macOS Ventura Light` | macOS Light Mode | `#f6f6f6` | `#1d1d1f` | `#ffffff` | `#1d1d1f` | `#007aff` | `#ffffff` | `#e8e8ed` | Clean, modern macOS Light desktop aesthetic with bright card surfaces, crisp dark typography, and vibrant macOS Aqua Blue accent. |
| `macOS Liquid Glass` | Glassmorphic Navy | `#141923` | `#f3f4f6` | `#1f2937` | `#f9fafb` | `#0284c7` | `#ffffff` | `#111827` | Translucent macOS Glassmorphism design featuring dark navy glass panels, subtle border reflections, and cyan highlight accents. |
| `Apple Dark` | Classic Space Gray | `#1e1e1e` | `#f5f5f7` | `#2c2c2e` | `#ffffff` | `#0a84ff` | `#ffffff` | `#252528` | Classic Apple macOS Space Gray desktop palette optimized for pro desktop studio tools and IDE window layouts. |
| `Midnight` | Midnight Indigo | `#0b0f19` | `#e2e8f0` | `#151c2c` | `#f3f4f6` | `#6366f1` | `#ffffff` | `#1e293b` | Deep dark blue/indigo macOS desktop theme with soft violet accents and elevated midnight slate panels. |
| `Apple Sunset` | macOS Sunset Wallpaper | `#2a1b2a` | `#ffd166` | `#3c243c` | `#ffe5ec` | `#ff477e` | `#ffffff` | `#4a2c4a` | macOS Sunset wallpaper theme with warm purple/magenta background, amber gold typography, and rose pink primary action buttons. |
| `Sonoma Emerald` | macOS Emerald Wallpaper | `#062c21` | `#a7f3d0` | `#0b4334` | `#d1fae5` | `#10b981` | `#ffffff` | `#0f5241` | macOS Sonoma Emerald forest wallpaper palette with deep emerald background, mint text, and green button swatches. |

---

### Windows 11 Desktop Themes Reference

| Theme Name | Target Aesthetic | `formBg` | `formFg` | `ctrlBg` | `ctrlFg` | `btnBg` | `btnFg` | `panelBg` | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Windows 11 Mica Light` | Fluent Mica Light | `#f3f3f3` | `#1b1b1b` | `#ffffff` | `#1b1b1b` | `#0067c0` | `#ffffff` | `#e5e5e5` | Windows 11 Fluent Design light theme with soft off-white Mica tinted background, crisp white card surfaces, and Windows Accent Blue buttons. |
| `Windows 11 Acrylic Dark` | Fluent Dark Acrylic | `#202020` | `#ffffff` | `#2c2c2c` | `#ffffff` | `#60cdff` | `#000000` | `#181818` | Windows 11 Dark Acrylic design with sleek dark charcoal surface, high contrast controls, and electric blue accent. |
| `Windows 11 Fluent Slate` | Fluent Slate Dark | `#1c2128` | `#adbac7` | `#22272e` | `#adbac7` | `#4796e6` | `#ffffff` | `#2d333b` | Windows 11 Slate theme featuring muted dark blue-gray card containers, steel blue buttons, and ergonomic low-eyestrain dark palette. |
| `Windows 11 Sun Valley` | Sun Valley Cobalt | `#0f172a` | `#f8fafc` | `#1e293b` | `#ffffff` | `#38bdf8` | `#0f172a` | `#1e293b` | Windows 11 signature Sun Valley cobalt theme with deep midnight slate canvas, high-contrast dark blue panels, and sky blue accents. |

---

### Developer & Studio Themes Reference

| Theme Name | Target Aesthetic | `formBg` | `formFg` | `ctrlBg` | `ctrlFg` | `btnBg` | `btnFg` | `panelBg` | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Dark` | Default Slate | `#0f172a` | `#f8fafc` | `#1e293b` | `#ffffff` | `#0284c7` | `#ffffff` | `#1e293b` | Default Bun RAD Studio dark theme with Tailwind slate tones and sky blue primary accents. |
| `Light` | Classic Light | `#f6f6f6` | `#1d1d1f` | `#ffffff` | `#1d1d1f` | `#007aff` | `#ffffff` | `#e8e8ed` | Classic light desktop theme with clean white container surfaces and system blue primary buttons. |
| `Catppuccin` | Catppuccin Mocha | `#1e1e2e` | `#cdd6f4` | `#313244` | `#cdd6f4` | `#cba6f7` | `#1e1e2e` | `#45475a` | Warm pastel dark developer theme inspired by Catppuccin Mocha with mauve accents. |
| `Dracula` | Dracula Studio | `#282a36` | `#f8f8f2` | `#44475a` | `#f8f8f2` | `#ff79c6` | `#282a36` | `#383a59` | High contrast dark developer theme with Dracula pink primary buttons and purple container slate. |
| `Cyberpunk` | Cyberpunk Neon | `#0d0221` | `#00f6ff` | `#190536` | `#00f6ff` | `#ff007f` | `#ffffff` | `#26094e` | Futuristic neon dark theme with deep purple canvas, glowing cyan text, and hot pink action buttons. |
| `Nord` | Nordic Ice | `#2e3440` | `#eceff4` | `#3b4252` | `#eceff4` | `#88c0d0` | `#2e3440` | `#434c5e` | Cool arctic dark theme with icy blue accent buttons and muted slate container boxes. |
| `Solarized Light` | Solarized Light | `#fdf6e3` | `#657b83` | `#eee8d5` | `#073642` | `#b58900` | `#fdf6e3` | `#e0d8c3` | Low-contrast solarized light theme designed for reduced glare during daylight coding. |
| `Solarized Dark` | Solarized Dark | `#002b36` | `#839496` | `#073642` | `#93a1a1` | `#2aa198` | `#002b36` | `#094352` | Low-contrast solarized dark theme with cyan/teal primary button swatches. |
| `High Contrast` | Accessibility High Contrast | `#000000` | `#00ff00` | `#111111` | `#00ff00` | `#00ff00` | `#000000` | `#1a1a1a` | High-contrast accessibility theme featuring neon green elements on solid pitch black canvas. |

---

## 9. Quick Start & Developer Recipes

Below are complete, copy-pasteable TypeScript developer recipes demonstrating standard patterns for building desktop UI applications with Bun RAD Studio.

### 💡 Recipe 1: Minimal RAD Desktop Window Setup

```typescript
import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "./index.ts";

const formSpec = {
  title: "My Bun RAD App",
  width: 800,
  height: 600,
  background_color: "#0f172a",
  font_color: "#f8fafc",
  controls: [
    {
      id: "btn_action",
      control_type: "button",
      x: 30, y: 30, width: 160, height: 38,
      text: "Click Me",
      background_color: "#0284c7",
      event_handlers: { onClick: "on_btn_action_click" }
    },
    {
      id: "status_lbl",
      control_type: "label",
      x: 200, y: 38, width: 300, height: 24,
      text: "Ready."
    }
  ]
};

const html = generatePreviewHtml(formSpec as any);
const wv = new Webview(true);
wv.title = formSpec.title;
wv.size = { width: formSpec.width, height: formSpec.height, hint: SizeHint.NONE };

// Bind backend IPC click handler
wv.bind("on_btn_action_click", () => {
  wv.eval(`setControlText("status_lbl", "Button clicked at ${new Date().toLocaleTimeString()}!")`);
});

wv.navigate(`data:text/html,${encodeURIComponent(html)}`);
wv.run();
```

---

### 💡 Recipe 2: Interacting with Modern Productivity Controls

```typescript
// Update Kanban board columns dynamically
wv.eval(`setKanbanColumns("kanban_1", "Backlog (3) | In Progress (5) | Completed (12)")`);

// Update executive KPI metric comparison
wv.eval(`setMetricComparison("metric_1", {
  title: "Quarterly Revenue",
  curVal: "$485,000",
  targetStr: "Target: $450,000",
  changeStr: "+7.8% vs Q2"
})`);

// Push new entries to activity audit stream
wv.eval(`setActivityFeedItems("feed_1", "Sarah deployed v2.1.0 release (1m ago), System automated backup finished (15m ago)")`);

// Toggle window pinning always-on-top
wv.eval(`setAlwaysOnTop(true)`);
```

---

### 💡 Recipe 3: Applying Desktop Form Themes Programmatically

```typescript
import { updateFormTheme } from "./index.ts";

// Apply macOS Sonoma Dark theme across FormSpec
const themedFormSpec = updateFormTheme(formSpec, "macOS Sonoma Dark");

// Generate themed preview HTML
const themedHtml = generatePreviewHtml(themedFormSpec);
```

---

### 💡 Recipe 4: Programmatic Project Exporter

```typescript
import { exportProject } from "./index.ts";

const result = exportProject(JSON.stringify(formSpec));
if (result.success) {
  console.log(`✅ App successfully exported to directory: ${result.dir}`);
} else {
  console.error(`❌ Export failed: ${result.error}`);
}
```

---

## 10. SimpleGUI Declarative Module Reference

The `SimpleGUI` module (`src/simplegui.ts` / exported via `index.ts`) provides a lightweight, fluent declarative API matching `vlang_simplegui`. A dedicated, complete API reference guide is available at [SIMPLEGUI_API.md](file:///Users/codecaine/bun_rad_studio/SIMPLEGUI_API.md).

### 🪟 Window Initialization & Configuration

```typescript
import { createWindow, newWindow, new_simple_window } from "bun_rad_studio";

const win = createWindow("My App", 800, 600, {
  theme: "apple_dark",
  alwaysOnTop: false,
  padding: 20,
  spacing: 12
});
```

### 🚪 Window Lifecycle & Process Exit Methods

| Function / Method | Signature | Description |
| --- | --- | --- |
| `win.close()` | `() => void` | Closes the current window frame (`webview.destroy()`) without killing the process (for multi-window apps). |
| `win.close_window()` | `() => void` | Alias for `win.close()`. |
| `win.exit(code?)` | `(code?: number) => void` | Immediately terminates the entire application process (`process.exit(code)`). |
| `win.quit(code?)` | `(code?: number) => void` | Alias for `win.exit()`. |
| `win.exitApp(code?)` | `(code?: number) => void` | Alias for `win.exit()`. |
| `win.exit_app(code?)` | `(code?: number) => void` | Alias for `win.exit()`. |
| `win.exit_application(code?)` | `(code?: number) => void` | Alias for `win.exit()`. |
| `win.quit_application(code?)` | `(code?: number) => void` | Alias for `win.exit()`. |

### 🔤 Typed Accessor & Control Value Methods

```typescript
// Typed getters
const name: string = win.getText("txtName");
const isEnabled: boolean = win.getBool("chkActive");
const age: number = win.getInt("numAge");
const price: number = win.getFloat("numPrice");

// Typed setters
win.setText("txtName", "Alice");
win.setBool("chkActive", true);
win.setInt("numAge", 30);
win.setFloat("numPrice", 49.99);
```

### 💬 In-Window Glassmorphic Modal Dialogs

```typescript
// Alert dialog
win.showAlert("Operation completed successfully!", "Success");

// Confirm dialog
win.showConfirm("Are you sure you want to delete this account?", "Confirm Action");

// Prompt dialog (async)
const inputName = await win.showPrompt("Please enter your name:", "Default Name", "Input Required");
```

### 🔍 Inspection & OS Path Helpers

```typescript
win.hasControl("btnSubmit");         // boolean
win.listControls();                 // string[]
win.getControlKind("btnSubmit");    // string ("button")
win.requireControl("btnSubmit");    // throws error if control doesn't exist

// OS System Path Helpers
homeDir();                          // User home directory path
tempDir();                          // System temp directory path
desktopDir();                       // Desktop folder path
documentsDir();                     // Documents folder path
downloadsDir();                     // Downloads folder path
```




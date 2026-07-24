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
      "event_handlers": {
        "onClick": "on_button_1_click"
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
| `controls` | `Array<ControlSpec>` | Array of placed component objects | `[]` |

---

## 2. Control Specification Object

Each component placed on the form canvas is represented by a `ControlSpec` object.

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
  placeholder?: string;            // Input placeholder text
  value?: any;                     // Metric, slider value, or stepper number
  checked?: boolean;               // Checkbox, radio, or switch toggle state
  enabled?: boolean;               // Interactive state (true = enabled)
  visible?: boolean;               // Render visibility state (true = visible)
  locked?: boolean;                // Designer lock state (true = locked against drag)
  tab_order?: number;              // Focus sequence index
  tooltip?: string;                // Hover hint tooltip text
  alert_type?: "info" | "success" | "warning" | "error";
  status?: "active" | "inactive" | "warning" | "error";
  event_handlers?: Record<string, string>; // Map of event names to handler code/names
}
```

---

## 3. Supported Component Reference

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
| `code_view` | Syntax Code View | 280 × 120 px | Monospace syntax code preview box |
| `drop_zone` | File Drop Zone | 280 × 100 px | Drag-and-drop file upload target |
| `panel` | Panel Box | 280 × 120 px | Container box for grouping controls |
| `table` | Data Grid | 280 × 120 px | Multi-column table data grid |
| `divider` | Separator | 300 × 4 px | Horizontal line divider |
| `form_field` | Labelled Input | 220 × 44 px | Pre-configured label + text field pair |
| `form_password` | Labelled Password | 220 × 44 px | Pre-configured label + password pair |
| `form_textarea` | Labelled Textarea | 280 × 120 px | Pre-configured label + textarea pair |
| `form_dropdown` | Labelled Dropdown | 220 × 44 px | Pre-configured label + select dropdown |

---

## 4. Webview IPC & Backend Bindings

Bun RAD Studio exposes native IPC methods between the frontend Webview and the Bun runtime using `webview.bind(...)`.

### 1. `runPreview(specJson: string): { success: boolean, error?: string }`
Launches an independent, interactive **Live Preview Window** using the provided `FormSpec` JSON.

### 2. `exportProject(specJson: string): { success: boolean, dir: string }`
Generates a complete, standalone Bun project directory on disk under `./exported_project`.

### 3. `quitApp(): void`
Terminates the main RAD Studio IDE application process.

### 4. `backendAlert(msg: string): void`
Logs a backend diagnostic notification to the terminal.

---

## 5. Code Generators

Bun RAD Studio includes 4 real-time code output generators:

### 1. Bun TypeScript Generator (`generateBunTSCode()`)
Generates executable TypeScript runner code using `webview-bun`. It automatically scans all placed controls and generates typed backend bindings for every `event_handler`:

```typescript
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

const wv = new Webview();
wv.title = "Customer Registration";
wv.size = { width: 840, height: 560, hint: SizeHint.NONE };

const html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
wv.setHTML(html);

// Auto-generated Event Bindings
wv.bind("on_button_1_click", (data?: any) => {
    console.log("⚡ RAD Event [onClick] on #button_1:", data || "");
    return { success: true, timestamp: Date.now() };
});

wv.run();
```

### 2. Standalone HTML5 Generator (`generateHTMLCode()`)
Generates a clean, responsive standalone single-file web application with embedded CSS and JS.

### 3. FormSpec JSON Generator
Generates the raw, formatted `FormSpec` JSON layout document for layout saving and importing.

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

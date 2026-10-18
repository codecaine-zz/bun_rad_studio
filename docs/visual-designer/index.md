# Visual form designer (the IDE)

> **Status: works.** Several defects made the designer unusable until 13 October 2026: [D-001](../documentation-maintenance/discrepancies.md#d-001) (crash on start), [D-016](../documentation-maintenance/discrepancies.md#d-016) (the page's script was cut short), [D-017](../documentation-maintenance/discrepancies.md#d-017) (dialogs could not appear) and [D-021](../documentation-maintenance/discrepancies.md#d-021) to [D-023](../documentation-maintenance/discrepancies.md#d-023) (export and Run). All are fixed. The checks below were made on macOS on **13 October 2026**, partly in a browser rendering of the exact page the designer loads and partly in the native window; each row says which. Windows and Linux were not tested.

## Contents

- [What the designer is meant to do](#what-the-designer-is-meant-to-do)
- [What was checked](#what-was-checked)
- [What the source contains](#what-the-source-contains)
- [Database features: placeholders only](#database-features-placeholders-only)
- [Exporting](#exporting)
- [What is missing from this guide and why](#what-is-missing-from-this-guide-and-why)
- [See also](#see-also)

## What the designer is meant to do

A *form designer* lets you build a window by dragging controls (buttons, text boxes, tables…) onto a canvas instead of writing code. In Bun RAD Studio the designer is a web page (`src/ide.html`) shown in a desktop window by `index.ts`. The page keeps the form as a JSON object (the "form spec"; its fields are described in [API.md](../API.md#2-control-specification-object)) and can show that form as code in several languages.

## What was checked

Checked in a browser rendering of the designer page, one item at a time (this is **not** a check of the native window):

| What | Result |
|---|---|
| Page loads with no script errors | Yes. The form is called "Form1", 800 by 600, with no controls. |
| Place a control | Click an item in the **Component palette**; the status bar says to click the canvas; click the canvas to drop it. Button, Label and Input were placed (ids `button_1`, `label_2`, `input_3`, 150 by 36 pixels, snapped to an 8 pixel grid). |
| Property fields | Selecting a control fills the id, caption, position, size, colors and tooltip fields. |
| Code tabs | With three controls placed, the JSON tab parses, the Python tab compiles (`python3 -m py_compile`), the Bun TS tab transpiles, and the HTML, React and Vue 3 tabs have the expected content. They were not run as projects. React and Vue place controls 30 pixels lower than Python (a title-bar offset); this was seen, not investigated. |
| Undo and redo | Cmd+Z and Cmd+Shift+Z took the control count from 3 to 2 and back to 3. |
| **Audit** | Opens a dialog. With no problems it says "Perfect! No layout collisions or structural issues detected." Overlap, out-of-bounds, duplicate-id and empty-caption checks are in the source; the "no issues" result and, on 13 October 2026, the out-of-bounds, invalid-size, empty-caption and overlap findings were seen in a browser (not in the native window). Since 13 October 2026 ([D-041](../documentation-maintenance/discrepancies.md#d-041)) it also reports a control that starts at a negative position and a control whose width or height is not above 0, and it escapes control ids and the form title in its report. **Auto-Fix** also pulls negative positions to 0; it cannot fix a missing size. |
| **Import** | Accepts a JSON layout (see [Importing a layout](#importing-a-layout)). |
| **New** | Clears the form without asking. The previous form is kept in the undo history (source); not tested. |
| Native window | `bun run index.ts` opens a window titled "Bun RAD Studio (Delphi/VB Style)" that shows the same interface as the browser rendering (seen once in a screenshot; no clicks were made in it). |
| **Run** | Calls `runPreviewHelper`. Verified by running it: it writes `.rad_preview/preview.html` and `preview.ts` into the current folder and starts a separate process that stays running, also when the designer was started from another folder. The preview window's contents were **not** inspected. |
| **Export** | Calls `exportProjectHelper` (button not clicked): writes `index.html`, `index.ts` and `package.json` into `exported_project` in the current folder; files that would change are first kept as `<name>.bak-<time>`. A one-button project builds and starts with the real webview. |
| Keys dialog, right-click menu, **DB Wizard**, **Pin**, **Fullscreen**, drag to move and resize, theme list, alignment buttons | **Not checked.** (Button text colors in all 51 themes were checked by calculation, see [D-019](../documentation-maintenance/discrepancies.md#d-019).) |

### Importing a layout

**Import** opens a box where you paste a form as JSON (the same JSON the JSON tab shows) and press **Load Layout**.

- The text must be one JSON object with a `title`, a `controls` list, or both.
- Each control needs a `control_type` (for example `"button"`). A missing `id` is generated, a duplicate `id` is renamed, and a missing position or size becomes 0,0 and 150 by 36. A missing form width and height become 840 by 560.
- If the text is not valid, you get a message that says what is wrong and **your current form is not changed**.
- If the layout contains event handler **scripts** (anything other than a plain function name), the designer asks for confirmation first; they run as code in **Run** and in exported projects ([D-024](../documentation-maintenance/discrepancies.md#d-024)).
- After a successful import, Cmd/Ctrl+Z brings back the previous form.

## What the source contains

These facts come from reading `src/ide.html` and `index.ts`. Items not listed in the table above were not observed running:

- **Toolbar buttons** include *Run* (preview the form in its own window), *Export*, *Pin* (stay on top), *Fullscreen*, *New*, *DB Wizard*, *Import* (JSON layout), undo/redo, copy/paste/duplicate, lock, bring to front/send to back, grid snapping, *Test* (live hover mode), *Audit* (check for overlaps/errors) and *Keys* (a shortcuts dialog). Tooltips in the source mention F5 for Run, F11 for fullscreen and ⌘Z / ⌘⇧Z / ⌘V / ⌘D for undo, redo, paste and duplicate on macOS.
- **A palette of 95 visual controls** (for example `button`, `input`, `checkbox`, `dropdown_menu`, `table`, `tabs`, `tree_view`, `split_pane`, `kanban_board`, `toast_card`) and **6 non-visual components** (`db_connection`, `http_client`, `notification`, `open_dialog`, `save_dialog`, `timer`).
- **Side panels** for properties, the control tree, and events, plus **code tabs** named *Bun TS*, *HTML*, *React*, *Vue 3*, *Python* and *JSON*.
- A **form spec** with common fields such as `id`, `control_type`, `text`, position and size, `event_handlers`, `data_source` and `data_field` (see [API.md](../API.md)).

Which of these work correctly, what each control's properties and defaults are, and what the dialogs say are **not documented** here yet: that needs a running designer.

## Database features: placeholders only

The designer has database-flavoured controls (`db_grid`, `db_navigator`, `db_input`, `db_dropdown`) and a non-visual `db_connection`, plus a **DB Wizard** button.

What the source does: [discrepancy D-002](../documentation-maintenance/discrepancies.md#d-002)

- `db_grid` draws a table with three fixed sample customers.
- `db_connection` is only a tray icon with a label such as "customers.db (SQLite)".
- The DB Wizard replaces the form with one fixed "Customer Database CRUD Manager" sample layout.
- Nothing connects to a database, discovers fields, or generates database access code.

So: **do not expect the designer to read or edit a real database.** Real database work is done in the [Database Workbench](../databases/workbench.md). Generating database-backed applications is **Planned**.

## Autosave and restore

Added 13 October 2026 ([D-039](../documentation-maintenance/discrepancies.md#d-039)). In the desktop app the form is copied to `~/.bun_rad_studio/designer_draft.json` about 0.8 seconds after each change, so a crash or an accidental close no longer loses it.

- **On the next start**, if that file holds a form with at least one control, a banner asks *Restore your unsaved design "…" (N controls, saved …)?* with **Restore** (focused, so Enter accepts) and **Discard**. A restored form can be undone (Cmd/Ctrl+Z returns to the blank form).
- **Nothing is saved until you answer the banner**, so the blank form shown at start-up cannot overwrite the old draft. If you ignore the banner and edit, those edits are not autosaved.
- A draft goes through the same checks as **Import**, and if it contains event scripts you are asked to confirm, because scripts run as code in Run and in exports.
- Only **one** draft is kept (the latest). It is not a project file: export or copy the **JSON** tab to keep named versions. **Export** does not delete the draft, so the banner can offer a design you already exported.
- In a plain browser (no desktop app) none of this exists.
- **Verified:** the backend helpers and the page logic by automated tests (`tests/designer_draft.test.ts`, "Designer: draft autosave and restore" in `tests/ide_html.test.ts`), the banner flow in a browser with a stand-in backend, and the real app starting with a seeded draft (under a temporary `HOME`) without error and without touching the draft. **Not verified:** the banner in the native window (no clicks made there), and Windows and Linux.

## Exporting

`index.ts` contains `exportProjectHelper(specJson, customExportDir?)`. From reading the source it writes a project folder (`exported_project` in the current folder by default) containing `index.html` (the rendered form), an `index.ts` that opens the form in a Webview and registers simple placeholder handlers for named events, and a `package.json`. [API.md](../API.md) describes the same three files.

Verified (by calling `exportProjectHelper` directly, not through the Export button): a one-button spec produced these three files, and the exported project builds and starts with the real webview (automated in `tests/ide_html.test.ts`, which also checks that a crafted layout cannot inject code, [D-021](../documentation-maintenance/discrepancies.md#d-021), and that edits are kept, [D-022](../documentation-maintenance/discrepancies.md#d-022)). Running it first exposed a syntax error in the generated `index.ts` helpers, now fixed ([D-011](../documentation-maintenance/discrepancies.md#d-011)). Larger forms were not exported. The *Python*, *React* and *Vue 3* tabs are code views; whether they produce runnable projects has not been checked.

## What is missing from this guide and why

| Missing | Reason |
|---|---|
| Complete interface tour, menus, status messages | Only the items in [What was checked](#what-was-checked) were observed; no clicks were made in the native window. |
| Per-control reference (properties, defaults, events, examples) | 95 controls; only Button, Label and Input were placed. The control list above is from the source. |
| Named save and open of a layout | There is no save-as or open command; the JSON tab and **Import** are the way to keep a named copy. The latest form is autosaved as a draft, see [Autosave and restore](#autosave-and-restore). |
| Keyboard shortcuts | Only Cmd+Z and Cmd+Shift+Z were tested. Tooltips mention others (F5, F11, Cmd+V, Cmd+D) that were not. |
| Accessibility | Partly assessed and improved (keyboard focus, palette reachable by keyboard, button contrast); placing (Enter on a palette item), moving (arrows) and resizing (Alt + arrows) work from the keyboard; a specific control can be selected from the Tree tab with Enter or Space. See [Accessibility](../accessibility.md) |

These gaps are tracked in the [coverage matrix](../documentation-maintenance/coverage-matrix.md).

## See also

- [Control specification (API.md)](../API.md)
- [SimpleGUI API](../SIMPLEGUI_API.md): building windows in code, which *does* work ([verified launch](../getting-started/install-and-first-launch.md#step-6-run-your-first-program))
- [Generated applications](../generated-applications/index.md)

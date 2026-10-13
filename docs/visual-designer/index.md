# Visual form designer (the IDE)

> **Status: not usable today.** `bun start`, the command that opens the designer, fails in a fresh clone and in the working copy with `ReferenceError: existsSync is not defined` ([discrepancy D-001](../documentation-maintenance/discrepancies.md#d-001)). Nothing on this page was observed in a running designer. It is a summary of what the **source code** (`index.ts`, `src/ide.html`) contains, so that readers know what to expect once the bug is fixed. Behaviour, defaults and shortcuts are intentionally not described beyond what the source shows.

## Contents

- [What the designer is meant to do](#what-the-designer-is-meant-to-do)
- [What the source contains](#what-the-source-contains)
- [Database features: placeholders only](#database-features-placeholders-only)
- [Exporting](#exporting)
- [What is missing from this guide and why](#what-is-missing-from-this-guide-and-why)
- [See also](#see-also)

## What the designer is meant to do

A *form designer* lets you build a window by dragging controls (buttons, text boxes, tables…) onto a canvas instead of writing code. In Bun RAD Studio the designer is a web page (`src/ide.html`) shown in a desktop window by `index.ts`. The page keeps the form as a JSON object (the "form spec"; its fields are described in [API.md](../API.md#2-control-specification-object)) and can show that form as code in several languages.

## What the source contains

These facts come from reading `src/ide.html` and `index.ts` (not from running them):

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

## Exporting

`index.ts` contains `exportProjectHelper(specJson, customExportDir?)`. From reading the source it writes a project folder (`exported_project` in the current folder by default) containing `index.html` (the rendered form), an `index.ts` that opens the form in a Webview and registers simple placeholder handlers for named events, and a `package.json`. [API.md](../API.md) describes the same three files.

This was **not run** (D-001), so it is not known whether the exported project starts. The *Python*, *React* and *Vue 3* tabs are code views; whether they produce runnable projects has not been checked.

## What is missing from this guide and why

| Missing | Reason |
|---|---|
| Interface tour, menus, dialogs, status messages | Designer cannot be launched (D-001). |
| Per-control reference (properties, defaults, events, examples) | Needs the designer to verify; the control list above is from the source only. |
| Layout, alignment, saving and reopening projects | Not verified. |
| Keyboard shortcuts | Only the tooltip hints above were seen in source; no list is given because none was tested. |
| Accessibility | Not assessed. |

These gaps are tracked in the [coverage matrix](../documentation-maintenance/coverage-matrix.md).

## See also

- [Control specification (API.md)](../API.md)
- [SimpleGUI API](../SIMPLEGUI_API.md): building windows in code, which *does* work ([verified launch](../getting-started/install-and-first-launch.md#step-6-run-your-first-program))
- [Generated applications](../generated-applications/index.md)

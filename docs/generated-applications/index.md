# Generated applications

This page says what the project can generate today and what it cannot. It exists so nobody assumes more than is there.

## What exists

| Output | Where it comes from | Status |
|---|---|---|
| A Bun + Webview project (`index.html`, `index.ts`, `package.json`) | **Export** in the visual designer; `exportProjectHelper` in `index.ts` | Partly verified: `exportProjectHelper` writes the three files, an exported one-button project builds and starts with the real webview, a crafted layout cannot inject code ([D-021](../documentation-maintenance/discrepancies.md#d-021)) and re-exporting keeps your edits as `.bak-<time>` copies ([D-022](../documentation-maintenance/discrepancies.md#d-022)). Automated in `tests/ide_html.test.ts`. The designer's Export button was not clicked and larger forms were not exported. |
| Code views (Bun TS, HTML, React, Vue 3, Python, JSON) | Tabs in the designer | Present in `src/ide.html`; **not verified**. |
| Python, Bun and V code for macros and SQL | "Code" buttons in the SQLite, MySQL and PostgreSQL studios (`applications/studio_codegen.ts`) | Implemented and verified by automated tests (`tests/studio_codegen.test.ts`). The generated text is checked, **not executed**. It targets SQLite in all three studios. |

## What does not exist

- **Database-backed CRUD applications generated from the designer** (forms that create, read, update and delete rows in MySQL, PostgreSQL or SQLite, with configuration kept outside the source code). The designer's *DB Wizard* only builds a fixed sample layout ([D-002](../documentation-maintenance/discrepancies.md#d-002)). This is **Planned**.
- Credentials handling for generated applications: because no database-backed generator exists, there is nothing to document. When one is built it must keep credentials on the server side, not in the page's code; the current [security notes](../databases/workbench.md#safety) describe only the Workbench.

## Running an exported project

Not verified. When the designer works again, the expected steps (from `docs/API.md`) are:

```bash
cd exported_project
bun install
bun run index.ts
```

These commands are copied from [API.md](../API.md), not tested here.

## See also

- [Visual designer](../visual-designer/index.md)
- [Coverage matrix](../documentation-maintenance/coverage-matrix.md)

# Documentation style guide

How to write and change pages in this handbook. Short on purpose: if a rule is not here, choose the plainer option.

## Contents

- [Principles](#principles)
- [Plain language](#plain-language)
- [Page structure](#page-structure)
- [Status labels](#status-labels)
- [Warnings](#warnings)
- [Commands and code examples](#commands-and-code-examples)
- [Screenshots and diagrams](#screenshots-and-diagrams)
- [Links](#links)
- [Terminology](#terminology)
- [Versions and dates](#versions-and-dates)
- [Adding or changing a page](#adding-or-changing-a-page)
- [Checking your pages](#checking-your-pages)

## Principles

1. **Describe what exists.** If you did not run it, read it from the source and say "source only". Never describe a planned feature as available, and never invent commands, shortcuts, settings, screenshots or API signatures.
2. **One authoritative page per subject.** Link to it instead of copying its steps.
3. **Say how you know.** Every behavior claim is either verified (what was run, when, on what) or labeled.
4. **When code and documents disagree, document the code** and record the disagreement in [discrepancies](discrepancies.md).

## Plain language

- Write for someone who has never used a terminal or a database.
- Short sentences. Active voice ("Click **Save**").
- Define a technical term the first time you use it, in the sentence where it appears, with an example. Once the [glossary](glossary-inventory.md) exists, link the first use.
- Name buttons exactly as they appear, in bold. Name files and commands in `code font`.
- Do not give time estimates unless you measured them.

## Page structure

- Exactly **one `#` heading** (the page title). Then `##`, `###`; do not skip levels.
- Pages longer than about 80 lines start with a **Contents** list that links to every `##` section.
- Task pages use: Goal → Prerequisites → numbered Steps with expected results → Cleanup → Related pages.
- Application guides use the template: Overview · Requirements · Starting · Interface tour · Common tasks · Settings · Files and saved state · Keyboard shortcuts · Troubleshooting · Limitations. **Leave out sections that cannot be filled truthfully** and say why in one line instead of writing generic text.
- End with *See also* or *Next* links. Sequential tutorials link to the previous and next lesson.

## Status labels

Use the same words everywhere (they match the [coverage matrix](coverage-matrix.md#features-and-workflows)):

| Label | Use when |
|---|---|
| **Implemented and verified** | You ran it or an automated test covers it. Say which and when. |
| **Implemented but not verified** | The code exists; nobody ran it. |
| **Partially implemented** | Part works or it is a placeholder. |
| **Planned** | It does not exist. |
| **Unsupported** | Known not to work. |
| **Unknown** | Not investigated. |

## Warnings

Put a warning **before** the step it protects, in a block quote that starts with a bold label:

> **Warning – this deletes data.** Name the exact thing that will be deleted and whether it can be undone.

Labels: **Warning** (data loss, security), **Note** (useful but not dangerous), **Not verified** (behavior not checked). Every step that changes or deletes data is labeled and names its exact target. Examples use disposable databases and fictional data only.

## Commands and code examples

- Show the command in a fenced block with a language (`bash`, `ts`, `sql`, `json`).
- Before the block say **where** to run it. After it say **what it does** and **what you should see**.
- Use placeholder credentials that are obviously fake (`your-password`, `user`, `localhost`) and never a real secret. `bun run docs:check` rejects password-looking values.
- Prefer examples that are checked into the repository (for example under `examples/docs/`) and have been run. Say when an example was *not* run.
- Keep each example minimal.

## Screenshots and diagrams

- Use a screenshot only if you captured it from the running application, with credentials removed. Give the surrounding text instructions as well: a screenshot is never the only explanation.
- Always write alt text that says what the image shows.
- Mark a diagram **Conceptual** (how to think about it) or **Verified** (drawn from checked code).

## Links

- Use relative links to `.md` files and descriptive link text ("[Database Workbench guide](../databases/workbench.md)", not "click here").
- Link to a heading with `#slug`. Slugs are lowercase; punctuation is dropped; spaces become hyphens; a heading that starts with an emoji gets a leading hyphen. When in doubt add `<a id="name"></a>` above the heading.
- First mention of another guide on a page should link to it.

## Terminology

Use one name for each thing: *studio* (a windowed tool), *CLI tool* (a command-line tool), *launcher*, *Workbench* (the shared database tool), *profile* (a saved connection), *engine* (SQLite, MySQL, PostgreSQL), *database server*. Keep the spelling of file names, commands and button labels exactly as in the project.

## Versions and dates

- State the version or commit, the operating system and the date for verification claims (for example "macOS, Bun 1.4.2, 13 October 2026").
- Do not write "currently" or "new"; write the date or the version.

## Adding or changing a page

1. Create the `.md` file in the matching folder under `docs/`.
2. Add it to `docs/nav.json` (title and path). A page missing from `nav.json` fails the check.
3. If the page documents an application or feature, add or update its row in `docs/documentation-maintenance/features.json` (hand-kept rows) or let the application index pick it up.
4. Run `bun run docs:build` to regenerate the table of contents, application index, script index and coverage matrix, then `bun run docs:check`.
5. Follow the [contributor checklist](contributor-checklist.md).

## Checking your pages

```bash
bun run docs:build   # regenerate generated pages
bun run docs:check   # fail on stale generated pages, broken links/anchors, orphan pages, unclosed code fences, extra/missing H1, password-looking text
```

`bun run docs:check` does not need a network. To also test external links (failures are warnings, not errors) run `bun scripts/docs/check_docs.ts --external`. The check does **not** run the commands in your pages: do that yourself and record the result.

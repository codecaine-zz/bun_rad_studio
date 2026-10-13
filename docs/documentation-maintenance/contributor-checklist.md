# Contributor checklist for documentation

Copy this list into your pull request description and tick every line that applies. If a line applies and you did not do it, say why.

## Always

- [ ] I ran every command I wrote or changed and recorded the result (or labelled it *not verified*).
- [ ] I followed the [style guide](style-guide.md).
- [ ] New or moved pages are listed in `docs/nav.json`.
- [ ] `bun run docs:build` has been run and its output committed.
- [ ] `bun run docs:check` passes.

## When a feature changes

- [ ] The application or feature page describes the new behaviour (not the planned behaviour).
- [ ] Its row in the [coverage matrix](coverage-matrix.md) source (`features.json`) has the right implementation and verification status, with date and setup.
- [ ] Screenshots from before the change are replaced or removed.
- [ ] The [task index](../reference/task-index.md) still points to the right place.

## When a setting or environment variable changes

- [ ] [Reference index](../reference/index.md) lists its name, purpose, accepted values, default, scope and source file.
- [ ] Security implications are stated (does it hold a secret? is it logged?).
- [ ] Any restart requirement is stated.

## When a command or `package.json` script changes

- [ ] `bun run docs:build` regenerated the [script index](../reference/script-index.md).
- [ ] Pages that quote the command were updated; the output shown is still what you see.

## When an API changes

- [ ] The API reference document names the exact signature, inputs, outputs, errors and side effects.
- [ ] The minimal example in the document was run.

## When a supported platform changes

- [ ] [Requirements](../getting-started/requirements.md) says what was verified on which system. Do not claim support from a successful build alone.

## When a limitation is introduced or fixed

- [ ] The limitation is added to, or removed from, the page where it applies and the [discrepancies](discrepancies.md) list.
- [ ] Statements such as "planned" or "not verified" that are no longer true are removed.

## Database work

- [ ] Examples use disposable databases and fictional data; destructive steps are labelled and name their target.
- [ ] No real credentials appear anywhere (including screenshots and history).

## Before you merge

- [ ] A person who did not write the page followed it from a clean clone, or I state that nobody has.

# Accessibility

What was checked about how usable the programs are with a keyboard, a screen reader or low vision, what was fixed, and what is still missing. **Only the visual designer's page was assessed**, in a Chromium-based browser rendering on macOS on 13 October 2026, with scripted measurements and a few real key presses. No screen reader, no zoom or reflow test, no colour-blindness check and no test in the native window was done. This is not a compliance claim (WCAG or any other standard).

## Contents

- [Visual designer: measured](#visual-designer-measured)
- [Fixed on 13 October 2026](#fixed-on-13-october-2026)
- [Still missing](#still-missing)
- [Other applications](#other-applications)
- [How to repeat the check](#how-to-repeat-the-check)

## Visual designer: measured

| Check | Result before | Result now |
|---|---|---|
| Page language | `lang="en"` set | same |
| Landmarks | one header, one main, one footer, two side panels; no navigation landmark | same |
| ARIA roles | none | the 133 clickable divs have `role="button"`; no other roles |
| Visible buttons with no name (no text, title or label) | 0 of 68 | 0 of 68 |
| Icon-only toolbar buttons | 16 have a `title` (for example "Undo (⌘Z)") but no `aria-label`; the title is used as the name | same |
| Form fields with a `<label for>` | 0 of 39 visible fields; their names come from the `title` attribute (for example "Unique variable name or ID for the control"), the visible label next to them is a separate element | same |
| Clickable elements a keyboard cannot reach | **133 of 133** (the whole component palette, the layout templates and similar) | **0** |
| Visible keyboard focus | **none**: three style rules remove the default outline and nothing replaced it (the focused button had `outline: none`) | a solid outline appears on keyboard focus (checked with real Tab presses) |
| Button text contrast | 25 of 51 themes below 4.5 to 1 | all 51 reach 4.5 to 1 ([D-019](documentation-maintenance/discrepancies.md#d-019)) |
| Body text contrast | Solarized Light and Solarized Dark body text on the form or panel colour is below 4.5 to 1 (published palette) | unchanged |

## Fixed on 13 October 2026

- **Keyboard focus is visible** (`:focus-visible` rule in `src/ide.html`).
- **The palette and other clickable divs are keyboard operable**: Tab reaches them, they are announced as buttons with a name taken from their tooltip, and **Enter** or **Space** activates them (`makeClickablesKeyboardOperable`). Checked live: Tab to *Label*, Enter arms placement ("Click canvas to place label"), Escape cancels. Automated with jsdom in `tests/ide_html.test.ts` ("Designer: keyboard access"); the tests fail on the old page.

- **Placing and resizing controls works from the keyboard** (added later, see [D-035](documentation-maintenance/discrepancies.md#d-035)): Tab to a palette item and press Enter or Space to drop the control below the lowest existing one (selected, status line tells you what happened); **Alt + arrows** resize the selection by 1 px (Alt + Shift: 8 px). Moving with the arrow keys already existed (my earlier statement that it needed a mouse was wrong). Checked live with real key presses (place two controls, move, resize, undo) and by tests ("Designer: placing and resizing without a mouse").

## Still missing

- **Selecting a particular control** on the canvas, drag-and-drop, and multi-select (other than what the keyboard handler already offers) were not checked for keyboard use, so the designer is **not shown to be fully keyboard operable**.
- **Icon-only buttons rely on `title`** instead of `aria-label`; screen readers differ in how they use it.
- **No `<label>` association** for the property fields; the `title` attribute is the only programmatic name.
- **Dialogs** (Import, Audit, Keys, event editor): focus handling (moving focus in, trapping it, returning it) was not checked.
- **The canvas** (the form being designed) exposes the controls as plain elements; whether a screen reader can understand the form was not tested.
- **Motion, zoom, text size and colour-blindness** were not assessed.
- **Solarized** body text contrast, see above.

## Other applications

Not assessed. The 65 studios were not opened in a browser for this purpose. The games draw on a canvas or with custom elements and are likely not accessible to screen readers; this is an expectation, not a finding.

## How to repeat the check

Serve the exact page the designer loads (`getIdeHtml()` from `index.ts`) from a throw-away loopback server, open it in a browser, and measure with `page.evaluate`: count visible buttons without a name, fields without a label, elements with `onclick` whose `tabIndex` is negative, and the computed `outline` of the focused element after real `Tab` key presses (a call to `.focus()` from script does not trigger `:focus-visible`).

## See also

- [Visual designer](visual-designer/index.md)
- [Discrepancy D-031](documentation-maintenance/discrepancies.md#d-031)

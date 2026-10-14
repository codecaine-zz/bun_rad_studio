// Selector groups shared by the fx CSS (fxCss.ts) and the pointer helper (fxPointer.ts), so the two cannot drift apart.
// Each group lists the drop-in `fx-` class first, then the markup SimpleGUI and the Designer canvas already produce.

export const FX_SEL = {
    /** Buttons: scale, press, cursor glow, bloom. */
    button: [".fx-button", "button.rad-button", "button.rad-dropdown-btn", '.designer-control[data-ctype="button"]'],
    /** Cards that tilt towards the pointer and lift. */
    card: [".fx-card", ".rad-card", ".rad-kpi-card", ".sg-kpi-card", '.designer-control[data-ctype="card"]'],
    /** Containers that get glass and a ring but stay flat (they hold other controls, so they never tilt). */
    panel: [".fx-panel", "fieldset", ".simplegui-card", "[data-card]", '.designer-control[data-ctype="panel"]', '.designer-control[data-ctype="groupbox"]'],
    /** Text fields. They cannot hold pseudo-elements, so the focus glow is a filter drop-shadow. */
    input: [".fx-input input", ".fx-input textarea", 'input[type="text"]', 'input[type="password"]', 'input[type="search"]', "textarea", "select", ".simplegui-select"],
    /** Items that drift toward the pointer, at most 6px. */
    magnet: [".fx-nav > *", ".fx-toolbar > *", ".rad-toolbar > *"],
    /** Tab strips with one sliding indicator. */
    pill: [".fx-nav", ".rad-tabs-bar"],
    /** Modal surfaces that animate in. */
    modal: [".fx-modal", ".fx-sheet", ".rad-modal"],
    /** Table rows. */
    row: [".fx-table tbody tr", "table tbody tr"],
} as const;

export const joinSel = (list: readonly string[], prefix = "", suffix = ""): string => list.map((s) => `${prefix}${s}${suffix}`).join(",\n");

/** Elements the pointer helper tracks for the cursor glow. */
export const FX_POINTER_TARGETS = [...FX_SEL.button, ...FX_SEL.card, ...FX_SEL.panel].join(",");
export const FX_TILT_TARGETS = FX_SEL.card.join(",");
export const FX_MAGNET_TARGETS = FX_SEL.magnet.join(",");
export const FX_PILL_BARS = FX_SEL.pill.join(",");

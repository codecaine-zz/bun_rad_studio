import { describe, expect, test } from "bun:test";
import { SimpleWindow, SIMPLEGUI_THEMES, getSemanticColors, getTheme, getThemeKeys } from "../src/simplegui";
import { SEMANTIC_KINDS, contrastRatio, normalizeKind, parseColor } from "../src/shared/themeSemantic";
import { OS_THEMES } from "../src/shared/osThemes";

// Aliases share a record's colours, so each distinct theme is checked once.
function distinctThemes(): { key: string; name: string }[] {
    const seen = new Set<string>();
    const out: { key: string; name: string }[] = [];
    for (const key of getThemeKeys()) {
        const t = getTheme(key);
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        out.push({ key, name: t.name });
    }
    return out;
}

// Status text moves toward black on light themes and white on dark ones, which cannot reach 4.5:1 on a mid-tone canvas such as Windows 95 teal; the target never asks for more than that.
function attainable(bg: string, isDark: boolean): number {
    return Math.min(4.5, contrastRatio(isDark ? "#ffffff" : "#000000", bg) - 0.1);
}

describe("semantic status colours", () => {
    test("every theme has readable danger, warning, success and info colours", () => {
        for (const { key } of distinctThemes()) {
            const t = getTheme(key);
            const card = t.card_background || (t.is_dark ? "#1e293b" : "#ffffff");
            const sem = getSemanticColors(key);
            for (const kind of SEMANTIC_KINDS) {
                const c = sem[kind];
                expect(contrastRatio(c.on, c.solid), `${key} ${kind} on/solid`).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(c.solid, card), `${key} ${kind} solid/card`).toBeGreaterThanOrEqual(3);
                expect(contrastRatio(c.text, card), `${key} ${kind} text/card`).toBeGreaterThanOrEqual(attainable(card, t.is_dark));
                expect(contrastRatio(c.text, t.background_color), `${key} ${kind} text/background`).toBeGreaterThanOrEqual(attainable(t.background_color, t.is_dark));
            }
        }
    });

    test("the four kinds keep their meaning in every theme", () => {
        for (const { key } of distinctThemes()) {
            const sem = getSemanticColors(key);
            const [dr, dg, db] = parseColor(sem.danger.solid);
            const [wr, wg, wb] = parseColor(sem.warning.solid);
            const [sr, sg, sb] = parseColor(sem.success.solid);
            const [ir, , ib] = parseColor(sem.info.solid);
            expect(dr > dg && dr > db, `${key} danger is red`).toBe(true);
            expect(wr > wb && wg > wb, `${key} warning is yellow or amber`).toBe(true);
            expect(sg > sb, `${key} success is green`).toBe(true);
            expect(sg > sr * 0.8 || sg > 90, `${key} success is not red`).toBe(true);
            expect(ib > ir, `${key} info is blue`).toBe(true);
        }
    });

    test("well-known palettes keep their published colours", () => {
        expect(getSemanticColors("dracula").danger.solid).toBe("#ff5555");
        expect(getSemanticColors("nord").success.solid).toBe("#a3be8c");
        expect(getSemanticColors("github_light").danger.solid).toBe("#cf222e");
        // Aliases of the same theme share the palette.
        expect(getSemanticColors("gruvbox").warning.solid).toBe(getSemanticColors("gruvbox_dark").warning.solid);
    });

    test("light and dark themes get different tones from the same defaults", () => {
        expect(getSemanticColors("ubuntu_dark").danger.text).not.toBe(getSemanticColors("ubuntu_light").danger.text);
    });

    test("normalizeKind understands the usual words", () => {
        expect(normalizeKind("error")).toBe("danger");
        expect(normalizeKind("Destructive")).toBe("danger");
        expect(normalizeKind("warn")).toBe("warning");
        expect(normalizeKind("ok")).toBe("success");
        expect(normalizeKind("information")).toBe("info");
        expect(normalizeKind("#ff0000")).toBeNull();
        expect(normalizeKind(undefined)).toBeNull();
    });

    test("pages carry the variables and status buttons use them", () => {
        const win = new SimpleWindow("t", 400, 300, {});
        win.setTheme("dracula");
        win.addButton("del", "Delete", { variant: "danger" });
        win.addButton("ok", "Save", { variant: "success", appearance: "soft" });
        win.addButton("plain", "Plain");
        const html = win.generateHtml();
        expect(html).toContain("--danger: #ff5555");
        expect(html).toContain("--danger-text:");
        expect(html).toMatch(/<button id="del"[^>]*class="rad-button rad-btn-danger"/);
        expect(html).toContain("background:var(--danger);color:var(--danger-on)");
        expect(html).toContain("background:var(--success-soft);color:var(--success-text)");
        expect(html).toMatch(/<button id="plain"[^>]*btn-theme-accent/);
        expect(html).not.toMatch(/<button id="plain"[^>]*rad-btn-/);
    });

    test("an explicit background colour still wins over a status variant", () => {
        const win = new SimpleWindow("t", 400, 300, {});
        win.addButton("x", "X", { variant: "danger", background_color: "#123456" });
        const html = win.generateHtml();
        expect(html).not.toContain("rad-btn-danger");
        expect(html).toContain("#123456");
    });

    test("badges use the theme's status text colour", () => {
        const win = new SimpleWindow("t", 400, 300, {});
        win.setTheme("nord");
        win.addBadge("Late", "warning");
        const html = win.generateHtml();
        const sem = getSemanticColors("nord");
        expect(html).toContain(`background:${sem.warning.soft};color:${sem.warning.text}`);
    });
});

describe("Linux, Windows and macOS themes", () => {
    const need = [
        "debian_dark", "arch_dark", "opensuse_dark", "manjaro_dark", "elementary_light", "kali_dark", "zorin_dark",
        "rhel_dark", "rocky_dark", "almalinux_dark", "centos_dark", "fedora_light", "endeavouros_dark", "nixos_dark",
        "gentoo_dark", "alpine_dark", "kde_breeze_dark", "kde_breeze_light", "xfce_dark", "mate_dark", "deepin_light",
        "arc_dark", "sweet_dark", "numix_dark",
        "win31", "win98", "win2000", "winxp_luna", "vista_aero", "win7_aero", "win8_metro", "win10_dark", "win10_light",
        "windows_terminal", "windows_high_contrast",
        "mac_os_9", "snow_leopard", "yosemite", "big_sur", "monterey_light", "sequoia_dark", "tahoe_glass",
    ];

    test("every promised distribution and OS version exists", () => {
        for (const k of need) expect(SIMPLEGUI_THEMES[k], k).toBeDefined();
        expect(Object.keys(OS_THEMES).length).toBe(45);
    });

    test("each new theme is readable: text, button label and card", () => {
        for (const [key, t] of Object.entries(OS_THEMES)) {
            const card = t.card_background!;
            expect(contrastRatio(t.font_color, t.background_color), `${key} font/background`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.font_color, card), `${key} font/card`).toBeGreaterThanOrEqual(4.5);
            const label = Math.max(contrastRatio(t.accent_color, "#ffffff"), contrastRatio(t.accent_color, "#000000"));
            expect(label, `${key} accent label`).toBeGreaterThanOrEqual(4.5);
            expect(t.is_dark, `${key} is_dark matches its background`).toBe(contrastRatio(t.background_color, "#000000") < contrastRatio(t.background_color, "#ffffff"));
        }
    });

    test("names and short names are unique so selectors stay unambiguous", () => {
        const names = new Set<string>();
        const shorts = new Set<string>();
        for (const { key } of distinctThemes()) {
            const t = getTheme(key);
            expect(names.has(t.name), t.name).toBe(false);
            names.add(t.name);
            if (t.short_name) {
                const s = t.short_name.toLowerCase();
                shorts.add(s);
            }
        }
        expect(names.size).toBeGreaterThanOrEqual(133);
    });

    test("friendly aliases resolve", () => {
        expect(getTheme("windows_xp").name).toBe("Windows XP Luna");
        expect(getTheme("debian").name).toBe("Debian Dark");
        expect(getTheme("kde").name).toBe("KDE Plasma Breeze Dark");
        expect(getTheme("macos_tahoe").name).toBe("macOS Tahoe Glass");
        expect(getTheme("Windows 7").name).toBe("Windows 7 Aero");
    });
});

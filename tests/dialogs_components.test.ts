import { describe, expect, test } from "bun:test";
import { createWindow } from "../src/simplegui.ts";
import { DIALOG_CLIENT_HTML } from "../src/simplegui_dialogs.ts";
import { UI_CLIENT_HTML, UI_DEFAULT_SIZES, renderUIComponent } from "../src/simplegui_components.ts";

const scriptOf = (html: string, id: string) => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))![1]!;

describe("SweetAlert-style dialogs", () => {
    test("client script parses", () => {
        expect(() => new Function(scriptOf(DIALOG_CLIENT_HTML, "sgd-script"))).not.toThrow();
    });
    test("headless callbacks fire synchronously", () => {
        const win = createWindow("t", 400, 300);
        let confirmed: boolean | undefined;
        let typed: string | null | undefined;
        win.confirm("Sure?", "T", (ok) => { confirmed = ok; });
        win.prompt("Name?", "bob", "T", (v) => { typed = v; });
        expect(confirmed).toBe(true);
        expect(typed).toBe("bob");
    });
    test("webview file dialog returns null when no window is running", () => {
        const win = createWindow("t", 400, 300);
        let got: any = "unset";
        win.open_webview_file_dialog("t", "", (p) => { got = p; });
        expect(got).toBeNull();
    });
    test("page embeds the dialog client", () => {
        expect(createWindow("t", 400, 300).generateHtml()).toContain("SimpleDialogClient");
    });
});

describe("Enterprise components", () => {
    test("client script parses", () => {
        expect(() => new Function(scriptOf(UI_CLIENT_HTML, "sgu-script"))).not.toThrow();
    });
    test("every component type has a default size and a window helper", () => {
        const win: any = createWindow("t", 800, 600);
        for (const type of Object.keys(UI_DEFAULT_SIZES)) {
            expect(Array.isArray((UI_DEFAULT_SIZES as any)[type])).toBe(true);
            const ref = win.ui(type, {});
            expect(ref.spec.text).toContain(`data-sgu="${type}"`);
        }
    });
    test("config is HTML-escaped and event hooks are stripped", () => {
        const html = renderUIComponent("chips", { chips: ['<b>"x"</b>'], onClick: () => 1 });
        expect(html).not.toContain("<b>");
        expect(html).not.toContain("onClick");
    });
    test("page embeds components and wires onChange", () => {
        const win = createWindow("t", 800, 600);
        let seen: any;
        win.autocomplete(["a", "b"], { id: "ac", onChange: (_w: any, v: any) => { seen = v; } });
        expect(win.generateHtml()).toContain('data-sgu="autocomplete"');
        expect(seen).toBeUndefined();
    });
});

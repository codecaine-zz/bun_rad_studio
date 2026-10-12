import { createWindow } from "../src/simplegui.ts";

// Enterprise component gallery: every component here is NEW (not previously in SimpleWindow).
// Run:  bun run demos/27_enterprise_components_demo.ts
export function createEnterpriseShowcase() {
    const win = createWindow("Enterprise Components", 1100, 900, { theme: "apple_dark" });

    win.scrollProgress();
    win.backToTop();

    win.appBar("Acme Console", ["Dashboard", "Reports", "Settings"], {
        search: true, menuButton: true, width: 1040,
        actions: [{ label: "Alerts", icon: "bell", badge: 3, value: "alerts" }, { label: "Profile", icon: "user", value: "profile" }],
        onClick: (w, v) => w.toast(`AppBar: ${v}`, 1500, "info"),
    });
    win.drawer("Navigation", {
        id: "nav", trigger: "☰ Open drawer", anchor: "left",
        items: [{ label: "Home", icon: "home", value: "home" }, { label: "Files", icon: "folder", value: "files" }, { label: "Settings", icon: "settings", value: "settings" }],
        onClick: (w, v) => w.toast(`Drawer: ${v}`, 1500),
    });

    win.typography("h4", "Inputs", { gradient: ["#38bdf8", "#a78bfa"], width: 600 });
    win.autocomplete(["Bun", "Node", "Deno", "TypeScript", "Rust", "Go", "Python"], {
        label: "Language", placeholder: "Search...", width: 320, onChange: (w, v) => w.toast(`Picked ${v}`, 1200),
    });
    win.autocomplete([
        { label: "React", group: "Frontend" }, { label: "Vue", group: "Frontend" }, { label: "Express", group: "Backend" }, { label: "Hono", group: "Backend" },
    ], { label: "Stack (multi, free-solo)", multiple: true, freeSolo: true, width: 420 });
    win.cascader([
        { label: "Europe", value: "eu", children: [{ label: "Germany", value: "de", children: [{ label: "Berlin", value: "ber" }, { label: "Munich", value: "muc" }] }, { label: "France", value: "fr", children: [{ label: "Paris", value: "par" }] }] },
        { label: "Asia", value: "as", children: [{ label: "Japan", value: "jp", children: [{ label: "Tokyo", value: "tok" }] }] },
    ], { label: "Location", placeholder: "Pick a city", width: 320 });
    win.treeSelect([
        { label: "src", value: "src", children: [{ label: "simplegui.ts", value: "sg" }, { label: "dialogs.ts", value: "dl" }] },
        { label: "demos", value: "demos", children: [{ label: "26_dialogs.ts", value: "d26" }] },
    ], { label: "Tree select", multiple: true, expandAll: true, width: 320 });
    win.mentions(["Ada", "Linus", "Grace", "Alan"], { placeholder: "Type @ to mention a teammate...", width: 420, height: 90 });
    win.richText({ value: "<b>Rich</b> text editor — try the toolbar.", width: 520, height: 200 });
    win.signaturePad({ width: 420, height: 170, saveButton: true, onClick: (w) => w.toast("Signature captured", 1500, "success") });

    win.typography("h4", "Buttons & actions", { gradient: ["#34d399", "#38bdf8"], width: 600 });
    win.copyButton("Copy API key", "sk-live-1234567890", { width: 170 });
    win.loadingButton("Save changes", { autoLoadingMs: 1800, color: "success", width: 170, onClick: (w) => w.toast("Saving...", 1200) });
    win.popconfirm("Delete", "Delete this record?", { text: "This cannot be undone.", width: 130, onChange: (w, ok) => ok && w.toast("Deleted", 1500, "error") });
    win.popover("Popover", { title: "Hello", text: "Anchored content with any HTML.", width: 140 });
    win.hoverCard("@ada", { name: "Ada Lovelace", text: "Analyst · wrote the first program", width: 120 });
    win.fab("add", { label: "New", width: 130, onClick: (w) => w.toast("FAB clicked", 1200) });
    win.speedDial([{ id: "copy", icon: "copy", label: "Copy" }, { id: "share", icon: "share", label: "Share" }, { id: "print", icon: "print", label: "Print" }], {
        direction: "right", width: 260, onClick: (w, id) => w.toast(`SpeedDial: ${id}`, 1200),
    });
    win.backdrop({ id: "bd", text: "Working...", trigger: "Show backdrop (2s)", timeout: 2000, width: 190 });

    win.typography("h4", "Data display", { gradient: ["#f59e0b", "#ef4444"], width: 600 });
    win.statistic("Revenue", 128900, { prefix: "$", trend: "+12.4%", width: 200 });
    win.statistic("Errors", 42, { color: "error", trend: "-8%", width: 200 });
    win.countdown("Sale ends in", { seconds: 600, width: 220 });
    win.avatarGroup(["Ada Lovelace", "Linus Torvalds", "Grace Hopper", "Alan Turing", "Margaret Hamilton", "Dennis Ritchie"], { max: 4, size: 40 });
    win.chips([{ label: "TypeScript", icon: "check", color: "primary" }, { label: "Bun", avatar: "B", color: "success" }, "Deletable", "Outlined"], { deletable: true, clickable: true, selectable: true, width: 520 });
    win.descriptions("Order #42", [["Customer", "Acme Corp"], ["Status", "Paid"], ["Total", "$1,290"], ["Date", "2026-10-12"], { label: "Notes", value: "Priority shipping", span: 2 }], { bordered: true, width: 560 });
    win.result("success", "Payment complete", "Your receipt was emailed.", { actions: ["View receipt", "Back"], width: 520 });
    win.emptyState("No files yet", "Upload something to get started.", { actions: ["Upload"], width: 360 });
    win.skeleton({ variant: "rect", lines: 1, height: 20, animation: "wave", width: 360 });
    win.skeleton({ lines: 3, animation: "wave", width: 360, height: 70 });
    win.paper("Paper", "Elevation 4 surface.", { elevation: 4, width: 300 });
    win.watermark("CONFIDENTIAL", "Internal report — do not share.", { width: 420, height: 120 });
    win.marquee(["Deploy finished", "3 new issues", "CI green", "Release 2.0 shipped"], { width: 700 });
    win.masonry(["Short", { title: "Card", text: "A longer body of text that wraps over several lines inside the masonry layout." }, "Another", { title: "Tall", text: "x", height: 120 }, "More"], { columns: 3, width: 520, height: 260 });
    win.virtualList(Array.from({ length: 5000 }, (_, i) => ({ primary: `Item ${i + 1}`, secondary: `#${i}` })), { search: true, width: 360, height: 280, onClick: (w, v: any) => w.toast(`Row ${v.index + 1}`, 900) });
    win.bottomNav([{ label: "Home", icon: "home", value: "home" }, { label: "Search", icon: "search", value: "search" }, { label: "Alerts", icon: "bell", value: "bell", badge: 2 }, { label: "Me", icon: "user", value: "me" }], { width: 460, onChange: (w, v) => w.toast(`Nav: ${v}`, 900) });
    win.tour([
        { target: "nav", title: "Drawer", text: "Open the navigation drawer here." },
        { target: "bd", title: "Backdrop", text: "Blocks the UI during long work." },
    ], { id: "tour1", trigger: "Start tour", width: 140 });

    return win;
}

if (import.meta.main) {
    const win = createEnterpriseShowcase();
    console.log("Launching Enterprise Components demo...");
    win.run();
}

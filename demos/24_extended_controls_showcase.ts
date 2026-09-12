#!/usr/bin/env bun
/**
 * Demo 24: Studio Extended Controls Showcase
 *
 * Demonstrates the 13 native modern controls inspired by classic web UI patterns
 * (W3-style versatility) but completely rebuilt from scratch with modern ergonomics,
 * glassmorphism, theme token integration, and smooth micro-animations.
 *
 * Controls featured:
 *   1. HeroDisplay      - Bold hero headline banner with subtitle & glass backdrop
 *   2. Sidebar          - Collapsible / expandable navigation drawer
 *   3. DropdownMenu     - Animated reveal dropdown with outside-click dismiss
 *   4. ListGroup        - High-density list with interactive items and badges
 *   5. ContentCard      - Card layout with header, body content, and action footer
 *   6. CalloutPanel     - Accent-bordered message box (info, success, warning, danger)
 *   7. TooltipBox       - Micro-animated hover tooltip with elevation shadow
 *   8. AnimatedInput    - Cubic-bezier expanding input with glowing accent focus ring
 *   9. CodeSnippet      - Monospace code container with 1-click clipboard copy button
 *  10. CountBadge       - Vibrant circular count/status badge (primary, success, warning, danger)
 *  11. ButtonGroup      - Unified segmented button bar with border radius fusion
 *  12. Slideshow        - Interactive carousel with slide counter, nav arrows, & dots
 *  13. Modal            - Backdrop-blur pop-in dialog window
 *
 * Usage:
 *   bun run demos/24_extended_controls_showcase.ts
 */

import { newSimpleWindow, SimpleWindow } from "../src/simplegui";

export function createExtendedControlsShowcase(): SimpleWindow {
  const win = newSimpleWindow("Studio Extended Controls Showcase", 1200, 1060, {
    appId: "studio_extended_controls",
    theme: "apple_dark",
    autoSaveState: true,
  });

  // 1. Hero Display (Full Width Banner)
  win.addHeroDisplay(
    "hero_banner",
    "Studio Extended Controls",
    "13 modern, native UI components with glassmorphism, micro-animations, and zero external CSS dependencies"
  );

  // 2. Action Bar Toolbar
  win.beginRow();
  win.addAnimatedInput("txt_search", "⚡ Search...", "").width(210);
  win.addButtonGroup("grp_view_mode", [
    { label: "🎛 Grid", value: "grid" },
    { label: "📋 List", value: "list" },
    { label: "📊 Metrics", value: "metrics" }
  ]).width(180);
  win.addCountBadge("badge_updates", "Alerts", 9, "danger").width(95);
  win.addCountBadge("badge_online", "Nodes", 42, "success").width(95);
  win.addDropdownMenu("dd_quick_actions", "⚙️ Actions ▾", [
    { label: "🚀 Deploy Pipeline", value: "deploy" },
    { label: "🔄 Refresh Cache", value: "refresh" },
    { label: "📦 Export Manifest", value: "export" },
    { label: "🧹 Clean Artifacts", value: "clean" }
  ]).width(140);
  win.addButton("btn_open_modal", "🪟 Open Modal", () => {
    win.openModal("modal_settings");
  }, {
    onclick: "if(window.openModal)window.openModal('modal_settings');"
  }).width(130);
  win.addThemeSelector("🎨 Theme", false, true).width(200);
  win.endRow();

  // 3. Card: Navigation & Badged Lists
  win.beginCard("Navigation & Badged Lists", "Interactive drawer navigation and high-density grouped notification items");
  win.beginRow();
  win.addSidebar("nav_sidebar", "Navigation Hub", [
    { label: "🏠 Overview", icon: "📊", href: "#overview", active: true },
    { label: "⚡ Live Telemetry", icon: "📈", href: "#telemetry" },
    { label: "🗄 Database Studio", icon: "💾", href: "#database" },
    { label: "🔐 Access & Security", icon: "🛡️", href: "#security" },
    { label: "⚙️ Preferences", icon: "🔧", href: "#settings" },
    { label: "📖 Documentation", icon: "📚", href: "#docs" }
  ]).width(340).height(260);

  win.addListGroup("lst_activity", [
    { title: "Server cluster healthy", subtext: "All 12 nodes responding in <2ms", badge: "OK", icon: "🟢" },
    { title: "Database replication synced", subtext: "PostgreSQL WAL sync at 100%", badge: "100%", icon: "🗄️" },
    { title: "WebSocket connections", subtext: "1,248 active client sessions", badge: "Live", icon: "⚡" },
    { title: "Memory allocation quota", subtext: "342 MB / 2 GB used", badge: "17%", icon: "💾" },
    { title: "TLS Security Certificate", subtext: "Valid until September 2027", badge: "Valid", icon: "🛡️" }
  ]).width(770).height(260);
  win.endRow();
  win.endCard();

  // 4. Card: Status Callout Panels & Content Cards
  win.beginCard("Callout Panels & Content Cards", "Accent-bordered status panels and content presentation cards");
  win.beginRow();
  win.addCalloutPanel(
    "callout_info",
    "Zero CSS Dependencies",
    "All components use native Bun RAD Studio CSS variables (--bg, --fg, --accent, --card-bg) for perfect theme harmony.",
    "info"
  ).width(550);

  win.addCalloutPanel(
    "callout_success",
    "Optimized Performance",
    "Pure CSS transitions and hardware-accelerated transforms ensure 60fps animations with instant responsiveness.",
    "success"
  ).width(550);
  win.endRow();

  win.beginRow();
  win.addContentCard(
    "card_project_a",
    "High-Performance Runtime",
    "Bun RAD Studio combines native desktop rendering with WebKit webviews, offering sub-millisecond IPC roundtrips and zero-overhead UI state management.",
    "Engine: Bun v1.4+ • Architecture: ARM64/x64"
  ).width(550);

  win.addContentCard(
    "card_project_b",
    "State Persistence & Sync",
    "Every control seamlessly binds to reactive state with automatic disk persistence, window position caching, and hot theme toggling.",
    "Persistence: SQLite + JSON WAL"
  ).width(550);
  win.endRow();

  // Code Snippet with 1-Click Clipboard Copy
  win.addCodeSnippet(
    "snippet_quickstart",
    `// Modern Bun RAD Studio - Extended Controls
import { newSimpleWindow } from "./src/simplegui";

const win = newSimpleWindow("App", 900, 600);
win.addHeroDisplay("hero", "Hello Studio", "Modern desktop widgets");
win.addAnimatedInput("search", "Type here...");
win.addCodeSnippet("code", "console.log('Zero config!');");
win.addButtonGroup("modes", [{ label: "Grid" }, { label: "List" }]);
win.show();`,
    "typescript"
  ).width(1110).height(165);
  win.endCard();

  // 5. Card: Media Slideshow & Contextual Tooltips
  win.beginCard("Media Slideshow & Contextual Tooltips", "Multi-slide presentation and hover documentation bubbles");
  win.beginRow();
  win.addSlideshow("demo_slides", [
    {
      title: "1. Visual Canvas Drag-and-Drop",
      description: "Design desktop interfaces visually with the integrated RAD Studio IDE frontend.",
      image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200' viewBox='0 0 600 200'><rect width='100%' height='100%' fill='%2318181b'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23a1a1aa' font-size='20' font-family='sans-serif'>Canvas Drag &amp; Drop Editor</text></svg>"
    },
    {
      title: "2. Zero External CSS Required",
      description: "Everything is self-contained and styled using native design tokens and CSS variables.",
      image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200' viewBox='0 0 600 200'><rect width='100%' height='100%' fill='%230f172a'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2338bdf8' font-size='20' font-family='sans-serif'>Built-in Native CSS System</text></svg>"
    },
    {
      title: "3. Full Parity & Backward Compatibility",
      description: "Supports both modern camelCase / snake_case names as well as legacy w3_* aliases.",
      image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200' viewBox='0 0 600 200'><rect width='100%' height='100%' fill='%23064e3b'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2334d399' font-size='20' font-family='sans-serif'>Full Backward Compatibility</text></svg>"
    }
  ]).width(550).height(200);

  win.addTooltipBox(
    "tip_hover_1",
    "🔍 Hover for Performance Tip",
    "Micro-animations use transform and opacity exclusively to avoid triggering browser layout repaints."
  ).width(270);

  win.addTooltipBox(
    "tip_hover_2",
    "🎨 Hover for Theming Info",
    "All extended controls adapt automatically when switching between apple_dark, dracula, nord, and codefreelance themes."
  ).width(270);
  win.endRow();
  win.endCard();

  // 6. Pop-in Modal Dialog (Hidden by default, triggered via button)
  win.addModal(
    "modal_settings",
    "Studio Configuration Settings",
    "This modal dialog was built entirely with native Bun RAD Studio components.\n\nKey features:\n• Backdrop blur & dim overlay\n• Smooth pop-in animation (@keyframes radModalPop)\n• Accessible header close (&times;) and Esc key dismissal\n• Confirm and Cancel action callbacks",
    false
  );

  // Wire interactive events
  win.on("btn_open_modal", "click", () => {
    win.openModal("modal_settings");
  });

  win.on("nav_sidebar", "select", (data) => {
    console.log("⚡ Sidebar item selected:", data);
  });

  win.on("lst_activity", "select", (data) => {
    console.log("📋 List group item selected:", data);
  });

  win.on("dd_quick_actions", "change", (data) => {
    console.log("⚙️ Dropdown action selected:", data);
  });

  win.on("grp_view_mode", "change", (data) => {
    console.log("🎛 View mode changed:", data);
  });

  win.on("modal_settings", "confirm", () => {
    console.log("✓ Modal confirmed!");
  });

  return win;
}

// Self-executing CLI runner
if (import.meta.main) {
  const win = createExtendedControlsShowcase();
  console.log("✨ Studio Extended Controls Showcase initialized.");
  console.log("Controls loaded: HeroDisplay, Sidebar, DropdownMenu, ListGroup, ContentCard, CalloutPanel, TooltipBox, AnimatedInput, CodeSnippet, CountBadge, ButtonGroup, Slideshow, Modal.");
  win.show();
}

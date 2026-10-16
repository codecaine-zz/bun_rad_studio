import type { Chapter } from "./fm_tutorial_types";

/** The SimpleGUI visual designer, from an empty form to exported code, then the same ideas in plain TypeScript. */
const pick = (id: string, value: string) => `(() => { const s = document.getElementById(${JSON.stringify(id)}); if (s) { s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`;
const fill = async (d: any, id: string, text: string) => {
  await d.click(`#${id}`, { pause: 500 });
  await d.eval(`document.getElementById(${JSON.stringify(id)}).select()`);
  await d.type(text, 90);
  await d.key("Tab", "Tab");
};

/** Numbers the controls on the canvas (1, 2, 3 ...) so a step can click "control 2" whatever its caption is. */
const tag = (d: any) => d.eval(`[...document.querySelectorAll('#formCanvas .designer-control')].forEach((e, i) => { e.dataset.n = String(i + 1); })`);
const control = async (d: any, n: number, pause = 900) => { await tag(d); await d.click(`#formCanvas .designer-control[data-n='${n}']`, { pause }); };

export const designerChapters: Chapter[] = [
  {
    id: "00_intro", chapter: "WELCOME", title: "Welcome", kind: "card",
    card: { kicker: "Visual programming with SimpleGUI", title: "The Bun RAD Studio Designer", lines: ["Drag. Click. Preview.", "Real TypeScript code at the end", "Nothing to install but Bun"] },
    steps: [{
      cap: "Visual desktop apps, in TypeScript",
      say: "Welcome. In this tutorial you will build a real desktop app without writing a line of code, using the visual designer in Bun RAD Studio. It works like Delphi or Visual Basic did. You place controls on a form, set their properties, connect events, and the designer writes the code for you, in Bun TypeScript, plain HTML, React, Vue and Python. At the end, you will see the same ideas written by hand with the SimpleGUI A P I. Let us begin.",
    }],
  },

  {
    id: "01_tour", chapter: "THE SCREEN", title: "A tour of the designer", blurb: "Templates, palette, canvas, inspector and toolbar",
    steps: [
      {
        cap: "Three areas: palette, canvas, inspector",
        say: "The designer has three main areas. On the left, form layout templates, and the component palette. In the middle, the canvas, which is your form. On the right, the inspector, where you edit whatever is selected. Along the top is the toolbar. Right now the form is empty.",
        act: async (d) => { await d.hover(".template-chip >> Customer", 1400); await d.hover(".palette-item >> Button", 1400); await d.hover("#formCanvas", 1500); await d.hover("#tabProps", 1500); },
      },
      {
        cap: "The palette has about a hundred controls",
        say: "The palette is grouped. Standard controls, like buttons, labels and inputs. Toggles and options, like checkboxes, switches and sliders. Database controls, like grids and lookups. And many more further down. If you cannot find one, type in the filter box. I will type chart.",
        act: async (d) => { await d.scroll(".palette-item >> Button", 600, 5); await d.click(".search-box", { pause: 500 }); await d.type("chart", 110); await d.wait(1500); await d.eval(`(() => { const i = document.querySelector('.search-box'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); },
      },
      {
        cap: "Rulers, zoom and the status bar",
        say: "The canvas has rulers on the top and left, so you can see exact positions in pixels. The text above the canvas tells you the size of the form, and how many controls it has. And the status bar at the bottom shows the position of your mouse.",
        act: async (d) => { await d.hover("#rulerH", 1500); await d.hover("#canvasStats", 1500); await d.hover("#statusCoords", 1500); },
      },
      {
        cap: "The inspector's six code tabs",
        say: "The inspector has tabs. Properties. The control Tree. Events. And then five tabs that show the code for your form as you build it: Bun TypeScript, H T M L, React, Vue three, and Python. Everything updates live.",
        act: async (d) => { for (const t of ["Tree", "Events", "Bun TS", "HTML", "React", "Vue 3", "Properties"]) await d.click(`.tab-item >> ${t}`, { pause: 1000 }); },
      },
    ],
  },

  {
    id: "02_first_form", chapter: "FIRST FORM", title: "Build a login form by clicking", blurb: "Place controls, name them, and change their text",
    steps: [
      {
        cap: "Click a control to place it",
        say: "To add a control, click it in the palette, and then click the place on the form where you want it. A message at the bottom confirms that placement mode is on. I click Label, and then a spot on the form. Then Input. Then Password. And then Button. The form is filling up, and the control count above the canvas goes up each time.",
        act: async (d) => {
          let i = 0;
          for (const n of ["Label", "Input", "Password", "Button"]) {
            await d.click(`.palette-item >> ${n}`, { pause: 900 });
            await d.click("#formCanvas", { dx: -250, dy: -200 + i * 90, pause: 1100 });
            i++;
          }
          await d.hover("#canvasStats", 1500);
        },
      },
      {
        cap: "Click a control on the form to select it",
        say: "To change a control, click it on the form. It gets a highlight and resize handles, and the inspector shows its properties. This is the label.",
        act: async (d) => { await control(d, 1, 1500); await d.hover("#selectedPropHeader", 1500); },
      },
      {
        cap: "Caption / Text and Control ID",
        say: "Control I D is the name you use in code, for example lbl Title. Caption is the text people see. I will change the caption to Sign in to your account.",
        act: async (d) => { await fill(d, "propId", "lblTitle"); await fill(d, "propText", "Sign in to your account"); await d.wait(900); },
      },
      {
        cap: "Do the same for the other controls",
        say: "I do the same for the others. The input gets the I D txt User, and a hint that says Your email. The password box is called txt Password. And the button gets the caption Sign in.",
        act: async (d) => {
          await control(d, 2, 800); await fill(d, "propId", "txtUser"); await fill(d, "propPlaceholder", "Your email");
          await control(d, 3, 800); await fill(d, "propId", "txtPassword");
          await control(d, 4, 800); await fill(d, "propId", "btnSignIn"); await fill(d, "propText", "Sign in");
        },
      },
      {
        cap: "Title the form itself",
        say: "Click on the form's title bar to select the form itself. The form title is the text in the window's title bar. I will call it Login.",
        act: async (d) => { await d.click("#winTitleHeader", { pause: 1000 }); await fill(d, "propFormTitle", "Login"); await d.hover("#windowFrame", 1500); },
      },
    ],
  },

  {
    id: "03_inspector", chapter: "PROPERTIES", title: "Size, colour, position and style", blurb: "Everything about how a control looks",
    steps: [
      {
        cap: "Start from a template",
        say: "For a quicker start, use a template. I click Auth Login, and a whole login form appears, already laid out. Everything you see is an ordinary control, so you can change any of it.",
        act: async (d) => { await d.click(".template-chip >> Auth Login", { pause: 2200 }); },
      },
      {
        cap: "Select a button; style presets",
        say: "I select the button. Under the toolbar, there are style presets: Primary, Success, Warning, Danger, Violet and Slate. One click gives the button a matching colour. I try Success, then Danger.",
        act: async (d) => { await tag(d); const n = await d.eval(`document.querySelectorAll("#formCanvas .designer-control").length`); await control(d, n, 1200); await d.click("button >> Success", { pause: 1300 }); await d.click("button >> Danger", { pause: 1300 }); await d.click("button >> Primary", { pause: 1300 }); },
      },
      {
        cap: "Position and size, in pixels",
        say: "Further down in the inspector are the exact numbers. X and Y are the position. Width and height are the size. Font size, colours, border radius, border, shadow and opacity are all here. I make the button wider.",
        act: async (d) => { await d.scroll("#controlPropContainer", 500, 5); await fill(d, "propWidth", "300"); await fill(d, "propBorderRadius", "20"); await d.hover("#formCanvas", 1500); },
      },
      {
        cap: "Move and resize with the mouse",
        say: "You can also drag a control with the mouse, or drag a handle on its edge to resize it. Guide lines appear when it lines up with another control. Or select it, and nudge it with the arrow keys.",
        act: async (d) => { await d.key("ArrowDown", "↓"); await d.key("ArrowDown", "↓"); await d.key("ArrowRight", "→"); await d.wait(800); },
      },
      {
        cap: "Undo and redo",
        say: "Made a mistake? Undo and redo are right here at the top, and Control Z and Control Y work too. The designer remembers a long history.",
        act: async (d) => { await d.click("#undoBtn", { pause: 1000 }); await d.click("#undoBtn", { pause: 1000 }); await d.click("#redoBtn", { pause: 1200 }); },
      },
    ],
  },

  {
    id: "04_layout", chapter: "LAYOUT", title: "Align, distribute and snap", blurb: "Tidy forms with one click",
    steps: [
      {
        cap: "A messy dashboard",
        say: "Layout tools keep forms tidy. I load the Dashboard template. Then I choose everything with the Select All button.",
        act: async (d) => { await d.click(".template-chip >> Dashboard", { pause: 2000 }); await d.click("button >> Select All", { pause: 1500 }); },
      },
      {
        cap: "Align left, equal width",
        say: "Align Left lines up the left edges. Equal Width makes everything as wide as the widest control. And Distribute Vertically spreads the controls out, with even gaps between them.",
        act: async (d) => { await d.click("button >> Left", { pause: 1500 }); await d.click("button >> Eq W", { pause: 1500 }); await d.click("button >> Dist V", { pause: 1500 }); },
      },
      {
        cap: "Columns, centring and the grid",
        say: "Two Columns and Three Columns show guides that help you build column layouts. Center H Form centres the selection in the form. And Grid turns on snapping, so everything you move lands on a tidy grid.",
        act: async (d) => { await d.click("button >> 2-Cols", { pause: 1500 }); await d.click("button >> 2-Cols", { pause: 800 }); await d.click("button >> Center H Form", { pause: 1500 }); await d.click("#snapBtn", { pause: 1400 }); },
      },
      {
        cap: "Zoom the canvas",
        say: "Zoom in to place things precisely, zoom out to see a large form, or return to one hundred percent.",
        act: async (d) => { await d.click("button >> In", { pause: 1200 }); await d.click("button >> Out", { pause: 1000 }); await d.click("button >> Out", { pause: 1000 }); await d.click("button >> 100%", { pause: 1000 }); },
      },
    ],
  },

  {
    id: "05_events", chapter: "EVENTS", title: "Make it do something: events", blurb: "Handlers that run when something happens",
    steps: [
      {
        cap: "Select a button; open the Events tab",
        say: "A form is only useful if it reacts. I load the Auth Login template again, select the Sign in button, and open the Events tab. Every control has events: click, change, double click, hover, focus, key presses, and more. Each one has a box where you write what should happen.",
        act: async (d) => { await d.click(".template-chip >> Auth Login", { pause: 1800 }); await tag(d); await control(d, await d.eval(`document.querySelectorAll("#formCanvas .designer-control").length`), 1200); await d.click(".tab-item >> Events", { pause: 1500 }); await d.hover("#evtOnChange", 1500); },
      },
      {
        cap: "Write the On Click handler",
        say: "In the on click box, I replace the starting line with one line of code that shows a message: alert, Welcome back. The box takes ordinary JavaScript. It is what runs in the form's page when the button is clicked.",
        act: async (d) => { await d.click("#evtOnClick", { pause: 700 }); await d.eval(`document.getElementById('evtOnClick').select()`); await d.type("alert('Welcome back!');", 70); await d.key("Tab", "Tab"); await d.wait(1200); },
      },
      {
        cap: "The handler appears in the generated code",
        say: "Now look at the Bun T S tab. The handler is part of the generated code, attached to the button. Every code tab includes it, so what you test in the preview is what you export. And you can add a handler to any control the same way.",
        act: async (d) => { await d.click(".tab-item >> Bun TS", { pause: 1600 }); await d.scroll("#bunTsPreviewText", 500, 5); await d.hover("#bunTsPreviewText", 2200); },
      },
    ],
  },

  {
    id: "06_code", chapter: "GENERATED CODE", title: "The code the designer writes", blurb: "Bun TypeScript, HTML, React, Vue and Python",
    steps: [
      {
        cap: "Bun TypeScript: the SimpleGUI code",
        say: "This is the point. The Bun T S tab shows the real SimpleGUI code for your form. A window, then each control, with its position and size, and your handler. You can copy it, paste it into a file, and run it with bun.",
        act: async (d) => { await d.click(".template-chip >> Auth Login", { pause: 1500 }); await d.click(".tab-item >> Bun TS", { pause: 1500 }); await d.scroll("#bunTsPreviewText", 400, 5); await d.hover("#bunTsPreviewText", 1800); },
      },
      {
        cap: "HTML, React, Vue and Python",
        say: "The same form is also available as plain H T M L, as a React component, as a Vue three component, and as Python code. They update live as you change the form.",
        act: async (d) => { for (const t of ["HTML", "React", "Vue 3", "Python"]) { await d.click(`.tab-item >> ${t}`, { pause: 1000 }); await d.hover(".tab-content.active, #tabHTML", 1400).catch(() => {}); } },
      },
      {
        cap: "Copy buttons",
        say: "Copy buttons put any of them on the clipboard. And the J S O N tab is the form itself, which you can save, share, and import again later.",
        act: async (d) => { await d.click("button >> Copy Bun Code", { pause: 1600 }).catch(() => {}); await d.click(".tab-item >> JSON", { pause: 1600 }); },
      },
    ],
  },

  {
    id: "07_run", chapter: "RUN & THEMES", title: "Run it, and make it beautiful", blurb: "Live preview, themes and visual effects",
    steps: [
      {
        cap: "Run: a live, working preview",
        say: "Press Run, and your form opens in a live preview. The controls are real. You can type in them, click them, and your handlers run. Close preview takes you back to the designer.",
        act: async (d) => { await d.click(".template-chip >> Auth Login", { pause: 1500 }); await d.click("button >> Run", { pause: 2500 }); await d.waitFor("#__preview", 6000); await d.hover("#__preview", 2000); await d.click("button >> Close preview", { pause: 1200 }); },
      },
      {
        cap: "Form Theme: sixty three looks",
        say: "Back in the inspector, click the title bar to select the form. The Form Theme list has sixty three looks, from light and dark to futuristic ones. The full SimpleGUI library has one hundred and thirty three themes, including operating system looks, editor colour schemes and retro computers. I will try a few.",
        act: async (d) => { await d.click("#winTitleHeader", { pause: 1000 }); for (const t of ["Light", "Neo-Tokyo Dark", "Cyberpunk Hologram"]) { await d.eval(pick("propFormTheme", t)); await d.wait(2000); } },
      },
      {
        cap: "Visual effects",
        say: "Themes can also have an effects layer. Full effects add depth, glow and motion. Reduced effects keep it calm. And off turns them off completely, which is kinder to older computers.",
        act: async (d) => { await d.eval(pick("propFormFx", "reduced")); await d.wait(2000); await d.eval(pick("propFormFx", "off")); await d.wait(2000); await d.eval(pick("propFormFx", "full")); await d.wait(2200); },
      },
    ],
  },

  {
    id: "08_tools", chapter: "MORE TOOLS", title: "Templates, audit, shortcuts and the database wizard", blurb: "The rest of the toolbar",
    steps: [
      {
        cap: "Ten ready-made templates",
        say: "There are ten templates: customer, login, dashboard, user profile, data entry, support ticket, A P I tester, media player, settings and checkout. They are a good way to learn how forms are built.",
        act: async (d) => { for (const t of ["Customer", "Data CRUD", "Media Player", "Checkout"]) await d.click(`.template-chip >> ${t}`, { pause: 1500 }); },
      },
      {
        cap: "Audit: find problems",
        say: "Audit checks your form. It finds duplicate names, controls hanging off the edge, missing labels, and other mistakes, and explains each one.",
        act: async (d) => { await d.click("button >> Audit", { pause: 2000 }); await d.waitFor("#diagnosticsModal", 5000).catch(() => {}); await d.hover("#diagnosticsModal", 2500).catch(() => {}); await d.key("Escape", "Esc"); },
      },
      {
        cap: "Keys: every keyboard shortcut",
        say: "Keys opens the list of keyboard shortcuts, for placing, selecting, moving, copying and aligning controls, so you hardly need the mouse.",
        act: async (d) => { await d.click("button >> Keys", { pause: 2000 }); await d.hover("#hotkeysModal", 2800).catch(() => {}); await d.key("Escape", "Esc"); },
      },
      {
        cap: "Database wizard",
        say: "And the D B Wizard builds a data form from a database table, with a grid, a navigator and fields already connected. Databases are covered in their own tutorial.",
        act: async (d) => { await d.click("button >> DB Wizard", { pause: 2200 }); await d.hover(".modal.active, .modal[style*='flex'], .modal", 2400).catch(() => {}); await d.key("Escape", "Esc"); },
      },
    ],
  },

  {
    id: "09_export", chapter: "SAVE & SHARE", title: "Export, import and automatic drafts", blurb: "Take your form out of the designer",
    steps: [
      {
        cap: "Export a project",
        say: "When the form is ready, press Export. The designer writes a complete project into a folder, with the Bun TypeScript file and the other formats, ready to run with bun.",
        act: async (d) => { await d.click(".template-chip >> Settings", { pause: 1800 }); await d.click("button >> Export", { pause: 2800 }); },
      },
      {
        cap: "Import a saved form",
        say: "Import does the opposite. Paste a form's J S O N, and it appears on the canvas, so you can continue where you stopped, or open a form someone shared with you.",
        act: async (d) => { await d.click("button >> Import", { pause: 2000 }); await d.hover("#importModal", 2200).catch(() => {}); await d.key("Escape", "Esc"); },
      },
      {
        cap: "Drafts are saved automatically",
        say: "And you never lose work. The designer saves a draft as you go. If you close it by accident and open it again, a banner offers to restore your form, or to discard it.",
        act: async (d) => { await d.hover("#draftBanner", 1800).catch(() => {}); await d.hover("#statusMsg", 1800); },
      },
    ],
  },

  {
    id: "10_code_card", chapter: "IN CODE", title: "The same ideas, written by hand", kind: "card",
    card: {
      kicker: "examples/hello_simplegui.ts",
      title: "SimpleGUI in 15 lines",
      lines: [
        "const win = newSimpleWindow(\"My First App\", 760, 420, { theme: \"apple_dark\" });",
        "win.addLabel(\"Welcome to SimpleGUI!\").font(24, \"#38bdf8\", \"700\");",
        "win.addInput(\"txtName\", \"\", \"Type your name…\").width(320);",
        "win.addButton(\"Say hello\", (w) => { w.setText(\"lblGreeting\", `Hello!`); });",
        "win.run();",
      ],
    },
    steps: [{
      cap: "A window, controls, a handler",
      say: "Everything the designer produced is plain TypeScript. A window. Controls added one after another, each one chainable. And a handler on the button. You create the window with new simple window, add controls with add label, add input and add button, and run it. The control I Ds are the same ones you typed in the inspector, and you read and write values with get value and set text. There is nothing hidden.",
    }],
  },

  {
    id: "11_hello", chapter: "RUN IT", title: "Running the code", blurb: "One file, one command",
    steps: [
      {
        cap: "bun run examples/hello_simplegui.ts",
        say: "Here is that app, running. In a terminal, it is just bun run, and the file name. I type a name, and press Say hello.",
        act: async (d) => { await d.click("input", { pause: 800 }); await d.type("Alex", 140); await d.click("button >> Say hello", { pause: 2500 }); },
      },
      {
        cap: "Change it and run again",
        say: "The label changed, and a toast message appeared. From here, you can change colours, add controls, switch to any of the one hundred thirty three themes, and use the other windows of the toolbox, from databases to games, all built with the same A P I. The full reference is in the docs folder, and there is a cookbook of working examples.",
        act: async (d) => { await d.click("input", { pause: 400 }); await d.type(" and friends", 100); await d.click("button >> Say hello", { pause: 2500 }); },
      },
    ],
  },

  {
    id: "12_outro", chapter: "THE END", title: "That is the tour", kind: "card",
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["github.com/codecaine-zz/bun_rad_studio", "Docs: docs/SIMPLEGUI_API.md and docs/visual-designer", "Examples: examples/rad_cookbook.ts"] },
    steps: [{
      cap: "Thank you for watching",
      say: "That is the visual designer, from an empty form to running code. Try the templates first, then build your own, and read the generated code to learn how SimpleGUI works. The documentation and the cookbook are in the repository. Thank you for watching, and happy building.",
    }],
  },
];

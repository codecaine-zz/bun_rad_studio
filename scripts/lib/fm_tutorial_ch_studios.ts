import type { Chapter } from "./fm_tutorial_types";
import type { Do } from "../tutorial_file_manager";

/** The Tools tab that is showing (each tool keeps its own pane). */
const PANE = "#power-body .power-pane:not([hidden])";

/** Right-clicks a file in the list and picks a menu item. */
async function rightClick(d: Do, name: string, item: string, pause = 2200) {
  await d.row(name, "rclick", { pause: 1300 });
  await d.menu(item, { pause });
}

/** Opens Convert for the selected files, searches, picks an action, and starts it. */
async function convert(d: Do, search: string, pick: string) {
  await d.click("#tool-tools", { pause: 1300 });
  await d.waitFor(".dialog", 6000);
  await d.click("#cv-search", { pause: 400 });
  await d.type(search, 110);
  await d.wait(900);
  await d.click(`.cv-main >> ${pick}`, { pause: 1600 });
  await d.hover(".dialog", 1400);
  await d.click(".dialog .btn.primary", { pause: 1500 });
}

/** Moves a studio slider by clicking along its track (`dx` pixels right of its middle, or left when negative). */
const nudge = (d: Do, opt: string, dx: number) => d.click(`${PANE} input[data-opt=${opt}]`, { dx, pause: 1100 });

/** Clicks a studio's quick look or recipe button by its text. */
const quick = (d: Do, text: string, pause = 1800) => d.click(`${PANE} .st-preset >> ${text}`, { pause });

/** Holds a button down for a while (Hold to compare), then lets go. */
async function hold(d: Do, selector: string, ms: number) {
  await d.hover(selector, 500);
  await d.eval(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))`);
  await d.wait(ms);
  await d.eval(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))`);
  await d.wait(600);
}

/** Waits for a studio to finish saving (its status line turns green), then lets the viewer read it. */
async function saved(d: Do, look = 2200) {
  await d.waitFor(`${PANE} .pw-status.pw-ok`, 45000).catch(() => {});
  await d.hover(`${PANE} .pw-status`, look).catch(() => {});
}

/** Chooses a saved preset from a studio's "My presets" list, as if picked from the drop-down. */
async function choosePreset(d: Do, id: string, name: string) {
  await d.hover(`#${id}-preset`, 900);
  await d.eval(`(() => { const s = document.querySelector("#${id}-preset"); s.value = ${JSON.stringify(name)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await d.wait(1600);
}

/** Chapters after the toolbox: Home & Split views, Clock/Calendar/Timestamps, CLI utilities, one-click conversions, Image and Media Studios, presets, Recent, Media Deck, Paint Studio & Arcade Games. */
export const studios: Chapter[] = [
  {
    id: "21a_home_split_clock_cli", chapter: "HOME, SPLIT, CLOCK & CLI", title: "Home view, Split view, Calendar & World Clocks, and CLI Utilities", blurb: "Start page tiles, tools beside your files, interactive calendar and epoch converter, and built-in command-line utilities",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "Home view & Split view",
        say: "Before we look at the media studios, let's check two more views in the top bar. Home is a friendly start page with tiles for your recent folders, favorite databases, and every tool in the suite. And Split puts any tool right beside your file list, so you can search, hash, or inspect while you browse.",
        act: async (d) => {
          await d.click("#view-home", { pause: 1800 });
          await d.hover("#home", 1800).catch(() => {});
          await d.click("#view-split", { pause: 1800 });
          await d.hover("#power-panel", 1400);
          await d.click("#view-files", { pause: 1000 });
        },
      },
      {
        cap: "Clock, Calendar, World Clocks & Unix Epoch Converter",
        say: "Click the clock in the status bar, or right-click the top clock, for date and timestamp tools. You can copy ISO or filename-safe timestamps, create a folder or Markdown note named with today's date, or open the interactive Calendar, World Clocks, and Unix Epoch Converter.",
        act: async (d) => {
          await d.click("#status-clock", { pause: 1100 });
          await d.hover(".menu", 1000);
          await d.menu("Calendar, World Clocks & Timestamps", { pause: 1500 });
          await d.hover(".cal-table", 1100).catch(() => {});
          await d.hover("#cal-world-grid", 1100).catch(() => {});
          await d.click("#cal-epoch-result button", { pause: 1000 }).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(500);
        },
      },
      {
        cap: "Tool filter & Built-in RAD Studio CLI Utilities",
        say: "In the Tools view, the filter box at the top finds any tool as you type, and Compact or Expand gives the active tool the whole window. Let's open C L I Utilities. Every Bun R A D Studio command-line utility is ready to run in the built-in terminal with a single click.",
        act: async (d) => {
          await d.click("#view-tools", { pause: 900 });
          await d.click("#power-filter", { pause: 400 });
          await d.type("cli", 90);
          await d.wait(800);
          await d.click("#power-tab-cliutils", { pause: 1400 });
          await d.click(".cliutil-card button >> 📋 Copy", { pause: 1200 }).catch(() => {});
          await d.click("#power-filter-clear", { pause: 700 }).catch(() => {});
          await d.click("#view-files", { pause: 800 });
        },
      },
    ],
  },

  {
    id: "21b_convert_more", chapter: "ONE-CLICK EDITS", title: "One-click picture, video and sound edits", blurb: "Black and white, round pictures, sepia, shapes and more",
    path: "<HOME>/Media",
    steps: [
      {
        cap: "Media: a picture, a song and a video",
        say: "Convert has a lot more than file formats. There are dozens of one click edits for pictures, videos and sound. Here is a folder with a photo, a song and a short video, so let me show you a few.",
        act: async (d) => { await d.hover("#list", 2200); },
      },
      {
        cap: "A round picture, for a profile photo",
        say: "First, a round picture, perfect for a profile photo. I select the sunset, press Convert, and type round. Make a round picture. I press start, and a moment later, there is a new round copy next to the original.",
        act: async (d) => {
          await d.row("sunset.jpg", "click", { pause: 700 });
          await convert(d, "round", "round picture");
          await d.wait(3500);
          await d.hover("#list", 1200);
        },
      },
      {
        cap: "Black and white video, in one click",
        say: "It works for video just the same. I select the city clip, press Convert, and type black and white. Black and white video. Start. The task panel shows the progress, and the new clip appears when it is done. The original is never touched.",
        act: async (d) => {
          await d.row("city-clip.mp4", "click", { pause: 700 });
          await convert(d, "black and white", "Black and white video");
          await d.waitFor("#tasks .task", 6000).catch(() => {});
          await d.wait(5000);
        },
      },
      {
        cap: "Search to find any edit",
        say: "There are many more. Old photo, in sepia. Crop to a shape, like square or sixteen by nine. Turn a video into a G I F. Speed up a clip, or make its sound louder. If you are not sure of the name, just type what you want to do, and the list finds it.",
        act: async (d) => {
          await d.row("sunset.jpg", "click", { pause: 600 });
          await d.click("#tool-tools", { pause: 1200 });
          await d.waitFor(".dialog", 6000);
          await d.click("#cv-search", { pause: 400 });
          await d.type("sepia", 120);
          await d.wait(1600);
          await d.eval(`(() => { const s = document.querySelector("#cv-search"); s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); s.focus(); })()`);
          await d.wait(500);
          await d.type("shape", 120);
          await d.wait(3000);
          await d.eval(`(() => { const s = document.querySelector("#cv-search"); s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); s.focus(); })()`);
          await d.type("gif", 140);
          await d.wait(3500);
          await d.key("Escape", "Esc");
        },
      },
    ],
  },

  {
    id: "21c_image_studio", chapter: "IMAGE STUDIO", title: "Image Studio: edit a picture with sliders", blurb: "See every change straight away, then save a copy",
    path: "<HOME>/Media",
    steps: [
      {
        cap: "Right-click a picture: Edit in Image Studio",
        say: "When you want more control, there is the Image Studio. I right click the sunset, and choose Edit in Image Studio. The picture opens on the left, with all the controls on the right. Every change shows up straight away.",
        act: async (d) => { await rightClick(d, "sunset.jpg", "Edit in Image Studio", 2600); },
      },
      {
        cap: "Sliders: light, color, warmth",
        say: "Let me make it brighter, and a little warmer. I just click along the sliders. Brightness up. Warmth up. You can see the picture change as I go. If you go too far, double click a slider, and it jumps back to normal.",
        act: async (d) => {
          await nudge(d, "brightness", 60);
          await nudge(d, "warmth", 90);
          await nudge(d, "saturation", 60);
          await d.hover(`${PANE} .st-preview`, 1600).catch(() => {});
        },
      },
      {
        cap: "Hold to compare with the original",
        say: "To see what I have changed, I hold down Hold to compare. While I hold it, I see the original. When I let go, my edit comes back.",
        act: async (d) => { await hold(d, "#ist-compare", 2200); },
      },
      {
        cap: "Quick looks: one click styles",
        say: "Along the top are quick looks. Ready made styles, in one click. Vintage. Vivid. Black and white. And Profile picture, which cuts a circle and makes it the right size. Reset all puts everything back.",
        act: async (d) => {
          await quick(d, "Vintage");
          await quick(d, "Vivid");
          await quick(d, "Black and white");
          await quick(d, "Profile picture", 2200);
        },
      },
      {
        cap: "Save a copy: the original never changes",
        say: "When I am happy, I press Save a copy. A new picture is saved next to the original. Here it is a P N G, because a round picture needs a see through background. The original is never changed, so you can always start again.",
        act: async (d) => {
          await d.click("#ist-save", { pause: 1200 });
          await saved(d, 2000);
          await d.click("#view-files", { pause: 1600 });
          await d.hover("#list", 1500);
        },
      },
    ],
  },

  {
    id: "21d_media_studio", chapter: "MEDIA STUDIO", title: "Media Studio: trim, speed, sound and video", blurb: "Songs, voice recordings and videos, without a video editor",
    path: "<HOME>/Media",
    steps: [
      {
        cap: "Right-click a video: Edit in Media Studio",
        say: "The Media Studio does the same for songs, voice recordings and videos. I right click the city clip, and choose Edit in Media Studio. The player is on the left, and the controls are on the right.",
        act: async (d) => { await rightClick(d, "city-clip.mp4", "Edit in Media Studio", 2800); },
      },
      {
        cap: "Trim: keep just the part you want",
        say: "To keep only part of it, I type a start time and an end time. From two seconds, to eight seconds. You can also play the clip, and press Start here, and End here, at the right moments. Play the part plays just that piece, so I can check it.",
        act: async (d) => {
          await d.click("#mst-start", { pause: 400 });
          await d.type("0:02", 140);
          await d.click("#mst-end", { pause: 400 });
          await d.type("0:08", 140);
          await d.hover("#mst-set-start", 900);
          await d.hover("#mst-set-end", 900);
          await d.click("#mst-play-part", { pause: 3500 });
        },
      },
      {
        cap: "Speed, volume, fades, picture",
        say: "Then the rest is just like the Image Studio. Quick recipes along the top, like Vertical for shorts, which makes a tall clip for phones. Then fine tune it with the sliders. Speed. Volume. Fade in, and fade out. For a video, the picture too: brightness, color, and the shape.",
        act: async (d) => {
          await quick(d, "Vertical for shorts", 2200);
          await nudge(d, "speed", -120);
          await nudge(d, "fadeIn", -276);
          await nudge(d, "fadeOut", -266);
          await d.hover(`${PANE} .mst-player`, 1500).catch(() => {});
        },
      },
      {
        cap: "Save a copy, with progress in the task panel",
        say: "I press Save a copy. The new clip is made in the background, and saved next to the original.",
        act: async (d) => { await d.click("#mst-save", { pause: 1500 }); await saved(d, 1500); },
      },
      {
        cap: "Songs: Podcast voice, Ringtone, MP3",
        say: "For sound files, there are recipes too. Podcast voice cleans up a recording, removes background noise, and evens out the loudness. Ringtone makes a thirty second clip with gentle fades. And Sound only takes the sound out of a video as an M P 3.",
        act: async (d) => {
          await d.click("#view-files", { pause: 1300 });
          await rightClick(d, "morning-song.mp3", "Edit in Media Studio", 2200);
          await quick(d, "Podcast voice");
          await quick(d, "Ringtone", 2200);
        },
      },
    ],
  },

  {
    id: "21e_presets_bulk", chapter: "PRESETS + BULK", title: "Save a preset, then edit many files at once", blurb: "The same look for a whole folder of photos, in one go",
    path: "<HOME>/Documents/Trip",
    steps: [
      {
        cap: "Make a look you like",
        say: "Here is my favorite time saver. Say I have a folder of holiday photos, and I want them all to look the same. I open the first one in the Image Studio, and make a look I like. Square, for posting. A little warmer. And a little more contrast.",
        act: async (d) => {
          await rightClick(d, "IMG_0001", "Edit in Image Studio", 2200);
          await quick(d, "Square post", 1600);
          await nudge(d, "warmth", 90);
          await nudge(d, "contrast", 50);
          await d.hover(`${PANE} .st-preview`, 1500).catch(() => {});
        },
      },
      {
        cap: "Save as preset: give it a name",
        say: "Now I press Save as preset, and give it a name. Holiday look. Every slider and switch is remembered, so I can use it again any time, even next week.",
        act: async (d) => {
          await d.click("#ist-preset-save", { pause: 1200 });
          await d.type("Holiday look", 110);
          await d.dialog("Save", { pause: 1800 });
        },
      },
      {
        cap: "Select all the photos",
        say: "Next, I go back to the files, and select all eight photos. Click the first, hold Shift, and click the last. Then I right click, and choose Edit eight pictures in Image Studio.",
        act: async (d) => {
          await d.click("#view-files", { pause: 1300 });
          await d.row("IMG_0001", "click", { pause: 600 });
          await d.row("IMG_0008", "click", { extend: "shift", pause: 900 });
          await d.row("IMG_0008", "rclick", { pause: 1300 });
          await d.menu("Edit 8 pictures in Image Studio", { pause: 2200 });
        },
      },
      {
        cap: "Choose the preset, apply to all",
        say: "At the bottom, the studio shows that eight pictures are selected. I choose my preset, Holiday look. And I press Apply to all eight selected pictures. It is one job, so you can watch it in the task panel.",
        act: async (d) => {
          await choosePreset(d, "ist", "Holiday look");
          await d.hover("#ist-bulk", 1400);
          await d.click("#ist-bulk", { pause: 1500 });
          await saved(d, 1800);
        },
      },
      {
        cap: "Eight new photos, originals untouched",
        say: "Done. Every photo has a new edited copy, all with the same look, and the originals are still there, unchanged. The Media Studio has presets and bulk editing too, for a whole folder of songs or videos.",
        act: async (d) => { await d.click("#view-files", { pause: 1500 }); await d.scroll("#list", 500, 6).catch(() => {}); await d.hover("#list", 2200); },
      },
    ],
  },

  {
    id: "21f_recent", chapter: "RECENT", title: "Recent files and media open right here", blurb: "Back to what you were working on, and pictures, songs and videos open in the File Manager by default",
    path: "<HOME>/Media",
    before: async (d) => {
      const home = d.world.home;
      await d.eval(`(async () => { const m = await import("/ui/api.js"); const st = await import("/ui/state.js"); for (const p of ${JSON.stringify(["Media/morning-song.mp3", "Media/city-clip.mp4", "Media/sunset.jpg"].map((r) => `${home}/${r}`))}) { const r = await m.call("recent/add", { path: p }); st.state.settings = r.settings; } st.emit("settings"); })()`);
      await d.wait(800);
    },
    steps: [
      {
        cap: "Places panel: Recent",
        say: "Last, the Recent list. In the Places panel on the left, under Recent, are the files you opened lately. Click one, and it opens right here, inside the File Manager.",
        act: async (d) => { await d.hover("#sidebar .side-section >> Recent", 1600); await d.click("#sidebar .side-item >> sunset.jpg", { pause: 2200 }); },
      },
      {
        cap: "Quick Look: then Edit in Studio",
        say: "A picture opens in Quick Look, nice and big. From here, Edit in Studio takes it straight to the Image Studio. Escape closes it again.",
        act: async (d) => { await d.hover(".ql-image", 2400).catch(() => {}); await d.hover("#ql-studio", 3500).catch(() => {}); await d.key("Escape", "Esc"); await d.wait(1200); },
      },
      {
        cap: "Songs and videos play in place",
        say: "A song or a video plays right in Quick Look, with its own controls. Play, the volume, mute, and full size. Press Escape when you are done, and you are back exactly where you were.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> city-clip.mp4", { pause: 1500 });
          await d.click(".mp .mp-play", { pause: 3000 }).catch(() => {});
          await d.hover(".mp", 4500).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(1200);
        },
      },
      {
        cap: "Enter or double-click: they open right here",
        say: "It is the same in the file list. Press Enter, or double-click, on a picture, a song or a video, and it opens here, in the File Manager's own viewer and player. Press Enter inside the viewer when you do want another program, or right-click and choose Open with.",
        act: async (d) => {
          await d.click("#list .row[data-key$='sunset.jpg']", { pause: 1200 });
          await d.key("Enter", "Enter");
          await d.wait(2600);
          await d.key("Escape", "Esc");
          await d.wait(900);
          await d.click("#list .row[data-key$='morning-song.mp3']", { pause: 1000 });
          await d.key("Enter", "Enter");
          await d.wait(3200);
          await d.key("Escape", "Esc");
          await d.wait(1000);
        },
      },
      {
        cap: "Settings: open media with another program",
        say: "Prefer your own photo viewer or music player? In Settings, Open pictures, sound and video with lets you choose the program your computer uses instead. It stays that way until you change it back.",
        act: async (d) => {
          await d.key("Meta+,", "⌘+,");
          await d.wait(900);
          if (!(await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`))) await d.eval(`import('/ui/extras.js').then((m) => m.showSettings())`);
          await d.wait(1000);
          const sel = ".dialog select[aria-label='Open pictures, sound and video with']";
          await d.eval(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`);
          await d.hover(sel, 3200).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(900);
        },
      },
    ],
  },

  {
    id: "21g_player_paint_games", chapter: "MEDIA DECK, PAINT & GAMES", title: "Media Deck, Paint Studio & 24 Built-in Arcade Games", blurb: "10-band equalizer, 108 visualizers, pixel and vector Paint Studio, and 24 arcade, puzzle and card games",
    path: "<HOME>/Media",
    steps: [
      {
        cap: "Media Deck: 10-band equalizer, 108 visualizers & playlists",
        say: "In the Tools panel, Media Deck is a full modular rack player for music and video. It has a digital L E D clock, a hundred and eight real-time spectrum, oscilloscope, and multi-layer visualizers, a ten-band graphic equalizer with preamp and spline curve, M 3 U playlists, synced karaoke lyrics, and sixteen studio skins.",
        act: async (d) => {
          await d.click("#view-tools", { pause: 900 });
          await d.click("#power-tab-player", { pause: 1300 });
          await d.click(".wa-pill-btn >> 📂 Folder", { pause: 1600 }).catch(() => {});
          await d.hover(".wa-stage", 1200).catch(() => {});
          await d.hover(".wa-eq-rack", 1200).catch(() => {});
          await d.hover(".wa-skin-select", 1000).catch(() => {});
        },
      },
      {
        cap: "Paint Studio & 24 Built-in Arcade Games",
        say: "Next to it, Paint Studio gives you a full canvas with brushes, shapes, layers, and filters right inside the File Manager. And when you want a break, the Games tab packs twenty-four built-in arcade, puzzle, card, and word games, from Tetris and Pac-Man to Poker, Blackjack, and Balatro Deluxe, playable here or in their own window.",
        act: async (d) => {
          await d.click("#power-tab-paint", { pause: 1800 });
          await d.hover("#power-body", 1400);
          await d.click("#power-tab-games", { pause: 1400 });
          await d.click("#games-view-play", { pause: 2000 }).catch(() => {});
          await d.click("#games-close-game", { pause: 900 }).catch(() => {});
          await d.click("#view-files", { pause: 800 });
        },
      },
    ],
  },
];


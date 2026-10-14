// The About window: what this app is and where to find the project on GitHub.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";

/** Used until the server answers (and if it can't); the server owns the real list and opens the links. */
const FALLBACK_LINKS = [
  { id: "project", label: "Project on GitHub", hint: "The source code, releases and documentation of Bun RAD Studio.", url: "https://github.com/codecaine-zz/bun_rad_studio" },
  { id: "tutorials", label: "Markdown tutorials", hint: "Lessons and examples for learning Markdown, the plain-text writing format used for README files and notes. Opens codefreelance.net.", url: "https://codefreelance.net/apps/markdown_tutorials/" },
  { id: "issues", label: "Report a problem or suggest an idea", hint: "Opens the issue tracker on GitHub (you need a free GitHub account to post).", url: "https://github.com/codecaine-zz/bun_rad_studio/issues" },
  { id: "author", label: "codecaine-zz on GitHub", hint: "The author's GitHub profile, with the other projects.", url: "https://github.com/codecaine-zz" },
];

/** Opens one of the About links in the web browser by its id (the addresses live on the server). */
export async function openAboutLink(id) {
  const links = await loadLinks();
  const link = links.find((l) => l.id === id);
  if (link) await openLink(link);
}

async function openLink(link) {
  try {
    await call("about/open", { id: link.id });
    toast(`Opened ${link.label} in your web browser.`);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : `Couldn't open the link. The address is ${link.url}`, { kind: "error" });
  }
}

async function loadLinks() {
  try {
    const { links } = await call("about/info");
    return Array.isArray(links) && links.length > 0 ? links : FALLBACK_LINKS;
  } catch {
    return FALLBACK_LINKS;
  }
}

const DONATE_URL = "https://paypal.me/codecaine81";

/** A window with a QR code for the PayPal donation page, a button that opens it, and a button that copies the link. */
export async function showDonate() {
  const copy = h("button", { type: "button", class: "btn", title: `Copy the link ${DONATE_URL} so you can paste it somewhere`, onclick: async () => {
    try {
      await call("copytext", { text: DONATE_URL });
      toast("The donation link was copied.", { kind: "success" });
    } catch {
      toast(`Couldn't copy. The link is ${DONATE_URL}`, { kind: "error" });
    }
  } }, "Copy link");
  openDialog({
    title: "Support the project",
    wide: true,
    body: [
      h("p", { class: "lead" }, "Bun RAD Studio is free. If it helps you, you can say thanks with a small PayPal donation. It is entirely optional."),
      h("div", { class: "donate-box" },
        h("img", { class: "donate-qr", src: "/ui/donate-paypal-qr.svg", alt: "QR code for the PayPal donation page paypal.me/codecaine81", title: "Scan this with your phone's camera or the PayPal app" }),
        h("div", { class: "donate-side" },
          h("p", {}, "Scan the code with your phone's camera or the PayPal app, or use the buttons."),
          h("p", { class: "about-url" }, DONATE_URL.replace(/^https:\/\//, "")),
          h("div", { class: "donate-actions" }, h("button", { type: "button", class: "btn primary", title: "Open the PayPal donation page in your web browser", onclick: () => openAboutLink("donate") }, "Open PayPal ↗"), copy))),
      h("p", { class: "hint" }, "Nothing is sent from this app. The page opens in your web browser."),
    ],
    buttons: [{ label: "Close", primary: true, value: true }],
  });
}

export async function showAbout() {
  const links = await loadLinks();
  const rows = links.map((link) =>
    h("li", { class: "about-link" },
      h("button", { type: "button", class: "btn", title: `${link.hint} (${link.url})`, onclick: () => openLink(link) }, `${link.label} ↗`),
      h("span", { class: "about-url" }, link.url.replace(/^https:\/\//, "")),
    ),
  );
  const about = openDialog({
    title: "About File Manager",
    wide: true,
    body: [
      h("p", { class: "lead" }, "File Manager is part of Bun RAD Studio: a free, open-source set of desktop apps and tools made with Bun."),
      h("ul", { class: "about-links" }, rows),
      h("p", { class: "hint" }, "Links open in your web browser. Nothing is sent from this app when you open them."),
    ],
    buttons: [{ label: "Donate with a QR code…", value: "donate" }, { label: "Close", primary: true, value: true }],
  });
  about.result.then((answer) => { if (answer === "donate") showDonate(); });
}

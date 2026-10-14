// "More info": what a picture reveals about the person who took it, and the ways to share it without that.
import { ApiError, call } from "./api.js";
import { openDialog, confirmBox } from "./dialogs.js";
import { h } from "./dom.js";
import { copyValue } from "./fileinfoRender.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { emit } from "./state.js";

const LOCATION_WARNING = "This photo contains the location where it was taken.";

/** The rows of the privacy report, for the report file and for searching. */
export function privacyGroup(items) {
  return {
    id: "privacy",
    title: "What this file reveals",
    hint: "Hidden details inside the file that could say who you are, where you were or when. Found items are worth removing before you share the file.",
    rows: items.map((p) => ({ label: p.label, value: p.present ? `Found${p.detail ? `: ${p.detail}` : ""}` : "Not found", flag: p.present ? "warn" : "good" })),
  };
}

/** Asks, then makes a clean copy with the built-in cleaner. Resolves the answer, or null when cancelled. */
async function cleanCopy(path) {
  const keep = h("input", { type: "checkbox", checked: true });
  const d = openDialog({
    title: "Make a copy without private details?",
    body: [
      h("p", {}, "A new picture is made next to this one, with the hidden notes taken out: where it was taken, the camera, dates, names, comments and the small preview picture. The picture itself is copied exactly, with no loss of quality."),
      h("p", { class: "hint" }, "The original is not changed and nothing is overwritten."),
      h("label", { class: "check", title: "A tiny note about which way up the picture is. Without it some pictures show sideways." }, keep, h("span", {}, "Keep the note about which way up the picture is")),
    ],
    buttons: [{ label: "Cancel", value: false }, { label: "Make the copy", value: true, primary: true }],
  });
  if ((await d.result) !== true) return null;
  return await call("info/strip", { path, keepOrientation: keep.checked });
}

async function openMap(lat, lon) {
  const ok = await confirmBox({
    title: "Open the map?",
    message: `This sends the location (${lat}, ${lon}) to openstreetmap.org, a website run by someone else, and opens it in your web browser. Only continue if you are happy for that place to be shared with them.`,
    confirmLabel: "Open the map",
    cancelLabel: "Don't open",
  });
  if (!ok) return;
  try {
    await call("info/openmap", { lat, lon, confirm: true });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't open the map.", { kind: "error" });
  }
}

/**
 * @param {string} path
 * @param {{ privacy: Array<{ id: string, label: string, present: boolean, detail: string }>, gps: null | { lat: number, lon: number, latText: string, lonText: string }, canStrip: boolean, helper: { exiftool: boolean } }} data
 */
export function privacySection(path, data) {
  const found = data.privacy.filter((p) => p.present).length;
  const list = h("ul", { class: "fi-privacy" }, data.privacy.map((p) => h("li", { class: p.present ? "fi-warn" : "fi-good", dataset: { item: p.id } },
    h("span", { class: "fi-flag", "aria-hidden": "true" }, p.present ? "⚠ " : "✔ "),
    h("strong", {}, p.label), ": ", p.present ? "Found" : "Not found",
    p.present && p.detail ? h("span", { class: "fi-detail" }, ` (${p.detail})`) : null)));
  const box = h("div", { class: "fi-privacy-box" });
  box.append(h("p", { class: found ? "fi-warn" : "fi-good", role: "status" }, found
    ? [h("span", { "aria-hidden": "true" }, "⚠ "), `${found} kind${found === 1 ? "" : "s"} of private detail found.`]
    : [h("span", { "aria-hidden": "true" }, "✔ "), "No private details were found."]));

  if (data.gps) {
    const { lat, lon } = data.gps;
    box.append(h("div", { class: "fi-gps", role: "note" },
      h("p", { class: "fi-gps-title" }, h("span", { "aria-hidden": "true" }, "📍 "), h("strong", {}, "Has location"), ": ", LOCATION_WARNING),
      h("p", {}, `${data.gps.latText}, ${data.gps.lonText}  (${lat}, ${lon})`),
      h("div", { class: "fi-gps-actions" },
        h("button", { type: "button", class: "btn fi-copy-gps", title: "Copy the coordinates as two numbers: latitude, longitude", onclick: () => copyValue(`${lat}, ${lon}`, "The coordinates") }, "Copy coordinates"),
        h("button", { type: "button", class: "btn fi-open-map", title: "Show this place on a map in your web browser. Nothing is sent until you confirm.", onclick: () => openMap(lat, lon) }, "Open map…"))));
  }
  box.append(list);

  const actions = h("div", { class: "fi-privacy-actions" });
  if (data.canStrip) {
    actions.append(h("button", { type: "button", class: "btn primary fi-strip", title: "Make a copy of this picture without location, camera, dates, names and comments. The original stays as it is.", onclick: async () => {
      try {
        const r = await cleanCopy(path);
        if (!r) return;
        toast(`Saved “${r.name}” without private details${r.removed.length ? ` (removed: ${r.removed.join(", ")})` : ""}.`, { kind: "success" });
        refresh();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't make the clean copy.", { kind: "error" });
      }
    } }, "Remove private info…"));
  } else {
    actions.append(h("p", { class: "hint" }, "The built-in cleaner works on JPEG, PNG and WebP pictures. For other kinds, use “Convert or process” and choose “Remove location and camera info”."));
  }
  if (data.gps && data.helper?.exiftool) {
    actions.append(h("button", { type: "button", class: "btn fi-strip-gps", title: "Make a copy without only the location. The date, camera and picture stay. Uses ExifTool.", onclick: async () => {
      try {
        const r = await call("tools/run", { action: "meta-gps-strip", paths: [path] });
        emit("job-started", r.job);
        toast("Making a copy without the location. You can follow it in the task list.", { kind: "info" });
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "That didn't start.", { kind: "error" });
      }
    } }, "Remove only the location…"));
  }
  box.append(actions);

  const el = h("section", { class: "fi-group fi-privacy-group", dataset: { group: "privacy-view" } }, h("h3", { class: "fi-title", title: "Hidden details inside a picture can say who took it, where and when." }, "What this file reveals"), box);
  return { el, group: () => privacyGroup(data.privacy) };
}

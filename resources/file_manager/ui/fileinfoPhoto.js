// The Details panel's compact "Photo" strip: size, camera, date and exposure for a picture, and a small badge when it
// holds the place where it was taken. Shown only when the picture really has such details.
import { call } from "./api.js";
import { h } from "./dom.js";

const PHOTO_EXT = /\.(jpe?g|png|webp|tiff?|heic|heif|avif)$/i;

/** Can this entry be a photo with details? (Cheap check, before asking the server.) */
export const mayHavePhotoDetails = (entry) => !entry.isDir && entry.preview === "image" && PHOTO_EXT.test(entry.name);

/**
 * @param {{ path: string, name: string }} entry
 * @returns {Promise<HTMLElement | null>}
 */
export async function photoStrip(entry) {
  let r;
  try {
    r = await call("info/image", { path: entry.path });
  } catch {
    return null;
  }
  const p = r.photo;
  if (!p && !r.gps) return null;
  const items = p ? [["Size", p.size, "How many dots (pixels) wide and high the picture is."], ["Camera", p.camera, "The camera that took the picture."], ["Taken", p.taken, "When the camera says the picture was taken."], ["ISO", p.iso, "How sensitive the camera was to light."], ["Aperture", p.aperture, "How wide the lens opened."], ["Shutter", p.shutter, "How long the shutter stayed open."], ["Focal length", p.focal, "How much the lens zoomed."]].filter(([, v]) => v) : [];
  return h("div", { class: "fi-photo", role: "group", "aria-label": "Photo details" },
    h("div", { class: "fi-photo-title" }, "Photo"),
    items.length ? h("dl", { class: "fi-photo-facts" }, items.map(([label, value, hint]) => [h("dt", { title: hint }, label), h("dd", {}, value)])) : null,
    r.gps ? h("p", { class: "fi-badge", title: "This photo contains the location where it was taken. Open More info to see it or remove it." }, h("span", { "aria-hidden": "true" }, "📍 "), "Has location") : null,
  );
}

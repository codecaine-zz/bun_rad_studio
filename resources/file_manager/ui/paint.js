// "Paint Studio" tool of the Power tools panel: Chroma Studio Pro digital painting & vector coloring book inside the File Manager.
import { rawUrl } from "./api.js";
import { embeddedUrl, mountEmbedded } from "./embed.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read picture."));
    reader.readAsDataURL(blob);
  });
}

registerPowerTab({
  id: "paint",
  label: "Paint Studio",
  icon: "🖌️",
  tip: "Digital painting studio with 20 brushes and tools, multi-layer canvas, symmetry modes, image filters and a 106-page vector coloring book",
  group: "media",
  mount(root) {
    let loaded = false;
    let pending = null;
    const { frame } = mountEmbedded(root, {
      id: "paint",
      title: "Chroma Studio Pro",
      note: "Chroma Studio Pro: freehand digital painting, multi-layer canvas, symmetry modes, image filters and the 106-page vector coloring book. Export your artwork as PNG, SVG or a .chroma project.",
    });
    const sendImport = (payload) => {
      try {
        const targetOrigin = new URL(embeddedUrl("paint")).origin;
        frame.contentWindow?.postMessage({ fmPaintImport: payload }, targetOrigin);
      } catch {
        // Ignore if frame is not ready
      }
    };
    frame.addEventListener("load", () => {
      loaded = true;
      if (pending) {
        const next = pending;
        pending = null;
        sendImport(next);
      }
    });
    async function importPath(filePath) {
      try {
        const res = await fetch(rawUrl(filePath));
        if (!res.ok) throw new Error("Couldn't load that picture.");
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        const name = String(filePath).split(/[\\/]/).pop() || "image";
        const payload = { name, dataUrl };
        if (loaded) sendImport(payload);
        else pending = payload;
      } catch (err) {
        toast(err?.message || "Couldn't open that picture in Paint Studio.", { kind: "error" });
      }
    }
    return {
      show(opts) {
        frame.focus();
        const filePath = opts?.path || (Array.isArray(opts?.paths) ? opts.paths[0] : null);
        if (filePath) void importPath(filePath);
      },
    };
  },
});

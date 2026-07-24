
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(import.meta.dir, "preview.html"), "utf-8");
const wv = new Webview();
wv.setHTML(html);
wv.title = "Form1 - Live Preview";
wv.size = { width: 800, height: 600, hint: SizeHint.NONE };

wv.bind("backendAlert", (msg: string) => {
    console.log("Backend alert:", msg);
});

wv.run();
            
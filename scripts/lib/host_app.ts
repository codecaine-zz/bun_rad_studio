// Runs any SimpleGUI app in a web page, without a native window, so it can be driven and recorded in headless Chrome.
// It is the same bridge the File Manager uses for the API Studio and friends (src/simplegui_host.ts).
//
//   const host = await hostApp(() => createPongStudio({ fullscreen: false }));
//   host.url          // open this in Chrome
//   host.stop();
import { createHostedHub, hostedPage, HostedSession } from "../../src/simplegui_host";
import type { SimpleWindow } from "../../src/simplegui";
import { exportProjectHelper, getIdeHtml, saveDraftHelper, loadDraftHelper, clearDraftHelper } from "../../index";
import { generatePreviewHtml } from "../../index";
import { injectHelp } from "../../src/shared/helpTips";

export interface HostedApp {
  url: string;
  session: HostedSession;
  stop(): void;
}

/** Serves a hosted session's page and its socket on a free local port. */
function serve(session: HostedSession, onStop: () => void): HostedApp {
  const server = Bun.serve<{ peer?: { send(t: string): void } }>({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") return srv.upgrade(req, { data: {} }) ? undefined : new Response("websocket only", { status: 426 });
      if (url.pathname === "/") return new Response(hostedPage(session, `ws://${url.host}/ws`), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        ws.data.peer = { send: (t: string) => void ws.send(t) };
        session.attach(ws.data.peer);
      },
      message(ws, m) {
        if (typeof m === "string" && ws.data.peer) void session.handleMessage(ws.data.peer, m);
      },
      close(ws) {
        if (ws.data.peer) session.detach(ws.data.peer);
      },
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, session, stop: () => { onStop(); server.stop(true); } };
}

export async function hostApp(create: () => SimpleWindow | Promise<SimpleWindow>, key = "app"): Promise<HostedApp> {
  const hub = createHostedHub();
  const win = await create();
  const session = hub.open(key, () => win);
  return serve(session, () => hub.closeAll());
}

/**
 * The visual form designer (index.ts). It is a plain web page whose few host calls are answered here: Preview shows the
 * form in a frame on top of the designer, Export and drafts write into `workDir`.
 */
export function hostDesigner(workDir: string): HostedApp {
  const session = new HostedSession("designer");
  session.html = injectHelp(getIdeHtml(), "designer");
  const b = (name: string, fn: (...a: any[]) => unknown) => session.webview.bind(name, fn);
  b("runPreview", (specJson: string) => {
    const html = generatePreviewHtml(JSON.parse(specJson));
    session.webview.eval(`(() => {
      const old = document.getElementById("__preview"); if (old) old.remove();
      const box = document.createElement("div"); box.id = "__preview";
      box.style.cssText = "position:fixed;inset:6% 8%;z-index:2147483000;background:#000;border:2px solid #6366f1;border-radius:12px;box-shadow:0 30px 90px #000c;display:flex;flex-direction:column;overflow:hidden";
      const bar = document.createElement("div"); bar.style.cssText = "background:#1e293b;color:#fff;font:600 14px system-ui;padding:8px 14px;display:flex;justify-content:space-between";
      bar.innerHTML = "<span>Live preview</span>"; const x = document.createElement("button"); x.textContent = "Close preview"; x.style.cssText = "background:#6366f1;color:#fff;border:0;border-radius:6px;padding:3px 10px;cursor:pointer"; x.onclick = () => box.remove(); bar.appendChild(x);
      const f = document.createElement("iframe"); f.style.cssText = "flex:1;border:0;background:#fff"; f.srcdoc = ${JSON.stringify(html)};
      box.append(bar, f); document.body.appendChild(box);
    })()`);
    return { success: true };
  });
  b("exportProject", (specJson: string) => exportProjectHelper(specJson, workDir));
  b("saveDraft", (specJson: string) => saveDraftHelper(specJson, workDir));
  b("loadDraft", () => loadDraftHelper(workDir));
  b("clearDraft", () => clearDraftHelper(workDir));
  return serve(session, () => session.close());
}

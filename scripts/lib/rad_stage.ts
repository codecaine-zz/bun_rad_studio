// The "stage" of the RAD tutorial: one page that shows a real source file on the left (with the lines being talked about
// highlighted) and, on the right, either the real program running (an iframe) or a terminal with real command output.
// The program is served from another address (127.0.0.1) than the stage (localhost) so Chrome keeps them apart and the
// recorder can click inside the program with `#appframe ||| selector`.
import { readFileSync } from "fs";
import type { Do } from "./step_video";

export interface StageOptions {
  /** The file shown on the left and its heading. */
  file: string;
  title: string;
  /** What the right side shows first: the program's address, or a terminal transcript. */
  app?: string;
  term?: { command: string; output: string };
  layout?: "split" | "code" | "right";
}

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>stage</title><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0b1020;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}
#wrap{display:flex;height:100%}
#codepane{flex:0 0 58%;display:flex;flex-direction:column;border-right:3px solid #6366f1;min-width:0;background:#0f172a}
#codehead{flex:none;padding:12px 22px;background:#111a33;color:#94a3b8;font-size:20px;font-weight:700;display:flex;gap:12px;align-items:center}
#codehead b{color:#fff}
#codehead i{font-style:normal;background:#334155;color:#e2e8f0;border-radius:8px;padding:2px 10px;font-size:15px}
#code{flex:1;overflow:hidden;padding:14px 0;font:16.5px/1.52 "SF Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace;position:relative}
.ln{display:flex;white-space:pre;padding-right:10px}
.ln .n{flex:none;width:58px;text-align:right;padding-right:18px;color:#475569;user-select:none}
.ln.on{background:rgba(99,102,241,.28);box-shadow:inset 5px 0 0 #818cf8}
.ln.on .n{color:#c7d2fe}
.ln.dim{opacity:.38}
.k{color:#c084fc}.s{color:#86efac}.c{color:#64748b;font-style:italic}.f{color:#7dd3fc}.m{color:#fbbf24}.t{color:#f9a8d4}
#right{flex:1;min-width:0;position:relative;background:#0b1020}
#appframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
#term{position:absolute;inset:0;background:#0d1117;padding:26px 30px;font:21px/1.5 "SF Mono",Menlo,Consolas,monospace;color:#c9d1d9;white-space:pre-wrap;overflow:hidden;display:none}
#term .p{color:#7ee787}#term .cmd{color:#fff}#term .cur{display:inline-block;width:11px;height:24px;background:#c9d1d9;vertical-align:-4px;animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
body.code #right{display:none}body.code #codepane{flex:1;border-right:0}body.code #code{font-size:21px}
body.right #codepane{display:none}
</style></head><body><div id="wrap">
<div id="codepane"><div id="codehead"><b id="ctitle"></b><i id="cfile"></i></div><div id="code"></div></div>
<div id="right"><iframe id="appframe" title="the running program"></iframe><div id="term"></div></div>
</div><script>
const KW=new Set("import from export const let var function return if else for while new class extends async await type interface true false null undefined default of in".split(" "));
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function paint(line){
  let out="",i=0;
  while(i<line.length){
    const rest=line.slice(i);
    let m;
    if((m=/^\\/\\/.*/.exec(rest))){out+='<span class="c">'+esc(m[0])+'</span>';i+=m[0].length;continue}
    if((m=/^("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)/.exec(rest))){out+='<span class="s">'+esc(m[0])+'</span>';i+=m[0].length;continue}
    if((m=/^[A-Za-z_$][\\w$]*/.exec(rest))){
      const w=m[0],next=rest[w.length];
      out+=KW.has(w)?'<span class="k">'+w+'</span>':(next==="("?'<span class="f">'+w+'</span>':w);i+=w.length;continue}
    if((m=/^\\d+(\\.\\d+)?/.exec(rest))){out+='<span class="m">'+m[0]+'</span>';i+=m[0].length;continue}
    out+=esc(rest[0]);i++;
  }
  return out;
}
window.__stage={
  load(title,file,text){
    document.getElementById("ctitle").textContent=title;document.getElementById("cfile").textContent=file;
    const box=document.getElementById("code");box.replaceChildren();
    text.replace(/\\n$/,"").split("\\n").forEach((l,i)=>{
      const row=document.createElement("div");row.className="ln";
      const n=document.createElement("span");n.className="n";n.textContent=String(i+1);
      const t=document.createElement("span");t.innerHTML=paint(l)||" ";
      row.append(n,t);box.append(row);
    });
  },
  hl(from,to){
    const rows=[...document.querySelectorAll("#code .ln")];
    rows.forEach((r,i)=>{r.classList.toggle("on",from>0&&i+1>=from&&i+1<=to);r.classList.toggle("dim",from>0&&(i+1<from||i+1>to))});
    if(from>0&&rows[from-1]){const box=document.getElementById("code");const want=rows[from-1].offsetTop-120;box.scrollTo({top:Math.max(0,want),behavior:"smooth"})}
  },
  layout(mode){document.body.className=mode==="split"?"":mode},
  app(url){document.getElementById("term").style.display="none";const f=document.getElementById("appframe");f.style.display="block";if(url&&f.src!==url)f.src=url},
  idle(){
    document.getElementById("appframe").style.display="none";
    const t=document.getElementById("term");t.style.display="block";t.replaceChildren();
    const p=document.createElement("span");p.className="p";p.textContent="$ ";
    const cur=document.createElement("span");cur.className="cur";t.append(p,cur);
  },
  async term(cmd,out,ms){
    document.getElementById("appframe").style.display="none";
    const t=document.getElementById("term");t.style.display="block";t.replaceChildren();
    const p=document.createElement("span");p.className="p";p.textContent="$ ";
    const c=document.createElement("span");c.className="cmd";
    const cur=document.createElement("span");cur.className="cur";
    t.append(p,c,cur);
    for(const ch of cmd){c.textContent+=ch;await new Promise(r=>setTimeout(r,ms||45))}
    await new Promise(r=>setTimeout(r,500));
    cur.remove();t.append(document.createTextNode("\\n"+out+"\\n"));
    const p2=document.createElement("span");p2.className="p";p2.textContent="$ ";t.append(p2,cur);
  }
};
</script></body></html>`;

export interface StageServer { url: string; stop(): void }

export function serveStage(): StageServer {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }) });
  return { url: `http://localhost:${server.port}/`, stop: () => server.stop(true) };
}

/** The line numbers (1-based, inclusive) that start at the first line containing `from` and end at the first later line containing `to`. */
export function rangeOf(source: string, from: string, to?: string): [number, number] {
  const lines = source.split("\n");
  const a = lines.findIndex((l) => l.includes(from));
  if (a < 0) throw new Error(`the file has no line with "${from}"`);
  if (!to) return [a + 1, a + 1];
  const b = lines.findIndex((l, i) => i >= a && l.includes(to));
  if (b < 0) throw new Error(`the file has no line with "${to}" after "${from}"`);
  return [a + 1, b + 1];
}

/** The real output of the command a chapter shows in its terminal, by chapter id (filled in when the chapter is opened). */
export const outputs: Record<string, string> = {};

let source = "";

/** Shows a file and what goes with it. */
export async function loadStage(d: Pick<Do, "c">, o: StageOptions): Promise<void> {
  source = readFileSync(o.file, "utf8");
  await d.c.eval(`window.__stage.load(${JSON.stringify(o.title)}, ${JSON.stringify(o.file.replace(/^.*\/examples\//, "examples/"))}, ${JSON.stringify(source)})`);
  await d.c.eval(`window.__stage.layout(${JSON.stringify(o.layout ?? "split")})`);
  if (o.app) await d.c.eval(`window.__stage.app(${JSON.stringify(o.app)})`);
}

export const stage = {
  /** Highlights the lines from the one containing `from` to the one containing `to` (and dims the rest). No arguments: show everything again. */
  async hl(d: Do, from?: string, to?: string) {
    if (!from) return void (await d.c.eval("window.__stage.hl(0,0)"));
    const [a, b] = rangeOf(source, from, to);
    await d.c.eval(`window.__stage.hl(${a}, ${b})`);
  },
  async layout(d: Do, mode: "split" | "code" | "right") { await d.c.eval(`window.__stage.layout(${JSON.stringify(mode)})`); },
  async app(d: Do, url: string) { await d.c.eval(`window.__stage.app(${JSON.stringify(url)})`); },
  async term(d: Do, command: string, output: string, ms = 45) { await d.c.eval(`window.__stage.term(${JSON.stringify(command)}, ${JSON.stringify(output)}, ${ms})`); },
  /** Where the program is on the page: use as the front of a selector, `${stage.inApp} input`. */
  inApp: "#appframe |||",
};

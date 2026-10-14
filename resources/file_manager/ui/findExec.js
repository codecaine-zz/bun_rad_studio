// "Run a command on the results" (fd's -x and -X). The command is never given to a shell: it is split into words
// on the server and started directly, so a strange file name can't smuggle in extra commands.
import { call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { h } from "./dom.js";
import { PLACEHOLDER_HELP, sampleNames } from "./findCore.js";
import { fs, scopeItems, selectedItems, targetBody } from "./findStore.js";
import { attempt, button, card, field, guarded, outputBox, row, showOutput, textInput } from "./findUi.js";
import { toast } from "./menus.js";
import { plural } from "./util.js";

function describeRuns(res) {
  const lines = [];
  for (const run of res.runs) {
    lines.push(`$ ${run.command}`);
    if (run.stdout) lines.push(run.stdout.replace(/\s+$/, ""));
    if (run.stderr) lines.push(`(error output) ${run.stderr.replace(/\s+$/, "")}`);
    if (run.error) lines.push(`⚠ ${run.error}`);
    else lines.push(run.exitCode === 0 ? "✓ finished" : `✗ finished with code ${run.exitCode}`);
    lines.push("");
  }
  if (res.notRun) lines.push(`${plural(res.notRun, "item")} were not run because the time limit was reached.`);
  if (res.truncated) lines.push("Only the beginning of the output is shown (64 KB).");
  return lines.join("\n").trim();
}

export function createExec() {
  const command = textInput({ value: "wc -l {}", label: "Command to run", tip: "The program and its options. Use {} where the file's location should go. Quotes keep words together: grep \"two words\" {}", width: "l" });
  const output = outputBox("Output of the command");
  const hint = h("p", { class: "pw-hint" }, `Placeholders: ${PLACEHOLDER_HELP.map(([p, text]) => `${p} = ${text}`).join("; ")}. Without any placeholder, {} is added at the end. A pair of braces always means a placeholder, and nothing is run through a shell (so pipes like | and > don't work). Each run stops after ${fs.meta.limits.execSeconds ?? 60} seconds.`);

  async function run(mode) {
    const template = command.value.trim();
    if (!template) return toast("Type a command first, for example: wc -l {}", { kind: "info" });
    const list = mode === "each" ? selectedItems() : scopeItems();
    if (!fs.resultId || list.length === 0) return toast(mode === "each" ? "Select one or more results first." : "There are no results to run it on. Search first.", { kind: "info" });
    const body = mode === "each" ? { paths: list.map((i) => i.path), resultId: fs.resultId } : targetBody();
    const ok = await confirmBox({
      title: "Run this command?",
      message: mode === "each"
        ? `This starts the program once for each of the ${plural(list.length, "selected item")}. Only continue if you trust the command.`
        : `This starts the program once, with all ${plural(list.length, "item")} given to it. Only continue if you trust the command.`,
      confirmLabel: "Run it",
      danger: true,
      details: [`Command: ${template}`, `On: ${sampleNames(list)}`],
    });
    if (!ok) return undefined;
    showOutput(output, "Running…");
    const res = await attempt(() => call("find/exec", { ...body, template, mode, confirm: true }));
    showOutput(output, res ? describeRuns(res) : "The command could not be run.");
    return undefined;
  }

  const each = button("⚡ Run on each selected", () => eachRun(), { tip: "Start the command once for every selected result (fd's -x). The output appears below." });
  const batch = button("🚀 Run once on all", () => batchRun(), { tip: "Start the command once and give it every result shown (fd's -X). The output appears below." });
  const eachRun = guarded(each, () => run("each"));
  const batchRun = guarded(batch, () => run("batch"));

  const el = card("Run a command on the results", "Start a program on the selected results, or once on all of them. You will be asked to confirm first.",
    row(field("Command", command, "The program and its options"), each, batch),
    hint,
    output,
  );
  return {
    el,
    applyMeta() {
      // The default command only works where the program exists.
      if (!fs.meta.posix && command.value === "wc -l {}") command.value = "certutil -hashfile {} SHA256";
    },
  };
}

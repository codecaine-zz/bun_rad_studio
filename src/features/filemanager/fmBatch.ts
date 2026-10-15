/**
 * The File Manager's "Convert & process" back end, as the server and the tests use it.
 *
 *  - finding the helper programs and what they can do:  `fmToolDetect.ts`
 *  - planning and running conversions:                  `fmConvert.ts` (the catalog is `fmConvCatalog.ts`)
 *  - installing missing programs:                       here
 */
import { classifyPaths, overview, planConvert, previewConvert, startConvert, type ConvertRequest } from "./fmConvert";
import type { JobStepSpec, JobView } from "./fmJobs";
import { lastLines } from "./fmJobs";
import { FmError } from "./fmPaths";
import { detectManagers, explainFailure, pdfEngineFor, resolveTool, toolStatus, type ToolStatus } from "./fmToolDetect";
import { TOOLS, TOOL_IDS, childEnv, installPlan, type ToolId } from "./fmTools";
import type { FmContext } from "./fmCore";
import { openCommand } from "./fmOpen";

export { classifyPaths, detectManagers, explainFailure, overview, pdfEngineFor, planConvert, previewConvert, resolveTool, startConvert, toolStatus };
export type { ConvertRequest, ToolStatus };

/** Only catalog URLs can be opened by the download buttons. */
export async function openToolWebsite(ctx: FmContext, tool: unknown, manager = false): Promise<{ opened: string }> {
  if (typeof tool !== "string" || !(TOOL_IDS as readonly string[]).includes(tool)) {
    throw new FmError("UNKNOWN_TOOL", "Choose a helper program from the list.");
  }
  const id = tool as ToolId;
  const url = manager ? installPlan(ctx.platform, id, detectManagers(ctx)).missingManager?.url : TOOLS[id].website;
  if (!url) throw new FmError("BAD_REQUEST", "This program doesn't need a package manager download.");
  const { command, args } = openCommand(ctx.platform, url);
  try { await ctx.launch(command, args); }
  catch (err) {
    throw new FmError("OPEN_FAILED", `Couldn't open your browser: ${err instanceof Error ? err.message : String(err)}. The address is ${url}`);
  }
  return { opened: url };
}

/** Starts one action on the selected files with its default options (the original, simple entry point). */
export function startBatch(ctx: FmContext, actionId: unknown, paths: unknown): Promise<JobView> {
  return startConvert(ctx, { action: actionId, paths });
}

// ---------------------------------------------------------------------------------------------------------------
// Installing
// ---------------------------------------------------------------------------------------------------------------

export function startInstall(ctx: FmContext, tools: unknown): JobView {
  const wanted = (Array.isArray(tools) ? tools : [tools]).filter((t): t is ToolId => typeof t === "string" && (TOOL_IDS as string[]).includes(t));
  if (!wanted.length) throw new FmError("UNKNOWN_TOOL", "Choose a program to install.");
  const managers = detectManagers(ctx);
  const env = childEnv(ctx);
  const steps: JobStepSpec[] = [];
  for (const id of [...new Set(wanted)]) {
    if (resolveTool(ctx, id)) continue;
    const plan = installPlan(ctx.platform, id, managers);
    if (!plan.auto || !plan.argv) throw new FmError("MANUAL_INSTALL", plan.missingManager ? `${plan.missingManager.name} isn't installed, so ${TOOLS[id].name} can't be installed from here. ${plan.missingManager.note}` : `${TOOLS[id].name} needs your administrator password, so install it in a terminal: ${plan.display}`);
    steps.push({
      label: `Installing ${TOOLS[id].name} (${plan.display})`,
      argv: plan.argv,
      env,
      timeoutMs: 60 * 60 * 1000,
      explain: (text) => (/already installed|up-to-date/i.test(text) ? "" : lastLines(text, 3) || "The installer stopped with an error."),
    });
  }
  if (!steps.length) throw new FmError("ALREADY_INSTALLED", "That program is already installed.");
  return ctx.jobs.start({ kind: "install", title: steps.length === 1 ? steps[0]!.label : `Installing ${steps.length} programs`, steps });
}

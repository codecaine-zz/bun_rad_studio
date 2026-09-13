import { watch } from "node:fs";
import type { ProcessState, WatchexecOptions } from "./watchexecTypes.ts";
import {
  buildWatchexecEnv,
  clearTerminal,
  killRunningProcess,
  shouldTrigger,
  spawnCommand,
} from "./watchexecDoers.ts";
import { colors } from "../../shared/colors.ts";

export function createExecutionHandler(
  options: WatchexecOptions,
  state: ProcessState
): (triggeredPath?: string) => void {
  return (triggeredPath?: string) => {
    if (options.clear) clearTerminal();
    if (options.restart) killRunningProcess(state.currentProcess);

    console.log(colors.dim(`[watchexec] Running: ${options.command.join(" ")}`));
    const env = buildWatchexecEnv(triggeredPath, options.watchPaths[0]);
    const proc = spawnCommand(options.command, { env, shell: options.shell });
    state.currentProcess = proc;
    proc.exited.then((code) => {
      console.log(colors.dim(`[watchexec] Process exited with status ${code}`));
    }).catch(() => {});
  };
}

export function startWatcher(
  options: WatchexecOptions,
  state: ProcessState,
  onTrigger: (triggeredPath?: string) => void
): { close: () => void } {
  let timer: Timer | null = null;
  const watchers = options.watchPaths.map((watchPath) =>
    watch(watchPath, { recursive: true }, (_eventType, filename) => {
      if (!filename || !shouldTrigger(filename, options.extensions, options.ignorePatterns, options.filterPatterns)) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onTrigger(filename);
      }, options.debounceMs);
    })
  );

  return {
    close: () => {
      if (timer) clearTimeout(timer);
      watchers.forEach((w) => w.close());
      killRunningProcess(state.currentProcess);
    },
  };
}

export async function runWatchexecCoordinator(
  options: WatchexecOptions
): Promise<{ close: () => void }> {
  const state: ProcessState = { currentProcess: null };
  const execute = createExecutionHandler(options, state);

  if (options.runOnStart) {
    execute();
  }

  return startWatcher(options, state, execute);
}

import {
  attachListeningPorts,
  buildProcessTree,
  fetchListeningPorts,
  fetchRawProcessList,
  filterProcesses,
  filterProcessesByUser,
  formatJsonProcesses,
  formatProcessTable,
  formatTreeLines,
  killProcess,
  parsePsOutput,
  sortProcesses,
} from "./procsDoers.ts";

export async function getProcesses(
  keyword?: string,
  sortBy?: ProcsOptions["sortBy"],
  limit?: number,
  user?: string
): Promise<ProcessInfo[]> {
  const raw = await fetchRawProcessList();
  const allProcs = parsePsOutput(raw);
  const userFiltered = filterProcessesByUser(allProcs, user);
  const filtered = filterProcesses(userFiltered, keyword);
  const sorted = sortProcesses(filtered, sortBy);
  return limit && limit > 0 ? sorted.slice(0, limit) : sorted;
}

export async function runProcsCoordinator(options: ProcsOptions): Promise<string> {
  if (options.killPid) {
    killProcess(options.killPid, (options.signal ?? "SIGTERM") as NodeJS.Signals);
    return `Successfully sent ${options.signal ?? "SIGTERM"} to PID ${options.killPid}.`;
  }

  let procs = await getProcesses(options.keyword, options.sortBy, options.limit, options.user);

  if (options.ports) {
    const portMap = await fetchListeningPorts();
    procs = attachListeningPorts(procs, portMap);
  }

  if (options.json) {
    return formatJsonProcesses(procs);
  }

  if (options.tree) {
    const tree = buildProcessTree(procs);
    const lines = formatTreeLines(tree);
    return lines.join("\n");
  }

  return formatProcessTable(procs);
}

export interface FlagDefinition {
  flag: string;
  desc: string;
}

export function generateBashCompletion(cliName: string, flags: string[]): string {
  const optsStr = flags.join(" ");
  return `# Bash completion for ${cliName}
_${cliName}() {
    local cur
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"

    if [[ \${cur} == * ]] ; then
        COMPREPLY=( $(compgen -W "${optsStr}" -- \${cur}) )
        return 0
    fi
}
complete -F _${cliName} ${cliName}
`;
}

export function generateZshCompletion(
  cliName: string,
  flagDefs: FlagDefinition[]
): string {
  const options = flagDefs
    .map((d) => {
      const escaped = d.desc.replace(/'/g, "'\\''").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      return `        '${d.flag}[${escaped}]'`;
    })
    .join("\n");

  return `#compdef ${cliName}
# Zsh completion for ${cliName}

_${cliName}() {
    local -a options
    options=(
${options}
    )
    _arguments -s -S $options
}

_${cliName} "$@"
`;
}

export function generateFishCompletion(
  cliName: string,
  flagDefs: FlagDefinition[]
): string {
  const lines: string[] = [
    `# Fish completion for ${cliName}`,
    `complete -c ${cliName} -f`,
  ];

  for (const def of flagDefs) {
    const cleanFlag = def.flag.replace(/^--?/, "");
    const isLong = def.flag.startsWith("--");
    const flagArg = isLong ? `-l ${cleanFlag}` : `-s ${cleanFlag}`;
    const desc = def.desc.replace(/"/g, '\\"');
    lines.push(`complete -c ${cliName} ${flagArg} -d "${desc}"`);
  }

  return lines.join("\n") + "\n";
}

export const TOOL_FLAGS: Record<string, FlagDefinition[]> = {
  fd: [
    { flag: "-t", desc: "Filter by entry type (f, d, l, x)" },
    { flag: "-e", desc: "Filter by file extension" },
    { flag: "-d", desc: "Limit directory traversal depth" },
    { flag: "-H", desc: "Include hidden files" },
    { flag: "-a", desc: "Print absolute paths" },
    { flag: "-x", desc: "Execute command on each match" },
    { flag: "--changed-within", desc: "Filter by modification time" },
    { flag: "--empty", desc: "Filter for empty files" },
    { flag: "--min-depth", desc: "Minimum directory depth" },
    { flag: "-h", desc: "Show help information" },
  ],
  sd: [
    { flag: "-s", desc: "Literal string mode" },
    { flag: "-f", desc: "Regex flags" },
    { flag: "-p", desc: "Preview diffs" },
    { flag: "-w", desc: "Whole-word matching" },
    { flag: "-b", desc: "Backup extension" },
    { flag: "-q", desc: "Quiet mode" },
    { flag: "-i", desc: "Ignore case" },
    { flag: "-c", desc: "Count matches only" },
    { flag: "-h", desc: "Show help information" },
  ],
  rip: [
    { flag: "-u", desc: "Unbury / restore item" },
    { flag: "-s", desc: "Seance / list buried items" },
    { flag: "--size", desc: "Show graveyard disk usage" },
    { flag: "-n", desc: "Dry-run mode" },
    { flag: "--prune", desc: "Prune items older than N days" },
    { flag: "-d", desc: "Decompose / purge graveyard" },
    { flag: "-h", desc: "Show help information" },
  ],
  procs: [
    { flag: "-u", desc: "Filter by username" },
    { flag: "-P", desc: "Inspect listening ports" },
    { flag: "-t", desc: "Tree view" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-n", desc: "Limit output rows" },
    { flag: "--sort-cpu", desc: "Sort by CPU usage" },
    { flag: "--sort-mem", desc: "Sort by memory usage" },
    { flag: "-w", desc: "Watch mode" },
    { flag: "-h", desc: "Show help information" },
  ],
  watchexec: [
    { flag: "-w", desc: "Watch path" },
    { flag: "-e", desc: "File extensions to watch" },
    { flag: "-i", desc: "Ignore pattern" },
    { flag: "-d", desc: "Debounce delay (ms)" },
    { flag: "-c", desc: "Clear screen" },
    { flag: "-r", desc: "Restart process" },
    { flag: "-s", desc: "Execute in shell" },
    { flag: "--postpone", desc: "Postpone first run" },
    { flag: "-h", desc: "Show help information" },
  ],
  tokei: [
    { flag: "-s", desc: "Sort column" },
    { flag: "--files", desc: "Show per-file breakdown" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-m", desc: "Markdown table output" },
    { flag: "-H", desc: "Count hidden files" },
    { flag: "-e", desc: "Exclude pattern" },
    { flag: "-h", desc: "Show help information" },
  ],
  gdu: [
    { flag: "-n", desc: "Non-interactive report" },
    { flag: "-C", desc: "Show item count" },
    { flag: "-B", desc: "Show relative size bar" },
    { flag: "-s", desc: "Summarize total only" },
    { flag: "-d", desc: "Show mounted disks" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-m", desc: "Minimum size filter" },
    { flag: "-h", desc: "Show help information" },
  ],
  ipinfo: [
    { flag: "-l", desc: "Show local network interfaces" },
    { flag: "-t", desc: "API token" },
    { flag: "-f", desc: "Specific field lookup" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-c", desc: "CSV output" },
    { flag: "-b", desc: "Bulk IP lookup file" },
    { flag: "-h", desc: "Show help information" },
  ],
  subfinder: [
    { flag: "-d", desc: "Target domain" },
    { flag: "-nW", desc: "Active DNS verification" },
    { flag: "-p", desc: "HTTP/HTTPS service probe" },
    { flag: "--ports", desc: "TCP ports to probe" },
    { flag: "--wildcard", desc: "Detect wildcard DNS" },
    { flag: "-silent", desc: "Subdomains only" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-o", desc: "Output file" },
    { flag: "-h", desc: "Show help information" },
  ],
  doggo: [
    { flag: "-t", desc: "DNS query type" },
    { flag: "-n", desc: "Nameserver" },
    { flag: "--doh", desc: "DNS-over-HTTPS" },
    { flag: "--doh-url", desc: "Custom DoH URL" },
    { flag: "--all", desc: "Query all record types" },
    { flag: "-x", desc: "Reverse PTR lookup" },
    { flag: "--short", desc: "Short answer output" },
    { flag: "-j", desc: "JSON output" },
    { flag: "-h", desc: "Show help information" },
  ],
};

export function renderCompletionScript(
  cliName: string,
  shell: string,
  flagDefs: FlagDefinition[] = TOOL_FLAGS[cliName] ?? []
): string {
  const normShell = shell.toLowerCase().trim();
  if (normShell === "bash") {
    const flags = flagDefs.map((d) => d.flag);
    return generateBashCompletion(cliName, flags);
  }
  if (normShell === "zsh") {
    return generateZshCompletion(cliName, flagDefs);
  }
  if (normShell === "fish") {
    return generateFishCompletion(cliName, flagDefs);
  }
  throw new Error(`[Completions] Unsupported shell: ${shell}. Supported shells: bash, zsh, fish.`);
}

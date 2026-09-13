import { describe, expect, it } from "bun:test";
import {
  generateBashCompletion,
  generateFishCompletion,
  generateZshCompletion,
  renderCompletionScript,
} from "./completions.ts";

describe("shell completions generator", () => {
  const flags = [
    { flag: "--help", desc: "Show help information" },
    { flag: "-h", desc: "Show help information" },
    { flag: "--json", desc: "Output JSON" },
  ];

  it("generates bash completion script", () => {
    const bash = generateBashCompletion("fd", ["--help", "-h", "--json"]);
    expect(bash).toContain("complete -F _fd fd");
    expect(bash).toContain("--help -h --json");
  });

  it("generates zsh completion script", () => {
    const zsh = generateZshCompletion("sd", flags);
    expect(zsh).toContain("#compdef sd");
    expect(zsh).toContain("'--help[Show help information]'");
    expect(zsh).toContain("_arguments -s -S $options");
  });

  it("generates fish completion script", () => {
    const fish = generateFishCompletion("doggo", flags);
    expect(fish).toContain("complete -c doggo -f");
    expect(fish).toContain("complete -c doggo -l help -d \"Show help information\"");
    expect(fish).toContain("complete -c doggo -s h -d \"Show help information\"");
  });

  it("renders script based on shell choice and rejects invalid shell", () => {
    const script = renderCompletionScript("tokei", "zsh", flags);
    expect(script).toContain("#compdef tokei");

    expect(() => renderCompletionScript("tokei", "powershell", flags)).toThrow();
  });
});

import type { ToolDefinition } from "../core/types.js";
import { execSync } from "child_process";

function ripgrep(pattern: string, flags: string[] = [], cwd?: string): string {
  try {
    return execSync(`rg --no-heading --line-number ${flags.join(" ")} "${pattern}" .`, { cwd, encoding: "utf-8", maxBuffer: 1024 * 1024 });
  } catch { return ""; }
}

export const searchCodeTool: ToolDefinition = {
  name: "search_code",
  description: "Search for a pattern in the codebase using ripgrep.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      glob: { type: "string", description: "File glob filter (e.g., *.ts)" },
      max_results: { type: "number", description: "Max results (default: 50)" },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    const flags: string[] = [];
    if (args.glob) flags.push("-g", args.glob as string);
    const raw = ripgrep(args.pattern as string, flags);
    const lines = raw.split("\n").filter(Boolean);
    const max = (args.max_results as number) ?? 50;
    return { output: lines.slice(0, max).join("\n") || "No matches found" };
  },
};

export const findFileTool: ToolDefinition = {
  name: "find_file",
  description: "Find files by name pattern.",
  parameters: { type: "object", properties: { name: { type: "string", description: "File name pattern" } }, required: ["name"] },
  execute: async (args) => {
    const raw = ripgrep("", ["-l", "--no-ignore", "-g", args.name as string]);
    return { output: raw || "No files found" };
  },
};

export const searchTools: ToolDefinition[] = [searchCodeTool, findFileTool];

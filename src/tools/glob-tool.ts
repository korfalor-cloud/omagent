import type { ToolDefinition } from "../core/types.js";
import { execSync } from "child_process";

// ============================================================
// Glob Tool - Find files by pattern (ripgrep-based)
// ============================================================

export const globTool: ToolDefinition = {
  name: "glob",
  description: "Find files matching a glob pattern. Returns matching file paths.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g., **/*.ts, src/**/*.test.ts)" },
      cwd: { type: "string", description: "Working directory (default: current)" },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    try {
      const pattern = args.pattern as string;
      const cwd = (args.cwd as string) ?? process.cwd();
      // Use find command for glob matching
      const result = execSync(`find ${cwd} -type f -name '${pattern.replace(/\*/g, '*')}' 2>/dev/null | head -100`, { encoding: "utf-8", maxBuffer: 1024 * 1024 });
      const files = result.trim().split("\n").filter(Boolean).map((f) => f.replace(cwd + "/", ""));
      return { output: files.join("\n") || "No files found" };
    } catch (err: any) { return { output: `Error: ${err.message}`, isError: true }; }
  },
};

export const grepTool: ToolDefinition = {
  name: "grep",
  description: "Search for content in files using ripgrep. More powerful than search_code.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Directory or file to search in" },
      glob: { type: "string", description: "File glob filter (e.g., *.ts)" },
      ignore_case: { type: "boolean", description: "Case-insensitive search" },
      max_results: { type: "number", description: "Max results (default: 50)" },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    try {
      const flags = ["--no-heading", "--line-number"];
      if (args.ignore_case) flags.push("-i");
      if (args.glob) flags.push("-g", args.glob as string);
      const path = (args.path as string) ?? ".";
      const pattern = args.pattern as string;
      const result = execSync(`rg ${flags.join(" ")} "${pattern}" ${path}`, { encoding: "utf-8", maxBuffer: 1024 * 1024, cwd: process.cwd() });
      const lines = result.trim().split("\n").filter(Boolean);
      const max = (args.max_results as number) ?? 50;
      return { output: lines.slice(0, max).join("\n") || "No matches" };
    } catch (err: any) { return { output: err.stdout || "No matches" }; }
  },
};

export const globTools: ToolDefinition[] = [globTool, grepTool];

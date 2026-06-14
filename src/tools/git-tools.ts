import type { ToolDefinition } from "../core/types.js";
import { spawn } from "child_process";

function gitExec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd: cwd ?? process.cwd() });
    let stdout = "", stderr = "";
    proc.stdout?.on("data", (d) => stdout += d.toString());
    proc.stderr?.on("data", (d) => stderr += d.toString());
    proc.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 }));
    proc.on("error", (err) => resolve({ stdout: "", stderr: err.message, exitCode: 1 }));
  });
}

export const gitStatusTool: ToolDefinition = {
  name: "git_status",
  description: "Get the current git status.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    const r = await gitExec(["status", "--porcelain"]);
    return { output: r.stdout || "Clean working tree" };
  },
};

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description: "Show git diff.",
  parameters: {
    type: "object",
    properties: {
      staged: { type: "boolean", description: "Show staged changes" },
      file: { type: "string", description: "Specific file to diff" },
    },
  },
  execute: async (args) => {
    const cmd = args.staged ? ["diff", "--cached"] : ["diff"];
    if (args.file) cmd.push(args.file as string);
    const r = await gitExec(cmd);
    return { output: r.stdout || "No changes" };
  },
};

export const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description: "Stage all changes and create a git commit.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message" },
      files: { type: "array", items: { type: "string" }, description: "Specific files to stage" },
    },
    required: ["message"],
  },
  execute: async (args) => {
    const files = args.files as string[] | undefined;
    if (files?.length) await gitExec(["add", ...files]);
    else await gitExec(["add", "-A"]);
    const r = await gitExec(["commit", "-m", args.message as string]);
    return { output: r.stdout || r.stderr || "Committed" };
  },
};

export const gitLogTool: ToolDefinition = {
  name: "git_log",
  description: "Show recent git log.",
  parameters: {
    type: "object",
    properties: { count: { type: "number", description: "Number of commits (default: 10)" } },
  },
  execute: async (args) => {
    const count = (args.count as number) ?? 10;
    const r = await gitExec(["log", "--oneline", "-n" + String(count)]);
    return { output: r.stdout || "No commits" };
  },
};

export const gitBranchTool: ToolDefinition = {
  name: "git_branch",
  description: "List, create, or switch git branches.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "create", "switch"] },
      name: { type: "string", description: "Branch name" },
    },
    required: ["action"],
  },
  execute: async (args) => {
    const action = args.action as string;
    if (action === "list") { const r = await gitExec(["branch", "-a"]); return { output: r.stdout }; }
    if (action === "create" && args.name) { const r = await gitExec(["checkout", "-b", args.name as string]); return { output: r.stdout || `Created: ${args.name}` }; }
    if (action === "switch" && args.name) { const r = await gitExec(["checkout", args.name as string]); return { output: r.stdout || `Switched to: ${args.name}` }; }
    return { output: "Invalid action" };
  },
};

export const gitTools: ToolDefinition[] = [gitStatusTool, gitDiffTool, gitCommitTool, gitLogTool, gitBranchTool];

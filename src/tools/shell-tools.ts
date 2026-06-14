import type { ToolDefinition } from "../core/types.js";
import { spawn } from "child_process";

// ============================================================
// Shell Execution Tools
// ============================================================

function execCommand(command: string, timeout = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", command], { cwd: process.cwd(), timeout });
    let stdout = "", stderr = "";
    proc.stdout?.on("data", (d) => stdout += d.toString());
    proc.stderr?.on("data", (d) => stderr += d.toString());
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    proc.on("error", (err) => resolve({ stdout: "", stderr: err.message, exitCode: 1 }));
  });
}

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  description: "Execute a shell command and return its output. Use with caution.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const command = args.command as string;
    const timeout = (args.timeout as number) ?? 30000;
    const result = await execCommand(command, timeout);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return {
      output: output || `(exit code: ${result.exitCode})`,
      isError: result.exitCode !== 0,
    };
  },
};

export const shellTools: ToolDefinition[] = [runCommandTool];

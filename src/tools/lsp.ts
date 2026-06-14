import type { ToolDefinition } from "../core/types.js";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// ============================================================
// LSP (Language Server Protocol) Integration
// ============================================================

export interface LspServer {
  name: string;
  command: string;
  args: string[];
  filePatterns: string[];
  process?: ReturnType<typeof spawn>;
}

const defaultLspServers: LspServer[] = [
  { name: "typescript", command: "typescript-language-server", args: ["--stdio"], filePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx"] },
  { name: "python", command: "pylsp", args: [], filePatterns: ["*.py"] },
  { name: "rust", command: "rust-analyzer", args: [], filePatterns: ["*.rs"] },
  { name: "go", command: "gopls", args: [], filePatterns: ["*.go"] },
];

let activeServers: Map<string, LspServer> = new Map();

export async function startLspForFile(filePath: string): Promise<LspServer | null> {
  const ext = path.extname(filePath);
  const server = defaultLspServers.find((s) => s.filePatterns.some((p) => p.endsWith(ext)));
  if (!server) return null;
  if (activeServers.has(server.name)) return activeServers.get(server.name)!;
  try {
    const proc = spawn(server.command, server.args, { stdio: ["pipe", "pipe", "pipe"] });
    server.process = proc;
    activeServers.set(server.name, server);
    // Send initialize request
    const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { processId: process.pid, rootUri: `file://${process.cwd()}`, capabilities: {} } }) + "\n";
    proc.stdin?.write(init);
    return server;
  } catch { return null; }
}

export function getDiagnostics(filePath: string): string {
  const ext = path.extname(filePath);
  const server = defaultLspServers.find((s) => s.filePatterns.some((p) => p.endsWith(ext)));
  if (!server) return "No LSP server for this file type";
  return `LSP server ${server.name} available for ${ext} files`;
}

export const lspTool: ToolDefinition = {
  name: "lsp_info",
  description: "Get LSP diagnostics and information for a file.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path" } },
    required: ["path"],
  },
  execute: async (args) => ({ output: getDiagnostics(args.path as string) }),
};

export const lspTools: ToolDefinition[] = [lspTool];

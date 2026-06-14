import type { ToolDefinition } from "../core/types.js";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// ============================================================
// MCP (Model Context Protocol) Integration
// Connects to external MCP servers for extended tool capabilities
// ============================================================

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  tools: McpTool[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const mcpServers: Map<string, McpServer> = new Map();
const mcpProcesses: Map<string, ReturnType<typeof spawn>> = new Map();

export function loadMcpConfig(configPath?: string): McpServer[] {
  const paths = [
    configPath,
    path.join(process.cwd(), ".omagent", "mcp.json"),
    path.join(os.homedir(), ".config", "omagent", "mcp.json"),
  ].filter(Boolean);

  for (const p of paths) {
    if (fs.existsSync(p!)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p!, "utf-8"));
        const servers: McpServer[] = [];
        for (const [name, config] of Object.entries(raw.servers ?? {})) {
          const c = config as any;
          servers.push({ name, command: c.command, args: c.args ?? [], env: c.env, tools: [] });
        }
        return servers;
      } catch {}
    }
  }
  return [];
}

export async function startMcpServer(server: McpServer): Promise<void> {
  const proc = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  mcpProcesses.set(server.name, proc);
  mcpServers.set(server.name, server);
  // MCP servers communicate via JSON-RPC over stdio
  // Send initialize request
  const initRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "omagent", version: "0.1.0" } } }) + "\n";
  proc.stdin?.write(initRequest);
}

export async function callMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const proc = mcpProcesses.get(serverName);
  if (!proc) return `Error: MCP server ${serverName} not running`;
  return new Promise((resolve) => {
    const requestId = Date.now();
    const request = JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: toolName, arguments: args } }) + "\n";
    let responseData = "";
    const timeout = setTimeout(() => resolve("MCP call timed out"), 30000);
    const handler = (data: Buffer) => {
      responseData += data.toString();
      try {
        const response = JSON.parse(responseData.split("\n")[0]);
        if (response.id === requestId) {
          clearTimeout(timeout);
          proc.stdout?.off("data", handler);
          const content = response.result?.content?.[0]?.text ?? JSON.stringify(response.result);
          resolve(content);
        }
      } catch {}
    };
    proc.stdout?.on("data", handler);
    proc.stdin?.write(request);
  });
}

export function getMcpTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const [serverName, server] of mcpServers) {
    for (const tool of server.tools) {
      tools.push({
        name: `mcp_${serverName}_${tool.name}`,
        description: `[MCP: ${serverName}] ${tool.description}`,
        parameters: tool.inputSchema,
        execute: async (args) => ({ output: await callMcpTool(serverName, tool.name, args) }),
      });
    }
  }
  return tools;
}

export function stopAllMcpServers(): void {
  for (const [name, proc] of mcpProcesses) {
    proc.kill();
    mcpProcesses.delete(name);
  }
}

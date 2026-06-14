import type { ToolDefinition } from "../core/types.js";
import { fileTools } from "./file-tools.js";
import { shellTools } from "./shell-tools.js";
import { gitTools } from "./git-tools.js";
import { searchTools } from "./search-tools.js";
import { agentTools, setOrchestrator } from "./agent-tools.js";
import { memoryToolDefs } from "./memory-tools.js";
import { globTools } from "./glob-tool.js";
import { lspTools } from "./lsp.js";
import { getMcpTools } from "./mcp.js";
import { skillManager } from "../core/skills.js";

const allTools: ToolDefinition[] = [
  ...fileTools,
  ...shellTools,
  ...gitTools,
  ...searchTools,
  ...agentTools,
  ...memoryToolDefs,
  ...globTools,
  ...lspTools,
];

export function getAllTools(): ToolDefinition[] {
  // Dynamically add MCP and skill tools
  const mcpTools = getMcpTools();
  const skillTools = skillManager.list().map((s) => skillManager.registerTool(s));
  return [...allTools, ...mcpTools, ...skillTools];
}

export function getTool(name: string): ToolDefinition | undefined { return getAllTools().find((t) => t.name === name); }
export function getToolNames(): string[] { return getAllTools().map((t) => t.name); }
export function registerCustomTool(tool: ToolDefinition): void { allTools.push(tool); }
export { setOrchestrator } from "./agent-tools.js";

import type { ToolDefinition } from "../core/types.js";

// ============================================================
// Subagent Spawning Tools
// ============================================================

let orchestratorRef: any = null;

export function setOrchestrator(orch: any) { orchestratorRef = orch; }

export const spawnAgentTool: ToolDefinition = {
  name: "spawn_agent",
  description: "Spawn a subagent to perform a specific task in parallel. Returns the subagent's result.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["build", "plan", "compose"], description: "Agent type" },
      description: { type: "string", description: "Short description (3-5 words)" },
      prompt: { type: "string", description: "Task for the subagent" },
    },
    required: ["type", "description", "prompt"],
  },
  execute: async (args) => {
    if (!orchestratorRef) return { output: "Error: Orchestrator not initialized", isError: true };
    try {
      const result = await orchestratorRef.spawnSubagent(
        args.type as any,
        args.prompt as string,
        args.description as string
      );
      return { output: result };
    } catch (err: any) {
      return { output: `Error spawning agent: ${err.message}`, isError: true };
    }
  },
};

export const listAgentsTool: ToolDefinition = {
  name: "list_agents",
  description: "List all active subagents and their status.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    if (!orchestratorRef) return { output: "No orchestrator" };
    const ids = orchestratorRef.getSubagentIds();
    return { output: ids.length > 0 ? ids.join("\n") : "No active subagents" };
  },
};

export const agentTools: ToolDefinition[] = [spawnAgentTool, listAgentsTool];

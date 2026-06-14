import type { ToolDefinition } from "../core/types.js";
import { memoryManager } from "../memory/index.js";

// ============================================================
// Memory Management Tools
// ============================================================

export const storeMemoryTool: ToolDefinition = {
  name: "store_memory",
  description: "Store a piece of knowledge in persistent memory for future sessions.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Memory file path (e.g., MEMORY.md, notes.md)" },
      scope: { type: "string", enum: ["project", "session", "global"], description: "Memory scope" },
      type: { type: "string", enum: ["architecture", "decision", "rule", "note", "checkpoint", "task_progress"], description: "Memory type" },
      content: { type: "string", description: "Content to store" },
    },
    required: ["path", "scope", "type", "content"],
  },
  execute: async (args) => {
    const id = await memoryManager.store({
      path: args.path as string,
      scope: args.scope as any,
      type: args.type as any,
      content: args.content as string,
    });
    return { output: `Memory stored: ${id}` };
  },
};

export const searchMemoryTool: ToolDefinition = {
  name: "search_memory",
  description: "Search persistent memory using full-text search (BM25 ranking).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      scope: { type: "string", enum: ["project", "session", "global"], description: "Filter by scope" },
      limit: { type: "number", description: "Max results (default: 10)" },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const results = await memoryManager.search(args.query as string, {
      scope: args.scope as any,
      limit: (args.limit as number) ?? 10,
    });
    if (results.length === 0) return { output: "No memories found" };
    return {
      output: results.map((r) => `[${r.type}] ${r.path}: ${r.content.slice(0, 200)}`).join("\n"),
    };
  },
};

export const listMemoryTool: ToolDefinition = {
  name: "list_memory",
  description: "List all stored memories.",
  parameters: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["project", "session", "global"], description: "Filter by scope" },
    },
  },
  execute: async (args) => {
    const results = await memoryManager.list(args.scope as any);
    if (results.length === 0) return { output: "No memories stored" };
    return {
      output: results.map((r) => `[${r.type}] ${r.path}: ${r.content.slice(0, 100)}`).join("\n"),
    };
  },
};

export const memoryToolDefs: ToolDefinition[] = [storeMemoryTool, searchMemoryTool, listMemoryTool];

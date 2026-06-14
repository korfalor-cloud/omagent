// ============================================================
// OmAgent Core Types
// ============================================================

export type AgentMode = "build" | "plan" | "compose";

export type ToolPermission = "allow" | "deny" | "ask";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  projectId: string;
  workDir: string;
  agentId: string;
  mode: AgentMode;
}

export interface ToolResult {
  output: string;
  metadata?: Record<string, unknown>;
  isError?: boolean;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse>;
  stream?(messages: LLMMessage[], options?: LLMChatOptions): AsyncGenerator<LLMStreamChunk>;
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface LLMStreamChunk {
  type: "text" | "tool_call" | "done";
  content?: string;
  tool_call?: { id: string; name: string; arguments: string };
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface SessionState {
  id: string;
  projectId: string;
  directory: string;
  title: string;
  version: number;
  agentMode: AgentMode;
  messageCount: number;
  parentSessionId?: string;
}

export interface MemoryEntry {
  id: string;
  path: string;
  scope: string;
  scopeId?: string;
  type: string;
  content: string | null;
  hash: string;
  timeCreated: number;
}

export interface TaskEntry {
  id: string;
  sessionId: string;
  parentTaskId?: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  description?: string;
  progressMd?: string;
}

export interface Goal {
  id: string;
  sessionId: string;
  description: string;
  status: "active" | "completed" | "failed";
  verificationCriteria: string[];
}

export interface Checkpoint {
  messageId: string;
  sessionId: string;
  summary: string;
  additions: number;
  deletions: number;
  files: string[];
  timestamp: number;
}



import type { AgentMode, LLMMessage, LLMResponse, LLMToolCall, ToolDefinition, ToolContext } from "../core/types.js";
import { createProvider } from "../providers/llm.js";
import { loadConfig, getAgentConfig } from "../config/index.js";

export interface AgentRunOptions {
  sessionId: string;
  projectId: string;
  workDir: string;
  agentMode: AgentMode;
  maxTurns?: number;
  onMessage?: (msg: LLMMessage) => void;
  onToolCall?: (call: LLMToolCall) => void;
  onToolResult?: (callId: string, result: string) => void;
}

export abstract class BaseAgent {
  protected provider: ReturnType<typeof createProvider>;
  protected mode: AgentMode;
  protected tools: Map<string, ToolDefinition> = new Map();
  protected history: LLMMessage[] = [];
  protected options: AgentRunOptions;
  protected turnCount = 0;
  protected maxTurns: number;

  constructor(options: AgentRunOptions) {
    this.options = options;
    this.mode = options.agentMode;
    this.maxTurns = options.maxTurns ?? 50;
    this.provider = createProvider(loadConfig().defaultProvider);
  }

  registerTool(tool: ToolDefinition) { this.tools.set(tool.name, tool); }
  registerTools(tools: ToolDefinition[]) { tools.forEach((t) => this.registerTool(t)); }
  protected abstract getSystemPrompt(): string;

  protected getToolSchemas() {
    return Array.from(this.tools.values()).map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  protected async checkPermission(toolName: string): Promise<boolean> {
    const agentConfig = getAgentConfig(this.mode);
    if (!agentConfig) return true;
    for (const rule of agentConfig.permissions) {
      const pattern = rule.pattern;
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      if (regex.test(toolName)) {
        if (rule.action === "deny") return false;
        return true;
      }
    }
    return true;
  }

  protected async executeTool(call: LLMToolCall): Promise<string> {
    const tool = this.tools.get(call.function.name);
    if (!tool) return `Error: Unknown tool '${call.function.name}'`;
    if (!await this.checkPermission(call.function.name)) return `Error: Permission denied for '${call.function.name}'`;
    let args: Record<string, unknown>;
    try { args = JSON.parse(call.function.arguments); } catch { return `Error: Invalid JSON for ${call.function.name}`; }
    const context: ToolContext = { sessionId: this.options.sessionId, projectId: this.options.projectId, workDir: this.options.workDir, agentId: this.mode, mode: this.mode };
    try {
      this.options.onToolCall?.(call);
      const result = await tool.execute(args, context);
      this.options.onToolResult?.(call.id, result.output);
      return result.output;
    } catch (err: any) { return `Error: ${err.message}`; }
  }

  protected buildMessages(): LLMMessage[] {
    return [{ role: "system", content: this.getSystemPrompt() }, ...this.history];
  }

  async run(userMessage: string): Promise<string> {
    this.history.push({ role: "user", content: userMessage });
    while (this.turnCount < this.maxTurns) {
      this.turnCount++;
      const response = await this.provider.chat(this.buildMessages(), {
        tools: this.getToolSchemas().length > 0 ? this.getToolSchemas() : undefined,
        temperature: 0.7, maxTokens: 4096,
      });
      if (!response.tool_calls || response.tool_calls.length === 0) {
        this.history.push({ role: "assistant", content: response.content });
        return response.content ?? "";
      }
      this.history.push({ role: "assistant", content: response.content || "", tool_calls: response.tool_calls });
      for (const call of response.tool_calls) {
        const result = await this.executeTool(call);
        this.history.push({ role: "tool", content: result, tool_call_id: call.id, name: call.function.name });
      }
    }
    return "Agent reached maximum turns.";
  }

  async *runStream(userMessage: string): AsyncGenerator<string> {
    this.history.push({ role: "user", content: userMessage });
    while (this.turnCount < this.maxTurns) {
      this.turnCount++;
      if (!this.provider.stream) { const r = await this.run(userMessage); yield r; return; }
      let fullContent = "";
      const toolCalls = new Map<string, { id: string; name: string; arguments: string }>();
      for await (const chunk of this.provider.stream(this.buildMessages(), { tools: this.getToolSchemas().length > 0 ? this.getToolSchemas() : undefined })) {
        if (chunk.type === "text" && chunk.content) { fullContent += chunk.content; yield chunk.content; }
        if (chunk.type === "tool_call" && chunk.tool_call) {
          const existing = toolCalls.get(chunk.tool_call.id);
          if (existing) existing.arguments += chunk.tool_call.arguments;
          else toolCalls.set(chunk.tool_call.id, { ...chunk.tool_call });
        }
      }
      if (toolCalls.size === 0) { this.history.push({ role: "assistant", content: fullContent }); return; }
      const calls: LLMToolCall[] = Array.from(toolCalls.values()).map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }));
      this.history.push({ role: "assistant", content: fullContent || "", tool_calls: calls });
      for (const call of calls) {
        const result = await this.executeTool(call);
        this.history.push({ role: "tool", content: result, tool_call_id: call.id, name: call.function.name });
        yield `\n[Tool: ${call.function.name}]\n${result}\n`;
      }
    }
  }

  getHistory() { return [...this.history]; }
  getTurnCount() { return this.turnCount; }
  getMode() { return this.mode; }
  reset() { this.history = []; this.turnCount = 0; }
}

import type { LLMProvider, LLMMessage, LLMResponse, LLMChatOptions, LLMStreamChunk } from "../core/types.js";
import { getProvider, type ProviderConfig } from "../config/index.js";

class OpenAICompatibleProvider implements LLMProvider {
  id: string;
  name: string;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.config.defaultModel ?? this.config.models[0];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      if (this.config.type === "anthropic") { headers["x-api-key"] = this.config.apiKey; headers["anthropic-version"] = "2023-06-01"; }
      else headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const body: Record<string, unknown> = { model, messages, temperature: options?.temperature ?? 0.7, max_tokens: options?.maxTokens ?? 4096 };
    if (options?.tools && options.tools.length > 0) { body.tools = options.tools; body.tool_choice = options.tool_choice ?? "auto"; }
    const endpoint = this.config.type === "anthropic" ? `${this.config.baseURL}/v1/messages` : `${this.config.baseURL}/chat/completions`;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) { const error = await response.text(); throw new Error(`LLM API error (${response.status}): ${error}`); }
    const data = await response.json() as any;
    if (this.config.type === "anthropic") {
      const content = data.content?.map((c: any) => c.text).join("") ?? "";
      const toolCalls = data.content?.filter((c: any) => c.type === "tool_use").map((c: any) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } }));
      return { content, tool_calls: toolCalls?.length ? toolCalls : undefined, model, usage: data.usage ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens, total_tokens: data.usage.input_tokens + data.usage.output_tokens } : undefined };
    }
    const choice = data.choices?.[0];
    return { content: choice?.message?.content ?? "", tool_calls: choice?.message?.tool_calls, model, usage: data.usage };
  }

  async *stream(messages: LLMMessage[], options?: LLMChatOptions): AsyncGenerator<LLMStreamChunk> {
    const model = options?.model ?? this.config.defaultModel ?? this.config.models[0];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    const body: Record<string, unknown> = { model, messages, stream: true, temperature: options?.temperature ?? 0.7, max_tokens: options?.maxTokens ?? 4096 };
    if (options?.tools?.length) { body.tools = options.tools; body.tool_choice = options.tool_choice ?? "auto"; }
    const response = await fetch(`${this.config.baseURL}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Stream error: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") { yield { type: "done" }; return; }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) yield { type: "text", content: delta.content };
          if (delta?.tool_calls) { for (const tc of delta.tool_calls) { yield { type: "tool_call", tool_call: { id: tc.id, name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" } }; } }
        } catch {}
      }
    }
  }
}

const providerCache = new Map<string, LLMProvider>();
export function createProvider(providerId: string): LLMProvider {
  const cached = providerCache.get(providerId);
  if (cached) return cached;
  const config = getProvider(providerId);
  if (!config) throw new Error(`Unknown provider: ${providerId}`);
  const provider = new OpenAICompatibleProvider(config);
  providerCache.set(providerId, provider);
  return provider;
}

export function listProviders(): string[] {
  const { loadConfig } = require("../config/index.js");
  const config = loadConfig();
  return config.providers.map((p: any) => `${p.id} (${p.name})`);
}

import path from "path";
import fs from "fs";
import os from "os";
import { z } from "zod";

export const ProviderConfigSchema = z.object({
  id: z.string(),
  type: z.enum(["openai", "anthropic", "custom"]),
  name: z.string(),
  baseURL: z.string(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).default([]),
  defaultModel: z.string().optional(),
});

export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  permissions: z.array(z.object({ pattern: z.string(), action: z.enum(["allow", "deny", "ask"]), always: z.boolean().optional() })).default([]),
});

export const OmAgentConfigSchema = z.object({
  version: z.string().default("0.1.0"),
  defaultProvider: z.string().default("mimo-free"),
  defaultModel: z.string().default("gpt-4o"),
  providers: z.array(ProviderConfigSchema).default([]),
  agents: z.record(z.string(), AgentConfigSchema).default({}),
  memory: z.object({
    enabled: z.boolean().default(true),
    maxTokens: z.number().default(8000),
    checkpointFrequency: z.number().default(10),
  }).default({ enabled: true, maxTokens: 8000, checkpointFrequency: 10 }),
  experimental: z.object({
    maxMode: z.boolean().default(false),
    parallelAgents: z.boolean().default(true),
  }).default({ maxMode: false, parallelAgents: true }),
});

export type OmAgentConfig = z.infer<typeof OmAgentConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) return path.join(xdgConfig, "omagent");
  return path.join(os.homedir(), ".config", "omagent");
}

function findProjectConfig(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const p = path.join(dir, ".omagent", "omagent.json");
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

function getDefaultProviders(): ProviderConfig[] {
  return [
    { id: "openai", type: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini"], defaultModel: "gpt-4o" },
    { id: "anthropic", type: "anthropic", name: "Anthropic", baseURL: "https://api.anthropic.com", models: ["claude-sonnet-4-20250514"], defaultModel: "claude-sonnet-4-20250514" },
    { id: "ollama", type: "openai", name: "Ollama (Local)", baseURL: "http://localhost:11434/v1", apiKey: "ollama", models: ["llama3.1"], defaultModel: "llama3.1" },
  ];
}

let _config: OmAgentConfig | null = null;

export function loadConfig(): OmAgentConfig {
  if (_config) return _config;
  let raw: Record<string, unknown> = {};
  const globalPath = path.join(getConfigDir(), "omagent.json");
  if (fs.existsSync(globalPath)) { try { raw = JSON.parse(fs.readFileSync(globalPath, "utf-8")); } catch {} }
  const projectPath = findProjectConfig();
  if (projectPath) { try { raw = { ...raw, ...JSON.parse(fs.readFileSync(projectPath, "utf-8")) }; } catch {} }
  if (!raw.providers || (raw.providers as any[]).length === 0) raw.providers = getDefaultProviders();
  _config = OmAgentConfigSchema.parse(raw);
  for (const p of _config!.providers) {
    if (!p.apiKey) { const k = `${p.id.toUpperCase().replace(/-/g, "_")}_API_KEY`; p.apiKey = process.env[k] ?? process.env.API_KEY; }
  }
  return _config!;
}

export function saveConfig(config: OmAgentConfig, global = false): void {
  const dir = global ? getConfigDir() : path.join(process.cwd(), ".omagent");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "omagent.json"), JSON.stringify(config, null, 2));
  _config = config;
}

export function getAgentConfig(name: string): AgentConfig | undefined { return loadConfig().agents[name]; }
export function getProvider(id: string): ProviderConfig | undefined { return loadConfig().providers.find((p) => p.id === id); }

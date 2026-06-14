import { BuildAgent } from "./build.js";
import { PlanAgent } from "./plan.js";
import { ComposeAgent } from "./compose.js";
import type { AgentMode, LLMMessage } from "../core/types.js";
import type { BaseAgent, AgentRunOptions } from "./base.js";

export interface OrchestratorOptions extends AgentRunOptions {}

export class AgentOrchestrator {
  private agents: Map<AgentMode, BaseAgent> = new Map();
  private currentMode: AgentMode;
  private options: AgentRunOptions;
  private subagents: Map<string, BaseAgent> = new Map();

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.currentMode = options.agentMode ?? "build";
  }

  private getAgent(mode: AgentMode): BaseAgent {
    let agent = this.agents.get(mode);
    if (!agent) {
      const opts: AgentRunOptions = { ...this.options, agentMode: mode };
      switch (mode) {
        case "build": agent = new BuildAgent(opts); break;
        case "plan": agent = new PlanAgent(opts); break;
        case "compose": agent = new ComposeAgent(opts); break;
      }
      this.agents.set(mode, agent!);
    }
    return agent!;
  }

  switchMode(mode: AgentMode) { this.currentMode = mode; }
  getCurrentMode() { return this.currentMode; }
  async run(message: string) { return this.getAgent(this.currentMode).run(message); }
  async *runStream(message: string) { yield* this.getAgent(this.currentMode).runStream(message); }

  async spawnSubagent(type: AgentMode, prompt: string, description: string): Promise<string> {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const subOpts: AgentRunOptions = { ...this.options, agentMode: type, sessionId: `${this.options.sessionId}/${id}` };
    let agent: BaseAgent;
    switch (type) { case "build": agent = new BuildAgent(subOpts); break; case "plan": agent = new PlanAgent(subOpts); break; case "compose": agent = new ComposeAgent(subOpts); break; default: throw new Error(`Unknown agent type: ${type}`); }
    this.subagents.set(id, agent);
    const result = await agent.run(prompt);
    return `[Subagent ${id} (${description})]\n${result}`;
  }

  getHistory(): LLMMessage[] { return this.getAgent(this.currentMode).getHistory(); }
  getSubagentIds() { return Array.from(this.subagents.keys()); }
}

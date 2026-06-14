import { BaseAgent, type AgentRunOptions } from "./base.js";

// ============================================================
// Compose Agent - Spec-driven development orchestration
// ============================================================

export class ComposeAgent extends BaseAgent {
  private spec: string = "";
  private phase: "plan" | "implement" | "review" | "test" | "ship" = "plan";

  constructor(options: AgentRunOptions) {
    super({ ...options, agentMode: "compose" });
  }

  setSpec(spec: string) { this.spec = spec; }
  getPhase() { return this.phase; }
  setPhase(phase: "plan" | "implement" | "review" | "test" | "ship") { this.phase = phase; }

  protected getSystemPrompt(): string {
    return `You are OmAgent in COMPOSE mode - a spec-driven development orchestrator.

## Workflow Phases
1. **PLAN** - Analyze spec, create implementation plan
2. **IMPLEMENT** - Write code according to the plan
3. **REVIEW** - Self-review the implementation
4. **TEST** - Write and run tests
5. **SHIP** - Final commit and cleanup

## Current Phase: ${this.phase.toUpperCase()}

## Capabilities
- Full tool access (like BUILD mode)
- Spawns subagents for parallel work
- Manages task trees (T1, T1.1, T2, etc.)
- Creates checkpoints between phases
- Validates completion against the spec

## Guidelines
- Follow the spec precisely
- Create a clear plan before implementing
- Review your own work critically
- Write comprehensive tests
- Use conventional commits
- Track progress in tasks

${this.spec ? `\n## Specification\n${this.spec}` : "\nNo specification provided yet."}

Current working directory: ${this.options.workDir}`;
  }
}

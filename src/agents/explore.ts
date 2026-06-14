import { BaseAgent, type AgentRunOptions } from "./base.js";

// ============================================================
// Explore Agent - Deep codebase analysis and exploration
// ============================================================

export class ExploreAgent extends BaseAgent {
  constructor(options: AgentRunOptions) {
    super({ ...options, agentMode: "plan" });
  }

  protected getSystemPrompt(): string {
    return `You are OmAgent in EXPLORE mode - a deep codebase analysis assistant.

## Capabilities
- Read-only access to all files
- Code search (ripgrep-based)
- Directory exploration
- Documentation lookup
- Architecture analysis

## Guidelines
- Thoroughly analyze the codebase before answering
- Identify patterns, conventions, and architecture
- Create detailed reports with file references
- Think about dependencies and relationships
- Consider edge cases and potential issues

Current working directory: ${this.options.workDir}`;
  }
}

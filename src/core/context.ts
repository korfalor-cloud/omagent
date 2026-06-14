import type { LLMMessage, MemoryEntry } from "./types.js";
import { memoryManager } from "../memory/index.js";

// ============================================================
// Context Manager - Intelligent context window management
// ============================================================

export interface ContextBudget {
  maxTokens: number;
  systemPromptTokens: number;
  memoryTokens: number;
  historyTokens: number;
  reservedTokens: number;
}

export class ContextManager {
  private budget: ContextBudget;

  constructor(maxTokens = 128000) {
    this.budget = {
      maxTokens,
      systemPromptTokens: 0,
      memoryTokens: Math.floor(maxTokens * 0.15), // 15% for memory
      historyTokens: Math.floor(maxTokens * 0.6), // 60% for history
      reservedTokens: Math.floor(maxTokens * 0.1), // 10% reserved for response
    };
  }

  // ── Estimate token count (rough: 1 token ≈ 4 chars) ─
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ── Build context with budget management ───────────
  async buildContext(
    systemPrompt: string,
    history: LLMMessage[],
    sessionId: string,
    projectId?: string
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];
    let remaining = this.budget.maxTokens - this.budget.reservedTokens;

    // 1. System prompt (always included)
    const sysTokens = this.estimateTokens(systemPrompt);
    messages.push({ role: "system", content: systemPrompt });
    remaining -= sysTokens;

    // 2. Memory context (ranked by importance)
    const memoryBudget = Math.min(this.budget.memoryTokens, remaining);
    const memoryContext = await this.buildMemoryContext(sessionId, projectId, memoryBudget);
    if (memoryContext) {
      messages.push({ role: "system", content: memoryContext });
      remaining -= this.estimateTokens(memoryContext);
    }

    // 3. History (fit as much as possible, most recent first)
    const historyBudget = Math.min(this.budget.historyTokens, remaining);
    const fittedHistory = this.fitHistory(history, historyBudget);
    messages.push(...fittedHistory);

    return messages;
  }

  // ── Build memory context ───────────────────────────
  private async buildMemoryContext(
    sessionId: string,
    projectId?: string,
    budget?: number
  ): Promise<string | null> {
    const parts: string[] = [];

    // Search for relevant memories
    const memories = await memoryManager.search("project architecture decision", {
      scope: "project",
      limit: 5,
    });

    if (memories.length > 0) {
      parts.push("## Project Memory");
      for (const m of memories) {
        parts.push(`- [${m.type}] ${m.content.slice(0, 200)}`);
      }
    }

    // Recent checkpoints
    const checkpoints = await memoryManager.search("checkpoint", {
      scope: "session",
      scopeId: sessionId,
      limit: 3,
    });

    if (checkpoints.length > 0) {
      parts.push("\n## Recent Checkpoints");
      for (const c of checkpoints) {
        parts.push(`- ${c.content.slice(0, 200)}`);
      }
    }

    if (parts.length === 0) return null;

    const result = parts.join("\n");
    if (budget && this.estimateTokens(result) > budget) {
      return result.slice(0, budget * 4); // Truncate to fit
    }
    return result;
  }

  // ── Fit history into budget ─────────────────────────
  private fitHistory(history: LLMMessage[], budget: number): LLMMessage[] {
    const fitted: LLMMessage[] = [];
    let tokensUsed = 0;

    // Start from most recent messages
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = this.estimateTokens(msg.content ?? "");
      if (tokensUsed + msgTokens > budget) break;
      fitted.unshift(msg);
      tokensUsed += msgTokens;
    }

    return fitted;
  }

  // ── Get budget info ────────────────────────────────
  getBudget(): ContextBudget { return { ...this.budget }; }
  setMaxTokens(max: number) {
    this.budget.maxTokens = max;
    this.budget.memoryTokens = Math.floor(max * 0.15);
    this.budget.historyTokens = Math.floor(max * 0.6);
    this.budget.reservedTokens = Math.floor(max * 0.1);
  }
}

export const contextManager = new ContextManager();

import { createProvider } from "../providers/llm.js";
import { loadConfig } from "../config/index.js";
import type { LLMMessage } from "./types.js";
import crypto from "crypto";

export interface GoalState {
  id: string; sessionId: string; description: string;
  status: "active" | "completed" | "failed";
  verificationCriteria: string[]; createdAt: number;
}

const activeGoals = new Map<string, GoalState>();

export function createGoal(sessionId: string, description: string, criteria: string[]): GoalState {
  const goal: GoalState = { id: crypto.randomUUID(), sessionId, description, status: "active", verificationCriteria: criteria, createdAt: Date.now() };
  activeGoals.set(goal.id, goal);
  return goal;
}

export async function evaluateGoal(goalId: string, conversationHistory: LLMMessage[]): Promise<{ achieved: boolean; reason: string }> {
  const goal = activeGoals.get(goalId);
  if (!goal) return { achieved: false, reason: "Goal not found" };
  const config = loadConfig();
  const provider = createProvider(config.defaultProvider);
  const judgePrompt: LLMMessage[] = [
    { role: "system", content: `You are a judge. Goal: ${goal.description}\nCriteria: ${goal.verificationCriteria.map((c, i) => `${i+1}. ${c}`).join("\n")}\nRespond with JSON: {"achieved": boolean, "reason": "..."}` },
    { role: "user", content: `Has this goal been achieved?\n\nRecent: ${conversationHistory.slice(-5).map((m) => `${m.role}: ${(m.content ?? "").slice(0, 200)}`).join("\n")}` },
  ];
  try {
    const response = await provider.chat(judgePrompt, { temperature: 0.1 });
    const parsed = JSON.parse(response.content ?? "{}");
    goal.status = parsed.achieved ? "completed" : "active";
    return { achieved: parsed.achieved, reason: parsed.reason };
  } catch { return { achieved: false, reason: "Failed to evaluate goal" }; }
}

export function getGoal(goalId: string) { return activeGoals.get(goalId); }
export function listActiveGoals(sessionId?: string) { return Array.from(activeGoals.values()).filter((g) => g.status === "active" && (!sessionId || g.sessionId === sessionId)); }

import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { memoryManager } from "../memory/index.js";
import { createProvider } from "../providers/llm.js";
import { loadConfig } from "../config/index.js";
import type { LLMMessage } from "./types.js";

export interface CompactionResult {
  originalMessages: number;
  compressedMessages: number;
  summary: string;
  tokensSaved: number;
}

export async function compactSession(sessionId: string): Promise<CompactionResult> {
  const db = getDb();
  const messages = db.select().from(schema.message)
    .where(eq(schema.message.session_id, sessionId)).all() as any[];

  if (messages.length < 20) {
    return { originalMessages: messages.length, compressedMessages: messages.length, summary: "No compaction needed", tokensSaved: 0 };
  }

  const splitIndex = Math.floor(messages.length * 0.6);
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  const config = loadConfig();
  const provider = createProvider(config.defaultProvider);

  const conversationText = oldMessages
    .map((m) => `[${m.agent_id}]: ${(typeof m.data === 'object' ? JSON.stringify(m.data) : String(m.data)).slice(0, 200)}`)
    .join("\n");

  const summaryResponse = await provider.chat([
    { role: "system", content: "Summarize this conversation concisely. Focus on key decisions, actions taken, and current state. Keep it under 500 tokens." },
    { role: "user", content: conversationText.slice(0, 8000) },
  ], { temperature: 0.3, maxTokens: 1000 });

  const summary = summaryResponse.content ?? "";

  await memoryManager.store({
    path: "checkpoint.md",
    scope: "session",
    scopeId: sessionId,
    type: "checkpoint",
    content: summary,
  });

  db.update(schema.session)
    .set({ time_compacting: Date.now(), time_updated: Date.now() } as any)
    .where(eq(schema.session.id, sessionId)).run();

  const originalTokens = Math.ceil(JSON.stringify(messages).length / 4);
  const compressedTokens = Math.ceil(JSON.stringify(recentMessages).length / 4) + Math.ceil(summary.length / 4);

  return {
    originalMessages: messages.length,
    compressedMessages: recentMessages.length + 1,
    summary,
    tokensSaved: Math.max(0, originalTokens - compressedTokens),
  };
}

export function shouldCompact(messageCount: number, lastCompaction?: number): boolean {
  if (messageCount < 50) return false;
  if (!lastCompaction) return true;
  const hoursSince = (Date.now() - lastCompaction) / (1000 * 60 * 60);
  return hoursSince > 2;
}

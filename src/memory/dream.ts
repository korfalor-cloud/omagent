import { memoryManager } from "./index.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface DreamResult {
  extracted: number; pruned: number;
  memories: Array<{ path: string; content: string; type: string }>;
}

export async function dream(sessionId: string): Promise<DreamResult> {
  const db = getDb();
  const messages = db.select().from(schema.message).where(eq(schema.message.session_id, sessionId)).all() as any[];
  const result: DreamResult = { extracted: 0, pruned: 0, memories: [] };
  const conversationText = messages.map((m) => `[${m.agent_id}]: ${JSON.stringify(m.data)}`).join("\n");

  const archPattern = /(?:architecture|design|pattern|structure|setup|configured)/gi;
  const archMatches = conversationText.match(archPattern);
  if (archMatches && archMatches.length > 2) {
    const content = `Architecture patterns: ${archMatches.slice(0, 5).join(", ")}`;
    await memoryManager.store({ path: "MEMORY.md", scope: "project", type: "architecture", content });
    result.extracted++;
    result.memories.push({ path: "MEMORY.md", content, type: "architecture" });
  }

  const decisionPattern = /(?:decided|chose|selected|going with|will use|prefer)/gi;
  const decisionMatches = conversationText.match(decisionPattern);
  if (decisionMatches && decisionMatches.length > 2) {
    const content = `Decisions made: ${decisionMatches.slice(0, 5).join(", ")}`;
    await memoryManager.store({ path: "MEMORY.md", scope: "project", type: "decision", content });
    result.extracted++;
    result.memories.push({ path: "MEMORY.md", content, type: "decision" });
  }

  const summary = `Session ${sessionId}: ${messages.length} messages exchanged`;
  await memoryManager.store({ path: "checkpoint.md", scope: "session", scopeId: sessionId, type: "checkpoint", content: summary });
  result.extracted++;
  result.memories.push({ path: "checkpoint.md", content: summary, type: "checkpoint" });

  const compact = await memoryManager.compact("project");
  result.pruned = compact.removed;
  return result;
}

export async function distill(sessionId: string): Promise<{ skills: number; content: string }> {
  const db = getDb();
  const messages = db.select().from(schema.message).where(eq(schema.message.session_id, sessionId)).all() as any[];
  const toolCalls: Record<string, number> = {};
  for (const msg of messages) {
    const data = msg.data as any;
    if (data.tool_calls) { for (const tc of data.tool_calls) { toolCalls[tc.name] = (toolCalls[tc.name] ?? 0) + 1; } }
  }
  const skills = Object.entries(toolCalls).filter(([_, count]) => count >= 3).map(([name, count]) => `Skill: ${name} (used ${count} times)`);
  const content = skills.length > 0 ? `\n## Distilled Skills\n${skills.join("\n")}` : "No repeated patterns found.";
  if (skills.length > 0) await memoryManager.store({ path: "skills.md", scope: "project", type: "note", content });
  return { skills: skills.length, content };
}

import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { memoryManager } from "../memory/index.js";
import crypto from "crypto";

export interface CheckpointConfig { frequency: number; maxCheckpoints: number; }
const defaultConfig: CheckpointConfig = { frequency: 10, maxCheckpoints: 50 };
let messageCounter = 0;
let lastCheckpointId: string | null = null;

export function shouldCheckpoint(config?: Partial<CheckpointConfig>): boolean {
  const freq = config?.frequency ?? defaultConfig.frequency;
  messageCounter++;
  return messageCounter % freq === 0;
}

export async function createCheckpoint(sessionId: string, messages: Array<{ role: string; content: string | null; tool_calls?: any[] }>): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const recentMessages = messages.slice(-10);
  const summary = recentMessages.map((m) => `[${m.role}]: ${(m.content ?? "(tool call)").slice(0, 100)}`).join("\n");
  let additions = 0;
  const files = new Set<string>();
  for (const msg of recentMessages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.name === "write_file" || tc.name === "edit_file") {
          additions++;
          try { const args = JSON.parse(tc.arguments); if (args.path) files.add(args.path); } catch {}
        }
      }
    }
  }
  const db = getDb();
  db.insert(schema.part).values({
    id, message_id: lastCheckpointId ?? "", session_id: sessionId,
    data: { type: "checkpoint", snapshot: summary },
    time_created: now, time_updated: now,
  }).run();
  await memoryManager.store({ path: "checkpoint.md", scope: "session", scopeId: sessionId, type: "checkpoint", content: summary });
  lastCheckpointId = id;
  return id;
}

export function resetCheckpointCounter(): void { messageCounter = 0; lastCheckpointId = null; }
export function getCheckpointFrequency(): number { return defaultConfig.frequency; }

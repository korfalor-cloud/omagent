import { getDb, initFts5 } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export type MemoryScope = "project" | "session" | "global";
export type MemoryType = "architecture" | "decision" | "rule" | "note" | "checkpoint" | "task_progress";

export interface MemorySearchResult {
  id: string; path: string; scope: string; type: string; content: string; rank: number;
}

export class MemoryManager {
  private db = getDb();
  constructor() { initFts5(this.db); }

  async store(entry: { path: string; scope: MemoryScope; scopeId?: string; type: MemoryType; content: string }): Promise<string> {
    const id = crypto.randomUUID();
    const hash = crypto.createHash("sha256").update(entry.content).digest("hex").slice(0, 16);
    this.db.insert(schema.memory).values({
      id, path: entry.path, scope: entry.scope, scope_id: entry.scopeId,
      type: entry.type, content: entry.content, hash, time_created: Date.now(),
    }).onConflictDoNothing().run();
    const raw = (this.db as any).$client;
    try {
      raw.prepare(`INSERT INTO memory_fts (id, path, scope, scope_id, type, content) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, entry.path, entry.scope, entry.scopeId ?? null, entry.type, entry.content);
    } catch {}
    return id;
  }

  async search(query: string, options?: { scope?: MemoryScope; scopeId?: string; type?: MemoryType; limit?: number }): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 10;
    const raw = (this.db as any).$client;
    let sql = `SELECT m.* FROM memory m INNER JOIN memory_fts f ON m.id = f.id WHERE f MATCH ?`;
    const params: unknown[] = [query];
    if (options?.scope) { sql += ` AND scope = ?`; params.push(options.scope); }
    if (options?.scopeId) { sql += ` AND scope_id = ?`; params.push(options.scopeId); }
    if (options?.type) { sql += ` AND type = ?`; params.push(options.type); }
    sql += ` LIMIT ?`; params.push(limit);
    try {
      const rows = raw.prepare(sql).all(...params) as any[];
      return rows.map((r) => ({ id: r.id, path: r.path, scope: r.scope, type: r.type, content: r.content, rank: 0 }));
    } catch { return []; }
  }

  async delete(id: string): Promise<void> {
    this.db.delete(schema.memory).where(eq(schema.memory.id, id)).run();
    const raw = (this.db as any).$client;
    try { raw.prepare(`DELETE FROM memory_fts WHERE id = ?`).run(id); } catch {}
  }

  async list(scope?: MemoryScope, scopeId?: string): Promise<MemorySearchResult[]> {
    let rows: any[];
    if (scope && scopeId) rows = this.db.select().from(schema.memory).where(eq(schema.memory.scope, scope)).all();
    else if (scope) rows = this.db.select().from(schema.memory).where(eq(schema.memory.scope, scope)).all();
    else rows = this.db.select().from(schema.memory).all();
    return rows.map((r: any) => ({ id: r.id, path: r.path, scope: r.scope, type: r.type, content: r.content, rank: 0 }));
  }

  async compact(scope?: MemoryScope): Promise<{ removed: number; merged: number }> {
    const memories = await this.list(scope);
    const byHash = new Map<string, typeof memories>();
    for (const m of memories) {
      const hash = crypto.createHash("sha256").update(m.content).digest("hex").slice(0, 16);
      const existing = byHash.get(hash) ?? [];
      existing.push(m);
      byHash.set(hash, existing);
    }
    let removed = 0;
    for (const [, entries] of byHash) {
      if (entries.length > 1) { for (let i = 1; i < entries.length; i++) { await this.delete(entries[i].id); removed++; } }
    }
    return { removed, merged: 0 };
  }
}

export const memoryManager = new MemoryManager();

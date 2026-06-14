import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import path from "path";

export interface SessionOptions { projectId?: string; title?: string; directory?: string; parentSessionId?: string; }

export class SessionManager {
  private db = getDb();

  create(options?: SessionOptions): string {
    const sessionId = crypto.randomUUID();
    const workDir = options?.directory ?? process.cwd();
    const projectId = options?.projectId ?? this.getOrCreateProject(workDir);
    this.db.insert(schema.session).values({
      id: sessionId, project_id: projectId, parent_id: options?.parentSessionId,
      slug: sessionId.slice(0, 8), directory: workDir,
      title: options?.title ?? `Session ${new Date().toISOString()}`,
      version: "0.1.0", time_created: Date.now(), time_updated: Date.now(),
    }).run();
    return sessionId;
  }

  private getOrCreateProject(workDir: string): string {
    const existing = this.db.select().from(schema.project).where(eq(schema.project.worktree, workDir)).get();
    if (existing) return existing.id;
    const projectId = crypto.randomUUID();
    this.db.insert(schema.project).values({
      id: projectId, worktree: workDir, vcs: "git", name: path.basename(workDir),
      time_created: Date.now(), time_updated: Date.now(), sandboxes: [],
    }).run();
    return projectId;
  }

  addMessage(sessionId: string, agentId: string, data: any): string {
    const messageId = crypto.randomUUID();
    this.db.insert(schema.message).values({
      id: messageId, session_id: sessionId, agent_id: agentId, data,
      time_created: Date.now(), time_updated: Date.now(),
    }).run();
    return messageId;
  }

  addPart(messageId: string, sessionId: string, data: any): string {
    const partId = crypto.randomUUID();
    this.db.insert(schema.part).values({
      id: partId, message_id: messageId, session_id: sessionId, data,
      time_created: Date.now(), time_updated: Date.now(),
    }).run();
    return partId;
  }

  setTodos(sessionId: string, todos: Array<{ content: string; status: string; position: number }>): void {
    this.db.delete(schema.todo).where(eq(schema.todo.session_id, sessionId)).run();
    for (const t of todos) {
      this.db.insert(schema.todo).values({
        session_id: sessionId, content: t.content, status: t.status, position: t.position,
        time_created: Date.now(), time_updated: Date.now(),
      }).run();
    }
  }

  getMessages(sessionId: string): Array<any> {
    return this.db.select().from(schema.message).where(eq(schema.message.session_id, sessionId)).all().map((r: any) => ({ ...r.data, id: r.id, agent_id: r.agent_id }));
  }

  createCheckpoint(sessionId: string, messageId: string, summary: string): void {
    this.db.insert(schema.part).values({
      id: crypto.randomUUID(), message_id: messageId, session_id: sessionId,
      data: { type: "checkpoint", snapshot: summary },
      time_created: Date.now(), time_updated: Date.now(),
    }).run();
  }

  listSessions(projectId?: string): any[] {
    if (projectId) return this.db.select().from(schema.session).where(eq(schema.session.project_id, projectId)).all();
    return this.db.select().from(schema.session).all();
  }

  getSession(sessionId: string) { return this.db.select().from(schema.session).where(eq(schema.session.id, sessionId)).get(); }
  archive(sessionId: string) { this.db.update(schema.session).set({ time_archived: Date.now(), time_updated: Date.now() } as any).where(eq(schema.session.id, sessionId)).run(); }
}

export const sessionManager = new SessionManager();

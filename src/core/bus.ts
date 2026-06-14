// ============================================================
// Event Bus - Internal event distribution
// ============================================================

type EventHandler = (...args: any[]) => void;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private onceHandlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  once(event: string, handler: EventHandler): () => void {
    if (!this.onceHandlers.has(event)) this.onceHandlers.set(event, new Set());
    this.onceHandlers.get(event)!.add(handler);
    return () => this.onceHandlers.get(event)?.delete(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((h) => h(...args));
    this.onceHandlers.get(event)?.forEach((h) => h(...args));
    this.onceHandlers.delete(event);
  }

  removeAllListeners(event?: string): void {
    if (event) { this.handlers.delete(event); this.onceHandlers.delete(event); }
    else { this.handlers.clear(); this.onceHandlers.clear(); }
  }
}

export const eventBus = new EventBus();

// Event types
export type OmAgentEvents = {
  "session:created": { sessionId: string };
  "session:message": { sessionId: string; role: string };
  "session:checkpoint": { sessionId: string; messageId: string };
  "agent:started": { agentId: string; mode: string };
  "agent:completed": { agentId: string; result: string };
  "agent:error": { agentId: string; error: string };
  "tool:executing": { toolName: string; args: Record<string, unknown> };
  "tool:completed": { toolName: string; result: string };
  "memory:stored": { id: string; scope: string };
  "memory:searched": { query: string; results: number };
};

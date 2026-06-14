import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations, eq, sql } from "drizzle-orm";

const timestamps = {
  time_created: integer("time_created").notNull().$defaultFn(() => Date.now()),
  time_updated: integer("time_updated").notNull().$defaultFn(() => Date.now()),
};

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  worktree: text("worktree").notNull(),
  vcs: text("vcs"),
  name: text("name"),
  icon_url: text("icon_url"),
  icon_color: text("icon_color"),
  time_initialized: integer("time_initialized"),
  sandboxes: text("sandboxes", { mode: "json" }).notNull().$type<string[]>().default([]),
  commands: text("commands", { mode: "json" }).$type<Record<string, string>>(),
  ...timestamps,
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  project_id: text("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  workspace_id: text("workspace_id"),
  parent_id: text("parent_id"),
  context_from: text("context_from"),
  context_watermark: text("context_watermark"),
  slug: text("slug").notNull(),
  directory: text("directory").notNull(),
  title: text("title").notNull(),
  version: text("version").notNull(),
  share_url: text("share_url"),
  summary_additions: integer("summary_additions"),
  summary_deletions: integer("summary_deletions"),
  summary_files: integer("summary_files"),
  summary_diffs: text("summary_diffs", { mode: "json" }).$type<string[]>(),
  revert: text("revert", { mode: "json" }).$type<Record<string, unknown>>(),
  permission: text("permission", { mode: "json" }).$type<Record<string, unknown>>(),
  time_compacting: integer("time_compacting"),
  time_archived: integer("time_archived"),
  last_checkpoint_message_id: text("last_checkpoint_message_id"),
  ...timestamps,
});

export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  agent_id: text("agent_id").notNull().default("main"),
  data: text("data", { mode: "json" }).notNull().$type<MessageData>(),
  ...timestamps,
});

export const part = sqliteTable("part", {
  id: text("id").primaryKey(),
  message_id: text("message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
  session_id: text("session_id").notNull(),
  data: text("data", { mode: "json" }).notNull().$type<PartData>(),
  ...timestamps,
});

export const todo = sqliteTable("todo", {
  session_id: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: text("status").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
});

export const permission = sqliteTable("permission", {
  project_id: text("project_id").primaryKey().references(() => project.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().$type<PermissionData>(),
  ...timestamps,
});

export const sessionShare = sqliteTable("session_share", {
  session_id: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  secret: text("secret").notNull(),
  url: text("url").notNull(),
  ...timestamps,
});

export const memory = sqliteTable("memory", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  scope: text("scope").notNull(),
  scope_id: text("scope_id"),
  type: text("type").notNull(),
  content: text("content").notNull(),
  hash: text("hash").notNull(),
  time_created: integer("time_created").notNull().$defaultFn(() => Date.now()),
});

export const agentTable = sqliteTable("agent", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  agent_type: text("agent_type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("idle"),
  parent_id: text("parent_id"),
  prompt: text("prompt"),
  result: text("result"),
  turn_count: integer("turn_count").default(0),
  time_started: integer("time_started"),
  time_completed: integer("time_completed"),
  last_error: text("last_error"),
  ...timestamps,
});

export const task = sqliteTable("task", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
  parent_task_id: text("parent_task_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  description: text("description"),
  progress_md: text("progress_md"),
  ...timestamps,
});

type MessageData = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; timestamp?: number; };
type PartData = { type: string; content?: string; [key: string]: unknown; };
type TodoItem = { content: string; status: string; position: number; };
type PermissionData = { rules: Array<{ pattern: string; action: string; always?: boolean }> };

export const projectRelations = relations(project, ({ many }) => ({ sessions: many(session) }));
export const sessionRelations = relations(session, ({ one, many }) => ({
  project: one(project, { fields: [session.project_id], references: [project.id] }),
  messages: many(message),
  todos: many(todo),
}));
export const messageRelations = relations(message, ({ one, many }) => ({
  session: one(session, { fields: [message.session_id], references: [session.id] }),
  parts: many(part),
}));
export const partRelations = relations(part, ({ one }) => ({
  message: one(message, { fields: [part.message_id], references: [message.id] }),
}));

import * as schema from "../db/schema.js";
import { getDb } from "../db/index.js";
import { eq } from "drizzle-orm";

// ============================================================
// Permission System - Tool execution permissions
// ============================================================

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  pattern: string;
  action: PermissionAction;
  always?: boolean;
  description?: string;
}

export interface PermissionSet {
  projectId: string;
  rules: PermissionRule[];
}

const defaultRules: PermissionRule[] = [
  { pattern: "read_file", action: "allow", description: "Read files" },
  { pattern: "list_directory", action: "allow", description: "List directories" },
  { pattern: "search_code", action: "allow", description: "Search code" },
  { pattern: "find_file", action: "allow", description: "Find files" },
  { pattern: "git_status", action: "allow", description: "Git status" },
  { pattern: "git_diff", action: "allow", description: "Git diff" },
  { pattern: "git_log", action: "allow", description: "Git log" },
  { pattern: "git_branch", action: "allow", description: "Git branch" },
  { pattern: "write_file", action: "ask", description: "Write files" },
  { pattern: "edit_file", action: "ask", description: "Edit files" },
  { pattern: "delete_file", action: "ask", description: "Delete files" },
  { pattern: "run_command", action: "ask", description: "Run commands" },
  { pattern: "git_commit", action: "ask", description: "Git commit" },
  { pattern: "git_push", action: "ask", description: "Git push" },
];

export class PermissionManager {
  private db = getDb();

  getPermissions(projectId: string): PermissionSet {
    const existing = this.db.select().from(schema.permission)
      .where(eq(schema.permission.project_id, projectId)).get() as any;
    if (existing) {
      return { projectId, rules: existing.data?.rules ?? defaultRules };
    }
    return { projectId, rules: defaultRules };
  }

  setPermissions(projectId: string, rules: PermissionRule[]): void {
    const existing = this.db.select().from(schema.permission)
      .where(eq(schema.permission.project_id, projectId)).get();
    if (existing) {
      this.db.update(schema.permission).set({ data: { rules } as any, time_updated: Date.now() } as any)
        .where(eq(schema.permission.project_id, projectId)).run();
    } else {
      this.db.insert(schema.permission).values({
        project_id: projectId, data: { rules } as any,
        time_created: Date.now(), time_updated: Date.now(),
      }).run();
    }
  }

  checkPermission(projectId: string, toolName: string, mode: string): PermissionAction {
    const perms = this.getPermissions(projectId);
    for (const rule of perms.rules) {
      const regex = new RegExp("^" + rule.pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      if (regex.test(toolName)) {
        // Mode-specific overrides
        if (mode === "plan" && (toolName.startsWith("write") || toolName.startsWith("edit") || toolName.startsWith("delete") || toolName.startsWith("run"))) {
          return "deny";
        }
        return rule.action;
      }
    }
    return "ask";
  }

  addRule(projectId: string, rule: PermissionRule): void {
    const perms = this.getPermissions(projectId);
    perms.rules.push(rule);
    this.setPermissions(projectId, perms.rules);
  }

  removeRule(projectId: string, pattern: string): void {
    const perms = this.getPermissions(projectId);
    perms.rules = perms.rules.filter((r) => r.pattern !== pattern);
    this.setPermissions(projectId, perms.rules);
  }
}

export const permissionManager = new PermissionManager();

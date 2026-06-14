import fs from "fs";
import path from "path";
import os from "os";
import type { ToolDefinition } from "./types.js";

export interface Skill {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
  path: string;
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private dirs: string[] = [];

  constructor() {
    this.dirs = [
      path.join(process.cwd(), ".omagent", "skills"),
      path.join(os.homedir(), ".config", "omagent", "skills"),
    ];
    this.loadAll();
  }

  private loadAll(): void {
    for (const dir of this.dirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dir, entry.name, "SKILL.md");
          if (fs.existsSync(skillPath)) this.loadSkill(skillPath, entry.name);
        } else if (entry.name.endsWith(".md")) {
          this.loadSkill(path.join(dir, entry.name), entry.name.replace(".md", ""));
        }
      }
    }
  }

  private loadSkill(filePath: string, name: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let prompt = content;
      let description = "";
      const fmRegex = new RegExp("^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n([\\s\\S]*)$");
      const fmMatch = content.match(fmRegex);
      if (fmMatch) {
        const fm = fmMatch[1];
        prompt = fmMatch[2];
        const dm = fm.match(/description:\\s*(.+)/);
        if (dm) description = dm[1].trim();
      }
      this.skills.set(name, { name, description, prompt, path: filePath });
    } catch {}
  }

  get(name: string): Skill | undefined { return this.skills.get(name); }
  list(): Skill[] { return Array.from(this.skills.values()); }
  names(): string[] { return Array.from(this.skills.keys()); }

  registerTool(skill: Skill): ToolDefinition {
    return {
      name: `skill_${skill.name}`,
      description: `Execute skill: ${skill.description || skill.name}`,
      parameters: { type: "object", properties: { input: { type: "string", description: "Input for the skill" } } },
      execute: async (args) => ({ output: `Skill ${skill.name} executed.\nPrompt: ${skill.prompt.slice(0, 200)}` }),
    };
  }
}

export const skillManager = new SkillManager();

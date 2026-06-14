#!/usr/bin/env node
import { AgentOrchestrator } from "../agents/orchestrator.js";
import { sessionManager } from "../session/index.js";
import { loadConfig, saveConfig } from "../config/index.js";
import { getAllTools, setOrchestrator } from "../tools/index.js";
import { createGoal, listActiveGoals } from "../core/goal.js";
import { dream, distill } from "../memory/dream.js";
import { initDb, runMigrations } from "../db/index.js";
import type { AgentMode } from "../core/types.js";
import readline from "readline";

// ============================================================
// OmAgent CLI - Terminal-native AI coding agent
// ============================================================

const VERSION = "0.1.0";
const BANNER = `
  ╔══════════════════════════════════════╗
  ║        🤖 OmAgent v${VERSION}            ║
  ║  Terminal-Native AI Coding Agent     ║
  ║  Persistent Memory · Auto Workflows  ║
  ╚══════════════════════════════════════╝
`;

const HELP = `
Usage: omagent [command] [options]

Commands:
  (no command)     Start interactive chat
  init             Initialize OmAgent in current project
  config           Show/edit configuration
  sessions         List past sessions
  dream            Extract knowledge from session
  distill          Package repeated workflows as skills
  goal             Set/evaluate goals
  tools            List available tools
  version          Show version

Options:
  --mode <mode>    Agent mode: build, plan, compose (default: build)
  --provider <id>  LLM provider ID
  --model <name>   Model name
  --session <id>   Resume a specific session
  --help           Show this help

Examples:
  omagent                      # Start interactive chat
  omagent --mode plan          # Start in plan mode
  omagent dream <session-id>   # Extract knowledge
  omagent config               # Show configuration
`;

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let mode: AgentMode = "build";
  let provider: string | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  let command: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mode" && args[i + 1]) { mode = args[++i] as AgentMode; }
    else if (arg === "--provider" && args[i + 1]) { provider = args[++i]; }
    else if (arg === "--model" && args[i + 1]) { model = args[++i]; }
    else if (arg === "--session" && args[i + 1]) { sessionId = args[++i]; }
    else if (arg === "--help" || arg === "-h") { console.log(HELP); return; }
    else if (!arg.startsWith("--")) { command = arg; }
  }

  // Initialize database
  const db = initDb();
  runMigrations(db);

  // Load config
  const config = loadConfig();
  if (provider) config.defaultProvider = provider;
  if (model) config.defaultModel = model;

  switch (command) {
    case "version":
      console.log(`OmAgent v${VERSION}`);
      return;

    case "init":
      console.log("Initializing OmAgent in current directory...");
      saveConfig(config);
      console.log("✓ Created .omagent/omagent.json");
      console.log("✓ Database initialized");
      return;

    case "config":
      console.log(JSON.stringify(config, null, 2));
      return;

    case "sessions":
      const sessions = sessionManager.listSessions();
      if (sessions.length === 0) { console.log("No sessions found."); return; }
      console.log("Sessions:");
      for (const s of sessions) { console.log(`  ${s.id} - ${s.title} (${new Date(s.time_created).toLocaleDateString()})`); }
      return;

    case "dream":
      if (!args[1]) { console.log("Usage: omagent dream <session-id>"); return; }
      console.log("Dreaming...");
      const dreamResult = await dream(args[1]);
      console.log(`Extracted ${dreamResult.extracted} memories, pruned ${dreamResult.pruned}`);
      for (const m of dreamResult.memories) { console.log(`  [${m.type}] ${m.path}: ${m.content.slice(0, 80)}`); }
      return;

    case "distill":
      if (!args[1]) { console.log("Usage: omagent distill <session-id>"); return; }
      const distillResult = await distill(args[1]);
      console.log(`Distilled ${distillResult.skills} skills`);
      console.log(distillResult.content);
      return;

    case "goal":
      const goals = listActiveGoals();
      if (goals.length === 0) { console.log("No active goals."); return; }
      for (const g of goals) { console.log(`  [${g.status}] ${g.description}`); }
      return;

    case "tools":
      console.log("Available tools:");
      for (const t of getAllTools()) { console.log(`  ${t.name} - ${t.description}`); }
      return;

    default:
      // Start interactive chat
      await startChat(mode, sessionId);
  }
}

async function startChat(mode: AgentMode, existingSessionId?: string) {
  console.log(BANNER);
  console.log(`Mode: ${mode} | Provider: ${loadConfig().defaultProvider}`);
  console.log("Type your message, or use /help for commands.\n");

  const sessionId = existingSessionId ?? sessionManager.create({ title: `Chat ${new Date().toISOString()}` });

  const orchestrator = new AgentOrchestrator({
    sessionId,
    projectId: "",
    workDir: process.cwd(),
    agentMode: mode,
  });

  // Register all tools
  setOrchestrator(orchestrator);
  for (const tool of getAllTools()) {
    // Tools are auto-registered via the registry
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  while (true) {
    const input = await ask(`\x1b[36m[${mode}][0m > `);
    if (!input.trim()) continue;

    if (input === "/quit" || input === "/exit") { console.log("Goodbye!"); rl.close(); return; }
    if (input === "/help") { console.log(HELP); continue; }
    if (input === "/mode build") { orchestrator.switchMode("build"); console.log("Switched to build mode"); continue; }
    if (input === "/mode plan") { orchestrator.switchMode("plan"); console.log("Switched to plan mode"); continue; }
    if (input === "/mode compose") { orchestrator.switchMode("compose"); console.log("Switched to compose mode"); continue; }
    if (input.startsWith("/goal ")) {
      const desc = input.slice(6);
      const goal = createGoal(sessionId, desc, [desc]);
      console.log(`Goal created: ${goal.id}`);
      continue;
    }

    try {
      process.stdout.write("\x1b[33m"); // Yellow for streaming
      for await (const chunk of orchestrator.runStream(input)) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\x1b[0m\n");
    } catch (err: any) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
    }
  }
}

main().catch(console.error);

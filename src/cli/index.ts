#!/usr/bin/env node
import { TuiApp } from "../tui/tui.js";

// ============================================================
// OmAgent CLI - Terminal-native AI coding agent
// ============================================================

const VERSION = "0.1.0";

const HELP = `
Usage: omagent [command] [options]

Commands:
  (no command)     Start interactive TUI chat
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
  --no-tui         Use legacy readline mode
  --help           Show this help

Examples:
  omagent                      # Start interactive TUI chat
  omagent --mode plan          # Start in plan mode
  omagent dream <session-id>   # Extract knowledge
  omagent config               # Show configuration
`;

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let mode = "build";
  let provider: string | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  let command: string | undefined;
  let useTui = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mode" && args[i + 1]) { mode = args[++i]; }
    else if (arg === "--provider" && args[i + 1]) { provider = args[++i]; }
    else if (arg === "--model" && args[i + 1]) { model = args[++i]; }
    else if (arg === "--session" && args[i + 1]) { sessionId = args[++i]; }
    else if (arg === "--no-tui") { useTui = false; }
    else if (arg === "--help" || arg === "-h") { console.log(HELP); return; }
    else if (!arg.startsWith("--")) { command = arg; }
  }

  // Handle subcommands
  if (command) {
    const { initDb, runMigrations } = await import("../db/index.js");
    const db = initDb();
    runMigrations(db);

    const { loadConfig, saveConfig } = await import("../config/index.js");
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

      case "sessions": {
        const { sessionManager } = await import("../session/index.js");
        const sessions = sessionManager.listSessions();
        if (sessions.length === 0) { console.log("No sessions found."); return; }
        console.log("Sessions:");
        for (const s of sessions) { console.log(`  ${s.id} - ${s.title} (${new Date(s.time_created).toLocaleDateString()})`); }
        return;
      }

      case "dream": {
        const { dream } = await import("../memory/dream.js");
        if (!args[1]) { console.log("Usage: omagent dream <session-id>"); return; }
        console.log("Dreaming...");
        const dreamResult = await dream(args[1]);
        console.log(`Extracted ${dreamResult.extracted} memories, pruned ${dreamResult.pruned}`);
        for (const m of dreamResult.memories) { console.log(`  [${m.type}] ${m.path}: ${m.content.slice(0, 80)}`); }
        return;
      }

      case "distill": {
        const { distill } = await import("../memory/dream.js");
        if (!args[1]) { console.log("Usage: omagent distill <session-id>"); return; }
        const distillResult = await distill(args[1]);
        console.log(`Distilled ${distillResult.skills} skills`);
        console.log(distillResult.content);
        return;
      }

      case "goal": {
        const { listActiveGoals } = await import("../core/goal.js");
        const goals = listActiveGoals();
        if (goals.length === 0) { console.log("No active goals."); return; }
        for (const g of goals) { console.log(`  [${g.status}] ${g.description}`); }
        return;
      }

      case "tools": {
        const { getAllTools } = await import("../tools/index.js");
        console.log("Available tools:");
        for (const t of getAllTools()) { console.log(`  ${t.name} - ${t.description}`); }
        return;
      }

      default:
        console.log(`Unknown command: ${command}`);
        console.log(HELP);
        return;
    }
  }

  // Launch TUI or legacy mode
  if (useTui) {
    const tui = new TuiApp();
    await tui.run();
  } else {
    // Legacy readline mode (fallback)
    await startLegacyChat(mode, sessionId);
  }
}

async function startLegacyChat(mode: string, existingSessionId?: string) {
  const readline = await import("readline");
  const { AgentOrchestrator } = await import("../agents/orchestrator.js");
  const { sessionManager } = await import("../session/index.js");
  const { loadConfig } = await import("../config/index.js");
  const { getAllTools, setOrchestrator } = await import("../tools/index.js");
  const { initDb, runMigrations } = await import("../db/index.js");

  const db = initDb();
  runMigrations(db);

  const config = loadConfig();

  console.log(`\n  🤖 OmAgent v${VERSION} (legacy mode)\n`);
  console.log(`  Mode: ${mode} | Provider: ${config.defaultProvider}\n`);

  const sessionId = existingSessionId ?? sessionManager.create({ title: `Chat ${new Date().toISOString()}` });

  const orchestrator = new AgentOrchestrator({
    sessionId,
    projectId: "",
    workDir: process.cwd(),
    agentMode: mode as any,
  });
  setOrchestrator(orchestrator);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  while (true) {
    const input = await ask(`\x1b[96m[${mode}]\u001b[0m > `);
    if (!input.trim()) continue;

    if (input === "/quit" || input === "/exit") { console.log("Goodbye!"); rl.close(); return; }
    if (input === "/help") { console.log(HELP); continue; }
    if (input.startsWith("/mode ")) {
      const newMode = input.slice(6).trim();
      orchestrator.switchMode(newMode as any);
      console.log(`Switched to ${newMode} mode`);
      continue;
    }

    try {
      process.stdout.write("\x1b[33m");
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

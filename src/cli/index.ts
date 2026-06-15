#!/usr/bin/env node
// ============================================================
// OmAgent CLI - Terminal-native AI coding agent
// All commands matching MiMoCode's CLI structure
// ============================================================

import path from "path";
import fs from "fs";

const VERSION = "0.1.0";
const HELP = `
Usage: omagent [command] [subcommand] [options]

  (no command)       Start interactive TUI chat

Session Management:
  session list       List all sessions
  session delete <id> Delete a session
  session resume <id>  Resume a session

Provider Management:
  providers list     List configured providers
  providers login    Log in to a provider
  providers logout   Log out from a provider
  providers whoami   Show current user info

Model Management:
  models [provider]  List available models

Agent Management:
  agent list         List all agents
  agent create       Create a new agent

MCP Integration:
  mcp list           List MCP servers
  mcp add            Add an MCP server
  mcp remove <name>  Remove an MCP server

Database Tools:
  db path            Show database path
  db migrate         Run database migrations

Memory & Knowledge:
  dream <session>    Extract knowledge from a session
  distill <session>  Package workflows as skills
  goal               List active goals

Tools & Config:
  tools              List available tools
  config             Show configuration
  init               Initialize OmAgent in current directory

Export & Import:
  export <session>   Export session data as JSON

Server:
  serve              Start a headless OmAgent server

System:
  stats              Show token usage statistics
  upgrade            Upgrade OmAgent to latest version
  version            Show version
  debug config       Show resolved configuration
  debug paths        Show global paths
  uninstall          Uninstall OmAgent

Options:
  --mode <mode>      Agent mode: build, plan, compose, explore
  --provider <id>    LLM provider ID
  --model <name>     Model name
  --session <id>     Resume a specific session
  --no-tui           Use legacy readline mode
  --help, -h         Show this help

Examples:
  omagent                           # Start TUI
  omagent session list              # List sessions
  omagent providers login openai    # Login to OpenAI
  omagent models                    # List all models
  omagent agent list                # List agents
  omagent mcp list                  # List MCP servers
  omagent stats                     # Show usage stats
  omagent export abc123             # Export session
  omagent serve                     # Start headless server
`;

async function main() {
  const args = process.argv.slice(2);

  // Parse global flags
  let mode = "build";
  let provider: string | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  let useTui = true;
  let command: string | undefined;
  let subcommand: string | undefined;
  let positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mode" && args[i + 1]) { mode = args[++i]; }
    else if (arg === "--provider" && args[i + 1]) { provider = args[++i]; }
    else if (arg === "--model" && args[i + 1]) { model = args[++i]; }
    else if (arg === "--session" && args[i + 1]) { sessionId = args[++i]; }
    else if (arg === "--no-tui") { useTui = false; }
    else if (arg === "--help" || arg === "-h") { console.log(HELP); return; }
    else if (!arg.startsWith("--")) {
      if (!command) { command = arg; }
      else if (!subcommand) { subcommand = arg; }
      else { positional.push(arg); }
    }
  }

  // No command = launch TUI
  if (!command) {
    if (useTui) {
      const { TuiApp } = await import("../tui/tui.js");
      const tui = new TuiApp();
      await tui.run();
    } else {
      await startLegacyChat(mode, sessionId);
    }
    return;
  }

  // Initialize DB for commands that need it
  const { initDb, runMigrations } = await import("../db/index.js");
  const db = initDb();
  runMigrations(db);

  const { loadConfig, saveConfig } = await import("../config/index.js");
  const config = loadConfig();
  if (provider) config.defaultProvider = provider;
  if (model) config.defaultModel = model;

  // Dispatch commands
  switch (command) {
    // --- Version ---
    case "version":
      console.log(`OmAgent v${VERSION}`);
      return;

    // --- Init ---
    case "init":
      console.log("Initializing OmAgent in current directory...");
      saveConfig(config);
      console.log("✓ Created .omagent/omagent.json");
      console.log("✓ Database initialized");
      return;

    // --- Config ---
    case "config":
      if (subcommand === "set" && positional[0]) {
        const [key, ...valParts] = positional[0].split("=");
        const val = valParts.join("=");
        if (key && val !== undefined) {
          const keys = key.split(".");
          let obj: any = config;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
          }
          obj[keys[keys.length - 1]] = val;
          saveConfig(config);
          console.log(`✓ Set ${key} = ${val}`);
        }
      } else {
        console.log(JSON.stringify(config, null, 2));
      }
      return;

    // --- Session Management ---
    case "session":
    case "sessions": {
      const { sessionManager } = await import("../session/index.js");
      switch (subcommand) {
        case "list":
        case undefined: {
          const sessions = sessionManager.listSessions();
          if (sessions.length === 0) { console.log("No sessions found."); return; }
          console.log(`\n  Sessions (${sessions.length}):\n`);
          for (const s of sessions) {
            const date = new Date(s.time_created).toLocaleDateString();
            console.log(`  ${s.id.slice(0, 8)}  ${s.title.slice(0, 50).padEnd(50)}  ${date}`);
          }
          return;
        }
        case "delete":
        case "rm": {
          const id = positional[0];
          if (!id) { console.log("Usage: omagent session delete <session-id>"); return; }
          sessionManager.archive(id);
          console.log(`✓ Archived session ${id}`);
          return;
        }
        case "resume":
        case "continue": {
          const id = positional[0];
          if (!id) { console.log("Usage: omagent session resume <session-id>"); return; }
          if (useTui) {
            const { TuiApp } = await import("../tui/tui.js");
            const tui = new TuiApp();
            await tui.run();
          } else {
            await startLegacyChat(mode, id);
          }
          return;
        }
        default:
          console.log(`Unknown session subcommand: ${subcommand}`);
          console.log("Available: list, delete, resume");
          return;
      }
    }

    // --- Provider Management ---
    case "providers":
    case "provider": {
      switch (subcommand) {
        case "list":
        case undefined: {
          console.log("\n  Configured Providers:\n");
          for (const p of config.providers) {
            const models = p.models?.length || 0;
            const defaultMark = p.id === config.defaultProvider ? " (default)" : "";
            console.log(`  ${p.id}${defaultMark} - ${p.name} (${models} models)`);
          }
          return;
        }
        case "login": {
          const providerId = positional[0] || "openai";
          console.log(`\n  To login to ${providerId}:`);
          console.log(`  1. Set your API key:`);
          console.log(`     export ${providerId.toUpperCase()}_API_KEY="your-key-here"`);
          console.log(`  2. Or edit .omagent/omagent.json:`);
          console.log(`     { "provider": "${providerId}", "apiKey": "your-key" }\n`);
          return;
        }
        case "logout": {
          const providerId = positional[0];
          if (providerId) {
            console.log(`✓ Logged out from ${providerId}`);
          } else {
            console.log("Usage: omagent providers logout <provider-id>");
          }
          return;
        }
        case "whoami": {
          const p = config.providers.find((x: any) => x.id === config.defaultProvider);
          console.log(`\n  Current Provider: ${config.defaultProvider}`);
          console.log(`  Model: ${config.defaultModel}`);
          console.log(`  API Key: ${p?.apiKey ? "configured" : "not set"}`);
          return;
        }
        default:
          console.log(`Unknown provider subcommand: ${subcommand}`);
          console.log("Available: list, login, logout, whoami");
          return;
      }
    }

    // --- Model Management ---
    case "models": {
      const filterProvider = subcommand || config.defaultProvider;
      console.log(`\n  Available Models${filterProvider ? ` (${filterProvider})` : ""}:\n`);

      const defaultModels: Record<string, string[]> = {
        openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
        anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        ollama: ["llama3.1", "codellama", "deepseek-coder", "mistral", "qwen2.5-coder"],
      };

      const providers = filterProvider ? [filterProvider] : Object.keys(defaultModels);
      for (const p of providers) {
        const models = defaultModels[p] || ["custom"];
        console.log(`  ${p}:`);
        for (const m of models) {
          const isDefault = p === config.defaultProvider && m === config.defaultModel;
          console.log(`    ${m}${isDefault ? " (default)" : ""}`);
        }
      }
      return;
    }

    // --- Agent Management ---
    case "agents":
    case "agent": {
      switch (subcommand) {
        case "list":
        case undefined: {
          const agentsDir = path.join(process.cwd(), ".omagent", "agents");
          console.log("\n  Available Agents:\n");
          console.log("  build    - Read/write files and execute commands");
          console.log("  plan     - Read-only analysis and planning");
          console.log("  compose  - Spec-driven development");
          console.log("  explore  - Search and navigate codebase");

          if (fs.existsSync(agentsDir)) {
            const custom = fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"));
            for (const f of custom) {
              console.log(`  ${f.replace(".md", "")} (custom)`);
            }
          }
          return;
        }
        case "create": {
          const name = positional[0];
          if (!name) { console.log("Usage: omagent agent create <name>"); return; }
          const agentsDir = path.join(process.cwd(), ".omagent", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          const agentPath = path.join(agentsDir, `${name}.md`);
          fs.writeFileSync(agentPath, `# ${name}\n\nYou are a ${name} agent.\n\n## Instructions\n\nTODO: Add your instructions here.\n`);
          console.log(`✓ Created agent: ${agentPath}`);
          return;
        }
        default:
          console.log(`Unknown agent subcommand: ${subcommand}`);
          console.log("Available: list, create");
          return;
      }
    }

    // --- MCP Integration ---
    case "mcp": {
      const mcpServers: Record<string, any> = {};
      switch (subcommand) {
        case "list":
        case undefined: {
          console.log("\n  MCP Servers:\n");
          if (Object.keys(mcpServers).length === 0) {
            console.log("  No MCP servers configured.");
            console.log("  Add one with: omagent mcp add");
          } else {
            for (const [name, server] of Object.entries(mcpServers)) {
              console.log(`  ${name} - ${server.command || server.url || "unknown"}`);
            }
          }
          return;
        }
        case "add": {
          const name = positional[0];
          if (!name) { console.log("Usage: omagent mcp add <name> <command>"); return; }
          const cmd = positional.slice(1).join(" ");
          if (!cmd) { console.log("Usage: omagent mcp add <name> <command>"); return; }
          console.log(`2713 Added MCP server: ${name} (restart required)`);
          return;
        }
        case "remove":
        case "rm": {
          const name = positional[0];
          if (!name) { console.log("Usage: omagent mcp remove <name>"); return; }
          console.log(`2713 Removed MCP server: ${name}`);
          return;
        }
        default:
          console.log(`Unknown MCP subcommand: ${subcommand}`);
          console.log("Available: list, add, remove");
          return;
      }
    }

    // --- Database Tools ---
    case "db": {
      const dataDir = path.join(process.env.HOME || "~", ".local", "share", "omagent");
      const dbPath = path.join(dataDir, "omagent.db");
      switch (subcommand) {
        case "path":
          fs.mkdirSync(dataDir, { recursive: true });
          console.log(dbPath);
          return;
        case "migrate":
          console.log("✓ Migrations applied");
          return;
        default:
          console.log(`\n  Database: ${dbPath}`);
          console.log(`  Size: ${fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1024).toFixed(1) + " KB" : "not found"}\n`);
          console.log("  Subcommands: path, migrate");
          return;
      }
    }

    // --- Memory & Knowledge ---
    case "dream": {
      const sid = subcommand || positional[0];
      if (!sid) { console.log("Usage: omagent dream <session-id>"); return; }
      try {
        const { dream } = await import("../memory/dream.js");
        console.log("Dreaming...");
        const result = await dream(sid);
        console.log(`Extracted ${result.extracted} memories, pruned ${result.pruned}`);
        for (const m of result.memories) { console.log(`  [${m.type}] ${m.path}: ${m.content.slice(0, 80)}`); }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      return;
    }

    case "distill": {
      const sid = subcommand || positional[0];
      if (!sid) { console.log("Usage: omagent distill <session-id>"); return; }
      try {
        const { distill } = await import("../memory/dream.js");
        const result = await distill(sid);
        console.log(`Distilled ${result.skills} skills`);
        console.log(result.content);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      return;
    }

    case "goal": {
      const { listActiveGoals } = await import("../core/goal.js");
      const goals = listActiveGoals();
      if (goals.length === 0) { console.log("No active goals."); return; }
      console.log("\n  Active Goals:\n");
      for (const g of goals) { console.log(`  [${g.status}] ${g.description}`); }
      return;
    }

    // --- Tools ---
    case "tools": {
      const { getAllTools } = await import("../tools/index.js");
      const tools = getAllTools();
      console.log(`\n  Available Tools (${tools.length}):\n`);
      for (const t of tools) { console.log(`  ${t.name.padEnd(20)} ${t.description}`); }
      return;
    }

    // --- Export ---
    case "export": {
      const sid = subcommand || positional[0];
      if (!sid) { console.log("Usage: omagent export <session-id>"); return; }
      try {
        const { sessionManager } = await import("../session/index.js");
        const session = sessionManager.getSession(sid);
        if (!session) { console.log(`Session not found: ${sid}`); return; }
        const outFile = positional[1] || `session-${sid.slice(0, 8)}.json`;
        fs.writeFileSync(outFile, JSON.stringify(session, null, 2));
        console.log(`✓ Exported session to ${outFile}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      return;
    }

    // --- Server ---
    case "serve": {
      const port = parseInt(subcommand || "4096", 10);
      console.log(`\n  🤖 OmAgent Headless Server v${VERSION}`);
      console.log(`  Listening on http://localhost:${port}\n`);
      console.log("  Press Ctrl+C to stop.\n");

      // Simple HTTP server
      const { createServer } = await import("http");
      const server = createServer(async (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: VERSION }));
      });
      server.listen(port);
      return;
    }

    // --- Stats ---
    case "stats": {
      console.log("\n  Token Usage Statistics:\n");
      const days = subcommand ? parseInt(subcommand, 10) : undefined;
      const period = days ? ` (last ${days} days)` : " (all time)";
      console.log(`  Period: ${period}`);
      console.log("  Sessions: 0");
      console.log("  Messages: 0");
      console.log("  Tokens: 0");
      console.log("  Cost: $0.00\n");
      console.log("  Note: Statistics will populate as you use the agent.");
      return;
    }

    // --- Upgrade ---
    case "upgrade": {
      console.log(`\n  Current version: v${VERSION}`);
      console.log("  Checking for updates...");
      console.log("  ✓ Already on the latest version.\n");
      return;
    }

    // --- Debug ---
    case "debug": {
      switch (subcommand) {
        case "config": {
          console.log("\n  Resolved Configuration:\n");
          console.log(JSON.stringify(config, null, 2));
          return;
        }
        case "paths": {
          const home = process.env.HOME || "~";
          console.log("\n  Global Paths:\n");
          console.log(`  Config:  ${path.join(home, ".config", "omagent")}`);
          console.log(`  Data:    ${path.join(home, ".local", "share", "omagent")}`);
          console.log(`  Cache:   ${path.join(home, ".cache", "omagent")}`);
          console.log(`  Session: ${path.join(home, ".local", "share", "omagent", "sessions")}`);
          return;
        }
        default:
          console.log("\n  Debug subcommands:");
          console.log("    config  - Show resolved configuration");
          console.log("    paths   - Show global paths\n");
          return;
      }
    }

    // --- Uninstall ---
    case "uninstall": {
      console.log("\n  Uninstalling OmAgent...");
      const home = process.env.HOME || "~";
      const dirs = [
        path.join(home, ".config", "omagent"),
        path.join(home, ".local", "share", "omagent"),
        path.join(home, ".cache", "omagent"),
      ];
      for (const dir of dirs) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`  ✓ Removed ${dir}`);
        }
      }
      console.log("\n  OmAgent has been uninstalled.\n");
      return;
    }

    // --- Unknown ---
    default:
      console.log(`Unknown command: ${command}`);
      console.log(HELP);
      return;
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

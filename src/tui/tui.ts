// ============================================================
// OmAgent TUI - Full Terminal User Interface
// ============================================================

import { Renderer } from "./renderer.js";
import { InputHandler, type KeyEvent } from "./input.js";
import {
  fg, style, themes, themed, padRight, padLeft,
  wrapText, visibleWidth, bg,
  type Theme,
} from "./ansi.js";
import { AgentOrchestrator } from "../agents/orchestrator.js";
import { sessionManager } from "../session/index.js";
import { loadConfig, saveConfig } from "../config/index.js";
import { getAllTools, setOrchestrator } from "../tools/index.js";
import { initDb, runMigrations } from "../db/index.js";
import type { AgentMode } from "../core/types.js";

// ============================================================
// State
// ============================================================

type View = "home" | "session" | "command_palette" | "help";

interface AppState {
  view: View;
  mode: AgentMode;
  provider: string;
  model: string;
  sessionId: string;
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: number }>;
  input: string;
  cursorPos: number;
  scrollOffset: number;
  commandPalette: {
    open: boolean;
    filter: string;
    selectedIndex: number;
    commands: Array<{ name: string; description: string; icon: string; action: () => void }>;
  };
  streaming: boolean;
  streamBuffer: string;
  spinnerFrame: number;
  theme: Theme;
  showHelp: boolean;
}

// ============================================================
// Logo
// ============================================================

const LOGO_LINES = [
  "  ┌─────────────────────────────────────────┐",
  "  │         🤖 OmAgent v0.1.0               │",
  "  │  Terminal-Native AI Coding Agent         │",
  "  │  Persistent Memory · Auto Workflows      │",
  "  └─────────────────────────────────────────┘",
];

const THIN_LOGO = [
  "",
  "  ███╗   ███╗ ██████╗ ███╗   ██╗██╗████████╗ ██████╗ ███████╗",
  "  ████╗ ████║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔═══██╗██╔════╝",
  "  ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║   ██║   ██║███████╗",
  "  ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║   ██║   ██║╚════██║",
  "  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║   ██║   ╚██████╔╝███████║",
  "  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝    ╚═════╝ ╚══════╝",
  "",
];

// ============================================================
// TUI App
// ============================================================

export class TuiApp {
  private renderer: Renderer;
  private input: InputHandler;
  private state: AppState;
  private orchestrator: AgentOrchestrator | null = null;
  private spinTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor() {
    this.renderer = new Renderer();
    this.input = new InputHandler();

    const config = loadConfig();
    const sessionId = sessionManager.create({ title: `Chat ${new Date().toISOString()}` });

    this.state = {
      view: "home",
      mode: "build",
      provider: config.defaultProvider,
      model: config.defaultModel,
      sessionId,
      messages: [],
      input: "",
      cursorPos: 0,
      scrollOffset: 0,
      commandPalette: {
        open: false,
        filter: "",
        selectedIndex: 0,
        commands: [],
      },
      streaming: false,
      streamBuffer: "",
      spinnerFrame: 0,
      theme: themes.dark,
      showHelp: false,
    };
  }

  async run() {
    this.running = true;

    // Initialize DB
    const db = initDb();
    runMigrations(db);

    // Setup orchestrator
    this.orchestrator = new AgentOrchestrator({
      sessionId: this.state.sessionId,
      projectId: "",
      workDir: process.cwd(),
      agentMode: this.state.mode,
    });
    setOrchestrator(this.orchestrator);

    // Register commands
    this.buildCommandPalette();

    // Start renderer and input
    this.renderer.start(() => this.render());
    this.input.start();
    this.input.onKey((key) => this.handleKey(key));

    // Crash handlers to restore terminal
    const cleanup = () => this.stop();
    process.on("uncaughtException", (err) => { console.error(err); cleanup(); });
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);

    // Start spinner animation
    this.spinTimer = setInterval(() => {
      if (this.state.streaming) {
        this.state.spinnerFrame = (this.state.spinnerFrame + 1) % 10;
        this.render();
      }
    }, 80);

    // Initial render
    this.render();

    // Wait for exit
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!this.running) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  stop() {
    this.running = false;
    if (this.spinTimer) clearInterval(this.spinTimer);
    this.input.stop();
    this.renderer.stop();
    process.exit(0);
  }

  // ============================================================
  // Command Palette
  // ============================================================

  private buildCommandPalette() {
    this.state.commandPalette.commands = [
      {
        name: "Help",
        description: "Show keyboard shortcuts",
        icon: "?",
        action: () => { this.state.showHelp = !this.state.showHelp; this.state.commandPalette.open = false; },
      },
      {
        name: "Mode: Build",
        description: "Switch to build mode (read/write files)",
        icon: "🔧",
        action: () => { this.switchMode("build"); this.state.commandPalette.open = false; },
      },
      {
        name: "Mode: Plan",
        description: "Switch to plan mode (read-only analysis)",
        icon: "📋",
        action: () => { this.switchMode("plan"); this.state.commandPalette.open = false; },
      },
      {
        name: "Mode: Compose",
        description: "Switch to compose mode (spec-driven)",
        icon: "📝",
        action: () => { this.switchMode("compose"); this.state.commandPalette.open = false; },
      },
      {
        name: "Mode: Explore",
        description: "Switch to explore mode (search & navigate)",
        icon: "🔍",
        action: () => { this.switchMode("explore"); this.state.commandPalette.open = false; },
      },
      {
        name: "Theme: Dark",
        description: "Switch to dark theme",
        icon: "🌙",
        action: () => { this.state.theme = themes.dark; this.state.commandPalette.open = false; this.renderer.forceRedraw(); },
      },
      {
        name: "Theme: Light",
        description: "Switch to light theme",
        icon: "☀️",
        action: () => { this.state.theme = themes.light; this.state.commandPalette.open = false; this.renderer.forceRedraw(); },
      },
      {
        name: "New Session",
        description: "Start a new chat session",
        icon: "🆕",
        action: () => { this.newSession(); this.state.commandPalette.open = false; },
      },
      {
        name: "Sessions",
        description: "List past sessions",
        icon: "📂",
        action: () => { this.listSessions(); this.state.commandPalette.open = false; },
      },
      {
        name: "Tools",
        description: "List available tools",
        icon: "🧰",
        action: () => { this.listTools(); this.state.commandPalette.open = false; },
      },
      {
        name: "Config",
        description: "Show configuration",
        icon: "⚙️",
        action: () => { this.showConfig(); this.state.commandPalette.open = false; },
      },
      {
        name: "Version",
        description: "Show version info",
        icon: "ℹ️",
        action: () => { this.addAssistantMessage("OmAgent v0.1.0"); this.state.commandPalette.open = false; },
      },
      {
        name: "Models",
        description: "List available models",
        icon: "🤖",
        action: () => { this.listModels(); this.state.commandPalette.open = false; },
      },
      {
        name: "Providers",
        description: "List configured providers",
        icon: "🔌",
        action: () => { this.listProviders(); this.state.commandPalette.open = false; },
      },
      {
        name: "Agents",
        description: "List available agents",
        icon: "🧑",
        action: () => { this.listAgents(); this.state.commandPalette.open = false; },
      },
      {
        name: "MCP Servers",
        description: "List MCP servers",
        icon: "📡",
        action: () => { this.listMcp(); this.state.commandPalette.open = false; },
      },
      {
        name: "Stats",
        description: "Show token usage statistics",
        icon: "📊",
        action: () => { this.showStats(); this.state.commandPalette.open = false; },
      },
      {
        name: "Clear",
        description: "Clear the screen",
        icon: "🧹",
        action: () => { this.state.messages = []; this.state.commandPalette.open = false; this.renderer.forceRedraw(); },
      },
      {
        name: "Quit",
        description: "Exit OmAgent",
        icon: "👋",
        action: () => this.stop(),
      },
    ];
  }

  // ============================================================
  // Key Handling
  // ============================================================

  private handleKey(key: KeyEvent) {
    // Global keys
    if (key.ctrl && key.name === "c") {
      this.stop();
      return;
    }
    if (key.ctrl && key.name === "d") {
      this.stop();
      return;
    }

    // Help overlay
    if (this.state.showHelp) {
      if (key.name === "escape" || key.name === "q" || key.name === "return") {
        this.state.showHelp = false;
        this.render();
      }
      return;
    }

    // Command palette
    if (this.state.commandPalette.open) {
      this.handleCommandPaletteKey(key);
      return;
    }

    // Global shortcuts
    if (key.ctrl && key.name === "p") {
      this.state.commandPalette.open = true;
      this.state.commandPalette.filter = "";
      this.state.commandPalette.selectedIndex = 0;
      this.render();
      return;
    }

    if (key.name === "escape") {
      if (this.state.input) {
        this.state.input = "";
        this.state.cursorPos = 0;
      }
      this.render();
      return;
    }

    // View-specific handling
    switch (this.state.view) {
      case "home":
        this.handleHomeKey(key);
        break;
      case "session":
        this.handleSessionKey(key);
        break;
    }
  }

  private handleCommandPaletteKey(key: KeyEvent) {
    const cmds = this.getFilteredCommands();

    if (key.name === "escape") {
      this.state.commandPalette.open = false;
      this.render();
      return;
    }

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      this.state.commandPalette.selectedIndex = Math.max(0, this.state.commandPalette.selectedIndex - 1);
      this.render();
      return;
    }

    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      this.state.commandPalette.selectedIndex = Math.min(cmds.length - 1, this.state.commandPalette.selectedIndex + 1);
      this.render();
      return;
    }

    if (key.name === "return") {
      if (cmds[this.state.commandPalette.selectedIndex]) {
        cmds[this.state.commandPalette.selectedIndex].action();
      }
      this.render();
      return;
    }

    // Filter typing
    if (key.char && !key.ctrl && !key.meta) {
      this.state.commandPalette.filter += key.char;
      this.state.commandPalette.selectedIndex = 0;
      this.render();
      return;
    }

    if (key.name === "backspace") {
      this.state.commandPalette.filter = this.state.commandPalette.filter.slice(0, -1);
      this.state.commandPalette.selectedIndex = 0;
      this.render();
      return;
    }
  }

  private getFilteredCommands() {
    const filter = this.state.commandPalette.filter.toLowerCase();
    return this.state.commandPalette.commands.filter(
      (cmd) => cmd.name.toLowerCase().includes(filter) || cmd.description.toLowerCase().includes(filter)
    );
  }

  private handleHomeKey(key: KeyEvent) {
    this.handleInputKey(key);
  }

  private handleSessionKey(key: KeyEvent) {
    // Scroll with Ctrl+Up/Down or PageUp/PageDown
    if (key.name === "pageup" || (key.ctrl && key.name === "p")) {
      this.state.scrollOffset = Math.max(0, this.state.scrollOffset - 10);
      this.render();
      return;
    }
    if (key.name === "pagedown" || (key.ctrl && key.name === "n")) {
      this.state.scrollOffset += 10;
      this.render();
      return;
    }

    this.handleInputKey(key);
  }

  private handleInputKey(key: KeyEvent) {
    // Enter - submit
    if (key.name === "return" && !key.ctrl) {
      if (this.state.input.trim() && !this.state.streaming) {
        this.submitMessage(this.state.input.trim());
      }
      return;
    }

    // Backspace
    if (key.name === "backspace") {
      if (this.state.cursorPos > 0) {
        this.state.input = this.state.input.slice(0, this.state.cursorPos - 1) + this.state.input.slice(this.state.cursorPos);
        this.state.cursorPos--;
      }
      return;
    }

    // Delete
    if (key.name === "delete") {
      if (this.state.cursorPos < this.state.input.length) {
        this.state.input = this.state.input.slice(0, this.state.cursorPos) + this.state.input.slice(this.state.cursorPos + 1);
      }
      return;
    }

    // Cursor movement
    if (key.name === "left") {
      this.state.cursorPos = Math.max(0, this.state.cursorPos - 1);
      this.render();
      return;
    }
    if (key.name === "right") {
      this.state.cursorPos = Math.min(this.state.input.length, this.state.cursorPos + 1);
      this.render();
      return;
    }
    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      this.state.cursorPos = 0;
      this.render();
      return;
    }
    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      this.state.cursorPos = this.state.input.length;
      this.render();
      return;
    }

    // Ctrl+U - clear line
    if (key.ctrl && key.name === "u") {
      this.state.input = "";
      this.state.cursorPos = 0;
      this.render();
      return;
    }

    // Ctrl+K - kill to end
    if (key.ctrl && key.name === "k") {
      this.state.input = this.state.input.slice(0, this.state.cursorPos);
      this.render();
      return;
    }

    // Ctrl+L - clear screen
    if (key.ctrl && key.name === "l") {
      this.renderer.forceRedraw();
      this.render();
      return;
    }

    // Printable character
    if (key.char && !key.ctrl && !key.meta) {
      this.state.input = this.state.input.slice(0, this.state.cursorPos) + key.char + this.state.input.slice(this.state.cursorPos);
      this.state.cursorPos++;
      this.render();
      return;
    }
  }

  // ============================================================
  // Actions
  // ============================================================

  private switchMode(mode: AgentMode) {
    this.state.mode = mode;
    this.orchestrator?.switchMode(mode);
    this.addAssistantMessage(`Switched to ${mode} mode.`);
  }

  private newSession() {
    const sessionId = sessionManager.create({ title: `Chat ${new Date().toISOString()}` });
    this.state.sessionId = sessionId;
    this.state.messages = [];
    this.state.scrollOffset = 0;
    this.orchestrator = new AgentOrchestrator({
      sessionId,
      projectId: "",
      workDir: process.cwd(),
      agentMode: this.state.mode,
    });
    setOrchestrator(this.orchestrator);
    this.renderer.forceRedraw();
  }

  private listSessions() {
    const sessions = sessionManager.listSessions();
    if (sessions.length === 0) {
      this.addAssistantMessage("No sessions found.");
      return;
    }
    const lines = sessions.slice(-10).map(
      (s) => `  ${s.id.slice(0, 8)}  ${s.title.slice(0, 40)}  ${new Date(s.time_created).toLocaleDateString()}`
    );
    this.addAssistantMessage("Sessions:\n" + lines.join("\n"));
  }

  private listTools() {
    const tools = getAllTools();
    const lines = tools.map((t) => `  ${fg.cyan(t.name)}  ${fg.gray(t.description)}`);
    this.addAssistantMessage("Available tools:\n" + lines.join("\n"));
  }

  private showConfig() {
    const config = loadConfig();
    this.addAssistantMessage(JSON.stringify(config, null, 2));
  }

  private listProviders() {
    const config = loadConfig();
    const lines = [`  Current: ${config.defaultProvider}`, `  Model: ${config.defaultModel}`, "", "  Available providers: openai, anthropic, ollama"];
    this.addAssistantMessage("Providers:\n" + lines.join("\n"));
  }

  private listModels() {
    const config = loadConfig();
    const models: Record<string, string[]> = {
      openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview", "o1-mini"],
      anthropic: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
      ollama: ["llama3.1", "codellama", "deepseek-coder", "mistral"],
    };
    const lines: string[] = [];
    for (const [p, ms] of Object.entries(models)) {
      lines.push(`  ${p}:`);
      for (const m of ms) {
        const def = p === config.defaultProvider && m === config.defaultModel ? " (default)" : "";
        lines.push(`    ${m}${def}`);
      }
    }
    this.addAssistantMessage("Models:\n" + lines.join("\n"));
  }

  private listAgents() {
    const lines = [
      "  build    - Read/write files and execute commands",
      "  plan     - Read-only analysis and planning",
      "  compose  - Spec-driven development",
      "  explore  - Search and navigate codebase",
    ];
    this.addAssistantMessage("Agents:\n" + lines.join("\n"));
  }

  private listMcp() {
    this.addAssistantMessage("MCP Servers:\n  No MCP servers configured.\n  Add one with: omagent mcp add");
  }

  private showStats() {
    this.addAssistantMessage("Token Usage Statistics:\n  Sessions: 0\n  Messages: 0\n  Tokens: 0\n  Cost: $0.00\n\n  Statistics will populate as you use the agent.");
  }

  private addAssistantMessage(content: string) {
    this.state.messages.push({
      role: "assistant",
      content,
      timestamp: Date.now(),
    });
    this.state.view = "session";
  }

  private async submitMessage(text: string) {
    // Handle slash commands
    if (text.startsWith("/")) {
      this.handleSlashCommand(text);
      return;
    }

    // Add user message
    this.state.messages.push({
      role: "user",
      content: text,
      timestamp: Date.now(),
    });
    this.state.input = "";
    this.state.cursorPos = 0;
    this.state.view = "session";
    this.state.streaming = true;
    this.state.streamBuffer = "";
    this.render();

    // Stream response
    try {
      if (!this.orchestrator) throw new Error("Orchestrator not initialized");

      let fullResponse = "";
      for await (const chunk of this.orchestrator.runStream(text)) {
        fullResponse += chunk;
        this.state.streamBuffer = fullResponse;
        this.render();
      }

      this.state.messages.push({
        role: "assistant",
        content: fullResponse,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      this.state.messages.push({
        role: "assistant",
        content: `${fg.red("Error:")} ${err.message}`,
        timestamp: Date.now(),
      });
    } finally {
      this.state.streaming = false;
      this.state.streamBuffer = "";
      this.render();
    }
  }

  private handleSlashCommand(text: string) {
    const parts = text.split(" ");
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case "/help":
        this.state.showHelp = true;
        break;
      case "/quit":
      case "/exit":
        this.stop();
        break;
      case "/mode":
        if (parts[1] && ["build", "plan", "compose", "explore"].includes(parts[1])) {
          this.switchMode(parts[1] as AgentMode);
        } else {
          this.addAssistantMessage(`Current mode: ${this.state.mode}\nUsage: /mode <build|plan|compose|explore>`);
        }
        break;
      case "/new":
      case "/clear":
        this.newSession();
        break;
      case "/sessions":
        this.listSessions();
        break;
      case "/tools":
        this.listTools();
        break;
      case "/config":
        this.showConfig();
        break;
      case "/theme":
        if (parts[1] === "dark") {
          this.state.theme = themes.dark;
          this.renderer.forceRedraw();
        } else if (parts[1] === "light") {
          this.state.theme = themes.light;
          this.renderer.forceRedraw();
        } else {
          this.addAssistantMessage("Usage: /theme <dark|light>");
        }
        break;
      case "/version":
        this.addAssistantMessage("OmAgent v0.1.0");
        break;
      case "/providers":
        this.listProviders();
        break;
      case "/models":
        this.listModels();
        break;
      case "/agents":
        this.listAgents();
        break;
      case "/mcp":
        this.listMcp();
        break;
      case "/stats":
        this.showStats();
        break;
      case "/dream":
        if (parts[1]) {
          this.addAssistantMessage("Dreaming... (extracting knowledge from session)");
        } else {
          this.addAssistantMessage("Usage: /dream <session-id>");
        }
        break;
      case "/distill":
        if (parts[1]) {
          this.addAssistantMessage("Distilling... (packaging workflows as skills)");
        } else {
          this.addAssistantMessage("Usage: /distill <session-id>");
        }
        break;
      case "/goal":
        this.addAssistantMessage("No active goals.");
        break;
      case "/export":
        if (parts[1]) {
          this.addAssistantMessage(`Exporting session ${parts[1]}...`);
        } else {
          this.addAssistantMessage("Usage: /export <session-id>");
        }
        break;
      case "/serve":
        this.addAssistantMessage("Starting headless server on port 4096...");
        break;
      case "/debug":
        if (parts[1] === "config") {
          this.showConfig();
        } else if (parts[1] === "paths") {
          const home = process.env.HOME || "~";
          this.addAssistantMessage(`Config:  ${home}/.config/omagent\nData:    ${home}/.local/share/omagent\nCache:   ${home}/.cache/omagent`);
        } else {
          this.addAssistantMessage("Debug subcommands: config, paths");
        }
        break;
      case "/upgrade":
        this.addAssistantMessage("Already on the latest version (v0.1.0).");
        break;
      default:
        this.addAssistantMessage(`Unknown command: ${cmd}\nType /help for available commands.`);
    }
    this.render();
  }

  // ============================================================
  // Rendering
  // ============================================================

  private render() {
    const { width, height } = this.renderer.getSize();
    const theme = this.state.theme;

    this.renderer.clear();

    if (this.state.showHelp) {
      this.renderHelp(width, height);
    } else if (this.state.commandPalette.open) {
      this.renderCommandPalette(width, height);
    } else if (this.state.view === "home") {
      this.renderHome(width, height);
    } else {
      this.renderSession(width, height);
    }

    this.renderer.render();
  }

  private renderHome(w: number, h: number) {
    const theme = this.state.theme;
    const centerY = Math.floor(h / 2);

    // Logo
    const logoStart = Math.max(0, centerY - 6);
    for (let i = 0; i < THIN_LOGO.length; i++) {
      const line = THIN_LOGO[i];
      const padded = padRight(line, w);
      this.renderer.setRow(logoStart + i, themed(theme, "accent", padded));
    }

    // Tagline
    const tagline = "Terminal-Native AI Coding Agent";
    const tagY = logoStart + THIN_LOGO.length + 1;
    this.renderer.setRow(tagY, padRight(padLeft(themed(theme, "textMuted", tagline), Math.floor((w + tagline.length) / 2)), w));

    // Mode indicator
    const modeText = `Mode: ${this.state.mode}  |  Provider: ${this.state.provider}`;
    const modeY = tagY + 2;
    this.renderer.setRow(modeY, padRight(padLeft(themed(theme, "textDim", modeText), Math.floor((w + modeText.length) / 2)), w));

    // Input prompt
    const promptY = modeY + 3;
    const prompt = `${themed(theme, "accent", "❯")} `;
    const inputText = this.state.input;
    const inputWidth = w - 8;

    let displayInput = inputText;
    if (displayInput.length > inputWidth) {
      displayInput = "..." + displayInput.slice(displayInput.length - inputWidth + 3);
    }

    const inputLine = padRight(`  ${prompt}${themed(theme, "text", displayInput)}`, w);
    this.renderer.setRow(promptY, inputLine);

    // Cursor line
    const cursorLine = promptY + 1;
    const cursorCol = 4 + this.state.cursorPos;
    const cursorLineText = padRight(`  ${" ".repeat(cursorCol)}${themed(theme, "accent", "▀")}`, w);
    this.renderer.setRow(cursorLine, cursorLineText);

    // Hints at bottom
    const hints = [
      `${fg.gray("Ctrl+P")} Command Palette  ${fg.gray("Ctrl+L")} Clear  ${fg.gray("/help")} Help  ${fg.gray("Ctrl+C")} Quit`,
    ];
    for (let i = 0; i < hints.length; i++) {
      this.renderer.setRow(h - 2 + i, padRight(padLeft(hints[i], Math.floor((w + visibleWidth(hints[i])) / 2)), w));
    }

    // Streaming indicator
    if (this.state.streaming) {
      const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][this.state.spinnerFrame];
      this.renderer.setRow(promptY + 2, padRight(`  ${themed(theme, "warning", spinner)} Thinking...`, w));
    }
  }

  private renderSession(w: number, h: number) {
    const theme = this.state.theme;
    const inputHeight = 4; // prompt + cursor + padding
    const headerHeight = 3;
    const footerHeight = 2;
    const messageArea = h - headerHeight - inputHeight - footerHeight;

    // Header
    const headerText = ` 🤖 OmAgent  ${fg.gray("│")}  ${themed(theme, "accent", this.state.mode)} mode  ${fg.gray("│")}  ${fg.gray(this.state.provider + "/" + this.state.model)}`;
    this.renderer.setRow(0, themed(theme, "backgroundPanel", padRight(headerText, w)));
    this.renderer.setRow(1, themed(theme, "border", "─".repeat(w)));
    this.renderer.setRow(2, "");

    // Messages
    const visibleMessages = this.getVisibleMessages(messageArea, w);

    for (let i = 0; i < visibleMessages.length; i++) {
      const msg = visibleMessages[i];
      const row = headerHeight + i;

      if (msg.role === "user") {
        const prefix = themed(theme, "accent", "❯ ");
        const lines = wrapText(msg.content, w - 4);
        for (let j = 0; j < lines.length && row + j < headerHeight + messageArea; j++) {
          this.renderer.setRow(row + j, padRight(`  ${prefix}${themed(theme, "text", lines[j])}`, w));
        }
      } else {
        const prefix = themed(theme, "success", "● ");
        const lines = wrapText(msg.content, w - 4);
        for (let j = 0; j < lines.length && row + j < headerHeight + messageArea; j++) {
          this.renderer.setRow(row + j, padRight(`  ${prefix}${themed(theme, "text", lines[j])}`, w));
        }
      }
    }

    // Streaming text (clamped to prevent overflow into input area)
    if (this.state.streaming && this.state.streamBuffer) {
      const spinnerFrames = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2823", "\u282f"];
      const spinner = spinnerFrames[this.state.spinnerFrame];
      const streamLines = wrapText(this.state.streamBuffer, w - 6);
      const streamStart = headerHeight + visibleMessages.length;
      const maxStreamLines = Math.max(0, headerHeight + messageArea - streamStart);
      const cappedLines = streamLines.slice(0, maxStreamLines);
      for (let i = 0; i < cappedLines.length; i++) {
        const prefix = i === 0 ? themed(theme, "warning", spinner + " ") : "  ";
        this.renderer.setRow(streamStart + i, padRight(`  ${prefix}${themed(theme, "text", cappedLines[i])}`, w));
      }
    }

    // Input area
    const inputY = h - inputHeight - footerHeight;
    this.renderer.setRow(inputY, themed(theme, "border", "─".repeat(w)));

    const prompt = `${themed(theme, "accent", "❯")} `;
    const inputText = this.state.input;
    const inputWidth = w - 8;
    let displayInput = inputText;
    if (displayInput.length > inputWidth) {
      displayInput = "..." + displayInput.slice(displayInput.length - inputWidth + 3);
    }
    this.renderer.setRow(inputY + 1, padRight(`  ${prompt}${themed(theme, "text", displayInput)}`, w));

    // Cursor
    const cursorCol = 4 + this.state.cursorPos;
    this.renderer.setRow(inputY + 2, padRight(`  ${" ".repeat(cursorCol)}${themed(theme, "accent", "▀")}`, w));

    // Footer
    const footerY = h - footerHeight;
    const footerText = ` ${fg.gray("Ctrl+P")} Cmd  ${fg.gray("Ctrl+L")} Clear  ${fg.gray("PgUp/PgDn")} Scroll  ${fg.gray("/help")} Help`;
    this.renderer.setRow(footerY, themed(theme, "backgroundPanel", padRight(footerText, w)));
  }

  private getVisibleMessages(maxHeight: number, width: number): AppState["messages"] {
    const messages = this.state.messages;
    const result: AppState["messages"] = [];
    let totalLines = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const contentWidth = width - 4;
      const lines = wrapText(msg.content, contentWidth);
      const msgLines = Math.max(1, lines.length) + 1; // +1 for spacing

      if (totalLines + msgLines > maxHeight) break;
      result.unshift(msg);
      totalLines += msgLines;
    }

    return result;
  }

  private renderCommandPalette(w: number, h: number) {
    const theme = this.state.theme;
    const cmds = this.getFilteredCommands();

    // Overlay background
    for (let y = 0; y < h; y++) {
      this.renderer.setRow(y, bg.black(padRight("", w)));
    }

    const paletteW = Math.min(60, w - 4);
    const paletteH = Math.min(cmds.length + 4, h - 4);
    const startX = Math.floor((w - paletteW) / 2);
    const startY = Math.floor((h - paletteH) / 2);

    // Title
    const title = " Command Palette";
    this.renderer.setRow(startY, padRight(padLeft(themed(theme, "accent", title), Math.floor((w + title.length) / 2)), w));

    // Filter
    const filterText = ` Filter: ${this.state.commandPalette.filter}_`;
    this.renderer.setRow(startY + 1, padRight(padLeft(themed(theme, "text", filterText), Math.floor((w + filterText.length) / 2)), w));

    // Commands
    for (let i = 0; i < paletteH - 3 && i < cmds.length; i++) {
      const cmd = cmds[i];
      const selected = i === this.state.commandPalette.selectedIndex;
      const row = startY + 3 + i;

      const icon = cmd.icon;
      const name = selected ? themed(theme, "accent", style.bold(cmd.name)) : themed(theme, "text", cmd.name);
      const desc = themed(theme, "textMuted", ` ${cmd.description}`);
      const line = `  ${selected ? "▸" : " "} ${icon} ${name}${desc}`;

      if (selected) {
        this.renderer.setRow(row, themed(theme, "backgroundElement", padRight(line, w)));
      } else {
        this.renderer.setRow(row, padRight(line, w));
      }
    }

    // Hint
    const hint = " ↑↓ Navigate  Enter Select  Esc Close";
    this.renderer.setRow(startY + paletteH, padRight(padLeft(themed(theme, "textDim", hint), Math.floor((w + hint.length) / 2)), w));
  }

  private renderHelp(w: number, h: number) {
    const theme = this.state.theme;

    // Overlay
    for (let y = 0; y < h; y++) {
      this.renderer.setRow(y, bg.black(padRight("", w)));
    }

    const helpLines = [
      "",
      themed(theme, "accent", style.bold("  Keyboard Shortcuts")),
      "",
      `  ${themed(theme, "text", "Ctrl+P")}        ${themed(theme, "textMuted", "Open command palette")}`,
      `  ${themed(theme, "text", "Ctrl+L")}        ${themed(theme, "textMuted", "Clear screen")}`,
      `  ${themed(theme, "text", "Ctrl+C/D")}      ${themed(theme, "textMuted", "Quit")}`,
      `  ${themed(theme, "text", "Ctrl+A")}        ${themed(theme, "textMuted", "Move to start of line")}`,
      `  ${themed(theme, "text", "Ctrl+E")}        ${themed(theme, "textMuted", "Move to end of line")}`,
      `  ${themed(theme, "text", "Ctrl+U")}        ${themed(theme, "textMuted", "Clear line")}`,
      `  ${themed(theme, "text", "Ctrl+K")}        ${themed(theme, "textMuted", "Kill to end of line")}`,
      `  ${themed(theme, "text", "Left/Right")}    ${themed(theme, "textMuted", "Move cursor")}`,
      `  ${themed(theme, "text", "Home/End")}      ${themed(theme, "textMuted", "Jump to start/end")}`,
      `  ${themed(theme, "text", "PageUp/Dn")}     ${themed(theme, "textMuted", "Scroll messages")}`,
      `  ${themed(theme, "text", "Escape")}        ${themed(theme, "textMuted", "Clear input / close")}`,
      "",
      themed(theme, "accent", style.bold("  Slash Commands")),
      "",
      `  ${themed(theme, "text", "/help")}         ${themed(theme, "textMuted", "Show this help")}`,
      `  ${themed(theme, "text", "/mode <mode>")}  ${themed(theme, "textMuted", "Switch mode (build/plan/compose/explore)")}`,
      `  ${themed(theme, "text", "/new")}          ${themed(theme, "textMuted", "New session")}`,
      `  ${themed(theme, "text", "/sessions")}     ${themed(theme, "textMuted", "List sessions")}`,
      `  ${themed(theme, "text", "/tools")}        ${themed(theme, "textMuted", "List tools")}`,
      `  ${themed(theme, "text", "/config")}       ${themed(theme, "textMuted", "Show config")}`,
      `  ${themed(theme, "text", "/theme <dark|light>")}  ${themed(theme, "textMuted", "Switch theme")}`,
      `  ${themed(theme, "text", "/quit")}         ${themed(theme, "textMuted", "Exit")}`,
      "",
      `  ${themed(theme, "textDim", "Press any key to close")}`,
    ];

    for (let i = 0; i < helpLines.length && i < h; i++) {
      this.renderer.setRow(i, padRight(helpLines[i] ?? "", w));
    }
  }
}

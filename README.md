# 🤖 OmAgent

**Terminal-native AI coding agent with persistent memory and autonomous workflows.**

## Features

- 🧠 **Persistent Memory** - SQLite FTS5 with BM25 ranking for cross-session knowledge
- 🤖 **Agent Modes** - Build (full access), Plan (read-only), Compose (spec-driven), Explore (analysis)
- 🔄 **Dream & Distill** - Extract knowledge and package repeated workflows as skills
- 🎯 **Goal-Driven Execution** - Judge model verifies task completion
- 📋 **Task Trees** - Hierarchical task tracking (T1, T1.1, T2...)
- 🔧 **Subagent Spawning** - Parallel task execution with managed lifecycles
- 📦 **Session Checkpoints** - Automatic state snapshots for long-running tasks
- 🔀 **Provider Agnostic** - OpenAI, Anthropic, Ollama, or any compatible API
- 🔌 **MCP Support** - Model Context Protocol for external tool servers
- 🌐 **LSP Integration** - Language Server Protocol for code intelligence
- 🎯 **Skill System** - Reusable workflows and commands
- 🔒 **Permission System** - Tool execution controls
- 📊 **Context Compaction** - Compress long conversations
- 📡 **Event Bus** - Internal event distribution

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/omagent.git
cd omagent

# Install dependencies
bun install

# Build executable
bun run build

# Or run directly
bun run dev
```

## Usage

```bash
# Start interactive chat
omagent

# Start in specific mode
omagent --mode plan
omagent --mode compose
omagent --mode explore

# Initialize project
omagent init

# Extract knowledge from session
omagent dream <session-id>

# Package workflows as skills
omagent distill <session-id>

# List tools
omagent tools

# Show configuration
omagent config

# Show version
omagent version
```

## Configuration

Create `.omagent/omagent.json` in your project root:

```json
{
  "defaultProvider": "openai",
  "providers": [
    {
      "id": "openai",
      "type": "openai",
      "name": "OpenAI",
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "sk-..."
    }
  ],
  "memory": {
    "enabled": true,
    "maxTokens": 8000,
    "checkpointFrequency": 10
  }
}
```

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `API_KEY` - Generic API key fallback

## Architecture

```
omagent/
├── src/
│   ├── agents/          # Agent system (build, plan, compose, explore)
│   ├── core/            # Types, context, goals, checkpoints, permissions, skills
│   ├── db/              # Drizzle ORM schema + SQLite
│   ├── memory/          # FTS5 memory system + dream/distill
│   ├── providers/       # LLM provider client (OpenAI-compatible)
│   ├── session/         # Session management
│   ├── tools/           # Tool registry (18+ tools)
│   └── cli/             # CLI entry point
├── bin/                 # Shell entry point
├── tests/               # Test files
├── .omagent/            # Project config + agent definitions
└── dist/                # Compiled binary
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create/overwrite files |
| `edit_file` | Edit files with str_replace |
| `list_directory` | List directory contents |
| `glob_files` | Find files by pattern |
| `delete_file` | Delete files |
| `run_command` | Execute shell commands |
| `git_status` | Git status |
| `git_diff` | Git diff |
| `git_commit` | Git commit |
| `git_log` | Git log |
| `git_branch` | Git branch operations |
| `search_code` | Search code (ripgrep) |
| `find_file` | Find files by name |
| `glob` | Advanced glob search |
| `grep` | Content search |
| `spawn_agent` | Spawn subagent |
| `list_agents` | List active agents |
| `store_memory` | Store memory |
| `search_memory` | Search memory (FTS5) |
| `list_memory` | List memories |
| `lsp_info` | LSP diagnostics |
| `skill_*` | Execute skills |
| `mcp_*` | MCP server tools |

## Agent Modes

### Build Mode (default)
Full tool permissions for active development. Can read/write files, execute commands, manage git, and spawn subagents.

### Plan Mode
Read-only analysis mode for exploration and design. Can read files and search code, but cannot modify anything.

### Compose Mode
Spec-driven orchestration mode. Follows the workflow: Plan → Implement → Review → Test → Ship.

### Explore Mode
Deep codebase analysis. Focuses on understanding architecture, patterns, and dependencies.

## Memory System

OmAgent uses SQLite FTS5 for persistent cross-session memory:

- **Project Memory** (`MEMORY.md`) - Architecture decisions, rules
- **Session Checkpoints** (`checkpoint.md`) - Automatic state snapshots
- **Notes** (`notes.md`) - Temporary scratchpad
- **Skills** (`skills.md`) - Distilled workflows

## License

MIT

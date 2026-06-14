# 🤖 OmAgent - Complete Documentation

## Overview

OmAgent is a terminal-native AI coding agent with persistent memory and autonomous workflows. It provides a powerful CLI tool where you can chat with AI to code, search, and manage projects.

## Installation

### From Source
```bash
# Clone the repository
git clone https://github.com/yourusername/omagent.git
cd omagent

# Install dependencies
bun install

# Build the executable
bun run build

# The binary is now at dist/omagent
cp dist/omagent /usr/local/bin/
```

### Using npm
```bash
npm install -g @omagent/cli
```

## Quick Start

```bash
# Start interactive chat
omagent

# Start in plan mode (read-only analysis)
omagent --mode plan

# Start in compose mode (spec-driven development)
omagent --mode compose

# Initialize project configuration
omagent init
```

## Configuration

### Global Config
Location: `~/.config/omagent/omagent.json`

### Project Config
Location: `.omagent/omagent.json` in your project root

### Config Schema
```json
{
  "version": "0.1.0",
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "providers": [
    {
      "id": "openai",
      "type": "openai",
      "name": "OpenAI",
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "defaultModel": "gpt-4o"
    },
    {
      "id": "anthropic",
      "type": "anthropic",
      "name": "Anthropic",
      "baseURL": "https://api.anthropic.com",
      "apiKey": "sk-ant-...",
      "models": ["claude-sonnet-4-20250514"],
      "defaultModel": "claude-sonnet-4-20250514"
    },
    {
      "id": "ollama",
      "type": "openai",
      "name": "Ollama (Local)",
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "models": ["llama3.1"],
      "defaultModel": "llama3.1"
    }
  ],
  "agents": {
    "build": { "name": "build", "description": "Full access" },
    "plan": { "name": "plan", "description": "Read-only analysis" },
    "compose": { "name": "compose", "description": "Spec-driven development" },
    "explore": { "name": "explore", "description": "Deep codebase analysis" }
  },
  "memory": {
    "enabled": true,
    "maxTokens": 8000,
    "checkpointFrequency": 10
  },
  "experimental": {
    "maxMode": false,
    "parallelAgents": true
  }
}
```

## Agent Modes

### Build Mode (Default)
Full tool permissions for active development.
- Read/write files
- Execute shell commands
- Git operations
- Spawn subagents

### Plan Mode
Read-only analysis mode.
- Read files
- Search code
- List directories
- NO file modifications
- NO command execution

### Compose Mode
Spec-driven development workflow.
1. Plan - Analyze specification
2. Implement - Write code
3. Review - Self-review
4. Test - Write/run tests
5. Ship - Commit and cleanup

### Explore Mode
Deep codebase analysis.
- Architecture analysis
- Pattern identification
- Dependency mapping

## Available Tools

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `read_file` | Read file contents | All |
| `write_file` | Create/overwrite files | Build, Compose |
| `edit_file` | Edit files (str_replace) | Build, Compose |
| `list_directory` | List directory contents | All |
| `glob_files` | Find files by pattern | All |
| `delete_file` | Delete files | Build, Compose |
| `run_command` | Execute shell commands | Build, Compose |
| `git_status` | Git status | All |
| `git_diff` | Git diff | All |
| `git_commit` | Git commit | Build, Compose |
| `git_log` | Git log | All |
| `git_branch` | Git branch operations | All |
| `search_code` | Search code (ripgrep) | All |
| `find_file` | Find files by name | All |
| `glob` | Advanced glob search | All |
| `grep` | Content search | All |
| `spawn_agent` | Spawn subagent | Build, Compose |
| `list_agents` | List active agents | All |
| `store_memory` | Store memory | All |
| `search_memory` | Search memory (FTS5) | All |
| `list_memory` | List memories | All |
| `lsp_info` | LSP diagnostics | All |

## CLI Commands

```bash
# Start interactive chat
omagent
omagent --mode build    # Build mode (default)
omagent --mode plan     # Plan mode
omagent --mode compose  # Compose mode
omagent --mode explore  # Explore mode

# Project management
omagent init            # Initialize config
omagent config          # Show configuration
omagent version         # Show version

# Session management
omagent sessions        # List past sessions

# Knowledge management
omagent dream <session-id>    # Extract knowledge
omagent distill <session-id>  # Package workflows as skills

# Tools
omagent tools           # List available tools

# Help
omagent --help          # Show help
```

## Interactive Commands

While in chat, use these slash commands:

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/quit` | Exit chat |
| `/exit` | Exit chat |
| `/mode build` | Switch to build mode |
| `/mode plan` | Switch to plan mode |
| `/mode compose` | Switch to compose mode |
| `/goal <description>` | Set a goal |

## Memory System

OmAgent uses SQLite FTS5 for persistent cross-session memory:

- **Project Memory** (`MEMORY.md`) - Architecture decisions, rules
- **Session Checkpoints** (`checkpoint.md`) - Automatic state snapshots
- **Notes** (`notes.md`) - Temporary scratchpad
- **Skills** (`skills.md`) - Distilled workflows

### Memory Commands

```bash
# Store a memory
store_memory --path MEMORY.md --scope project --type architecture --content "..."

# Search memory
search_memory --query "database design"

# List memories
list_memory --scope project
```

## Skills System

Skills are reusable workflows stored in `.omagent/skills/`:

```markdown
---
description: Translate text to Spanish
---
Translate the following text to Spanish, preserving technical terms.
```

## MCP Integration

Configure MCP servers in `.omagent/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `API_KEY` | Generic API key fallback |
| `OMAGENT_BIN_PATH` | Override binary path |

## Architecture

```
omagent/
├── src/
│   ├── agents/          # Agent system (build, plan, compose, explore)
│   │   ├── base.ts      # Base agent class
│   │   ├── build.ts     # Build mode agent
│   │   ├── plan.ts      # Plan mode agent
│   │   ├── compose.ts   # Compose mode agent
│   │   ├── explore.ts   # Explore mode agent
│   │   └── orchestrator.ts  # Agent lifecycle management
│   ├── core/            # Core infrastructure
│   │   ├── types.ts     # TypeScript types
│   │   ├── context.ts   # Context manager
│   │   ├── goal.ts      # Goal-driven execution
│   │   ├── checkpoint.ts # Session checkpoints
│   │   ├── compaction.ts # Context compression
│   │   ├── permissions.ts # Permission system
│   │   ├── skills.ts    # Skill system
│   │   └── bus.ts       # Event bus
│   ├── db/              # Database layer
│   │   ├── schema.ts    # Drizzle ORM schema
│   │   └── index.ts     # Database connection
│   ├── memory/          # Memory system
│   │   ├── index.ts     # FTS5 memory manager
│   │   └── dream.ts     # Dream & Distill
│   ├── providers/       # LLM providers
│   │   └── llm.ts       # OpenAI-compatible client
│   ├── session/         # Session management
│   │   └── index.ts     # Session manager
│   ├── tools/           # Tool registry (18+ tools)
│   │   ├── index.ts     # Tool registration
│   │   ├── file-tools.ts
│   │   ├── shell-tools.ts
│   │   ├── git-tools.ts
│   │   ├── search-tools.ts
│   │   ├── agent-tools.ts
│   │   ├── memory-tools.ts
│   │   ├── glob-tool.ts
│   │   ├── mcp.ts       # MCP integration
│   │   └── lsp.ts       # LSP integration
│   ├── cli/             # CLI entry point
│   │   └── index.ts     # Main CLI
│   ├── config/          # Configuration
│   │   └── index.ts     # Config loader
│   └── utils/           # Utilities
│       └── index.ts     # Helper functions
├── bin/                 # Shell entry point
├── tests/               # Test files
├── .omagent/            # Project config
└── dist/                # Compiled binary
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Typecheck
bun run typecheck

# Build
bun run build

# Run tests
bun test
```

## License

MIT

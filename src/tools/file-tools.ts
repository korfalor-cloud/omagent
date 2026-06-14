import type { ToolDefinition } from "../core/types.js";
import fs from "fs";
import path from "path";
import { glob } from "fs/promises";

// ============================================================
// File Operation Tools
// ============================================================

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file. Returns the full file content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to working directory" },
    },
    required: ["path"],
  },
  execute: async (args) => {
    try {
      const filePath = path.resolve(process.cwd(), args.path as string);
      const content = fs.readFileSync(filePath, "utf-8");
      return { output: content };
    } catch (err: any) {
      return { output: `Error reading file: ${err.message}`, isError: true };
    }
  },
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Create or overwrite a file with the given content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to working directory" },
      content: { type: "string", description: "Content to write to the file" },
    },
    required: ["path", "content"],
  },
  execute: async (args) => {
    try {
      const filePath = path.resolve(process.cwd(), args.path as string);
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, args.content as string);
      return { output: `File written: ${args.path}` };
    } catch (err: any) {
      return { output: `Error writing file: ${err.message}`, isError: true };
    }
  },
};

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description: "Edit a file by replacing a string with new content (str_replace style).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      old_string: { type: "string", description: "Exact string to find and replace" },
      new_string: { type: "string", description: "Replacement string" },
    },
    required: ["path", "old_string", "new_string"],
  },
  execute: async (args) => {
    try {
      const filePath = path.resolve(process.cwd(), args.path as string);
      let content = fs.readFileSync(filePath, "utf-8");
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      if (!content.includes(oldStr)) return { output: "Error: old_string not found in file", isError: true };
      content = content.replace(oldStr, newStr);
      fs.writeFileSync(filePath, content);
      return { output: `File edited: ${args.path}` };
    } catch (err: any) {
      return { output: `Error editing file: ${err.message}`, isError: true };
    }
  },
};

export const listDirectoryTool: ToolDefinition = {
  name: "list_directory",
  description: "List files and directories at the given path.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path (default: current directory)" },
    },
  },
  execute: async (args) => {
    try {
      const dirPath = args.path ? path.resolve(process.cwd(), args.path as string) : process.cwd();
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = entries.filter((e) => e.isFile()).map((e) => e.name);
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      return { output: `Directories: ${dirs.join(", ") || "(none)"}\nFiles: ${files.join(", ") || "(none)"}` };
    } catch (err: any) {
      return { output: `Error listing directory: ${err.message}`, isError: true };
    }
  },
};

export const globFilesTool: ToolDefinition = {
  name: "glob_files",
  description: "Find files matching a glob pattern.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g., **/*.ts)" },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    try {
      const pattern = args.pattern as string;
      const dir = process.cwd();
      const results: string[] = [];
      const walk = (d: string) => {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(d, e.name);
          const rel = path.relative(dir, full);
          if (e.isDirectory() && !e.name.startsWith(".")) walk(full);
          else if (e.isFile()) {
             const minimatch = (s: string, p: string) => {
               const regex = new RegExp("^" + p.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
               return regex.test(s);
             };
             if (minimatch(rel, pattern)) results.push(rel);
          }
        }
      };
      walk(dir);
      return { output: results.join("\n") || "No files found" };
    } catch (err: any) {
      return { output: `Error: ${err.message}`, isError: true };
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "Delete a file or empty directory.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to delete" },
    },
    required: ["path"],
  },
  execute: async (args) => {
    try {
      const filePath = path.resolve(process.cwd(), args.path as string);
      fs.rmSync(filePath, { recursive: true });
      return { output: `Deleted: ${args.path}` };
    } catch (err: any) {
      return { output: `Error deleting: ${err.message}`, isError: true };
    }
  },
};

export const fileTools: ToolDefinition[] = [
  readFileTool, writeFileTool, editFileTool, listDirectoryTool, globFilesTool, deleteFileTool,
];

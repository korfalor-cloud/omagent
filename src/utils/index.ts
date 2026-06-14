import crypto from "crypto";
import { execSync } from "child_process";

export function generateId(): string { return crypto.randomUUID(); }
export function shortId(): string { return generateId().slice(0, 8); }
export function hashContent(content: string): string { return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16); }
export function truncate(str: string, max: number): string { return str.length > max ? str.slice(0, max) + "..." : str; }
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
export function getGitRoot(dir: string): string {
  try { return execSync("git rev-parse --show-toplevel", { cwd: dir, encoding: "utf-8" }).trim(); } catch { return dir; }
}
export function resolveWorkDir(): string { return process.cwd(); }

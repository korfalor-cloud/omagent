import { describe, it, expect } from "bun:test";
import { loadConfig } from "../src/config/index.js";

describe("Config", () => {
  it("should load default config", () => {
    const config = loadConfig();
    expect(config).toBeTruthy();
    expect(config.version).toBe("0.1.0");
    expect(config.defaultProvider).toBeTruthy();
    expect(Array.isArray(config.providers)).toBe(true);
    expect(config.providers.length).toBeGreaterThan(0);
  });

  it("should have provider configs", () => {
    const config = loadConfig();
    const ids = config.providers.map((p: any) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
  });

  it("should have memory config defaults", () => {
    const config = loadConfig();
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.maxTokens).toBe(8000);
    expect(config.memory.checkpointFrequency).toBe(10);
  });

  it("should have experimental config defaults", () => {
    const config = loadConfig();
    expect(config.experimental.maxMode).toBe(false);
    expect(config.experimental.parallelAgents).toBe(true);
  });
});

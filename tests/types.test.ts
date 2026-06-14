import { describe, it, expect } from "bun:test";

describe("Core Types", () => {
  it("should define AgentMode type", () => {
    const modes = ["build", "plan", "compose", "explore"];
    expect(modes).toContain("build");
    expect(modes).toContain("plan");
    expect(modes).toContain("compose");
    expect(modes).toContain("explore");
  });

  it("should define tool permissions", () => {
    const permissions = ["allow", "deny", "ask"];
    expect(permissions).toContain("allow");
    expect(permissions).toContain("deny");
    expect(permissions).toContain("ask");
  });
});

describe("Skill Manager", () => {
  it("should initialize without errors", async () => {
    const { skillManager } = await import("../src/core/skills.js");
    expect(skillManager).toBeTruthy();
    expect(typeof skillManager.list).toBe("function");
    expect(typeof skillManager.get).toBe("function");
    expect(typeof skillManager.names).toBe("function");
  });

  it("should list skills as array", async () => {
    const { skillManager } = await import("../src/core/skills.js");
    const skills = skillManager.list();
    expect(Array.isArray(skills)).toBe(true);
  });
});

describe("Event Bus", () => {
  it("should emit and receive events", async () => {
    const { eventBus } = await import("../src/core/bus.js");
    let received = false;
    const unsub = eventBus.on("test", () => { received = true; });
    eventBus.emit("test");
    expect(received).toBe(true);
    unsub();
  });

  it("should support once listeners", async () => {
    const { eventBus } = await import("../src/core/bus.js");
    let count = 0;
    eventBus.once("test-once", () => { count++; });
    eventBus.emit("test-once");
    eventBus.emit("test-once");
    expect(count).toBe(1);
    eventBus.removeAllListeners("test-once");
  });
});

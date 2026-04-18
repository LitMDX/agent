/**
 * Tests for SkillsPlugin.
 *
 * Strategy: build a minimal fake LocalAgent that captures addHook calls and
 * exposes systemPrompt as a mutable property, then verify:
 *   - getTools() returns the `skills` tool (or nothing when empty)
 *   - The `skills` tool callback returns instructions or an error message
 *   - initAgent injects <available_skills> XML into systemPrompt immediately
 *   - The BeforeInvocationEvent hook refreshes systemPrompt on every call
 *   - Plugin identity (name, instanceof)
 */

import { describe, it, expect, vi } from "vitest";
import { BeforeInvocationEvent } from "@strands-agents/sdk";
import { SkillsPlugin } from "../../../src/session/skills/plugin.js";
import type { SkillDefinition } from "../../../src/session/skills/types.js";
import type { LocalAgent } from "@strands-agents/sdk";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SKILL_A: SkillDefinition = {
  name: "mdx-troubleshooting",
  description: "Diagnose and fix MDX compilation errors.",
  instructions: "# MDX Troubleshooting\nYou are an expert MDX debugger.",
};

const SKILL_B: SkillDefinition = {
  name: "litmdx-basics",
  description: "Explain core LitMDX concepts to beginners.",
  instructions: "# LitMDX Basics\nStart with a friendly overview.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventClass = abstract new (...args: unknown[]) => unknown;

function makeFakeAgent(initialSystemPrompt = "You are a helpful docs agent.") {
  const hooks = new Map<EventClass, Array<(e: unknown) => void>>();

  const agent = {
    systemPrompt: initialSystemPrompt as string | undefined,
    addHook: vi.fn((eventClass: EventClass, cb: (e: unknown) => void) => {
      if (!hooks.has(eventClass)) hooks.set(eventClass, []);
      hooks.get(eventClass)!.push(cb);
    }),
    fire(eventClass: EventClass) {
      // Simulate the SDK firing the event — passes the agent reference back
      const event = { agent } as unknown;
      for (const cb of hooks.get(eventClass) ?? []) cb(event);
    },
    hookCount() {
      return [...hooks.values()].reduce((n, list) => n + list.length, 0);
    },
  } as unknown as LocalAgent & {
    fire: (cls: EventClass) => void;
    hookCount: () => number;
  };

  return agent;
}

function _getToolByName(plugin: SkillsPlugin, name: string) {
  const tools = plugin.getTools();
  // FunctionTool / ZodTool expose .name directly
  return tools.find((t) => (t as unknown as { name: string }).name === name);
}

// Invoke the skills tool callback directly via invoke()
async function callSkillsTool(plugin: SkillsPlugin, skill_name: string): Promise<string> {
  const tools = plugin.getTools() as unknown as Array<{
    invoke: (input: { skill_name: string }) => Promise<string>;
  }>;
  if (!tools[0]) throw new Error("No tools registered");
  return tools[0].invoke({ skill_name });
}

// ---------------------------------------------------------------------------
// Plugin identity
// ---------------------------------------------------------------------------

describe("SkillsPlugin — identity", () => {
  it("has name 'litmdx:skills'", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    expect(plugin.name).toBe("litmdx:skills");
  });

  it("is an instance of SkillsPlugin", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    expect(plugin).toBeInstanceOf(SkillsPlugin);
  });
});

// ---------------------------------------------------------------------------
// getTools — tool registration
// ---------------------------------------------------------------------------

describe("SkillsPlugin — getTools()", () => {
  it("returns empty array when no skills are provided", () => {
    const plugin = new SkillsPlugin([]);
    expect(plugin.getTools()).toHaveLength(0);
  });

  it("returns a single 'skills' tool when skills are provided", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const tools = plugin.getTools();
    expect(tools).toHaveLength(1);
    const tool = tools[0] as unknown as { name: string; toolSpec: { description: string } };
    expect(tool.name).toBe("skills");
    expect(tool.toolSpec.description).toContain("<available_skills>");
  });

  it("returns the same tool count regardless of how many skills are defined", () => {
    const plugin = new SkillsPlugin([SKILL_A, SKILL_B]);
    expect(plugin.getTools()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getTools — skills tool callback
// ---------------------------------------------------------------------------

describe("SkillsPlugin — skills tool callback", () => {
  it("returns skill instructions for a known skill name", async () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const result = await callSkillsTool(plugin, "mdx-troubleshooting");
    expect(result).toBe(SKILL_A.instructions);
  });

  it("returns full instructions for the second skill", async () => {
    const plugin = new SkillsPlugin([SKILL_A, SKILL_B]);
    const result = await callSkillsTool(plugin, "litmdx-basics");
    expect(result).toBe(SKILL_B.instructions);
  });

  it("returns an error message for an unknown skill name", async () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const result = await callSkillsTool(plugin, "nonexistent");
    expect(result).toMatch(/not found/i);
    expect(result).toContain("mdx-troubleshooting");
  });

  it("error message lists all available skills", async () => {
    const plugin = new SkillsPlugin([SKILL_A, SKILL_B]);
    const result = await callSkillsTool(plugin, "unknown");
    expect(result).toContain("mdx-troubleshooting");
    expect(result).toContain("litmdx-basics");
  });
});

// ---------------------------------------------------------------------------
// initAgent — system prompt injection
// ---------------------------------------------------------------------------

describe("SkillsPlugin — initAgent() system prompt injection", () => {
  it("appends <available_skills> XML to systemPrompt immediately on init", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const agent = makeFakeAgent("Base prompt.");
    plugin.initAgent(agent);

    expect(typeof agent.systemPrompt).toBe("string");
    const prompt = agent.systemPrompt as string;
    expect(prompt).toContain("Base prompt.");
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>mdx-troubleshooting</name>");
    expect(prompt).toContain("<description>Diagnose and fix MDX compilation errors.</description>");
    expect(prompt).toContain("</available_skills>");
  });

  it("lists all skills in the discovery XML", () => {
    const plugin = new SkillsPlugin([SKILL_A, SKILL_B]);
    const agent = makeFakeAgent("Prompt.");
    plugin.initAgent(agent);

    const prompt = agent.systemPrompt as string;
    expect(prompt).toContain("<name>mdx-troubleshooting</name>");
    expect(prompt).toContain("<name>litmdx-basics</name>");
  });

  it("does NOT modify systemPrompt when no skills are configured", () => {
    const plugin = new SkillsPlugin([]);
    const agent = makeFakeAgent("Original.");
    plugin.initAgent(agent);
    expect(agent.systemPrompt).toBe("Original.");
  });

  it("does NOT register a hook when no skills are configured", () => {
    const plugin = new SkillsPlugin([]);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);
    expect((agent as ReturnType<typeof makeFakeAgent>).hookCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// initAgent — BeforeInvocationEvent hook
// ---------------------------------------------------------------------------

describe("SkillsPlugin — BeforeInvocationEvent hook", () => {
  it("registers exactly one BeforeInvocationEvent hook", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);
    expect(agent.addHook).toHaveBeenCalledWith(BeforeInvocationEvent, expect.any(Function));
    expect((agent as ReturnType<typeof makeFakeAgent>).hookCount()).toBe(1);
  });

  it("refreshes systemPrompt to base + XML on each invocation", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const agent = makeFakeAgent("Base.");
    plugin.initAgent(agent);

    // Simulate external modification
    agent.systemPrompt = "Tampered.";

    // Fire the hook — should reset to base + XML
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeInvocationEvent);

    const prompt = agent.systemPrompt as string;
    expect(prompt).toContain("Base.");
    expect(prompt).toContain("<available_skills>");
    expect(prompt).not.toContain("Tampered.");
  });

  it("does not accumulate XML across multiple invocations", () => {
    const plugin = new SkillsPlugin([SKILL_A]);
    const agent = makeFakeAgent("Prompt.");
    plugin.initAgent(agent);

    const fakeAgent = agent as ReturnType<typeof makeFakeAgent>;
    fakeAgent.fire(BeforeInvocationEvent);
    fakeAgent.fire(BeforeInvocationEvent);
    fakeAgent.fire(BeforeInvocationEvent);

    const prompt = agent.systemPrompt as string;
    // There should be exactly one <available_skills> block
    const count = (prompt.match(/<available_skills>/g) ?? []).length;
    expect(count).toBe(1);
  });
});

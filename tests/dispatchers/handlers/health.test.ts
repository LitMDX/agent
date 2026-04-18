import { describe, it, expect } from "vitest";
import { handleHealth } from "../../../src/dispatcher/handlers/health.js";
import { makeMockStore } from "../fixtures.js";

describe("handleHealth", () => {
  it("returns kind json with status 200", () => {
    const { store } = makeMockStore();
    const result = handleHealth(store, { provider: "openai", model: "gpt-4o" });

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
  });

  it("body contains status ok", () => {
    const { store } = makeMockStore();
    const result = handleHealth(store, { provider: "anthropic", model: "claude-3" });

    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["status"]).toBe("ok");
    }
  });

  it("body reflects configured provider", () => {
    const { store } = makeMockStore();

    const openai = handleHealth(store, { provider: "openai", model: undefined });
    const anthropic = handleHealth(store, { provider: "anthropic", model: undefined });

    if (openai.kind === "json")
      expect((openai.body as Record<string, unknown>)["provider"]).toBe("openai");
    if (anthropic.kind === "json")
      expect((anthropic.body as Record<string, unknown>)["provider"]).toBe("anthropic");
  });

  it("body reflects configured model", () => {
    const { store } = makeMockStore();
    const result = handleHealth(store, { provider: "openai", model: "gpt-4o-mini" });

    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["model"]).toBe("gpt-4o-mini");
    }
  });

  it("body reflects undefined model when not set", () => {
    const { store } = makeMockStore();
    const result = handleHealth(store, { provider: "openai", model: undefined });

    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["model"]).toBeUndefined();
    }
  });

  it("body sessions reflects current store size", async () => {
    const { store } = makeMockStore();

    const before = handleHealth(store, { provider: "openai", model: undefined });
    if (before.kind === "json")
      expect((before.body as Record<string, unknown>)["sessions"]).toBe(0);

    await store.getOrCreate("s1");
    await store.getOrCreate("s2");

    const after = handleHealth(store, { provider: "openai", model: undefined });
    if (after.kind === "json") expect((after.body as Record<string, unknown>)["sessions"]).toBe(2);
  });
});

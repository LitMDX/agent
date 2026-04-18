import { describe, it, expect } from "vitest";
import { resolveApiKey, PROVIDER_ENV_VARS } from "../../src/model/env.js";

// ---------------------------------------------------------------------------
// resolveApiKey
// ---------------------------------------------------------------------------

describe("resolveApiKey", () => {
  // ── configKey takes priority ──────────────────────────────────────────────

  it("returns configKey when it is provided", () => {
    expect(resolveApiKey("openai", "explicit-key")).toBe("explicit-key");
  });

  it("returns configKey even when matching env var is set", () => {
    const original = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "env-key";
    try {
      expect(resolveApiKey("openai", "explicit-key")).toBe("explicit-key");
    } finally {
      if (original === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = original;
    }
  });

  // ── falls back to env var ─────────────────────────────────────────────────

  it("reads OPENAI_API_KEY from env when configKey is empty", () => {
    const original = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "env-openai-key";
    try {
      expect(resolveApiKey("openai", "")).toBe("env-openai-key");
    } finally {
      if (original === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = original;
    }
  });

  it("reads ANTHROPIC_API_KEY from env when configKey is empty", () => {
    const original = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "env-anthropic-key";
    try {
      expect(resolveApiKey("anthropic", "")).toBe("env-anthropic-key");
    } finally {
      if (original === undefined) delete process.env["ANTHROPIC_API_KEY"];
      else process.env["ANTHROPIC_API_KEY"] = original;
    }
  });

  it("reads GEMINI_API_KEY from env when configKey is empty", () => {
    const original = process.env["GEMINI_API_KEY"];
    process.env["GEMINI_API_KEY"] = "env-gemini-key";
    try {
      expect(resolveApiKey("gemini", "")).toBe("env-gemini-key");
    } finally {
      if (original === undefined) delete process.env["GEMINI_API_KEY"];
      else process.env["GEMINI_API_KEY"] = original;
    }
  });

  // ── returns empty string when nothing is set ──────────────────────────────

  it("returns empty string when configKey is empty and env var is absent", () => {
    const original = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    try {
      expect(resolveApiKey("openai", "")).toBe("");
    } finally {
      if (original !== undefined) process.env["OPENAI_API_KEY"] = original;
    }
  });

  // ── providers without an env var mapping ─────────────────────────────────

  it("returns empty string for bedrock when configKey is empty (no env var)", () => {
    expect(resolveApiKey("bedrock", "")).toBe("");
  });

  it("returns empty string for ollama when configKey is empty (no env var)", () => {
    expect(resolveApiKey("ollama", "")).toBe("");
  });

  // ── reads env lazily (at call time) ──────────────────────────────────────

  it("reads env var at call time, not at module import time", () => {
    const original = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    const before = resolveApiKey("openai", "");
    process.env["OPENAI_API_KEY"] = "late-set-key";
    const after = resolveApiKey("openai", "");
    if (original === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = original;

    expect(before).toBe("");
    expect(after).toBe("late-set-key");
  });
});

// ---------------------------------------------------------------------------
// PROVIDER_ENV_VARS — mapping correctness
// ---------------------------------------------------------------------------

describe("PROVIDER_ENV_VARS", () => {
  it("maps openai to OPENAI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["openai"]).toBe("OPENAI_API_KEY");
  });

  it("maps anthropic to ANTHROPIC_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["anthropic"]).toBe("ANTHROPIC_API_KEY");
  });

  it("maps gemini to GEMINI_API_KEY", () => {
    expect(PROVIDER_ENV_VARS["gemini"]).toBe("GEMINI_API_KEY");
  });

  it("has no entry for bedrock", () => {
    expect(PROVIDER_ENV_VARS["bedrock"]).toBeUndefined();
  });

  it("has no entry for ollama", () => {
    expect(PROVIDER_ENV_VARS["ollama"]).toBeUndefined();
  });
});

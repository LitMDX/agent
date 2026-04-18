import { describe, it, expect, vi } from "vitest";

// ── Mock SDK before importing index ─────────────────────────────────────────
vi.mock("@strands-agents/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strands-agents/sdk")>();
  return {
    ...actual,
    BedrockModel: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
      return { _kind: "bedrock-mock", modelId: opts["modelId"] };
    }),
  };
});

vi.mock("@strands-agents/sdk/models/openai", () => ({
  OpenAIModel: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
    return { _kind: "openai-mock", ...opts };
  }),
}));

vi.mock("@strands-agents/sdk/models/anthropic", () => ({
  AnthropicModel: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
    return { _kind: "anthropic-mock", ...opts };
  }),
}));

vi.mock("@strands-agents/sdk/models/google", () => ({
  GoogleModel: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
    return { _kind: "gemini-mock", ...opts };
  }),
}));

import { buildModel } from "../../src/model/index.js";

// ---------------------------------------------------------------------------
// buildModel — routing
// ---------------------------------------------------------------------------

describe("buildModel — routing", () => {
  it("routes openai to the OpenAI provider", async () => {
    const model = (await buildModel("openai", "key-123")) as Record<string, unknown>;
    expect(model["_kind"]).toBe("openai-mock");
  });

  it("passes the apiKey to OpenAI provider", async () => {
    const model = (await buildModel("openai", "my-openai-key")) as Record<string, unknown>;
    expect(model["apiKey"]).toBe("my-openai-key");
  });

  it("routes anthropic to the Anthropic provider", async () => {
    const model = (await buildModel("anthropic", "key-456")) as Record<string, unknown>;
    expect(model["_kind"]).toBe("anthropic-mock");
  });

  it("passes the apiKey to Anthropic provider", async () => {
    const model = (await buildModel("anthropic", "my-anthropic-key")) as Record<string, unknown>;
    expect(model["apiKey"]).toBe("my-anthropic-key");
  });

  it("routes bedrock to the Bedrock provider", async () => {
    const model = (await buildModel("bedrock", "")) as Record<string, unknown>;
    expect(model["_kind"]).toBe("bedrock-mock");
  });

  it("routes gemini to the Gemini provider", async () => {
    const model = (await buildModel("gemini", "key-789")) as Record<string, unknown>;
    expect(model["_kind"]).toBe("gemini-mock");
  });

  it("passes modelId to openai provider when provided", async () => {
    const model = (await buildModel("openai", "k", "gpt-4-turbo")) as Record<string, unknown>;
    expect(model["modelId"]).toBe("gpt-4-turbo");
  });

  it("passes modelId to anthropic provider when provided", async () => {
    const model = (await buildModel("anthropic", "k", "claude-3-opus")) as Record<string, unknown>;
    expect(model["modelId"]).toBe("claude-3-opus");
  });

  it("passes modelId to gemini provider when provided", async () => {
    const model = (await buildModel("gemini", "k", "gemini-2.0-flash")) as Record<string, unknown>;
    expect(model["modelId"]).toBe("gemini-2.0-flash");
  });
});

// ---------------------------------------------------------------------------
// buildModel — error paths
// ---------------------------------------------------------------------------

describe("buildModel — error paths", () => {
  it("throws for ollama provider", async () => {
    await expect(buildModel("ollama", "")).rejects.toThrow(/TypeScript SDK/i);
  });

  it("throws when openai apiKey resolves to empty string", async () => {
    const orig = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    try {
      await expect(buildModel("openai", "")).rejects.toThrow(/OPENAI_API_KEY/);
    } finally {
      if (orig !== undefined) process.env["OPENAI_API_KEY"] = orig;
    }
  });

  it("throws when anthropic apiKey resolves to empty string", async () => {
    const orig = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      await expect(buildModel("anthropic", "")).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (orig !== undefined) process.env["ANTHROPIC_API_KEY"] = orig;
    }
  });

  it("throws when gemini apiKey resolves to empty string", async () => {
    const orig = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      await expect(buildModel("gemini", "")).rejects.toThrow(/GEMINI_API_KEY/);
    } finally {
      if (orig !== undefined) process.env["GEMINI_API_KEY"] = orig;
    }
  });
});

// ---------------------------------------------------------------------------
// buildModel — env key resolution
// ---------------------------------------------------------------------------

describe("buildModel — env key resolution", () => {
  it("picks up OPENAI_API_KEY from env when configKey is empty", async () => {
    const orig = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "env-openai";
    try {
      const model = (await buildModel("openai", "")) as Record<string, unknown>;
      expect(model["apiKey"]).toBe("env-openai");
    } finally {
      if (orig === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = orig;
    }
  });

  it("explicit configKey takes priority over env var", async () => {
    const orig = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "env-key";
    try {
      const model = (await buildModel("openai", "explicit-key")) as Record<string, unknown>;
      expect(model["apiKey"]).toBe("explicit-key");
    } finally {
      if (orig === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = orig;
    }
  });
});

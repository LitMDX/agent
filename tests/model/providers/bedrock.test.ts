import { describe, it, expect, vi } from "vitest";

// Mock the SDK before importing bedrock builder so the lazy import resolves
vi.mock("@strands-agents/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strands-agents/sdk")>();
  return {
    ...actual,
    BedrockModel: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
      return { _kind: "bedrock-mock", modelId: opts["modelId"] };
    }),
  };
});

import { buildBedrockModel, DEFAULT_BEDROCK_MODEL } from "../../../src/model/providers/bedrock.js";

describe("buildBedrockModel", () => {
  it("resolves without throwing (no API key required)", async () => {
    await expect(buildBedrockModel()).resolves.toBeDefined();
  });

  it("uses the default model id when none is provided", async () => {
    const model = (await buildBedrockModel()) as Record<string, unknown>;
    expect(model["modelId"]).toBe(DEFAULT_BEDROCK_MODEL);
  });

  it("uses the supplied model id when provided", async () => {
    const customId = "us.amazon.titan-text-express-v1";
    const model = (await buildBedrockModel(customId)) as Record<string, unknown>;
    expect(model["modelId"]).toBe(customId);
  });
});

describe("DEFAULT_BEDROCK_MODEL", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_BEDROCK_MODEL).toBe("string");
    expect(DEFAULT_BEDROCK_MODEL.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildAnthropicModel,
  DEFAULT_ANTHROPIC_MODEL,
} from "../../../src/model/providers/anthropic.js";

describe("buildAnthropicModel", () => {
  it("throws when apiKey is empty string", async () => {
    await expect(buildAnthropicModel("")).rejects.toThrow("ANTHROPIC_API_KEY is not set.");
  });

  it("error message names the missing key", async () => {
    await expect(buildAnthropicModel("")).rejects.toThrowError(/ANTHROPIC_API_KEY/);
  });
});

describe("DEFAULT_ANTHROPIC_MODEL", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_ANTHROPIC_MODEL).toBe("string");
    expect(DEFAULT_ANTHROPIC_MODEL.length).toBeGreaterThan(0);
  });
});

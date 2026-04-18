import { describe, it, expect } from "vitest";
import { buildOpenAIModel, DEFAULT_OPENAI_MODEL } from "../../../src/model/providers/openai.js";

describe("buildOpenAIModel", () => {
  it("throws when apiKey is empty string", async () => {
    await expect(buildOpenAIModel("")).rejects.toThrow("OPENAI_API_KEY is not set.");
  });

  it("error message names the missing key", async () => {
    await expect(buildOpenAIModel("")).rejects.toThrowError(/OPENAI_API_KEY/);
  });
});

describe("DEFAULT_OPENAI_MODEL", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_OPENAI_MODEL).toBe("string");
    expect(DEFAULT_OPENAI_MODEL.length).toBeGreaterThan(0);
  });
});

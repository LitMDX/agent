import { describe, it, expect } from "vitest";
import { buildGeminiModel, DEFAULT_GEMINI_MODEL } from "../../../src/model/providers/gemini.js";

describe("buildGeminiModel", () => {
  it("throws when apiKey is empty string", async () => {
    await expect(buildGeminiModel("")).rejects.toThrow("GEMINI_API_KEY is not set.");
  });

  it("error message names the missing key", async () => {
    await expect(buildGeminiModel("")).rejects.toThrowError(/GEMINI_API_KEY/);
  });
});

describe("DEFAULT_GEMINI_MODEL", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_GEMINI_MODEL).toBe("string");
    expect(DEFAULT_GEMINI_MODEL.length).toBeGreaterThan(0);
  });
});

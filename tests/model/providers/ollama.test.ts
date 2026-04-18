import { describe, it, expect } from "vitest";
import { buildOllamaModel } from "../../../src/model/providers/ollama.js";

describe("buildOllamaModel", () => {
  it("always throws", () => {
    expect(() => buildOllamaModel()).toThrow();
  });

  it("error message mentions TypeScript SDK", () => {
    expect(() => buildOllamaModel()).toThrowError(/TypeScript SDK/i);
  });

  it("error message suggests supported providers", () => {
    expect(() => buildOllamaModel()).toThrowError(/openai|anthropic|bedrock|gemini/i);
  });
});

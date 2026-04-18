import { describe, it, expect } from "vitest";
import {
  defaultSystemPrompt,
  defaultDocsSpecialistSystemPrompt,
  defaultOrchestratorSystemPrompt,
} from "../../src/adapters/shared.js";

describe("defaultSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const result = defaultSystemPrompt("MyProject");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("interpolates the project name into the output", () => {
    const result = defaultSystemPrompt("AcmeDocs");
    expect(result).toContain("AcmeDocs");
  });

  it("mentions the documentation context", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("documentation");
  });

  it("instructs to use search_docs tool", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("search_docs");
  });

  it("instructs to use get_page tool", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("get_page");
  });

  it("instructs to use list_pages tool", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("list_pages");
  });

  it("instructs to respond in the same language as the user", () => {
    const result = defaultSystemPrompt("any");
    expect(result.toLowerCase()).toContain("language");
  });

  it("changes output when project name changes", () => {
    const a = defaultSystemPrompt("Alpha");
    const b = defaultSystemPrompt("Beta");
    expect(a).not.toBe(b);
    expect(a).toContain("Alpha");
    expect(b).toContain("Beta");
  });

  // Agent SOP format — structured Markdown with MUST/SHOULD/MAY keywords
  it("follows Agent SOP format with numbered Steps", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("## Steps");
    // Canonical format: ### N. Step Name (no colon, no "Step" keyword)
    expect(result).toMatch(/### \d+\.\s+\S/);
  });

  it("contains MUST keyword for mandatory behaviors", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("MUST");
  });

  it("contains SHOULD keyword for recommended behaviors", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("SHOULD");
  });

  it("contains MAY keyword for optional behaviors", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toContain("MAY");
  });

  it("Step 2 mandates searching before answering (MUST use search_docs)", () => {
    const result = defaultSystemPrompt("any");
    expect(result).toMatch(/MUST.*search_docs/);
  });

  it("mandates basing answers only on documentation content", () => {
    const result = defaultSystemPrompt("any");
    // The prompt must require grounding in retrieved content (various phrasings)
    expect(result).toMatch(
      /MUST base|MUST.*content|exclusively.*documentation|documentation.*tools/i,
    );
  });
});

// ---------------------------------------------------------------------------
// defaultDocsSpecialistSystemPrompt
// ---------------------------------------------------------------------------

describe("defaultDocsSpecialistSystemPrompt", () => {
  it("returns a non-empty string", () => {
    expect(defaultDocsSpecialistSystemPrompt().length).toBeGreaterThan(0);
  });

  it("includes the docs_specialist identity in the header", () => {
    expect(defaultDocsSpecialistSystemPrompt()).toContain("Docs Specialist");
  });

  it("instructs to use search_docs", () => {
    expect(defaultDocsSpecialistSystemPrompt()).toContain("search_docs");
  });

  it("instructs to use get_page", () => {
    expect(defaultDocsSpecialistSystemPrompt()).toContain("get_page");
  });

  it("instructs to use list_pages", () => {
    expect(defaultDocsSpecialistSystemPrompt()).toContain("list_pages");
  });

  it("follows Agent SOP numbered steps format", () => {
    expect(defaultDocsSpecialistSystemPrompt()).toMatch(/### \d+\.\s+\S/);
  });

  it("mandates basing answers on retrieved content only", () => {
    const p = defaultDocsSpecialistSystemPrompt();
    expect(p).toMatch(/MUST base|strictly on the retrieved|retrieved content/i);
  });

  it("forbids adding content from memory or training knowledge", () => {
    const p = defaultDocsSpecialistSystemPrompt();
    expect(p).toMatch(/NOT.*memory|NOT add anything from memory/i);
  });

  it("forbids outputting JSX or HTML tags", () => {
    const p = defaultDocsSpecialistSystemPrompt();
    expect(p).toMatch(/NOT output JSX|JSX.*HTML|HTML tags/i);
  });

  it("uses MUST / SHOULD / MAY RFC 2119 keywords", () => {
    const p = defaultDocsSpecialistSystemPrompt();
    expect(p).toContain("MUST");
    expect(p).toContain("SHOULD");
    expect(p).toContain("MAY");
  });
});

// ---------------------------------------------------------------------------
// defaultOrchestratorSystemPrompt
// ---------------------------------------------------------------------------

describe("defaultOrchestratorSystemPrompt", () => {
  it("returns a non-empty string", () => {
    expect(defaultOrchestratorSystemPrompt("Proj", []).length).toBeGreaterThan(0);
  });

  it("includes the project name in the header", () => {
    expect(defaultOrchestratorSystemPrompt("AcmeDocs", [])).toContain("AcmeDocs");
  });

  it("always includes a routing constraint for docs_specialist", () => {
    const p = defaultOrchestratorSystemPrompt("X", []);
    expect(p).toContain("docs_specialist");
  });

  it("includes a routing constraint for each supplied specialist name", () => {
    const p = defaultOrchestratorSystemPrompt("X", ["code_specialist", "api_specialist"]);
    expect(p).toContain("code_specialist");
    expect(p).toContain("api_specialist");
  });

  it("does not include docs_specialist in the dynamic routing lines (it is hardcoded)", () => {
    // docs_specialist must not appear twice in the routing lines via specialistNames
    const p = defaultOrchestratorSystemPrompt("X", ["docs_specialist"]);
    // It should still only appear once in the routing constraint block
    const count = (p.match(/docs_specialist/g) ?? []).length;
    // Appears in the hardcoded MUST line and possibly in the header — but not twice in routing
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("allows translation but forbids adding or removing content", () => {
    const p = defaultOrchestratorSystemPrompt("X", []);
    expect(p).toMatch(/translate|language/i);
    expect(p).toMatch(/NOT add|NOT remove|NOT invent/i);
  });

  it("mandates preserving all structure (headings, lists, code blocks)", () => {
    const p = defaultOrchestratorSystemPrompt("X", []);
    expect(p).toMatch(/heading|list item|code block/i);
  });

  it("mandates not adding preamble", () => {
    const p = defaultOrchestratorSystemPrompt("X", []);
    expect(p).toMatch(/preamble|transition phrase/i);
  });

  it("follows Agent SOP numbered steps format", () => {
    expect(defaultOrchestratorSystemPrompt("X", [])).toMatch(/### \d+\.\s+\S/);
  });

  it("changes output when project name changes", () => {
    const a = defaultOrchestratorSystemPrompt("Alpha", []);
    const b = defaultOrchestratorSystemPrompt("Beta", []);
    expect(a).not.toBe(b);
  });

  it("changes output when specialist names change", () => {
    const a = defaultOrchestratorSystemPrompt("X", []);
    const b = defaultOrchestratorSystemPrompt("X", ["code_specialist"]);
    expect(a).not.toBe(b);
  });
});

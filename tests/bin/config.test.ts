import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseArgs, resolveServerConfig } from "../../src/bin/config.js";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns empty object for empty argv", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("parses a single --key value pair", () => {
    expect(parseArgs(["--docs", "/my/docs"])).toEqual({ docs: "/my/docs" });
  });

  it("parses multiple flags", () => {
    expect(parseArgs(["--provider", "anthropic", "--port", "9000"])).toEqual({
      provider: "anthropic",
      port: "9000",
    });
  });

  it("ignores a flag whose next token is another flag", () => {
    const result = parseArgs(["--api-key", "--port", "9000"]);
    expect(result).not.toHaveProperty("api-key");
    expect(result["port"]).toBe("9000");
  });

  it("ignores a trailing flag with no value", () => {
    const result = parseArgs(["--port", "8000", "--model"]);
    expect(result["port"]).toBe("8000");
    expect(result).not.toHaveProperty("model");
  });

  it("parses all known server flags", () => {
    const argv = [
      "--docs",
      "/docs",
      "--docs-index-url",
      "https://example.com/index.json",
      "--provider",
      "openai",
      "--api-key",
      "sk-test",
      "--model",
      "gpt-4o",
      "--port",
      "8080",
      "--title",
      "My Docs",
      "--sessions",
      "/tmp/sessions",
      "--s3-bucket",
      "my-bucket",
      "--s3-region",
      "us-east-1",
      "--s3-prefix",
      "sessions/",
    ];
    const result = parseArgs(argv);
    expect(result).toEqual({
      docs: "/docs",
      "docs-index-url": "https://example.com/index.json",
      provider: "openai",
      "api-key": "sk-test",
      model: "gpt-4o",
      port: "8080",
      title: "My Docs",
      sessions: "/tmp/sessions",
      "s3-bucket": "my-bucket",
      "s3-region": "us-east-1",
      "s3-prefix": "sessions/",
    });
  });

  it("last occurrence wins for duplicate flags", () => {
    const result = parseArgs(["--port", "8000", "--port", "9000"]);
    expect(result["port"]).toBe("9000");
  });

  it("does not mutate the input array", () => {
    const argv = ["--port", "8000"];
    const copy = [...argv];
    parseArgs(argv);
    expect(argv).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// resolveServerConfig
// ---------------------------------------------------------------------------

describe("resolveServerConfig", () => {
  const emptyEnv: Record<string, string | undefined> = {};

  // ── defaults ──────────────────────────────────────────────────────────────

  it("defaults provider to 'openai'", () => {
    const cfg = resolveServerConfig({}, emptyEnv);
    expect(cfg.provider).toBe("openai");
  });

  it("defaults port to 8000", () => {
    const cfg = resolveServerConfig({}, emptyEnv);
    expect(cfg.port).toBe(8000);
  });

  it("defaults docsDir to resolved 'docs'", () => {
    const cfg = resolveServerConfig({}, emptyEnv);
    expect(cfg.docsDir).toBe(path.resolve("docs"));
  });

  it("defaults apiKey to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).apiKey).toBeUndefined();
  });

  it("defaults model to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).model).toBeUndefined();
  });

  it("defaults projectTitle to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).projectTitle).toBeUndefined();
  });

  it("defaults sessionsDir to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).sessionsDir).toBeUndefined();
  });

  // ── CLI args take priority over env vars ──────────────────────────────────

  it("CLI --provider overrides env LITMDX_AGENT_PROVIDER", () => {
    const cfg = resolveServerConfig({ provider: "anthropic" }, { LITMDX_AGENT_PROVIDER: "openai" });
    expect(cfg.provider).toBe("anthropic");
  });

  it("CLI --port overrides env LITMDX_AGENT_PORT", () => {
    const cfg = resolveServerConfig({ port: "9001" }, { LITMDX_AGENT_PORT: "7777" });
    expect(cfg.port).toBe(9001);
  });

  it("CLI --docs overrides env LITMDX_AGENT_DOCS_DIR", () => {
    const cfg = resolveServerConfig({ docs: "/cli/docs" }, { LITMDX_AGENT_DOCS_DIR: "/env/docs" });
    expect(cfg.docsDir).toBe(path.resolve("/cli/docs"));
  });

  it("CLI --api-key overrides env LITMDX_AGENT_API_KEY", () => {
    const cfg = resolveServerConfig({ "api-key": "cli-key" }, { LITMDX_AGENT_API_KEY: "env-key" });
    expect(cfg.apiKey).toBe("cli-key");
  });

  it("CLI --model overrides env LITMDX_AGENT_MODEL", () => {
    const cfg = resolveServerConfig({ model: "gpt-4o" }, { LITMDX_AGENT_MODEL: "gpt-3.5" });
    expect(cfg.model).toBe("gpt-4o");
  });

  it("CLI --title overrides env LITMDX_AGENT_TITLE", () => {
    const cfg = resolveServerConfig({ title: "CLI Title" }, { LITMDX_AGENT_TITLE: "Env Title" });
    expect(cfg.projectTitle).toBe("CLI Title");
  });

  it("CLI --sessions overrides env LITMDX_AGENT_SESSIONS_DIR", () => {
    const cfg = resolveServerConfig(
      { sessions: "/cli/sessions" },
      { LITMDX_AGENT_SESSIONS_DIR: "/env/sessions" },
    );
    expect(cfg.sessionsDir).toBe("/cli/sessions");
  });

  // ── env vars fall back when no CLI arg is provided ────────────────────────

  it("env LITMDX_AGENT_PROVIDER is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_PROVIDER: "bedrock" });
    expect(cfg.provider).toBe("bedrock");
  });

  it("env LITMDX_AGENT_PORT is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_PORT: "4321" });
    expect(cfg.port).toBe(4321);
  });

  it("env LITMDX_AGENT_DOCS_DIR is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_DOCS_DIR: "/env/docs" });
    expect(cfg.docsDir).toBe(path.resolve("/env/docs"));
  });

  it("env LITMDX_AGENT_API_KEY is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_API_KEY: "env-key" });
    expect(cfg.apiKey).toBe("env-key");
  });

  it("env LITMDX_AGENT_MODEL is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_MODEL: "claude-3" });
    expect(cfg.model).toBe("claude-3");
  });

  it("env LITMDX_AGENT_TITLE is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_TITLE: "Env Title" });
    expect(cfg.projectTitle).toBe("Env Title");
  });

  it("env LITMDX_AGENT_SESSIONS_DIR is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_SESSIONS_DIR: "/env/sessions" });
    expect(cfg.sessionsDir).toBe("/env/sessions");
  });

  // ── docsIndexUrl ──────────────────────────────────────────────────────────

  it("defaults docsIndexUrl to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).docsIndexUrl).toBeUndefined();
  });

  it("CLI --docs-index-url overrides env LITMDX_AGENT_DOCS_INDEX_URL", () => {
    const cfg = resolveServerConfig(
      { "docs-index-url": "https://cli.example.com/index.json" },
      { LITMDX_AGENT_DOCS_INDEX_URL: "https://env.example.com/index.json" },
    );
    expect(cfg.docsIndexUrl).toBe("https://cli.example.com/index.json");
  });

  it("env LITMDX_AGENT_DOCS_INDEX_URL is used when no CLI arg", () => {
    const cfg = resolveServerConfig(
      {},
      { LITMDX_AGENT_DOCS_INDEX_URL: "https://env.example.com/index.json" },
    );
    expect(cfg.docsIndexUrl).toBe("https://env.example.com/index.json");
  });

  // ── S3 storage ────────────────────────────────────────────────────────────

  it("defaults s3Bucket to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).s3Bucket).toBeUndefined();
  });

  it("defaults s3Region to undefined when no env", () => {
    expect(resolveServerConfig({}, emptyEnv).s3Region).toBeUndefined();
  });

  it("defaults s3Prefix to undefined", () => {
    expect(resolveServerConfig({}, emptyEnv).s3Prefix).toBeUndefined();
  });

  it("CLI --s3-bucket overrides env LITMDX_AGENT_S3_BUCKET", () => {
    const cfg = resolveServerConfig(
      { "s3-bucket": "cli-bucket" },
      { LITMDX_AGENT_S3_BUCKET: "env-bucket" },
    );
    expect(cfg.s3Bucket).toBe("cli-bucket");
  });

  it("env LITMDX_AGENT_S3_BUCKET is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_S3_BUCKET: "my-bucket" });
    expect(cfg.s3Bucket).toBe("my-bucket");
  });

  it("CLI --s3-region overrides env LITMDX_AGENT_S3_REGION", () => {
    const cfg = resolveServerConfig(
      { "s3-region": "us-west-2" },
      { LITMDX_AGENT_S3_REGION: "eu-west-1" },
    );
    expect(cfg.s3Region).toBe("us-west-2");
  });

  it("env LITMDX_AGENT_S3_REGION is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_S3_REGION: "eu-west-1" });
    expect(cfg.s3Region).toBe("eu-west-1");
  });

  it("falls back to AWS_REGION when LITMDX_AGENT_S3_REGION is not set", () => {
    const cfg = resolveServerConfig({}, { AWS_REGION: "ap-southeast-1" });
    expect(cfg.s3Region).toBe("ap-southeast-1");
  });

  it("LITMDX_AGENT_S3_REGION takes priority over AWS_REGION", () => {
    const cfg = resolveServerConfig(
      {},
      { LITMDX_AGENT_S3_REGION: "eu-central-1", AWS_REGION: "us-east-1" },
    );
    expect(cfg.s3Region).toBe("eu-central-1");
  });

  it("CLI --s3-prefix overrides env LITMDX_AGENT_S3_PREFIX", () => {
    const cfg = resolveServerConfig(
      { "s3-prefix": "cli/prefix" },
      { LITMDX_AGENT_S3_PREFIX: "env/prefix" },
    );
    expect(cfg.s3Prefix).toBe("cli/prefix");
  });

  it("env LITMDX_AGENT_S3_PREFIX is used when no CLI arg", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_S3_PREFIX: "sessions/" });
    expect(cfg.s3Prefix).toBe("sessions/");
  });

  // ── type coercions ────────────────────────────────────────────────────────

  it("port is parsed as a number", () => {
    const cfg = resolveServerConfig({ port: "1234" }, emptyEnv);
    expect(typeof cfg.port).toBe("number");
    expect(cfg.port).toBe(1234);
  });

  it("docsDir is an absolute path regardless of input", () => {
    const cfg = resolveServerConfig({ docs: "relative/docs" }, emptyEnv);
    expect(path.isAbsolute(cfg.docsDir)).toBe(true);
  });

  // ── context7 ─────────────────────────────────────────────────────────────

  it("defaults context7 to false", () => {
    expect(resolveServerConfig({}, emptyEnv).context7).toBe(false);
  });

  it("CLI --context7 true enables Context7", () => {
    const cfg = resolveServerConfig({ context7: "true" }, emptyEnv);
    expect(cfg.context7).toBe(true);
  });

  it("env LITMDX_AGENT_CONTEXT7=true enables Context7", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_CONTEXT7: "true" });
    expect(cfg.context7).toBe(true);
  });

  it("env LITMDX_AGENT_CONTEXT7=1 enables Context7", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_CONTEXT7: "1" });
    expect(cfg.context7).toBe(true);
  });

  it("env LITMDX_AGENT_CONTEXT7=false keeps Context7 disabled", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_CONTEXT7: "false" });
    expect(cfg.context7).toBe(false);
  });

  it("CLI --context7 overrides env LITMDX_AGENT_CONTEXT7", () => {
    const cfg = resolveServerConfig({ context7: "false" }, { LITMDX_AGENT_CONTEXT7: "true" });
    expect(cfg.context7).toBe(false);
  });

  // ── notebook ──────────────────────────────────────────────────────────────

  it("defaults notebook to false", () => {
    expect(resolveServerConfig({}, emptyEnv).notebook).toBe(false);
  });

  it("CLI --notebook true enables notebook tool", () => {
    const cfg = resolveServerConfig({ notebook: "true" }, emptyEnv);
    expect(cfg.notebook).toBe(true);
  });

  it("env LITMDX_AGENT_NOTEBOOK=true enables notebook tool", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_NOTEBOOK: "true" });
    expect(cfg.notebook).toBe(true);
  });

  it("env LITMDX_AGENT_NOTEBOOK=false keeps notebook disabled", () => {
    const cfg = resolveServerConfig({}, { LITMDX_AGENT_NOTEBOOK: "false" });
    expect(cfg.notebook).toBe(false);
  });

  it("CLI --notebook overrides env LITMDX_AGENT_NOTEBOOK", () => {
    const cfg = resolveServerConfig({ notebook: "false" }, { LITMDX_AGENT_NOTEBOOK: "true" });
    expect(cfg.notebook).toBe(false);
  });
});

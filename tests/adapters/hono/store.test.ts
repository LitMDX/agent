import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock heavy dependencies ──────────────────────────────────────────────────

const mockDispatch = vi.hoisted(() => vi.fn());
const mockCreateDispatcher = vi.hoisted(() => vi.fn().mockReturnValue(mockDispatch));
const mockSessionStore = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return {};
  }),
);
const mockBuildModel = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "mock-model" }));
const mockCreateTools = vi.hoisted(() => vi.fn().mockReturnValue([{ name: "mock-tool" }]));
const mockBuildIndex = vi.hoisted(() => vi.fn().mockReturnValue(new Map([["page", {}]])));
const mockFetchRemoteIndex = vi.hoisted(() =>
  vi.fn().mockResolvedValue(new Map([["remote-page", {}]])),
);
const mockConfigureSdkLogging = vi.hoisted(() => vi.fn());

vi.mock("../../../src/dispatcher/index.js", () => ({
  createDispatcher: mockCreateDispatcher,
}));

vi.mock("../../../src/session/index.js", () => ({
  SessionStore: mockSessionStore,
}));

vi.mock("../../../src/model/index.js", () => ({
  buildModel: mockBuildModel,
}));

vi.mock("../../../src/tools/index.js", () => ({
  createTools: mockCreateTools,
}));

vi.mock("../../../src/indexer/index.js", () => ({
  buildIndex: mockBuildIndex,
  fetchRemoteIndex: mockFetchRemoteIndex,
}));

vi.mock("../../../src/logging/sdk.js", () => ({
  configureSdkLogging: mockConfigureSdkLogging,
}));

import { createGetStore } from "../../../src/adapters/hono/store.js";

// ── Base options ─────────────────────────────────────────────────────────────

const baseOpts = {
  provider: "openai" as const,
  apiKey: "test-key",
  docsDir: "/fake/docs",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createGetStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configures official Strands SDK logging when sdkLogging is enabled", () => {
    createGetStore({ ...baseOpts, sdkLogging: true });
    expect(mockConfigureSdkLogging).toHaveBeenCalledOnce();
    expect(mockConfigureSdkLogging).toHaveBeenCalledWith(true);
  });

  it("passes a custom SDK logger through to configureSdkLogging", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    createGetStore({ ...baseOpts, sdkLogging: logger });

    expect(mockConfigureSdkLogging).toHaveBeenCalledOnce();
    expect(mockConfigureSdkLogging).toHaveBeenCalledWith(logger);
  });

  it("returns a function", () => {
    const getStore = createGetStore(baseOpts);
    expect(typeof getStore).toBe("function");
  });

  it("returns a StoreHandle with store and dispatch on first call", async () => {
    const getStore = createGetStore(baseOpts);
    const handle = await getStore();
    expect(handle).toHaveProperty("store");
    expect(handle).toHaveProperty("dispatch");
  });

  it("dispatch is the value returned by createDispatcher", async () => {
    const getStore = createGetStore(baseOpts);
    const { dispatch } = await getStore();
    expect(dispatch).toBe(mockDispatch);
  });

  it("calls createTools on first invocation", async () => {
    const getStore = createGetStore(baseOpts);
    await getStore();
    expect(mockCreateTools).toHaveBeenCalledOnce();
  });

  it("calls createDispatcher with the SessionStore instance and provider options", async () => {
    const getStore = createGetStore(baseOpts);
    await getStore();
    expect(mockCreateDispatcher).toHaveBeenCalledOnce();
    expect(mockCreateDispatcher).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "openai" }),
    );
  });

  it("returns the SAME cached handle on subsequent calls", async () => {
    const getStore = createGetStore(baseOpts);
    const first = await getStore();
    const second = await getStore();
    expect(first).toBe(second);
  });

  it("creates SessionStore only once even when called multiple times", async () => {
    const getStore = createGetStore(baseOpts);
    await getStore();
    await getStore();
    await getStore();
    expect(mockSessionStore).toHaveBeenCalledOnce();
  });

  it("each createGetStore call has its own independent cache", async () => {
    const getStoreA = createGetStore({ ...baseOpts, provider: "anthropic" });
    const getStoreB = createGetStore({ ...baseOpts, provider: "openai" });
    await getStoreA();
    await getStoreB();
    // Two separate SessionStore constructions
    expect(mockSessionStore).toHaveBeenCalledTimes(2);
  });

  it("uses the pre-built index when opts.index is provided", async () => {
    const prebuiltIndex = new Map([["pre", {}]]);
    const getStore = createGetStore({ ...baseOpts, index: prebuiltIndex as never });
    await getStore();
    // buildIndex should NOT have been called since index was supplied
    expect(mockBuildIndex).not.toHaveBeenCalled();
    // fetchRemoteIndex should NOT have been called either
    expect(mockFetchRemoteIndex).not.toHaveBeenCalled();
    // but createTools IS still called with the prebuilt index
    expect(mockCreateTools).toHaveBeenCalledWith(prebuiltIndex);
  });

  it("calls fetchRemoteIndex when docsIndexUrl is provided", async () => {
    const getStore = createGetStore({
      ...baseOpts,
      docsIndexUrl: "https://docs.example.com/docs-index.json",
    });
    await getStore();
    expect(mockFetchRemoteIndex).toHaveBeenCalledWith("https://docs.example.com/docs-index.json");
    expect(mockBuildIndex).not.toHaveBeenCalled();
  });

  it("passes the remote index to createTools when docsIndexUrl is used", async () => {
    const remoteIndex = new Map([["remote", {}]]);
    mockFetchRemoteIndex.mockResolvedValueOnce(remoteIndex);
    const getStore = createGetStore({
      ...baseOpts,
      docsIndexUrl: "https://docs.example.com/docs-index.json",
    });
    await getStore();
    expect(mockCreateTools).toHaveBeenCalledWith(remoteIndex);
  });

  it("pre-built index takes priority over docsIndexUrl", async () => {
    const prebuiltIndex = new Map([["pre", {}]]);
    const getStore = createGetStore({
      ...baseOpts,
      index: prebuiltIndex as never,
      docsIndexUrl: "https://docs.example.com/docs-index.json",
    });
    await getStore();
    // Neither fetch nor build should run — the pre-built Map is used directly
    expect(mockFetchRemoteIndex).not.toHaveBeenCalled();
    expect(mockBuildIndex).not.toHaveBeenCalled();
    expect(mockCreateTools).toHaveBeenCalledWith(prebuiltIndex);
  });

  it("falls back to process.env LITMDX_AGENT_DOCS_DIR when docsDir is absent", async () => {
    const origEnv = process.env["LITMDX_AGENT_DOCS_DIR"];
    process.env["LITMDX_AGENT_DOCS_DIR"] = "/env/docs";
    try {
      const getStore = createGetStore({ provider: "openai", apiKey: "k" });
      await getStore();
      expect(mockBuildIndex).toHaveBeenCalledWith(expect.stringContaining("docs"));
    } finally {
      if (origEnv === undefined) delete process.env["LITMDX_AGENT_DOCS_DIR"];
      else process.env["LITMDX_AGENT_DOCS_DIR"] = origEnv;
    }
  });

  it("uses custom systemPrompt when provided", async () => {
    const customPrompt = "You are a custom assistant.";
    const getStore = createGetStore({ ...baseOpts, systemPrompt: customPrompt });
    await getStore();
    expect(mockSessionStore).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: customPrompt }),
    );
  });
});

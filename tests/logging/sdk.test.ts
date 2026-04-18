import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfigureLogging = vi.hoisted(() => vi.fn());

vi.mock("@strands-agents/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strands-agents/sdk")>();
  return {
    ...actual,
    configureLogging: mockConfigureLogging,
  };
});

import { configureSdkLogging } from "../../src/logging/sdk.js";

describe("configureSdkLogging", () => {
  beforeEach(() => {
    mockConfigureLogging.mockClear();
  });

  it("does nothing when logging is undefined", () => {
    configureSdkLogging(undefined);
    expect(mockConfigureLogging).not.toHaveBeenCalled();
  });

  it("does nothing when logging is false", () => {
    configureSdkLogging(false);
    expect(mockConfigureLogging).not.toHaveBeenCalled();
  });

  it("routes SDK logs to console when logging is true", () => {
    configureSdkLogging(true);
    expect(mockConfigureLogging).toHaveBeenCalledOnce();
    expect(mockConfigureLogging).toHaveBeenCalledWith(console);
  });

  it("forwards a custom logger to the SDK", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    configureSdkLogging(logger);

    expect(mockConfigureLogging).toHaveBeenCalledOnce();
    expect(mockConfigureLogging).toHaveBeenCalledWith(logger);
  });
});

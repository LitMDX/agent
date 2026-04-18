import { describe, it, expect, vi } from "vitest";

// ── vi.hoisted ensures mockS3Storage exists before vi.mock is hoisted ───────
const mockS3Storage = vi.hoisted(() =>
  vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
    return { _kind: "s3-storage", ...opts };
  }),
);

vi.mock("@strands-agents/sdk/session/s3-storage", () => ({
  S3Storage: mockS3Storage,
}));

import { resolvePluginStorage } from "../../src/vite-plugin/storage.js";

// ---------------------------------------------------------------------------
// resolvePluginStorage
// ---------------------------------------------------------------------------

describe("resolvePluginStorage", () => {
  it("returns undefined when neither storage nor s3Sessions is provided", async () => {
    const result = await resolvePluginStorage({});
    expect(result).toBeUndefined();
  });

  it("returns opts.storage when provided (no s3Sessions)", async () => {
    const customStorage = { _kind: "custom" } as never;
    const result = await resolvePluginStorage({ storage: customStorage });
    expect(result).toBe(customStorage);
  });

  it("returns an S3Storage instance when s3Sessions is provided", async () => {
    mockS3Storage.mockClear();
    const result = await resolvePluginStorage({ s3Sessions: { bucket: "my-bucket" } });
    expect(result).toBeDefined();
    expect(mockS3Storage).toHaveBeenCalledOnce();
  });

  it("constructs S3Storage with the bucket name", async () => {
    mockS3Storage.mockClear();
    await resolvePluginStorage({ s3Sessions: { bucket: "my-bucket" } });
    expect(mockS3Storage).toHaveBeenCalledWith(expect.objectContaining({ bucket: "my-bucket" }));
  });

  it("constructs S3Storage with the full s3Sessions config (prefix + region)", async () => {
    mockS3Storage.mockClear();
    const s3Sessions = { bucket: "b", prefix: "sessions/", region: "eu-west-1" };
    await resolvePluginStorage({ s3Sessions });
    expect(mockS3Storage).toHaveBeenCalledWith(s3Sessions);
  });

  it("s3Sessions takes precedence over opts.storage", async () => {
    mockS3Storage.mockClear();
    const customStorage = { _kind: "custom" } as never;
    const result = await resolvePluginStorage({
      storage: customStorage,
      s3Sessions: { bucket: "b" },
    });
    expect(mockS3Storage).toHaveBeenCalledOnce();
    expect(result).not.toBe(customStorage);
  });

  it("does NOT construct S3Storage when only opts.storage is given", async () => {
    mockS3Storage.mockClear();
    await resolvePluginStorage({ storage: { _kind: "custom" } as never });
    expect(mockS3Storage).not.toHaveBeenCalled();
  });

  it("logs the bucket name to console when S3 storage is used", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await resolvePluginStorage({ s3Sessions: { bucket: "logged-bucket" } });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("logged-bucket"));
    consoleSpy.mockRestore();
  });

  it("does NOT log to console when no s3Sessions", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await resolvePluginStorage({});
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

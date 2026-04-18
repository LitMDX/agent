import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRemoteIndex } from "../../src/indexer/remote.js";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const mockEntry = {
  path: "/getting-started",
  title: "Getting Started",
  description: "Get started quickly.",
  content: "Install LitMDX.",
  raw: "---\ntitle: Getting Started\n---\nInstall LitMDX.",
};

function mockFetch(ok: boolean, body: unknown, status = 200, contentType = "application/json") {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchRemoteIndex
// ---------------------------------------------------------------------------

describe("fetchRemoteIndex", () => {
  it("calls fetch with the provided URL", async () => {
    const spy = mockFetch(true, [mockEntry]);
    vi.stubGlobal("fetch", spy);

    await fetchRemoteIndex("https://docs.example.com/docs-index.json");

    expect(spy).toHaveBeenCalledWith("https://docs.example.com/docs-index.json");
  });

  it("returns a DocsIndex Map populated from the remote array", async () => {
    vi.stubGlobal("fetch", mockFetch(true, [mockEntry]));

    const index = await fetchRemoteIndex("https://docs.example.com/docs-index.json");

    expect(index).toBeInstanceOf(Map);
    expect(index.size).toBe(1);
    expect(index.get("/getting-started")).toEqual(mockEntry);
  });

  it("keys the Map by entry.path", async () => {
    const entries = [
      { ...mockEntry, path: "/a" },
      { ...mockEntry, path: "/b" },
    ];
    vi.stubGlobal("fetch", mockFetch(true, entries));

    const index = await fetchRemoteIndex("https://docs.example.com/docs-index.json");

    expect(index.has("/a")).toBe(true);
    expect(index.has("/b")).toBe(true);
    expect(index.size).toBe(2);
  });

  it("returns an empty Map when the remote array is empty", async () => {
    vi.stubGlobal("fetch", mockFetch(true, []));

    const index = await fetchRemoteIndex("https://docs.example.com/docs-index.json");

    expect(index.size).toBe(0);
  });

  it("throws when the HTTP response is not ok (404)", async () => {
    vi.stubGlobal("fetch", mockFetch(false, null, 404));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("throws when the HTTP response is not ok (500)", async () => {
    vi.stubGlobal("fetch", mockFetch(false, null, 500));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("throws when the response body is not an array (object)", async () => {
    vi.stubGlobal("fetch", mockFetch(true, { entries: [] }));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      "expected an array",
    );
  });

  it("throws when the response body is not an array (string)", async () => {
    vi.stubGlobal("fetch", mockFetch(true, "not-an-array"));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      "expected an array",
    );
  });

  it("error message includes the URL", async () => {
    vi.stubGlobal("fetch", mockFetch(false, null, 403));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      "docs-index.json",
    );
  });

  it("throws with a helpful tip when response is HTML (Vite SPA fallback)", async () => {
    const htmlBody = "<!doctype html><html><body>Not found</body></html>";
    vi.stubGlobal("fetch", mockFetch(true, htmlBody, 200, "text/html"));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      /expected JSON.*text\/html/i,
    );
  });

  it("tip message mentions litmdx build", async () => {
    vi.stubGlobal("fetch", mockFetch(true, "<html>", 200, "text/html; charset=utf-8"));

    await expect(fetchRemoteIndex("https://docs.example.com/docs-index.json")).rejects.toThrow(
      /litmdx build/i,
    );
  });
});

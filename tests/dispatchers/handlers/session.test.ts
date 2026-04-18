import { describe, it, expect } from "vitest";
import { handleDeleteSession } from "../../../src/dispatcher/handlers/session.js";
import { makeMockStore, makeRequest } from "../fixtures.js";

describe("handleDeleteSession", () => {
  it("returns kind json with status 200", async () => {
    const { store } = makeMockStore();
    await store.getOrCreate("sess-1");

    const result = await handleDeleteSession(
      makeRequest({ method: "DELETE", searchParams: new URLSearchParams("session_id=sess-1") }),
      store,
    );

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
  });

  it("body contains cleared session id", async () => {
    const { store } = makeMockStore();
    await store.getOrCreate("my-session");

    const result = await handleDeleteSession(
      makeRequest({
        method: "DELETE",
        searchParams: new URLSearchParams("session_id=my-session"),
      }),
      store,
    );

    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["cleared"]).toBe("my-session");
    }
  });

  it("removes the session from the store", async () => {
    const { store } = makeMockStore();
    await store.getOrCreate("to-delete");
    expect(store.size()).toBe(1);

    await handleDeleteSession(
      makeRequest({
        method: "DELETE",
        searchParams: new URLSearchParams("session_id=to-delete"),
      }),
      store,
    );

    expect(store.size()).toBe(0);
  });

  it("uses 'default' session when session_id param is absent", async () => {
    const { store } = makeMockStore();
    await store.getOrCreate("default");
    expect(store.size()).toBe(1);

    const result = await handleDeleteSession(
      makeRequest({ method: "DELETE", searchParams: new URLSearchParams() }),
      store,
    );

    expect(store.size()).toBe(0);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["cleared"]).toBe("default");
    }
  });

  it("only removes the targeted session, leaves others intact", async () => {
    const { store } = makeMockStore();
    await store.getOrCreate("keep-1");
    await store.getOrCreate("keep-2");
    await store.getOrCreate("remove-me");
    expect(store.size()).toBe(3);

    await handleDeleteSession(
      makeRequest({
        method: "DELETE",
        searchParams: new URLSearchParams("session_id=remove-me"),
      }),
      store,
    );

    expect(store.size()).toBe(2);
  });

  it("handles clearing an already-absent session gracefully", async () => {
    const { store } = makeMockStore();

    await expect(
      handleDeleteSession(
        makeRequest({
          method: "DELETE",
          searchParams: new URLSearchParams("session_id=ghost"),
        }),
        store,
      ),
    ).resolves.toMatchObject({ kind: "json", status: 200 });
  });
});

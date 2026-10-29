import { describe, expect, it } from "vitest";
import { createSupabaseSnapshotStore, describeStoreFailure, SnapshotStoreError } from "./snapshotStore";

const SECRET = "FAKE_SERVICE_ROLE_KEY_FOR_TEST";

const respond = (status: number, body: unknown) => async (): Promise<Response> => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const storeWith = (fetchAdmin: (path: string, init?: RequestInit) => Promise<Response>) => createSupabaseSnapshotStore(fetchAdmin as never);

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the store to throw");
}

describe("snapshot store read failures", () => {
  it("reports HTTP status, category and the PostgREST code for a missing table", async () => {
    const store = storeWith(respond(404, { code: "PGRST205", message: `Could not find the table 'public.nba_board_snapshots' ${SECRET}`, hint: "x" }));
    const description = describeStoreFailure(await failureOf(() => store.read()));
    expect(description).toBe("category=not-found status=404 code=PGRST205");
    expect(description).not.toContain(SECRET);
  });

  it("classifies a permission error from the database", async () => {
    const store = storeWith(respond(403, { code: "42501", message: "permission denied for table nba_board_snapshots" }));
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=forbidden status=403 code=42501");
  });

  it("classifies a rejected key without a code", async () => {
    const store = storeWith(respond(401, { message: `Invalid API key ${SECRET}` }));
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=unauthorized status=401");
  });

  it("drops a code that is not a short alphanumeric token", async () => {
    const store = storeWith(respond(500, { code: `bad code ${SECRET}` }));
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=upstream status=500");
  });

  it("tolerates a non-JSON error body", async () => {
    const store = storeWith(respond(502, "<html>bad gateway</html>"));
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=upstream status=502");
  });

  it("reports a missing environment variable as config without echoing the message", async () => {
    const store = storeWith(async () => { throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); });
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=config");
  });

  it("reports a failed request with the error name and a system code only", async () => {
    const cause = Object.assign(new Error(`getaddrinfo ENOTFOUND host.example ${SECRET}`), { code: "ENOTFOUND" });
    const store = storeWith(async () => { throw Object.assign(new TypeError(`fetch failed ${SECRET}`), { cause }); });
    const description = describeStoreFailure(await failureOf(() => store.read()));
    expect(description).toBe("category=network error=TypeError code=ENOTFOUND");
    expect(description).not.toContain(SECRET);
  });

  it("reports an unparseable success body", async () => {
    const store = storeWith(respond(200, "not json"));
    expect(describeStoreFailure(await failureOf(() => store.read()))).toBe("category=bad-body status=200");
  });

  it("describes any other error as unclassified and never echoes its message", () => {
    const description = describeStoreFailure(new Error(`boom ${SECRET}`));
    expect(description).toBe("category=unclassified");
  });

  it("still returns the envelope when the read succeeds", async () => {
    const store = storeWith(respond(200, [{ envelope: { ok: true } }]));
    expect(await store.read()).toEqual({ ok: true });
    expect(new SnapshotStoreError("config")).toBeInstanceOf(Error);
  });
});

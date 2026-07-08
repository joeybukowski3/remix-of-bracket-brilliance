import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../../api/mlb/numerology-email";

const originalEnv = { ...process.env };

const validPayload = {
  subject: "MLB Numerology Plays - 2026-07-07",
  html: "<h1>Plays</h1>",
  text: "Plays",
  date: "2026-07-07",
  topPlay: {
    player: "Chase DeLauter",
    team: "CLE",
    opponent: "DET",
    numerologyScore: 49,
  },
  qualifiedCount: 0,
};

function resetEnv() {
  process.env = { ...originalEnv };
  process.env.NUMEROLOGY_EMAIL_RECEIVER_TOKEN = "receiver-secret";
  process.env.BUTTONDOWN_API_KEY = "buttondown-secret";
  delete process.env.BUTTONDOWN_CONTEXT;
  delete process.env.BUTTONDOWN_EMAIL_STATUS;
  delete process.env.BUTTONDOWN_ALLOW_TEST_SEND;
}

function request(payload: unknown, init: RequestInit = {}) {
  return new Request("https://www.joeknowsball.com/api/mlb/numerology-email", {
    method: "POST",
    headers: {
      Authorization: "Bearer receiver-secret",
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("MLB numerology email receiver", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnv();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("GET returns 405", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(await json(response)).toMatchObject({ ok: false, error: "method_not_allowed" });
  });

  it("missing receiver token env returns 500", async () => {
    delete process.env.NUMEROLOGY_EMAIL_RECEIVER_TOKEN;
    const response = await POST(request(validPayload));
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({ ok: false, error: "server_misconfigured" });
  });

  it("missing Authorization returns 401", async () => {
    const response = await POST(new Request("https://www.joeknowsball.com/api/mlb/numerology-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    }));
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("bad Authorization returns 401", async () => {
    const response = await POST(request(validPayload, {
      headers: { Authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("wrong Authorization scheme returns 401", async () => {
    const response = await POST(request(validPayload, {
      headers: { Authorization: "Token receiver-secret" },
    }));
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("malformed Authorization value returns 401", async () => {
    const response = await POST(request(validPayload, {
      headers: { Authorization: "Bearer receiver-secret extra" },
    }));
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("invalid JSON returns 400", async () => {
    const response = await POST(request("{not-json"));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: "invalid_json" });
  });

  it.each(["subject", "html", "text", "date", "qualifiedCount"] as const)(
    "missing %s returns 400",
    async (field) => {
      const payload = { ...validPayload };
      delete payload[field];
      const response = await POST(request(payload));
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ ok: false, error: "invalid_payload" });
    },
  );

  it("bad date returns 400", async () => {
    const response = await POST(request({ ...validPayload, date: "07/07/2026" }));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: "invalid_payload" });
  });

  it("dry-run valid request returns ok true and does not call fetch", async () => {
    const response = await POST(request(validPayload, {
      headers: { "X-JKB-Email-Dry-Run": "true" },
    }));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, dryRun: true, status: "draft" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dry-run succeeds without BUTTONDOWN_API_KEY", async () => {
    delete process.env.BUTTONDOWN_API_KEY;
    const response = await POST(request({ ...validPayload, dryRun: true }));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, dryRun: true, status: "draft" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dry-run reports sent when gated test-send status is configured", async () => {
    process.env.BUTTONDOWN_EMAIL_STATUS = "sent";
    process.env.BUTTONDOWN_ALLOW_TEST_SEND = "true";
    delete process.env.BUTTONDOWN_API_KEY;

    const response = await POST(request({ ...validPayload, dryRun: true }));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, dryRun: true, status: "sent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("non-dry-run fails without BUTTONDOWN_API_KEY", async () => {
    delete process.env.BUTTONDOWN_API_KEY;
    const response = await POST(request(validPayload));
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({ ok: false, error: "server_misconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valid request calls Buttondown with Authorization: Token and status draft", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_123", url: "https://buttondown.com/emails/email_123" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await POST(request(validPayload));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      ok: true,
      dryRun: false,
      status: "draft",
      buttondown: { id: "email_123", url: "https://buttondown.com/emails/email_123" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.buttondown.com/v1/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Token buttondown-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      subject: validPayload.subject,
      body: `<!-- buttondown-editor-mode: fancy -->${validPayload.html}`,
      status: "draft",
      metadata: {
        source: "joeknowsball-mlb-numerology",
        date: validPayload.date,
        topPlay: "Chase DeLauter CLE vs DET score 49",
        qualifiedCount: 0,
      },
    });
  });

  it("BUTTONDOWN_CONTEXT is included when set", async () => {
    process.env.BUTTONDOWN_CONTEXT = "joeknowsball";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));

    await POST(request(validPayload));

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "Buttondown-Context": "joeknowsball" });
  });

  it("non-draft BUTTONDOWN_EMAIL_STATUS is rejected without test-send gate", async () => {
    process.env.BUTTONDOWN_EMAIL_STATUS = "sent";
    const response = await POST(request(validPayload));
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({ ok: false, error: "server_misconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unsupported non-draft status is rejected even with test-send gate", async () => {
    process.env.BUTTONDOWN_EMAIL_STATUS = "published";
    process.env.BUTTONDOWN_ALLOW_TEST_SEND = "true";
    const response = await POST(request(validPayload));
    expect(response.status).toBe(500);
    expect(await json(response)).toMatchObject({ ok: false, error: "server_misconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sent status is accepted only with explicit test-send gate", async () => {
    process.env.BUTTONDOWN_EMAIL_STATUS = "sent";
    process.env.BUTTONDOWN_ALLOW_TEST_SEND = "true";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_123", url: "https://buttondown.com/emails/email_123" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await POST(request(validPayload));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      ok: true,
      dryRun: false,
      status: "sent",
      buttondown: { id: "email_123", url: "https://buttondown.com/emails/email_123" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ status: "sent" });
  });

  it("Buttondown failure returns 502", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "nope" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await POST(request(validPayload));

    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ ok: false, error: "buttondown_failed", status: 400 });
  });

  it("response and logs do not include secrets", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await POST(request(validPayload));
    const responseText = JSON.stringify(await json(response));
    const logs = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].flat().join(" ");

    expect(responseText).not.toContain("receiver-secret");
    expect(responseText).not.toContain("buttondown-secret");
    expect(logs).not.toContain("receiver-secret");
    expect(logs).not.toContain("buttondown-secret");
  });
});

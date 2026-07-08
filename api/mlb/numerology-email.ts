import { timingSafeEqual } from "node:crypto";

const BUTTONDOWN_EMAILS_URL = "https://api.buttondown.com/v1/emails";
const BUTTONDOWN_EDITOR_PREFIX = "<!-- buttondown-editor-mode: fancy -->";
const BUTTONDOWN_DRAFT_STATUS = "draft";
const BUTTONDOWN_TEST_SEND_STATUS = "about_to_send";
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 1_000_000;
const MAX_TEXT_LENGTH = 250_000;
const MAX_BUTTONDOWN_ERROR_LENGTH = 1_000;
const SOURCE = "joeknowsball-mlb-numerology";
const SENSITIVE_RESPONSE_KEY = /(authorization|token|secret|api[-_ ]?key|password|html|body|content)/i;

type ButtondownEmailStatus = typeof BUTTONDOWN_DRAFT_STATUS | typeof BUTTONDOWN_TEST_SEND_STATUS;

type NumerologyEmailPayload = {
  subject: string;
  html: string;
  text: string;
  date: string;
  topPlay: unknown;
  qualifiedCount: number;
  dryRun?: boolean;
};

type ErrorCode =
  | "method_not_allowed"
  | "server_misconfigured"
  | "unauthorized"
  | "invalid_json"
  | "invalid_payload"
  | "buttondown_failed";

function jsonError(error: ErrorCode, message: string, status: number) {
  return Response.json({ ok: false, error, message }, { status });
}

function safeTokenEquals(actual: string, expected: string) {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    try {
      timingSafeEqual(expectedBuffer, expectedBuffer);
    } catch {
      // Ignore fallback comparison errors; unequal lengths are unauthorized.
    }
    return false;
  }

  try {
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return "";
  return authorization.slice(prefix.length);
}

function isNonEmptyBoundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validatePayload(value: unknown): { payload: NumerologyEmailPayload | null; error: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { payload: null, error: "Payload must be a JSON object." };
  }

  const payload = value as Record<string, unknown>;
  if (!isNonEmptyBoundedString(payload.subject, MAX_SUBJECT_LENGTH)) {
    return { payload: null, error: "subject must be a non-empty string no longer than 200 characters." };
  }
  if (!isNonEmptyBoundedString(payload.html, MAX_HTML_LENGTH)) {
    return { payload: null, error: "html must be a non-empty bounded string." };
  }
  if (!isNonEmptyBoundedString(payload.text, MAX_TEXT_LENGTH)) {
    return { payload: null, error: "text must be a non-empty bounded string." };
  }
  if (typeof payload.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return { payload: null, error: "date must match YYYY-MM-DD." };
  }
  if (
    typeof payload.qualifiedCount !== "number"
    || !Number.isFinite(payload.qualifiedCount)
    || payload.qualifiedCount < 0
  ) {
    return { payload: null, error: "qualifiedCount must be a non-negative finite number." };
  }

  return {
    payload: {
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      date: payload.date,
      topPlay: payload.topPlay,
      qualifiedCount: payload.qualifiedCount,
      dryRun: payload.dryRun === true,
    },
    error: null,
  };
}

function summarizeTopPlay(topPlay: unknown) {
  if (!topPlay || typeof topPlay !== "object" || Array.isArray(topPlay)) return "";
  const row = topPlay as Record<string, unknown>;
  const pieces = [
    typeof row.player === "string" ? row.player : "",
    typeof row.team === "string" ? row.team : "",
    typeof row.opponent === "string" ? `vs ${row.opponent}` : "",
    typeof row.numerologyScore === "number" ? `score ${row.numerologyScore}` : "",
  ].filter(Boolean);
  return pieces.join(" ").slice(0, 300);
}

function getDryRun(request: Request, payload: NumerologyEmailPayload) {
  return request.headers.get("x-jkb-email-dry-run")?.toLowerCase() === "true" || payload.dryRun === true;
}

function getButtondownStatus(): { status: ButtondownEmailStatus | null; error: string | null } {
  const configuredStatus = (process.env.BUTTONDOWN_EMAIL_STATUS || BUTTONDOWN_DRAFT_STATUS).trim().toLowerCase();
  if (configuredStatus === BUTTONDOWN_DRAFT_STATUS) {
    return { status: BUTTONDOWN_DRAFT_STATUS, error: null };
  }

  const allowTestSend = process.env.BUTTONDOWN_ALLOW_TEST_SEND === "true";
  if (!allowTestSend) {
    return {
      status: null,
      error: "Only Buttondown draft mode is supported unless BUTTONDOWN_ALLOW_TEST_SEND=true.",
    };
  }

  if (configuredStatus !== BUTTONDOWN_TEST_SEND_STATUS) {
    return {
      status: null,
      error: `Unsupported Buttondown status. Use ${BUTTONDOWN_DRAFT_STATUS} or ${BUTTONDOWN_TEST_SEND_STATUS}.`,
    };
  }

  return { status: BUTTONDOWN_TEST_SEND_STATUS, error: null };
}

function redactButtondownErrorValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => redactButtondownErrorValue(item, depth + 1));
  if (!value || typeof value !== "object") return String(value).slice(0, 500);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .map(([key, entry]) => [
        key,
        SENSITIVE_RESPONSE_KEY.test(key) ? "[redacted]" : redactButtondownErrorValue(entry, depth + 1),
      ]),
  );
}

function sanitizeButtondownError(value: unknown) {
  if (value === null || value === undefined) return null;

  try {
    return JSON.stringify(redactButtondownErrorValue(value)).slice(0, MAX_BUTTONDOWN_ERROR_LENGTH);
  } catch {
    return String(value).slice(0, MAX_BUTTONDOWN_ERROR_LENGTH);
  }
}

function getRequestId() {
  return `numerology-email-${Date.now().toString(36)}`;
}

export async function GET() {
  return jsonError("method_not_allowed", "Only POST is supported.", 405);
}

export async function POST(request: Request) {
  const requestId = getRequestId();
  const receiverToken = process.env.NUMEROLOGY_EMAIL_RECEIVER_TOKEN ?? "";
  if (!receiverToken) {
    console.error(`[api/mlb/numerology-email] ${requestId} missing receiver token env`);
    return jsonError("server_misconfigured", "Receiver is not configured.", 500);
  }

  const bearerToken = getBearerToken(request);
  if (!safeTokenEquals(bearerToken, receiverToken)) {
    console.warn(`[api/mlb/numerology-email] ${requestId} unauthorized request`);
    return jsonError("unauthorized", "Unauthorized.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }

  const { payload, error } = validatePayload(body);
  if (!payload) {
    return jsonError("invalid_payload", error ?? "Invalid payload.", 400);
  }

  const { status: buttondownStatus, error: statusError } = getButtondownStatus();
  if (!buttondownStatus) {
    console.error(`[api/mlb/numerology-email] ${requestId} unsupported Buttondown status configured`);
    return jsonError("server_misconfigured", statusError ?? "Unsupported Buttondown status.", 500);
  }

  const dryRun = getDryRun(request, payload);
  const topPlaySummary = summarizeTopPlay(payload.topPlay);
  console.log(
    `[api/mlb/numerology-email] ${requestId} accepted date=${payload.date} qualifiedCount=${payload.qualifiedCount} dryRun=${dryRun} status=${buttondownStatus}`,
  );

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      status: buttondownStatus,
      date: payload.date,
      qualifiedCount: payload.qualifiedCount,
    });
  }

  const buttondownApiKey = process.env.BUTTONDOWN_API_KEY ?? "";
  if (!buttondownApiKey) {
    console.error(`[api/mlb/numerology-email] ${requestId} missing Buttondown API key env`);
    return jsonError("server_misconfigured", "Buttondown is not configured.", 500);
  }

  const headers: Record<string, string> = {
    Authorization: `Token ${buttondownApiKey}`,
    "Content-Type": "application/json",
  };
  const buttondownContext = process.env.BUTTONDOWN_CONTEXT;
  if (buttondownContext) headers["Buttondown-Context"] = buttondownContext;

  const buttondownPayload = {
    subject: payload.subject,
    body: `${BUTTONDOWN_EDITOR_PREFIX}${payload.html}`,
    status: buttondownStatus,
    metadata: {
      source: SOURCE,
      date: payload.date,
      topPlay: topPlaySummary,
      qualifiedCount: payload.qualifiedCount,
    },
  };

  try {
    const response = await fetch(BUTTONDOWN_EMAILS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(buttondownPayload),
    });

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      const buttondownError = sanitizeButtondownError(responseBody);
      console.error(
        `[api/mlb/numerology-email] ${requestId} Buttondown failed status=${response.status} error=${buttondownError ?? "unavailable"}`,
      );
      return Response.json(
        {
          ok: false,
          error: "buttondown_failed",
          status: response.status,
          message: "Buttondown email creation failed.",
          buttondownError,
        },
        { status: 502 },
      );
    }

    const result = responseBody && typeof responseBody === "object" ? responseBody as Record<string, unknown> : {};
    const id = typeof result.id === "string" || typeof result.id === "number" ? result.id : null;
    const url = typeof result.url === "string"
      ? result.url
      : typeof result.absolute_url === "string"
        ? result.absolute_url
        : null;

    console.log(`[api/mlb/numerology-email] ${requestId} Buttondown email created status=${buttondownStatus}`);
    return Response.json({
      ok: true,
      dryRun: false,
      status: buttondownStatus,
      buttondown: { id, url },
    });
  } catch {
    console.error(`[api/mlb/numerology-email] ${requestId} Buttondown network error`);
    return Response.json(
      {
        ok: false,
        error: "buttondown_failed",
        message: "Buttondown email creation failed.",
      },
      { status: 502 },
    );
  }
}

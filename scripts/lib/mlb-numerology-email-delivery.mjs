import fs from "node:fs";
import path from "node:path";

export const DELIVERY_STATUS = Object.freeze({
  SENT: "sent",
  ALREADY_EXISTS: "already_exists",
  ALREADY_RECORDED: "already_recorded",
});

export function getNumerologyEmailSubject(date) {
  return `MLB Numerology Plays — ${date}`;
}

export function getNumerologyEmailKey(date, subject = getNumerologyEmailSubject(date)) {
  return `mlb-numerology:${date}:${subject}`;
}

export function readDeliveryReceipt(receiptPath) {
  try {
    return JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch {
    return null;
  }
}

export function hasValidDeliveryReceipt(receipt, date, subject) {
  if (!receipt || receipt.date !== date) return false;
  if (receipt.subject && receipt.subject !== subject) return false;
  if (receipt.result === DELIVERY_STATUS.SENT || receipt.result === DELIVERY_STATUS.ALREADY_EXISTS) return true;
  return typeof receipt.sentAt === "string" && receipt.sentAt.length > 0;
}

export function isButtondownDuplicateResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) return false;
  const body = responseBody;
  if (Number(body.status) !== 400) return false;
  const buttondownError = parsePossibleJson(body.buttondownError);
  return Boolean(
    buttondownError
    && typeof buttondownError === "object"
    && !Array.isArray(buttondownError)
    && buttondownError.code === "email_duplicate",
  );
}

export async function deliverNumerologyEmail({
  card,
  html,
  text,
  webhookUrl,
  webhookToken = "",
  receiptPath,
  fetchImpl,
  now = () => new Date(),
  sourceWorkflow = process.env.GITHUB_WORKFLOW || "MLB Numerology Email Reliable Delivery",
  log = console.log,
}) {
  const subject = getNumerologyEmailSubject(card.date);
  const existingReceipt = readDeliveryReceipt(receiptPath);
  if (hasValidDeliveryReceipt(existingReceipt, card.date, subject)) {
    log(`[mlb-numerology] Valid delivery receipt already exists for ${card.date}; skipping provider call.`);
    return {
      status: DELIVERY_STATUS.ALREADY_RECORDED,
      buttondownEmailId: existingReceipt.buttondownEmailId ?? null,
      receipt: existingReceipt,
    };
  }

  const payload = {
    subject,
    html,
    text,
    date: card.date,
    topPlay: card.topPlay,
    qualifiedCount: card.emailSelectedPlays.length,
  };

  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Email webhook network failure: ${error instanceof Error ? error.message : String(error)}`);
  }

  const responseText = await response.text().catch(() => "");
  const responseBody = parsePossibleJson(responseText);

  if (!response.ok) {
    if (isButtondownDuplicateResponse(responseBody)) {
      const buttondownEmailId = getButtondownEmailId(responseBody);
      log("Buttondown reports this email already exists; treating as already delivered.");
      const receipt = writeDeliveryReceipt({
        receiptPath,
        date: card.date,
        subject,
        result: DELIVERY_STATUS.ALREADY_EXISTS,
        timestamp: now().toISOString(),
        buttondownEmailId,
        sourceWorkflow,
      });
      return { status: DELIVERY_STATUS.ALREADY_EXISTS, buttondownEmailId, receipt };
    }

    throw new Error(`Email webhook failed ${response.status}: ${responseText.slice(0, 500)}`);
  }

  if (responseBody && typeof responseBody === "object" && responseBody.ok === false) {
    throw new Error(`Email webhook returned an unsuccessful response: ${responseText.slice(0, 500)}`);
  }

  const buttondownEmailId = getButtondownEmailId(responseBody);
  const receipt = writeDeliveryReceipt({
    receiptPath,
    date: card.date,
    subject,
    result: DELIVERY_STATUS.SENT,
    timestamp: now().toISOString(),
    buttondownEmailId,
    sourceWorkflow,
  });
  return { status: DELIVERY_STATUS.SENT, buttondownEmailId, receipt };
}

function writeDeliveryReceipt({ receiptPath, date, subject, result, timestamp, buttondownEmailId, sourceWorkflow }) {
  const receipt = {
    date,
    subject,
    emailKey: getNumerologyEmailKey(date, subject),
    result,
    timestamp,
    buttondownEmailId,
    sourceWorkflow,
    sentAt: result === DELIVERY_STATUS.SENT ? timestamp : null,
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

function getButtondownEmailId(responseBody) {
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) return null;
  const buttondown = parsePossibleJson(responseBody.buttondown);
  const buttondownError = parsePossibleJson(responseBody.buttondownError);
  const candidates = [
    buttondown?.id,
    buttondownError?.id,
    buttondownError?.email_id,
    buttondownError?.emailId,
    buttondownError?.existing_email_id,
  ];
  const id = candidates.find((value) => typeof value === "string" || typeof value === "number");
  return id ?? null;
}

function parsePossibleJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deliverNumerologyEmail,
  getNumerologyEmailSubject,
  isButtondownDuplicateResponse,
} from "./mlb-numerology-email-delivery.mjs";

const card = {
  date: "2026-07-14",
  topPlay: { player: "Fixture Player" },
  emailSelectedPlays: [{ player: "Fixture Player" }],
};
const fixedTimestamp = "2026-07-14T12:00:00.000Z";

function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "numerology-email-delivery-"));
  const receiptPath = path.join(directory, "email-send-state.json");
  const calls = [];
  const fetchImpl = options.fetchImpl ?? (async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify({ ok: true, buttondown: { id: "email_123" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return {
    directory,
    receiptPath,
    calls,
    args: {
      card,
      html: "<h1>Fixture</h1>",
      text: "Fixture",
      webhookUrl: "https://example.test/api/mlb/numerology-email",
      webhookToken: "test-token",
      receiptPath,
      fetchImpl,
      now: () => new Date(fixedTimestamp),
      sourceWorkflow: "MLB Numerology Email Reliable Delivery",
      log: () => {},
    },
  };
}

function readReceipt(receiptPath) {
  return JSON.parse(fs.readFileSync(receiptPath, "utf8"));
}

test("successful Buttondown delivery returns sent and persists a sent receipt", async (t) => {
  const setup = fixture();
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  const result = await deliverNumerologyEmail(setup.args);

  assert.equal(result.status, "sent");
  assert.equal(result.buttondownEmailId, "email_123");
  assert.equal(setup.calls.length, 1);
  assert.deepEqual(readReceipt(setup.receiptPath), {
    date: "2026-07-14",
    subject: "MLB Numerology Plays — 2026-07-14",
    emailKey: "mlb-numerology:2026-07-14:MLB Numerology Plays — 2026-07-14",
    result: "sent",
    timestamp: fixedTimestamp,
    buttondownEmailId: "email_123",
    sourceWorkflow: "MLB Numerology Email Reliable Delivery",
    sentAt: fixedTimestamp,
  });
});

test("Buttondown email_duplicate returns already_exists without throwing and records no new send", async (t) => {
  const logs = [];
  const setup = fixture({
    fetchImpl: async () => new Response(JSON.stringify({
      status: 400,
      message: "Buttondown email creation failed.",
      buttondownError: { code: "email_duplicate", detail: "Email is potentially a duplicate of an existing email" },
    }), { status: 502, headers: { "Content-Type": "application/json" } }),
  });
  setup.args.log = (message) => logs.push(message);
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  const result = await deliverNumerologyEmail(setup.args);
  const receipt = readReceipt(setup.receiptPath);

  assert.equal(result.status, "already_exists");
  assert.equal(result.buttondownEmailId, null);
  assert.equal(receipt.result, "already_exists");
  assert.equal(receipt.sentAt, null);
  assert.equal(receipt.buttondownEmailId, null);
  assert.equal(receipt.timestamp, fixedTimestamp);
  assert.match(logs.join(" "), /already exists; treating as already delivered/);
});

test("serialized Buttondown duplicate details are recognized without an extra lookup", async (t) => {
  const setup = fixture({
    fetchImpl: async () => new Response(JSON.stringify({
      status: 400,
      buttondownError: JSON.stringify({ code: "email_duplicate", detail: "duplicate" }),
    }), { status: 400 }),
  });
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  assert.equal((await deliverNumerologyEmail(setup.args)).status, "already_exists");
});

test("existing valid receipt skips the provider call", async (t) => {
  const setup = fixture();
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(setup.receiptPath), { recursive: true });
  fs.writeFileSync(setup.receiptPath, JSON.stringify({
    date: card.date,
    subject: getNumerologyEmailSubject(card.date),
    result: "already_exists",
    timestamp: fixedTimestamp,
  }));

  const result = await deliverNumerologyEmail(setup.args);

  assert.equal(result.status, "already_recorded");
  assert.equal(setup.calls.length, 0);
});

test("other Buttondown 400 codes remain fatal", async (t) => {
  const setup = fixture({
    fetchImpl: async () => new Response(JSON.stringify({
      status: 400,
      buttondownError: { code: "email_invalid", detail: "Invalid email" },
    }), { status: 502 }),
  });
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  await assert.rejects(deliverNumerologyEmail(setup.args), /Email webhook failed 502/);
  assert.equal(fs.existsSync(setup.receiptPath), false);
});

test("authentication failures remain fatal", async (t) => {
  const setup = fixture({
    fetchImpl: async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  });
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  await assert.rejects(deliverNumerologyEmail(setup.args), /Email webhook failed 401/);
  assert.equal(fs.existsSync(setup.receiptPath), false);
});

test("rate-limit failures remain fatal", async (t) => {
  const setup = fixture({
    fetchImpl: async () => new Response(JSON.stringify({
      status: 429,
      buttondownError: { code: "rate_limited", detail: "Try again later" },
    }), { status: 502 }),
  });
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  await assert.rejects(deliverNumerologyEmail(setup.args), /Email webhook failed 502/);
  assert.equal(fs.existsSync(setup.receiptPath), false);
});

test("network failures remain fatal", async (t) => {
  const setup = fixture({ fetchImpl: async () => { throw new Error("connection reset"); } });
  t.after(() => fs.rmSync(setup.directory, { recursive: true, force: true }));

  await assert.rejects(deliverNumerologyEmail(setup.args), /network failure: connection reset/);
  assert.equal(fs.existsSync(setup.receiptPath), false);
});

test("duplicate classification requires provider status 400 and exact email_duplicate code", () => {
  assert.equal(isButtondownDuplicateResponse({ status: 400, buttondownError: { code: "email_duplicate" } }), true);
  assert.equal(isButtondownDuplicateResponse({ status: 429, buttondownError: { code: "email_duplicate" } }), false);
  assert.equal(isButtondownDuplicateResponse({ status: 400, buttondownError: { code: "rate_limited" } }), false);
  assert.equal(isButtondownDuplicateResponse({ status: 400 }), false);
});

test("subject remains deterministic for the same slate date", () => {
  assert.equal(getNumerologyEmailSubject("2026-07-14"), "MLB Numerology Plays — 2026-07-14");
  assert.equal(getNumerologyEmailSubject("2026-07-14"), getNumerologyEmailSubject("2026-07-14"));
});

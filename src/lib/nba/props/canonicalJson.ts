/**
 * Canonical JSON and content hashing shared by the evaluation manifest and the
 * research pipeline records: sorted keys, no undefined, finite numbers only, so
 * the same content always hashes the same.
 */
import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("stableStringify: non-finite number");
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export const sha256Text = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

export const sha256Json = (value: unknown): string => sha256Text(stableStringify(value));

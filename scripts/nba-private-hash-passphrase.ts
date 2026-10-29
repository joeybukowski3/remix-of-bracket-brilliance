/**
 * Make the NBA_PRIVATE_PASSWORD_HASH value for the hosted /nba/props login. Reads the passphrase from standard input
 * (so it never appears in shell history or argv) and prints only the scrypt hash.
 *
 *   node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"   # a session secret
 *   npx tsx scripts/nba-private-hash-passphrase.ts < passphrase-file                          # the hash
 */
import { readFileSync } from "node:fs";
import { hashPassphrase } from "../api/_lib/nbaPrivate/session";

hashPassphrase(readFileSync(0, "utf8").replace(/\r?\n$/, "")).then(
  (hash) => console.log(hash),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "could not hash the passphrase");
    process.exit(1);
  },
);

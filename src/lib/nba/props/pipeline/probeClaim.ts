/** Local, durable one-attempt claim. A claim is never removed or refunded. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ProbeClaim {
  claim(approvalId: string, scope: string, eventId: string | null): Promise<boolean>;
}

export function fileProbeClaim(dir: string, now: () => Date = () => new Date()): ProbeClaim {
  return {
    async claim(approvalId, scope, eventId) {
      if (!approvalId.trim() || !scope.trim()) throw new Error("probe approval identity is required");
      mkdirSync(dir, { recursive: true });
      const name = createHash("sha256").update(approvalId).digest("hex");
      const file = path.join(dir, `${name}.claim.json`);
      if (existsSync(file)) return false;
      let fd: number;
      try {
        fd = openSync(file, "wx", 0o600); // atomic across processes on the local filesystem
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
      try {
        writeFileSync(fd, JSON.stringify({ approvalId, scope, eventId, claimedAtUtc: now().toISOString() }));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return true;
    },
  };
}

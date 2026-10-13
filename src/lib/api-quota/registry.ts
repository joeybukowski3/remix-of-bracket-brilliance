/**
 * Registry invariants, checked when a QuotaManager is constructed.
 *
 * A credential name listed on more than one account would let one key draw
 * from several budgets. That is allowed only when the provider has confirmed
 * separate quotas (`separateQuotaVerified`), or when every account sharing the
 * name is planStatus "unknown" (and therefore closed to new consumers).
 */
import type { ProviderAccountConfig } from "./types";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export function validateRegistry(accounts: readonly ProviderAccountConfig[]): void {
  const ids = new Set<string>();
  const byCredential = new Map<string, ProviderAccountConfig[]>();
  for (const account of accounts) {
    if (ids.has(account.accountId)) throw new RegistryError(`Duplicate account id ${account.accountId}`);
    ids.add(account.accountId);
    if (account.nonessentialMaxRatio < 0 || account.nonessentialMaxRatio > 1) throw new RegistryError(`${account.accountId}: nonessentialMaxRatio must be within [0, 1]`);
    if (account.safetyReserve < 0) throw new RegistryError(`${account.accountId}: safetyReserve must be non-negative`);
    for (const name of account.credentialEnvVars) byCredential.set(name, [...(byCredential.get(name) ?? []), account]);
  }
  for (const [name, sharing] of byCredential) {
    if (sharing.length < 2) continue;
    const unjustified = sharing.filter((a) => a.separateQuotaVerified !== true && a.planStatus !== "unknown");
    if (unjustified.length > 1) {
      throw new RegistryError(
        `Credential ${name} would fund independent budgets on ${unjustified.map((a) => a.accountId).join(", ")} without verified separate quotas`,
      );
    }
  }
}

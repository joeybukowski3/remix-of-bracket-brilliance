export const PERSON_SUFFIX_PATTERN = /\b(jr|sr|ii|iii|iv|v)\b\.?$/i;

export function normalizePersonName(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[A-Z]{1,3}\s+-\s+/i, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, "")
    .replace(PERSON_SUFFIX_PATTERN, "")
    .replace(/[' -]+/g, " ")
    .trim();
}

export const normalizePlayerName = normalizePersonName;
export const normalizeCoachName = normalizePersonName;

export function extractPersonSuffix(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(PERSON_SUFFIX_PATTERN);
  return match ? match[1].replace(".", "").toUpperCase() : null;
}

export function stableId(parts) {
  return parts
    .filter((part) => part != null && String(part).trim() !== "")
    .map((part) => String(part).trim())
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-")
    .replace(/-:/g, ":")
    .replace(/:-/g, ":")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildPersonIdentity({
  providerId = null,
  sourcePlayerId = null,
  playerId = null,
  name,
  position = null,
  teamId = null,
  sourceId = null,
}) {
  const normalizedName = normalizePersonName(name);
  const suffix = extractPersonSuffix(name);
  const resolvedProviderId = providerId ?? sourcePlayerId ?? playerId ?? null;
  const identityKey = resolvedProviderId
    ? stableId(["provider", resolvedProviderId])
    : stableId(["name", normalizedName, position ?? "unknown-position", teamId ?? "unknown-team"]);

  return {
    playerId: playerId ?? resolvedProviderId,
    providerId: resolvedProviderId,
    displayName: typeof name === "string" ? name.trim() : "",
    normalizedName,
    suffix,
    position,
    teamId,
    sourceId,
    identityKey,
    confidence: resolvedProviderId ? "provider_id" : "name_position_team",
  };
}

export function personIdentityKey(identityOrPerson) {
  if (!identityOrPerson || typeof identityOrPerson !== "object") return "";
  if (identityOrPerson.identityKey) return identityOrPerson.identityKey;
  if (identityOrPerson.providerId || identityOrPerson.sourcePlayerId || identityOrPerson.playerId) {
    return stableId(["provider", identityOrPerson.providerId ?? identityOrPerson.sourcePlayerId ?? identityOrPerson.playerId]);
  }
  return stableId([
    "name",
    normalizePersonName(identityOrPerson.playerName ?? identityOrPerson.coachName ?? identityOrPerson.name ?? ""),
    identityOrPerson.position ?? "unknown-position",
    identityOrPerson.teamId ?? identityOrPerson.priorTeamId ?? "unknown-team",
  ]);
}

export function detectSameNameCollisions(people) {
  const byName = new Map();
  for (const person of people ?? []) {
    const normalizedName = normalizePersonName(person.playerName ?? person.coachName ?? person.name ?? "");
    if (!normalizedName) continue;
    const providerKey = person.providerId ?? person.sourcePlayerId ?? person.playerId ?? null;
    byName.set(normalizedName, [...(byName.get(normalizedName) ?? []), { ...person, providerKey }]);
  }

  const collisions = [];
  for (const [normalizedName, group] of byName) {
    const providerIds = new Set(group.map((person) => person.providerKey).filter(Boolean));
    const hasUnresolved = group.some((person) => !person.providerKey);
    if (group.length > 1 && (providerIds.size > 1 || hasUnresolved)) {
      collisions.push({
        normalizedName,
        count: group.length,
        providerIds: [...providerIds].sort(),
        unresolvedCount: group.filter((person) => !person.providerKey).length,
      });
    }
  }
  return collisions.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}

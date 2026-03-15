export function readSecretFromRequest(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  return (
    url.searchParams.get("token") ||
    request.headers.get("x-bracket-sync-secret") ||
    bearer ||
    ""
  );
}

export function isAuthorized(request: Request, expectedSecret: string) {
  if (!expectedSecret) return false;
  return readSecretFromRequest(request) === expectedSecret;
}

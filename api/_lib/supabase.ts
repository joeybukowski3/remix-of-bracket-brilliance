const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    url: SUPABASE_URL,
    key: SUPABASE_SERVICE_ROLE_KEY,
  };
}

export async function supabaseAdminFetch(path: string, init: RequestInit = {}) {
  const env = requireSupabaseEnv();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", env.key);
  headers.set("Authorization", `Bearer ${env.key}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${env.url}${path}`, {
    ...init,
    headers,
  });
}

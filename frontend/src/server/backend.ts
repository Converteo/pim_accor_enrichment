const IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
// Google ID tokens last 1 h; renew well before expiry.
const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedToken: { audience: string; token: string; expiresAt: number } | null = null;

async function identityToken(audience: string): Promise<string> {
  if (cachedToken && cachedToken.audience === audience && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const response = await fetch(`${IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) {
    throw new Error(`metadata server answered ${response.status}`);
  }
  const token = await response.text();
  cachedToken = { audience, token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

export interface BackendCall {
  method: string;
  /** Path and query, starting with `/`. */
  path: string;
  body: ArrayBuffer | null;
  author: string | null;
  signal?: AbortSignal;
}

/** Calls the back with fresh headers only; throws if the back or the metadata server is unreachable. */
export async function fetchBackend(backendUrl: string, call: BackendCall): Promise<Response> {
  const base = backendUrl.replace(/\/+$/, "");
  const headers = new Headers({ Accept: "application/json, */*" });
  if (call.body) {
    headers.set("Content-Type", "application/json");
  }
  if (base.startsWith("https://")) {
    headers.set("Authorization", `Bearer ${await identityToken(base)}`);
  }
  if (call.author) {
    headers.set("X-PIM-Author", call.author);
  }
  return fetch(`${base}${call.path}`, {
    method: call.method,
    headers,
    body: call.body,
    // A redirect would resend X-PIM-Author to another host.
    redirect: "manual",
    signal: call.signal,
  });
}

// Reviewer identity, sent to the back as X-PIM-Author (US8).
// Behind IAP: the e-mail of the signed `x-goog-iap-jwt-assertion` header, verified here.
// Local only (no IAP, not on Cloud Run): DEV_AUTHOR.

const IAP_KEYS_URL = "https://www.gstatic.com/iap/verify/public_key-jwk";
const IAP_ISSUER = "https://cloud.google.com/iap";
// Clock skew tolerated between Google and this server.
const SKEW_S = 30;
// Forged tokens with random kids must not make this server hammer Google.
const RELOAD_MS = 60_000;
// Keys Google withdraws stop being accepted after this delay (gstatic caches them 50 min).
const MAX_AGE_MS = 12 * 3_600_000;

interface IapJwk extends JsonWebKey {
  kid: string;
}

let keys: Promise<Map<string, CryptoKey>> | null = null;
let loadedAt = 0;
let audienceWarned = false;

async function loadKeys(): Promise<Map<string, CryptoKey>> {
  const response = await fetch(IAP_KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`IAP keys answered ${response.status}`);
  const { keys: jwks } = (await response.json()) as { keys: IapJwk[] };
  const usable = jwks.filter((jwk) => jwk.kty === "EC" && jwk.crv === "P-256");
  return new Map(
    await Promise.all(
      usable.map(
        async (jwk) =>
          [
            jwk.kid,
            await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]),
          ] as const,
      ),
    ),
  );
}

async function iapKey(kid: string): Promise<CryptoKey | undefined> {
  const age = Date.now() - loadedAt;
  const known = keys ? (await keys.catch(() => null))?.has(kid) : false;
  // Google rotates the keys: reload when a kid is unknown (at most once a minute, failures included) or the set is old.
  // The pending load is shared, so a burst of requests fetches the keys once.
  if (!keys || (!known && age > RELOAD_MS) || age > MAX_AGE_MS) {
    loadedAt = Date.now();
    keys = loadKeys();
  }
  return (await keys).get(kid);
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

/** E-mail of a valid IAP assertion for this audience, null otherwise. */
export async function verifyIapAssertion(assertion: string, audience: string): Promise<string | null> {
  const parts = assertion.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  try {
    const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
    if (header.alg !== "ES256" || !header.kid) return null;
    const key = await iapKey(header.kid);
    if (!key) return null;
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Buffer.from(signaturePart, "base64url"),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;
    const claims = decodePart<{ iss?: string; aud?: string; exp?: number; iat?: number; email?: string }>(payloadPart);
    const now = Date.now() / 1000;
    if (claims.iss !== IAP_ISSUER) return null;
    if (claims.aud !== audience) {
      // A wrong IAP_AUDIENCE leaves everyone without author: say it once in the logs.
      if (!audienceWarned) console.error(`IAP assertion: audience ${claims.aud} instead of ${audience}`);
      audienceWarned = true;
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp < now - SKEW_S) return null;
    if (typeof claims.iat !== "number" || claims.iat > now + SKEW_S) return null;
    return claims.email?.replace(/^accounts\.google\.com:/, "") || null;
  } catch (error) {
    console.error("IAP assertion:", error);
    return null;
  }
}

export async function currentAuthor(headers: Headers): Promise<string | null> {
  const audience = process.env.IAP_AUDIENCE?.trim();
  if (audience) {
    const assertion = headers.get("x-goog-iap-jwt-assertion");
    return assertion ? verifyIapAssertion(assertion, audience) : null;
  }
  // DEV_AUTHOR never applies on Cloud Run, even before IAP is enabled.
  if (process.env.K_SERVICE) return null;
  return process.env.DEV_AUTHOR?.trim() || null;
}

import { currentAuthor, verifyIapAssertion } from "../src/server/author";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// Test keys only: a P-256 pair standing for Google's IAP keys.
const AUDIENCE = "/projects/123/global/backendServices/456";
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "ES256" };

let keyFetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  assert(String(input) === "https://www.gstatic.com/iap/verify/public_key-jwk", `unexpected fetch ${String(input)}`);
  keyFetches += 1;
  return Response.json({ keys: [jwk] });
}) as typeof fetch;

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);

async function token(
  claims: Record<string, unknown>,
  { kid = "k1", alg = "ES256", key = pair.privateKey }: { kid?: string; alg?: string; key?: CryptoKey } = {},
): Promise<string> {
  const unsigned = `${b64({ alg, kid })}.${b64({
    iss: "https://cloud.google.com/iap",
    aud: AUDIENCE,
    iat: now - 10,
    exp: now + 600,
    email: "prenom.nom@converteo.com",
    ...claims,
  })}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

const silence = console.error;
console.error = () => undefined;

// Cold start: a burst of requests shares one load of the keys.
const valid = await token({});
const burst = await Promise.all(Array.from({ length: 5 }, () => verifyIapAssertion(valid, AUDIENCE)));
assert(burst.every((email) => email === "prenom.nom@converteo.com"), "valid assertion");
assert(keyFetches === 1, `keys fetched once for a burst (${keyFetches})`);
assert((await verifyIapAssertion(await token({}), AUDIENCE)) !== null && keyFetches === 1, "keys cached");
assert(
  (await verifyIapAssertion(await token({ email: "accounts.google.com:a.b@converteo.com" }), AUDIENCE)) === "a.b@converteo.com",
  "accounts.google.com prefix removed",
);
assert((await verifyIapAssertion(await token({ aud: "/projects/1/other" }), AUDIENCE)) === null, "wrong audience");
assert((await verifyIapAssertion(await token({ iss: "https://evil.example" }), AUDIENCE)) === null, "wrong issuer");
assert((await verifyIapAssertion(await token({ exp: now - 120 }), AUDIENCE)) === null, "expired");
assert((await verifyIapAssertion(await token({ iat: now + 600 }), AUDIENCE)) === null, "issued in the future");
assert((await verifyIapAssertion(await token({}, { key: other.privateKey }), AUDIENCE)) === null, "bad signature");
assert((await verifyIapAssertion(await token({}, { alg: "none" }), AUDIENCE)) === null, "alg none");
assert((await verifyIapAssertion(await token({}, { kid: "unknown" }), AUDIENCE)) === null, "unknown key");
assert(keyFetches === 1, "an unknown kid does not reload the keys again within a minute");
assert((await verifyIapAssertion("not.a.jwt", AUDIENCE)) === null, "garbage");
assert((await verifyIapAssertion("onlyone", AUDIENCE)) === null, "not three parts");

// currentAuthor: IAP first, DEV_AUTHOR only locally and without IAP.
process.env.DEV_AUTHOR = "test@converteo.com";
delete process.env.K_SERVICE;
delete process.env.IAP_AUDIENCE;
assert((await currentAuthor(new Headers())) === "test@converteo.com", "DEV_AUTHOR locally");
process.env.K_SERVICE = "front";
assert((await currentAuthor(new Headers())) === null, "no DEV_AUTHOR on Cloud Run");
process.env.IAP_AUDIENCE = AUDIENCE;
assert((await currentAuthor(new Headers())) === null, "IAP without assertion");
const headers = new Headers({ "x-goog-iap-jwt-assertion": await token({}) });
assert((await currentAuthor(headers)) === "prenom.nom@converteo.com", "author from IAP");
delete process.env.K_SERVICE;
assert((await currentAuthor(new Headers())) === null, "IAP set: DEV_AUTHOR ignored");

console.error = silence;
globalThis.fetch = realFetch;
console.log("check-author: ok");

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { GET, POST } from "../src/app/api/[...path]/route";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let seen: Seen | null = null;

// Fake back: records the request, answers according to the path.
const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk: Buffer) => (body += chunk.toString()));
  request.on("end", () => {
    seen = { method: request.method ?? "", url: request.url ?? "", headers: request.headers, body };
    if (request.url?.startsWith("/hotels/unknown")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { code: "not_found", message: "Hôtel inconnu" } }));
    } else if (request.url?.startsWith("/exports/")) {
      response.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="values.csv"',
      });
      response.end("a,b\n1,2\n");
    } else {
      response.writeHead(200, { "Content-Type": "application/json", "X-Internal": "secret" });
      response.end(JSON.stringify({ ok: true }));
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const backendUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

process.env.BACKEND_URL = `${backendUrl}/`;
process.env.DEV_AUTHOR = " prenom.nom@converteo.com ";
delete process.env.K_SERVICE;
delete process.env.IAP_AUDIENCE;

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const lastSeen = (): Seen => {
  if (!seen) {
    throw new Error("the back received nothing");
  }
  return seen;
};

// GET: path and query relayed, browser headers dropped, author added, no token over http.
let response = await GET(
  new Request("http://front/api/hotels?brand=ibis&limit=50", {
    headers: { "X-PIM-Author": "pirate@example.com", Cookie: "session=1" },
  }),
  context("hotels"),
);
assert(response.status === 200, `GET status ${response.status}`);
assert(response.headers.get("Cache-Control") === "no-store", "no-store");
assert(response.headers.get("X-Internal") === null, "back headers are not all copied");
assert((await response.json()).ok === true, "GET body");
assert(lastSeen().method === "GET", "GET method");
assert(lastSeen().url === "/hotels?brand=ibis&limit=50", `GET url ${lastSeen().url}`);
assert(lastSeen().headers["x-pim-author"] === "prenom.nom@converteo.com", "author is DEV_AUTHOR");
assert(lastSeen().headers.cookie === undefined, "browser cookie dropped");
assert(lastSeen().headers.authorization === undefined, "no Authorization over http");

// Segments are re-encoded one by one.
response = await GET(new Request("http://front/api/fields/a%2Fb/values"), context("fields", "a/b", "values"));
assert(lastSeen().url === "/fields/a%2Fb/values", `encoded url ${lastSeen().url}`);

// POST: body relayed as JSON.
const decisions = JSON.stringify({ items: [{ enrichmentId: "e1", decision: "human_approved" }] });
response = await POST(
  new Request("http://front/api/decisions/enrichments", {
    method: "POST",
    body: decisions,
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
  }),
  context("decisions", "enrichments"),
);
assert(response.status === 200, `POST status ${response.status}`);
assert(lastSeen().method === "POST", "POST method");
assert(lastSeen().body === decisions, "POST body");
assert(lastSeen().headers["content-type"] === "application/json", "POST content type");

// Writes forged by another site, or not in JSON, never reach the back.
seen = null;
response = await POST(
  new Request("http://front/api/export", {
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
  }),
  context("export"),
);
assert(response.status === 403, `cross-site status ${response.status}`);
response = await POST(
  new Request("http://front/api/export", { method: "POST", body: "{}", headers: { "Content-Type": "text/plain" } }),
  context("export"),
);
assert(response.status === 415, `text/plain status ${response.status}`);
assert(seen === null, "refused writes not relayed");

// Back errors relayed as is.
response = await GET(new Request("http://front/api/hotels/unknown"), context("hotels", "unknown"));
assert(response.status === 404, `404 status ${response.status}`);
assert((await response.json()).error.code === "not_found", "404 body");

// Downloads keep Content-Disposition.
response = await GET(new Request("http://front/api/exports/x1/files/values.csv"), context("exports", "x1", "files", "values.csv"));
assert(response.headers.get("Content-Disposition") === 'attachment; filename="values.csv"', "Content-Disposition");
assert(response.headers.get("Content-Type") === "text/csv", "download Content-Type");
assert((await response.text()) === "a,b\n1,2\n", "download body");

// Dot segments refused before reaching the back.
seen = null;
response = await GET(new Request("http://front/api/hotels/x"), context("hotels", "..", "admin"));
assert(response.status === 400, `dot-dot status ${response.status}`);
assert(seen === null, "dot-dot not relayed");

// No DEV_AUTHOR on Cloud Run; forged browser identity never relayed.
process.env.K_SERVICE = "front";
await GET(
  new Request("http://front/api/stats", {
    headers: { "X-PIM-Author": "pirate@example.com", Authorization: "Bearer forged" },
  }),
  context("stats"),
);
assert(lastSeen().headers["x-pim-author"] === undefined, "no author on Cloud Run, forged one dropped");
assert(lastSeen().headers.authorization === undefined, "browser Authorization dropped");
delete process.env.K_SERVICE;

// Behind IAP without a verified identity: refused before the back, reads included.
process.env.IAP_AUDIENCE = "/projects/1/locations/europe-west1/services/front";
seen = null;
response = await GET(
  new Request("http://front/api/stats", { headers: { "x-goog-iap-jwt-assertion": "forged.jwt.value" } }),
  context("stats"),
);
assert(response.status === 401, `IAP without identity status ${response.status}`);
assert((await response.json()).error.code === "iap_required", "IAP error code");
assert(seen === null, "unidentified call not relayed");
delete process.env.IAP_AUDIENCE;

await new Promise<void>((resolve) => server.close(() => resolve()));

// Unreachable back.
response = await GET(new Request("http://front/api/stats"), context("stats"));
assert(response.status === 502, `unreachable status ${response.status}`);
assert((await response.json()).error.code === "backend_unreachable", "unreachable body");

// https back: Google ID token from the metadata server, cached per audience.
const realFetch = globalThis.fetch;
let metadataCalls = 0;
let metadataStatus = 200;
let backAuthorization: string | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://metadata.google.internal/")) {
    metadataCalls += 1;
    assert(new Headers(init?.headers).get("Metadata-Flavor") === "Google", "Metadata-Flavor");
    const audience = (process.env.BACKEND_URL ?? "").replace(/\/+$/, "");
    assert(url.endsWith(`audience=${encodeURIComponent(audience)}`), `audience ${url}`);
    return new Response(metadataStatus === 200 ? "tok-1" : "boom", { status: metadataStatus });
  }
  backAuthorization = new Headers(init?.headers).get("Authorization");
  return Response.json({ ok: true });
}) as typeof fetch;
process.env.BACKEND_URL = "https://back.test/";
response = await GET(new Request("http://front/api/stats"), context("stats"));
await GET(new Request("http://front/api/stats"), context("stats"));
assert(response.status === 200, `https status ${response.status}`);
assert(backAuthorization === "Bearer tok-1", `Authorization ${backAuthorization}`);
assert(metadataCalls === 1, `token cached (${metadataCalls} metadata calls)`);
process.env.BACKEND_URL = "https://back.test/v2";
metadataStatus = 500;
response = await GET(new Request("http://front/api/stats"), context("stats"));
assert(response.status === 502, `metadata failure status ${response.status}`);
assert(metadataCalls === 2, "new audience asks for a new token");
globalThis.fetch = realFetch;

// Missing configuration.
delete process.env.BACKEND_URL;
response = await GET(new Request("http://front/api/stats"), context("stats"));
assert(response.status === 500, `unconfigured status ${response.status}`);
assert((await response.json()).error.code === "backend_not_configured", "unconfigured body");

console.log("check-relay: ok");

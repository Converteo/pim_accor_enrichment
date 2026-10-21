import { currentAuthor } from "@/server/author";
import { fetchBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

const RELAYED_HEADERS = ["Content-Type", "Content-Disposition"];

interface Context {
  params: Promise<{ path: string[] }>;
}

function relayError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function relay(request: Request, context: Context): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL?.trim();
  if (!backendUrl) {
    return relayError(500, "backend_not_configured", "L’adresse du back (BACKEND_URL) n’est pas configurée.");
  }

  // Writes carry the reviewer's identity: refuse requests forged by another site (no CORS preflight for text/plain).
  if (request.method === "POST") {
    const site = request.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin") {
      return relayError(403, "cross_site", "Requête refusée : elle ne vient pas de l’interface.");
    }
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
      return relayError(415, "unsupported_media_type", "Corps JSON attendu.");
    }
  }

  const { path } = await context.params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return relayError(400, "invalid_path", "Chemin d’API invalide.");
  }
  const target = "/" + path.map(encodeURIComponent).join("/") + new URL(request.url).search;

  // Behind IAP, every call needs a verified identity: reads too, should IAP be bypassed (direct run.app URL).
  const author = await currentAuthor(request.headers);
  if (process.env.IAP_AUDIENCE?.trim() && !author) {
    return relayError(401, "iap_required", "Identité non vérifiée : rechargez la page pour vous reconnecter.");
  }

  let upstream: Response;
  try {
    const body = request.method === "POST" ? await request.arrayBuffer() : null;
    upstream = await fetchBackend(backendUrl, {
      method: request.method,
      path: target,
      body: body && body.byteLength > 0 ? body : null,
      author,
      signal: request.signal,
    });
  } catch (error) {
    console.error("api relay:", error);
    return relayError(502, "backend_unreachable", "Le back est injoignable.");
  }

  // Cloud Run or load-balancer errors (HTML 403, 5xx) are not in the contract's error format.
  if (!upstream.ok && !upstream.headers.get("Content-Type")?.includes("json")) {
    console.error(`api relay: back answered ${upstream.status} without a JSON error`);
    return relayError(502, "backend_error", `Le back a répondu ${upstream.status}.`);
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of RELAYED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const GET = relay;
export const POST = relay;

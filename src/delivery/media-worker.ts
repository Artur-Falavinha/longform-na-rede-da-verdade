import manifest from "../../.generated/media-manifest.json";

type AssetFetcher = { fetch(request: Request): Promise<Response> };
const media = manifest as Record<string, { bytes: number; sha256: string }>;

function lookupRequest(request: Request, key: Request, etag: string) {
  const headers = new Headers(request.headers);
  const ifRange = headers.get("If-Range");
  if (request.method === "HEAD" || (ifRange && ifRange !== etag)) {
    headers.delete("Range");
  }
  return new Request(key, { headers });
}

export default {
  async fetch(request: Request, env: { ASSETS: AssetFetcher }) {
    const url = new URL(request.url);
    const asset = media[url.pathname];
    if (!asset || !["GET", "HEAD"].includes(request.method)) {
      return env.ASSETS.fetch(request);
    }

    const cache = await caches.open("longform-media-v1");
    const key = new Request(
      new URL(`/.media-cache/${asset.sha256}${url.pathname}`, url),
    );
    const etag = `"${asset.sha256}"`;
    const lookup = lookupRequest(request, key, etag);
    let response = await cache.match(lookup);
    if (!response) {
      const complete = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
      if (complete.status !== 200) return complete;
      const headers = new Headers(complete.headers);
      headers.set("Content-Length", String(asset.bytes));
      headers.set("Accept-Ranges", "bytes");
      headers.set("ETag", etag);
      // O cache usa o tamanho real para responder Range; o hash evita misturar versões.
      await cache.put(key, new Response(complete.body, { headers }));
      response = await cache.match(lookup);
      if (!response) {
        return new Response("Arquivo de mídia temporariamente indisponível.", {
          status: 503,
        });
      }
    }
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};

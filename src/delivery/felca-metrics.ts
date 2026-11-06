import { felcaVideoId } from "../data/felca-metrics";

type VideoStatistics = {
  items?: { statistics?: { viewCount?: string; commentCount?: string } }[];
};

export async function deliverFelcaMetrics(request: Request, apiKey?: string) {
  if (!apiKey) return new Response(null, { status: 404 });
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }
  const cache = await caches.open("felca-metrics-v1");
  const cacheKey = new Request(new URL("/api/felca-metrics", request.url));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.search = new URLSearchParams({
      part: "statistics",
      id: felcaVideoId,
      key: apiKey,
    }).toString();
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return new Response(null, { status: 503 });
    const { items } = (await response.json()) as VideoStatistics;
    const views = Number(items?.[0]?.statistics?.viewCount);
    const comments = Number(items?.[0]?.statistics?.commentCount);
    if (
      ![views, comments].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      return new Response(null, { status: 503 });
    }
    const result = Response.json(
      { views, comments, updatedAt: new Date().toISOString() },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
    await cache.put(cacheKey, result.clone());
    return result;
  } catch {
    return new Response(null, { status: 503 });
  }
}

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportMetrics,
  parseMetricsExportArgs,
  readPostHogConfiguration,
  runMetricsExport,
  type MetricExportOptions,
} from "../scripts/export-metrics";

const from = "2026-10-09T00:00:00Z";
const to = "2026-10-10T00:00:00Z";
const epoch = "validation-2026-10";
const fixtureKey = "personal-key-fixture";

const options: MetricExportOptions = {
  from,
  to,
  epoch,
  projectId: "12345",
  host: "us.posthog.com",
  apiKey: fixtureKey,
};

type EventRow = [
  string,
  string,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
  string | null,
];

function eventRow(
  eventId: string,
  name: string,
  overrides: Partial<Pick<EventRow, 2 | 3 | 4 | 5 | 6 | 7 | 8>> = {},
): EventRow {
  const row: EventRow = [
    eventId,
    name,
    epoch,
    "direcao-04-validation-1",
    "2026-10-09T12:00:00Z",
    "",
    "",
    "",
    "",
  ];

  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value;
  }

  return row;
}

function response(
  rows: EventRow[],
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ results: rows, ...extra }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makePagedFetch(
  rows: EventRow[],
  requests: Array<{ url: string; init?: RequestInit }> = [],
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    const body = JSON.parse(String(init?.body)) as { query: { query: string } };
    const cursor =
      body.query.query
        .match(/properties\.eventId\)\s*>\s*'((?:''|[^'])*)'/)?.[1]
        ?.replaceAll("''", "'") ?? "";
    const page = rows
      .filter((row) => row[0] > cursor)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(0, 100);

    return response(page);
  };
}

describe("exportação administrativa de métricas", () => {
  afterEach(() => vi.restoreAllMocks());

  it("página por eventId, filtra época e janela, deduplica e mantém zeros dos IDs atuais", async () => {
    const rows: EventRow[] = Array.from({ length: 100 }, (_, index) =>
      eventRow(`evt-${String(index + 1).padStart(3, "0")}`, "page_load"),
    );
    rows.push(
      eventRow("evt-050", "page_load"),
      eventRow("evt-101", "chapter_reached", { 4: from, 5: "cartilha" }),
      eventRow("evt-102", "media_started", {
        3: "content-final",
        4: "2026-10-09T23:59:59.999Z",
        7: "opening",
        8: "ambient",
      }),
      eventRow("evt-102", "media_started", {
        3: "content-final",
        4: "2026-10-09T23:59:59.999Z",
        7: "opening",
        8: "ambient",
      }),
      eventRow("evt-103", "comment_group_opened", {
        2: "other-epoch",
        6: "journalism",
      }),
      eventRow("evt-104", "booklet_opened", { 4: to, 5: "booklet" }),
      eventRow("evt-105", "chapter_reached", {
        4: "2026-10-08T23:59:59.999Z",
        5: "contexto",
      }),
      eventRow("evt-106", "booklet_download_clicked", {
        4: "2026-10-09T23:59:59.999Z",
        5: "booklet",
      }),
    );

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const result = await exportMetrics(options, {
      fetch: makePagedFetch(rows, requests),
      now: () => new Date("2026-10-10T12:00:00.000Z"),
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      "https://us.posthog.com/api/projects/12345/query/",
    );
    expect(requests[0].init?.redirect).toBe("error");
    expect(new Headers(requests[0].init?.headers).get("authorization")).toBe(
      `Bearer ${fixtureKey}`,
    );
    expect(requests[0].init?.body).toContain(
      "properties.occurredAt) >= '2026-10-09T00:00:00.000Z'",
    );
    expect(requests[0].init?.body).toContain(
      "properties.occurredAt) < '2026-10-10T00:00:00.000Z'",
    );
    expect(requests[1].init?.body).toContain("properties.eventId) > 'evt-099'");
    expect(result).toEqual({
      dictionaryVersion: 1,
      metricEpoch: epoch,
      from,
      to,
      generatedAt: "2026-10-10T12:00:00.000Z",
      contentVersions: ["content-final", "direcao-04-validation-1"],
      totals: {
        page_load: 100,
        chapter_reached: 1,
        media_started: 1,
        comment_group_opened: 0,
        booklet_opened: 0,
        booklet_download_clicked: 1,
      },
      byChapter: {
        abertura: 0,
        contexto: 0,
        comentarios: 0,
        comparacao: 0,
        jornalismo: 0,
        cronologia: 0,
        adultizacao: 0,
        cartilha: 1,
        encerramento: 0,
      },
      byCommentGroup: {
        journalism: 0,
        "moral-authority": 0,
        opposition: 0,
        adultization: 0,
      },
      byMedia: {
        opening: { ambient: 1, editorial: 0 },
        closing: { ambient: 0, editorial: 0 },
        felca: { ambient: 0, editorial: 0 },
        comparison: { ambient: 0, editorial: 0 },
        "checking-future": { ambient: 0, editorial: 0 },
        "journalist-influencer": { ambient: 0, editorial: 0 },
      },
      disclaimer: "Abrir ou baixar a cartilha não confirma que ela foi lida.",
    });
  });

  it("normaliza limites com fração curta e aceita propriedades opcionais nulas", async () => {
    const shortFractionOptions = {
      ...options,
      from: "2026-10-09T00:00:00.1Z",
      to: "2026-10-09T00:00:00.2Z",
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return response([
        eventRow("evt-short-fraction", "page_load", {
          4: "2026-10-09T00:00:00.100Z",
          5: null,
          6: null,
          7: null,
          8: null,
        }),
      ]);
    };

    const result = await exportMetrics(shortFractionOptions, {
      fetch,
      now: () => new Date("2026-10-10T12:00:00.000Z"),
    });
    const queryBody = String(requests[0].init?.body);

    expect(queryBody).toContain(
      "properties.occurredAt) >= '2026-10-09T00:00:00.100Z'",
    );
    expect(queryBody).toContain(
      "properties.occurredAt) < '2026-10-09T00:00:00.200Z'",
    );
    expect(result.totals.page_load).toBe(1);
  });

  it("valida argumentos UTC, ordem da janela e época segura", () => {
    const parsed = parseMetricsExportArgs([
      "--from",
      from,
      "--to",
      to,
      "--epoch",
      epoch,
      "--out",
      "tmp/metrics.json",
    ]);

    expect(parsed).toEqual({ from, to, epoch, out: "tmp/metrics.json" });
    expect(() =>
      parseMetricsExportArgs([
        "--from",
        "2026-10-09",
        "--to",
        to,
        "--epoch",
        epoch,
        "--out",
        "out.json",
      ]),
    ).toThrow();
    expect(() =>
      parseMetricsExportArgs([
        "--from",
        to,
        "--to",
        from,
        "--epoch",
        epoch,
        "--out",
        "out.json",
      ]),
    ).toThrow();
    expect(() =>
      parseMetricsExportArgs([
        "--from",
        from,
        "--to",
        to,
        "--epoch",
        "x'; DROP TABLE events",
        "--out",
        "out.json",
      ]),
    ).toThrow();
  });

  it("exige chave pessoal e host/região oficiais sem expor o valor recebido", () => {
    expect(() =>
      readPostHogConfiguration({
        PROJECT_ID: "12345",
        POSTHOG_HOST: "us.posthog.com",
      }),
    ).toThrow(/POSTHOG_PERSONAL_API_KEY/);
    expect(
      readPostHogConfiguration({
        PROJECT_ID: "12345",
        POSTHOG_HOST: "eu.posthog.com",
        POSTHOG_PERSONAL_API_KEY: fixtureKey,
      }),
    ).toEqual({
      projectId: "12345",
      host: "eu.posthog.com",
      apiKey: fixtureKey,
    });
    expect(() =>
      readPostHogConfiguration({
        PROJECT_ID: "12345",
        POSTHOG_HOST: "https://attacker.example",
        POSTHOG_PERSONAL_API_KEY: fixtureKey,
      }),
    ).toThrow(/POSTHOG_HOST/);
    expect(() =>
      readPostHogConfiguration({
        PROJECT_ID: "12345",
        POSTHOG_HOST: "eu.posthog.com",
        PUBLIC_POSTHOG_PERSONAL_API_KEY: fixtureKey,
      }),
    ).toThrow(/POSTHOG_PERSONAL_API_KEY/);
  });

  it("interrompe uma resposta redirecionada do endpoint", async () => {
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      expect(init?.redirect).toBe("error");
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/collect" },
      });
    };

    await expect(exportMetrics(options, { fetch })).rejects.toThrow(
      /redirect/i,
    );
  });

  it("grava o documento JSON completo no caminho solicitado", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metrics-export-"));
    const outputPath = join(directory, "metrics.json");

    try {
      const result = await runMetricsExport(
        { ...options, out: outputPath },
        {
          fetch: async () => response([eventRow("evt-one", "page_load")]),
          now: () => new Date("2026-10-10T12:00:00.000Z"),
        },
      );

      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(result);
      expect(await readdir(directory)).toEqual(["metrics.json"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("falha em uma página incompleta e não grava arquivo JSON parcial", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metrics-export-"));
    const outputPath = join(directory, "metrics.json");
    const rows = Array.from({ length: 100 }, (_, index) =>
      eventRow(`evt-${String(index + 1).padStart(3, "0")}`, "page_load"),
    );
    let requestCount = 0;
    const fetch: typeof globalThis.fetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? response(rows)
        : new Response(JSON.stringify({ query_status: { complete: false } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    };

    try {
      await expect(
        runMetricsExport({ ...options, out: outputPath }, { fetch }),
      ).rejects.toThrow(/incomplete|incompleta/i);
      expect(requestCount).toBe(2);
      expect(await readdir(directory)).toEqual([]);
      await expect(readFile(outputPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

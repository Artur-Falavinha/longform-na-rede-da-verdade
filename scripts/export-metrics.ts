import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chapters } from "../src/data/chapters";
import { comments } from "../src/data/comments";
import { media } from "../src/data/media";
import type { ChapterId, CommentGroupId, MediaId } from "../src/data/types";
import type { MetricEnvelope, MetricEvent } from "../src/scripts/analytics";

const POSTHOG_HOSTS = new Set(["us.posthog.com", "eu.posthog.com"]);
const PAGE_SIZE = 100;
const MAX_PAGES = 10_000;
const METRIC_EVENT_NAMES = [
  "page_load",
  "chapter_reached",
  "media_started",
  "comment_group_opened",
  "booklet_opened",
  "booklet_download_clicked",
] satisfies MetricEvent["name"][];
const QUERY_COLUMNS = [
  "event_id",
  "event_name",
  "metric_epoch",
  "content_version",
  "occurred_at",
  "chapter_id",
  "group_id",
  "media_id",
  "purpose",
] as const;
const DISCLAIMER = "Abrir ou baixar a cartilha não confirma que ela foi lida.";

type MetricEventName = (typeof METRIC_EVENT_NAMES)[number];
type MetricExportEvent = MetricEvent & Omit<MetricEnvelope, "pageLoadId">;
type QueryRow = Record<(typeof QUERY_COLUMNS)[number], string>;
type QueryPayload = {
  error?: unknown;
  results?: unknown;
  columns?: unknown;
  query_status?: { complete?: unknown; error?: unknown };
  is_truncated?: unknown;
  isTruncated?: unknown;
  truncated?: unknown;
};
type FetchResponse = Pick<
  Response,
  "ok" | "status" | "json" | "url" | "redirected"
>;
type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<FetchResponse>;

export type MetricExportDocument = {
  dictionaryVersion: 1;
  metricEpoch: string;
  from: string;
  to: string;
  generatedAt: string;
  contentVersions: string[];
  totals: Record<MetricEventName, number>;
  byChapter: Record<string, number>;
  byCommentGroup: Record<string, number>;
  byMedia: Record<string, { ambient: number; editorial: number }>;
  disclaimer: string;
};

export type MetricExportOptions = {
  from: string;
  to: string;
  epoch: string;
  projectId: string;
  host: string;
  apiKey: string;
};

export type MetricExportCliOptions = MetricExportOptions & { out: string };

export type MetricExportDependencies = {
  fetch?: FetchFunction;
  now?: () => Date;
};

type ParsedMetricExportArgs = Omit<
  MetricExportCliOptions,
  "projectId" | "host" | "apiKey"
>;
type PostHogConfiguration = Pick<
  MetricExportOptions,
  "projectId" | "host" | "apiKey"
>;

export function parseMetricsExportArgs(args: string[]): ParsedMetricExportArgs {
  const allowedOptions = new Set(["from", "to", "epoch", "out"]);
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error("Expected --from, --to, --epoch, and --out options.");
    }

    const name = argument.slice(2);
    if (!allowedOptions.has(name)) {
      throw new Error(`Unknown option --${name}.`);
    }
    if (values.has(name)) {
      throw new Error(`Option --${name} can only be supplied once.`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${name} requires a value.`);
    }

    values.set(name, value);
    index += 1;
  }

  const fromValue = requiredOption(values, "from");
  const toValue = requiredOption(values, "to");
  const epoch = requiredOption(values, "epoch");
  const out = requiredOption(values, "out");
  const fromTime = parseUtc(fromValue, "--from");
  const toTime = parseUtc(toValue, "--to");

  if (fromTime >= toTime) {
    throw new Error("--from must be earlier than --to.");
  }
  validateEpoch(epoch);
  if (!out.toLowerCase().endsWith(".json")) {
    throw new Error("--out must name a .json file.");
  }

  return { from: fromValue, to: toValue, epoch, out };
}

export function readPostHogConfiguration(
  env: NodeJS.ProcessEnv,
): PostHogConfiguration {
  const projectId = env.PROJECT_ID ?? env.POSTHOG_PROJECT_ID;
  const host = env.POSTHOG_HOST;
  const apiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();

  if (!projectId || !/^\d{1,32}$/.test(projectId) || /^0+$/.test(projectId)) {
    throw new Error(
      "PROJECT_ID must contain a positive numeric PostHog project ID.",
    );
  }
  if (!host || !POSTHOG_HOSTS.has(host)) {
    throw new Error("POSTHOG_HOST must be us.posthog.com or eu.posthog.com.");
  }
  if (!apiKey) {
    throw new Error("POSTHOG_PERSONAL_API_KEY is required.");
  }
  if (apiKey.startsWith("phc_")) {
    throw new Error(
      "POSTHOG_PERSONAL_API_KEY must be a personal API key, not a project token.",
    );
  }

  return { projectId, host, apiKey };
}

export async function exportMetrics(
  options: MetricExportOptions,
  dependencies: MetricExportDependencies = {},
): Promise<MetricExportDocument> {
  validateExportOptions(options);

  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? (() => new Date());
  const windowStart = parseUtc(options.from, "--from");
  const windowEnd = parseUtc(options.to, "--to");
  const seenEventIds = new Set<string>();
  const acceptedEvents: MetricExportEvent[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await requestEventPage(options, cursor, fetchImpl);
    if (rows.length > PAGE_SIZE) {
      throw new Error(
        "PostHog returned more rows than the requested page limit.",
      );
    }

    for (const row of rows) {
      const envelope = toMetricEnvelope(row);
      if (envelope.metricEpoch !== options.epoch) {
        continue;
      }

      const occurredAt = parseUtc(envelope.occurredAt, "PostHog occurredAt");
      if (occurredAt < windowStart || occurredAt >= windowEnd) {
        continue;
      }
      if (seenEventIds.has(envelope.eventId)) {
        continue;
      }

      seenEventIds.add(envelope.eventId);
      acceptedEvents.push(envelope);
    }

    if (rows.length < PAGE_SIZE) {
      return buildExportDocument(options, acceptedEvents, now());
    }

    const nextCursor = rows.at(-1)?.event_id;
    if (!nextCursor || nextCursor <= cursor) {
      throw new Error(
        "PostHog pagination did not advance; export is incomplete.",
      );
    }
    cursor = nextCursor;
  }

  throw new Error(
    "PostHog export exceeded the 10000-page safety limit; no complete export was produced.",
  );
}

export async function runMetricsExport(
  options: MetricExportCliOptions,
  dependencies: MetricExportDependencies = {},
): Promise<MetricExportDocument> {
  const document = await exportMetrics(options, dependencies);
  const outputPath = resolve(options.out);
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, outputPath);
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error("Could not write the completed metrics export file.");
  }

  return document;
}

function requiredOption(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) {
    throw new Error(`Required option --${name} is missing.`);
  }
  return value;
}

function validateEpoch(epoch: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(epoch)) {
    throw new Error(
      "--epoch must be 1 to 64 letters, digits, dots, underscores, colons, or hyphens.",
    );
  }
}

function parseUtc(value: string, label: string): number {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      value,
    );
  if (!match) {
    throw new Error(
      `${label} must be an ISO UTC timestamp ending in Z with at most millisecond precision.`,
    );
  }

  const timestamp = Date.parse(value);
  const date = new Date(timestamp);
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));

  if (
    !Number.isFinite(timestamp) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    throw new Error(`${label} is not a valid UTC timestamp.`);
  }

  return timestamp;
}

function validateExportOptions(options: MetricExportOptions): void {
  const fromTime = parseUtc(options.from, "--from");
  const toTime = parseUtc(options.to, "--to");

  if (fromTime >= toTime) {
    throw new Error("--from must be earlier than --to.");
  }
  validateEpoch(options.epoch);
  if (!/^\d{1,32}$/.test(options.projectId) || /^0+$/.test(options.projectId)) {
    throw new Error(
      "PROJECT_ID must contain a positive numeric PostHog project ID.",
    );
  }
  if (!POSTHOG_HOSTS.has(options.host)) {
    throw new Error("POSTHOG_HOST must be us.posthog.com or eu.posthog.com.");
  }
  if (!options.apiKey.trim()) {
    throw new Error("POSTHOG_PERSONAL_API_KEY is required.");
  }
  if (options.apiKey.trim().startsWith("phc_")) {
    throw new Error(
      "POSTHOG_PERSONAL_API_KEY must be a personal API key, not a project token.",
    );
  }
}

async function requestEventPage(
  options: MetricExportOptions,
  cursor: string,
  fetchImpl: FetchFunction,
): Promise<QueryRow[]> {
  const origin = `https://${options.host}`;
  const endpoint = `${origin}/api/projects/${encodeURIComponent(options.projectId)}/query/`;
  const requestBody = {
    name: "longform metrics export",
    query: {
      kind: "HogQLQuery",
      query: buildHogQlQuery(options, cursor),
    },
  };

  let response: FetchResponse;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${options.apiKey.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("PostHog query request failed.");
  }

  if (
    response.redirected ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error(
      "PostHog query endpoint returned a redirect; export was stopped.",
    );
  }
  if (response.url) {
    try {
      if (new URL(response.url).origin !== origin) {
        throw new Error("Unexpected response origin.");
      }
    } catch {
      throw new Error("PostHog query response came from an unexpected URL.");
    }
  }
  if (!response.ok) {
    throw new Error(`PostHog query failed with HTTP ${response.status}.`);
  }

  let payload: QueryPayload;
  try {
    payload = (await response.json()) as QueryPayload;
  } catch {
    throw new Error("PostHog query returned an invalid JSON response.");
  }

  if (
    Boolean(payload.error) ||
    Boolean(payload.query_status?.error) ||
    payload.query_status?.complete === false ||
    payload.is_truncated === true ||
    payload.isTruncated === true ||
    payload.truncated === true
  ) {
    throw new Error("PostHog reported incomplete query results.");
  }

  if (!Array.isArray(payload.results)) {
    throw new Error("PostHog query response did not include a results array.");
  }
  if (Array.isArray(payload.columns) && !sameColumns(payload.columns)) {
    throw new Error(
      "PostHog query response columns did not match the requested export.",
    );
  }

  return payload.results.map(parseQueryRow);
}

function buildHogQlQuery(options: MetricExportOptions, cursor: string): string {
  return [
    "SELECT",
    "  toString(properties.eventId) AS event_id,",
    "  any(event) AS event_name,",
    "  any(toString(properties.metricEpoch)) AS metric_epoch,",
    "  any(toString(properties.contentVersion)) AS content_version,",
    "  any(toString(properties.occurredAt)) AS occurred_at,",
    "  coalesce(any(toString(properties.chapterId)), '') AS chapter_id,",
    "  coalesce(any(toString(properties.groupId)), '') AS group_id,",
    "  coalesce(any(toString(properties.mediaId)), '') AS media_id,",
    "  coalesce(any(toString(properties.purpose)), '') AS purpose",
    "FROM events",
    `WHERE event IN (${METRIC_EVENT_NAMES.map(sqlLiteral).join(", ")})`,
    `  AND toString(properties.metricEpoch) = ${sqlLiteral(options.epoch)}`,
    `  AND toString(properties.occurredAt) >= ${sqlLiteral(new Date(parseUtc(options.from, "--from")).toISOString())}`,
    `  AND toString(properties.occurredAt) < ${sqlLiteral(new Date(parseUtc(options.to, "--to")).toISOString())}`,
    "  AND toString(properties.eventId) != ''",
    `  AND toString(properties.eventId) > ${sqlLiteral(cursor)}`,
    "GROUP BY toString(properties.eventId)",
    "ORDER BY event_id ASC",
    `LIMIT ${PAGE_SIZE}`,
  ].join("\n");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function sameColumns(columns: unknown[]): boolean {
  return (
    columns.length === QUERY_COLUMNS.length &&
    columns.every((column, index) => column === QUERY_COLUMNS[index])
  );
}

function parseQueryRow(value: unknown): QueryRow {
  if (!Array.isArray(value) || value.length !== QUERY_COLUMNS.length) {
    throw new Error("PostHog query returned a malformed metric row.");
  }

  const entries = value.map((field, index) => {
    if (index >= 5 && field === null) {
      return [QUERY_COLUMNS[index], ""] as const;
    }
    if (typeof field !== "string") {
      throw new Error("PostHog query returned a malformed metric row.");
    }
    return [QUERY_COLUMNS[index], field] as const;
  });

  return Object.fromEntries(entries) as QueryRow;
}

function toMetricEnvelope(row: QueryRow): MetricExportEvent {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.event_id)) {
    throw new Error(
      "PostHog returned an invalid eventId; export is incomplete.",
    );
  }
  if (!row.metric_epoch || !row.content_version || !row.occurred_at) {
    throw new Error(
      "PostHog returned a metric row missing required envelope fields.",
    );
  }
  if (!isMetricEventName(row.event_name)) {
    throw new Error(
      "PostHog returned an unknown metric event; export is incomplete.",
    );
  }

  const envelope = {
    eventId: row.event_id,
    metricEpoch: row.metric_epoch,
    contentVersion: row.content_version,
    occurredAt: row.occurred_at,
  };

  switch (row.event_name) {
    case "page_load":
      return { ...envelope, name: row.event_name };
    case "chapter_reached":
      if (!row.chapter_id) {
        throw new Error("PostHog chapter_reached event is missing chapterId.");
      }
      return {
        ...envelope,
        name: row.event_name,
        chapterId: row.chapter_id as ChapterId,
      };
    case "media_started":
      if (
        !row.media_id ||
        (row.purpose !== "ambient" && row.purpose !== "editorial")
      ) {
        throw new Error(
          "PostHog media_started event is missing mediaId or has an invalid purpose.",
        );
      }
      return {
        ...envelope,
        name: row.event_name,
        mediaId: row.media_id as MediaId,
        purpose: row.purpose,
      };
    case "comment_group_opened":
      if (!row.group_id) {
        throw new Error(
          "PostHog comment_group_opened event is missing groupId.",
        );
      }
      return {
        ...envelope,
        name: row.event_name,
        groupId: row.group_id as CommentGroupId,
      };
    case "booklet_opened":
    case "booklet_download_clicked":
      return { ...envelope, name: row.event_name, documentId: "booklet" };
  }
}

function isMetricEventName(value: string): value is MetricEventName {
  return METRIC_EVENT_NAMES.includes(value as MetricEventName);
}

function buildExportDocument(
  options: MetricExportOptions,
  events: MetricExportEvent[],
  generatedAt: Date,
): MetricExportDocument {
  const totals = Object.fromEntries(
    METRIC_EVENT_NAMES.map((name) => [name, 0]),
  ) as Record<MetricEventName, number>;
  const byChapter = new Map<string, number>(
    chapters.map((chapter) => [chapter.id, 0]),
  );
  const byCommentGroup = new Map<string, number>(
    comments.map((group) => [group.id, 0]),
  );
  const byMedia = new Map<string, { ambient: number; editorial: number }>(
    media.map((asset) => [asset.id, { ambient: 0, editorial: 0 }]),
  );
  const contentVersions = new Set<string>();

  for (const event of events) {
    totals[event.name] += 1;
    contentVersions.add(event.contentVersion);

    switch (event.name) {
      case "chapter_reached":
        incrementCounter(byChapter, event.chapterId);
        break;
      case "comment_group_opened":
        incrementCounter(byCommentGroup, event.groupId);
        break;
      case "media_started": {
        const counts = byMedia.get(event.mediaId) ?? {
          ambient: 0,
          editorial: 0,
        };
        counts[event.purpose] += 1;
        byMedia.set(event.mediaId, counts);
        break;
      }
    }
  }

  return {
    dictionaryVersion: 1,
    metricEpoch: options.epoch,
    from: options.from,
    to: options.to,
    generatedAt: generatedAt.toISOString(),
    contentVersions: [...contentVersions].sort(),
    totals,
    byChapter: sortedObject(byChapter),
    byCommentGroup: sortedObject(byCommentGroup),
    byMedia: sortedObject(byMedia),
    disclaimer: DISCLAIMER,
  };
}

function incrementCounter(counters: Map<string, number>, key: string): void {
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

function sortedObject<T>(values: Map<string, T>): Record<string, T> {
  return Object.fromEntries(
    [...values].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function main(): Promise<void> {
  const cliOptions = parseMetricsExportArgs(process.argv.slice(2));
  const configuration = readPostHogConfiguration(process.env);
  await runMetricsExport({ ...cliOptions, ...configuration });
  console.log(`Metrics export written to ${cliOptions.out}.`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Metrics export failed.",
    );
    process.exitCode = 1;
  });
}

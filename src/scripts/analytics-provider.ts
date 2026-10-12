import type { MetricEnvelope, MetricSink } from "./analytics";
import type { PostHog } from "posthog-js";

const allowedHosts = new Set(["us.i.posthog.com", "eu.i.posthog.com"]);
const eventNames = new Set([
  "page_load",
  "chapter_reached",
  "media_started",
  "comment_group_opened",
  "booklet_opened",
  "booklet_download_clicked",
]);
const allowedProperties = new Set([
  "token",
  "distinct_id",
  "$process_person_profile",
  "$geoip_disable",
  "eventId",
  "pageLoadId",
  "metricEpoch",
  "contentVersion",
  "occurredAt",
  "chapterId",
  "mediaId",
  "purpose",
  "groupId",
  "documentId",
]);

export function createAnalyticsSink(): MetricSink {
  if (import.meta.env.DEV)
    return (
      (window as Window & { __LONGFORM_TEST_SINK__?: MetricSink })
        .__LONGFORM_TEST_SINK__ ?? (() => {})
    );
  const key = import.meta.env.PUBLIC_POSTHOG_KEY;
  const host = import.meta.env.PUBLIC_POSTHOG_HOST;
  if (!key || !host) return () => {};
  try {
    const url = new URL(host);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname))
      return () => {};
  } catch {
    return () => {};
  }
  let client: PostHog | undefined;
  let loading = false;
  let unavailable = false;
  const queue: MetricEnvelope[] = [];
  const send = (event: MetricEnvelope) => {
    const { name, ...properties } = event;
    client?.capture(
      name,
      {
        ...properties,
        distinct_id: event.pageLoadId,
        $process_person_profile: false,
        $geoip_disable: true,
      },
      { uuid: event.eventId, timestamp: new Date(event.occurredAt) },
    );
  };
  return (event) => {
    if (unavailable) return;
    if (client) {
      try {
        send(event);
      } catch {}
      return;
    }
    if (queue.length < 100) queue.push(event);
    if (loading) return;
    loading = true;
    void import("posthog-js")
      .then(({ PostHog }) => {
        client = new PostHog();
        client.init(key, {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_external_dependency_loading: true,
          capture_performance: false,
          capture_exceptions: false,
          rageclick: false,
          capture_dead_clicks: false,
          persistence: "memory",
          disable_persistence: true,
          person_profiles: "never",
          advanced_disable_feature_flags: true,
          bootstrap: { distinctID: event.pageLoadId },
          before_send: (captured) => {
            if (!captured || !eventNames.has(captured.event)) return null;
            captured.properties = Object.fromEntries(
              Object.entries(captured.properties).filter(([name]) =>
                allowedProperties.has(name),
              ),
            );
            return captured;
          },
        });
        queue.splice(0).forEach(send);
      })
      .catch(() => {
        unavailable = true;
        queue.length = 0;
      });
  };
}

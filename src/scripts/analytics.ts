import type {
  ChapterId,
  CommentGroupId,
  Dispose,
  MediaId,
} from "../data/types";
import { release } from "../data/release";
export type MetricEvent =
  | { name: "page_load" }
  | { name: "chapter_reached"; chapterId: ChapterId }
  | {
      name: "media_started";
      mediaId: MediaId;
      purpose: "ambient" | "editorial";
    }
  | { name: "comment_group_opened"; groupId: CommentGroupId }
  | { name: "booklet_opened"; documentId: "booklet" }
  | { name: "booklet_download_clicked"; documentId: "booklet" };
export type MetricEnvelope = MetricEvent & {
  eventId: string;
  pageLoadId: string;
  metricEpoch: string;
  contentVersion: string;
  occurredAt: string;
};
export type MetricSink = (event: MetricEnvelope) => void;
export function createMetrics(sink: MetricSink) {
  const pageLoadId = crypto.randomUUID();
  const seen = new Set<string>();
  let disposed = false;
  function record(event: MetricEvent) {
    if (disposed) return;
    const key = JSON.stringify(event);
    const repeatable =
      event.name === "booklet_opened" ||
      event.name === "booklet_download_clicked";
    if (!repeatable && seen.has(key)) return;
    if (!repeatable) seen.add(key);
    const envelope: MetricEnvelope = {
      ...event,
      eventId: crypto.randomUUID(),
      pageLoadId,
      metricEpoch: release.metricEpoch,
      contentVersion: release.contentVersion,
      occurredAt: new Date().toISOString(),
    };
    try {
      sink(envelope);
    } catch {
      /* Coleta indisponível não interfere na leitura. */
    }
  }
  return {
    record,
    dispose() {
      disposed = true;
      seen.clear();
    },
  };
}
export function createExposureTracker(reached: (id: ChapterId) => void) {
  const visible = new Set<ChapterId>();
  const counted = new Set<ChapterId>();
  const timers = new Map<ChapterId, ReturnType<typeof setTimeout>>();
  let documentVisible = true;
  let disposed = false;
  function cancel(id: ChapterId) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  function start(id: ChapterId) {
    if (
      disposed ||
      !documentVisible ||
      !visible.has(id) ||
      counted.has(id) ||
      timers.has(id)
    )
      return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        counted.add(id);
        reached(id);
      }, 1000),
    );
  }
  function setVisible(id: ChapterId, value: boolean) {
    if (value) {
      visible.add(id);
      start(id);
    } else {
      visible.delete(id);
      cancel(id);
    }
  }
  function setDocumentVisible(value: boolean) {
    documentVisible = value;
    if (value) visible.forEach(start);
    else [...timers.keys()].forEach(cancel);
  }
  return {
    setVisible,
    setDocumentVisible,
    dispose() {
      disposed = true;
      [...timers.keys()].forEach(cancel);
      visible.clear();
    },
  };
}
export function observeChapterStarts(
  root: HTMLElement,
  record: (event: MetricEvent) => void,
): Dispose {
  const tracker = createExposureTracker((chapterId) =>
    record({ name: "chapter_reached", chapterId }),
  );
  const controller = new AbortController();
  const markers: HTMLElement[] = [];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        tracker.setVisible(
          (entry.target as HTMLElement).dataset.metricChapter as ChapterId,
          entry.isIntersecting && entry.intersectionRatio >= 1,
        );
    },
    { threshold: 1, rootMargin: "-64px 0px 0px 0px" },
  );
  root
    .querySelectorAll<HTMLElement>("[data-chapter-start]")
    .forEach((section) => {
      const marker = document.createElement("span");
      marker.className = "metric-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.dataset.metricChapter = section.id;
      section.prepend(marker);
      markers.push(marker);
      observer.observe(marker);
    });
  const updateVisibility = () => tracker.setDocumentVisible(!document.hidden);
  document.addEventListener("visibilitychange", updateVisibility, {
    signal: controller.signal,
  });
  window.addEventListener("pageshow", updateVisibility, {
    signal: controller.signal,
  });
  updateVisibility();
  return () => {
    controller.abort();
    observer.disconnect();
    tracker.dispose();
    markers.forEach((marker) => marker.remove());
  };
}

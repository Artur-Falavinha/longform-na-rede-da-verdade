import type { CommentGroupId, Dispose, MediaId } from "../data/types";
import {
  createMetrics,
  observeChapterStarts,
  type MetricSink,
} from "./analytics";

export function initMetrics(root: HTMLElement, sink: MetricSink): Dispose {
  const metrics = createMetrics(sink);
  const controller = new AbortController();
  const stopChapters = observeChapterStarts(root, metrics.record);
  metrics.record({ name: "page_load" });
  root
    .querySelectorAll<HTMLMediaElement>("[data-media-id]")
    .forEach((element) => {
      element.addEventListener(
        "playing",
        () =>
          metrics.record({
            name: "media_started",
            mediaId: element.dataset.mediaId as MediaId,
            purpose: element.dataset.purpose as "ambient" | "editorial",
          }),
        { signal: controller.signal },
      );
    });
  root.addEventListener(
    "longform:comment-open",
    (event) => {
      const detail = (
        event as CustomEvent<{
          groupId: CommentGroupId;
          userInitiated: boolean;
        }>
      ).detail;
      if (detail.userInitiated)
        metrics.record({
          name: "comment_group_opened",
          groupId: detail.groupId,
        });
    },
    { signal: controller.signal },
  );
  root.addEventListener(
    "longform:booklet-action",
    (event) => {
      const detail = (event as CustomEvent<{ action: "open" | "download" }>)
        .detail;
      metrics.record({
        name:
          detail.action === "open"
            ? "booklet_opened"
            : "booklet_download_clicked",
        documentId: "booklet",
      });
    },
    { signal: controller.signal },
  );
  return () => {
    controller.abort();
    stopChapters();
    metrics.dispose();
  };
}

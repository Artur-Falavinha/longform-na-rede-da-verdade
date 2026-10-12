import { initChapterIndex } from "../components/navigation/chapter-index";
import { initCommentExplorer } from "../components/comments/comment-explorer";
import { createMediaCoordinator } from "../components/media/coordinator";
import { initAmbientVideo } from "../components/media/ambient-video";
import { initVideoPlayer } from "../components/media/video-player";
import { initBooklet } from "../components/documents/booklet";
import { initPodcastPlayer } from "../components/media/podcast-player";
import { initTimeline } from "../components/timeline/timeline-motion";
import { initSectionMotion } from "./motion";
import { initMetrics } from "./metrics-bindings";
import { createAnalyticsSink } from "./analytics-provider";
import type { Dispose, MediaId } from "../data/types";

const dispose: Dispose[] = [];
const coordinator = createMediaCoordinator();
dispose.push(() => coordinator.dispose());
dispose.push(initMetrics(document.body, createAnalyticsSink()));
document
  .querySelectorAll<HTMLMediaElement>("[data-media-id]")
  .forEach((element) =>
    dispose.push(
      coordinator.register(element.dataset.mediaId as MediaId, element),
    ),
  );
document
  .querySelectorAll<HTMLElement>("[data-chapter-index]")
  .forEach((root) => dispose.push(initChapterIndex(root)));
document
  .querySelectorAll<HTMLElement>("[data-comment-explorer]")
  .forEach((root) => dispose.push(initCommentExplorer(root)));
document
  .querySelectorAll<HTMLElement>("[data-video-player]")
  .forEach((root) => dispose.push(initVideoPlayer(root)));
document
  .querySelectorAll<HTMLElement>("[data-ambient]")
  .forEach((root) => dispose.push(initAmbientVideo(root, coordinator)));
document
  .querySelectorAll<HTMLElement>("[data-booklet]")
  .forEach((root) => dispose.push(initBooklet(root)));
document
  .querySelectorAll<HTMLElement>("[data-podcast]")
  .forEach((root) => dispose.push(initPodcastPlayer(root, coordinator)));
document
  .querySelectorAll<HTMLElement>("[data-timeline]")
  .forEach((root) => dispose.push(initTimeline(root)));
dispose.push(initSectionMotion(document.body));
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) dispose.reverse().forEach((cleanup) => cleanup());
});

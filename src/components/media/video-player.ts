import type { Dispose } from "../../data/types";

export function initVideoPlayer(root: HTMLElement): Dispose {
  const video = root.querySelector<HTMLVideoElement>("video")!;
  const error = root.querySelector<HTMLElement>(".media-error")!;
  const controller = new AbortController();
  if (video.dataset.mobileSrc && matchMedia("(max-width:899px)").matches) {
    video.src = video.dataset.mobileSrc;
    if (video.dataset.mobilePoster) video.poster = video.dataset.mobilePoster;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        video.preload = "metadata";
        observer.disconnect();
      }
    },
    { rootMargin: "600px" },
  );
  observer.observe(root);
  video.addEventListener(
    "error",
    () => {
      error.hidden = false;
    },
    { signal: controller.signal },
  );
  video.addEventListener(
    "loadeddata",
    () => {
      error.hidden = true;
    },
    { signal: controller.signal },
  );
  root.querySelector("[data-media-retry]")?.addEventListener(
    "click",
    () => {
      error.hidden = true;
      video.load();
      void video.play().catch(() => {
        error.hidden = false;
      });
    },
    { signal: controller.signal },
  );
  return () => {
    controller.abort();
    observer.disconnect();
  };
}

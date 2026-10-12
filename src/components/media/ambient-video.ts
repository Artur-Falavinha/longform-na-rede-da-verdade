import type { Dispose, MediaId } from "../../data/types";
import type { MediaCoordinator } from "./coordinator";

export function initAmbientVideo(
  root: HTMLElement,
  coordinator: MediaCoordinator,
): Dispose {
  const video = root.querySelector<HTMLVideoElement>("video")!;
  const id = video.dataset.mediaId as MediaId;
  const playButton = root.querySelector<HTMLButtonElement>(
    "[data-ambient-play]",
  )!;
  const soundButton = root.querySelector<HTMLButtonElement>(
    "[data-ambient-sound]",
  );
  const controller = new AbortController();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  video.controls = false;
  video.muted = true;
  root.querySelector<HTMLElement>(".ambient-controls")!.hidden = false;
  function updateControls() {
    playButton.textContent = video.paused ? "Reproduzir vídeo" : "Pausar vídeo";
    playButton.setAttribute(
      "aria-label",
      `${video.paused ? "Reproduzir" : "Pausar"} ${video.getAttribute("aria-label")}`,
    );
    soundButton?.setAttribute("aria-pressed", String(!video.muted));
    if (soundButton)
      soundButton.textContent = video.muted ? "Ativar som" : "Desativar som";
  }
  function attempt() {
    if (
      visible &&
      !document.hidden &&
      !reduced.matches &&
      coordinator.canAutoplay(id)
    )
      void coordinator.play(id, "automatic").then(updateControls);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      visible =
        entries[0].isIntersecting && entries[0].intersectionRatio >= 0.15;
      if (visible) attempt();
      else if (!video.paused) coordinator.pause(id, "visibility");
    },
    { threshold: 0.15 },
  );
  observer.observe(root);
  playButton.addEventListener(
    "click",
    () => {
      if (video.paused) void coordinator.play(id, "user").then(updateControls);
      else coordinator.pause(id, "manual");
    },
    { signal: controller.signal },
  );
  soundButton?.addEventListener(
    "click",
    () => {
      video.muted = !video.muted;
      updateControls();
    },
    { signal: controller.signal },
  );
  for (const event of ["play", "pause", "volumechange", "ended"])
    video.addEventListener(event, updateControls, {
      signal: controller.signal,
    });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden && !video.paused) coordinator.pause(id, "visibility");
      else attempt();
    },
    { signal: controller.signal },
  );
  reduced.addEventListener(
    "change",
    () => {
      if (reduced.matches && !video.paused)
        coordinator.pause(id, "reduced-motion");
      updateControls();
    },
    { signal: controller.signal },
  );
  updateControls();
  return () => {
    controller.abort();
    observer.disconnect();
  };
}

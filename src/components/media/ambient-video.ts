import { animate } from "motion/mini";
import type { Dispose, MediaId } from "../../data/types";
import type { MediaCoordinator } from "./coordinator";

export function initAmbientVideo(
  root: HTMLElement,
  coordinator: MediaCoordinator,
): Dispose {
  const video = root.querySelector<HTMLVideoElement>("video")!;
  const id = video.dataset.mediaId as MediaId;
  const soundButton = root.querySelector<HTMLButtonElement>(
    "[data-ambient-sound]",
  );
  const controller = new AbortController();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const off = soundButton?.querySelector<SVGSVGElement>(".sound-off");
  const on = soundButton?.querySelector<SVGSVGElement>(".sound-on");
  const slash = off?.querySelector<SVGPathElement>('path[d="m2 2 20 20"]');
  slash?.setAttribute("pathLength", "1");
  if (slash) slash.style.strokeDasharray = "1";
  let iconState: boolean | undefined;
  let iconAnimations: ReturnType<typeof animate>[] = [];
  function updateIcon(force = false) {
    if (!off || !on || !slash || (iconState === video.muted && !force)) return;
    const instant = iconState === undefined || reduced.matches;
    iconState = video.muted;
    iconAnimations.forEach((animation) => animation.stop());
    const options = {
      duration: instant ? 0 : 0.4,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    };
    iconAnimations = [
      animate(off, { opacity: video.muted ? 1 : 0 }, options),
      animate(on, { opacity: video.muted ? 0 : 1 }, options),
      animate(
        slash,
        { strokeDashoffset: video.muted ? "0" : "1" },
        { ...options, duration: instant ? 0 : 0.5 },
      ),
    ];
  }
  let visible = false;
  video.controls = false;
  video.muted = true;
  root.querySelector<HTMLElement>(".ambient-controls")!.hidden = false;
  function updateControls() {
    soundButton?.setAttribute("aria-pressed", String(!video.muted));
    soundButton?.setAttribute(
      "aria-label",
      video.muted ? "Ativar som" : "Desativar som",
    );
    video.controls = false;
    updateIcon();
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
  soundButton?.addEventListener(
    "click",
    () => {
      video.muted = !video.muted;
      if (video.paused) void coordinator.play(id, "user").then(updateControls);
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
      updateIcon(true);
    },
    { signal: controller.signal },
  );
  updateControls();
  return () => {
    iconAnimations.forEach((animation) => animation.stop());
    controller.abort();
    observer.disconnect();
  };
}

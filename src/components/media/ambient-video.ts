import { animate } from "motion/mini";
import type { Dispose, MediaId } from "../../data/types";
import type { MediaCoordinator } from "./coordinator";

export function initAmbientVideos(
  roots: Iterable<HTMLElement>,
  coordinator: MediaCoordinator,
): Dispose {
  const players = Array.from(roots, (root) => ({
    root,
    video: root.querySelector<HTMLVideoElement>("video")!,
  }));
  function setMuted(muted: boolean) {
    for (const { video } of players) {
      if (video.muted !== muted) video.muted = muted;
    }
  }
  const cleanups = players.map(({ root, video }) =>
    initAmbientVideo(root, video, coordinator, setMuted),
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}

function initAmbientVideo(
  root: HTMLElement,
  video: HTMLVideoElement,
  coordinator: MediaCoordinator,
  setMuted: (muted: boolean) => void,
): Dispose {
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
  root.querySelector<HTMLElement>(".ambient-controls")!.hidden = false;
  function updateSoundButton() {
    soundButton?.setAttribute("aria-pressed", String(!video.muted));
    soundButton?.setAttribute(
      "aria-label",
      video.muted ? "Ativar som" : "Desativar som",
    );
    updateIcon();
  }
  function attempt() {
    if (
      visible &&
      !document.hidden &&
      !reduced.matches &&
      coordinator.canAutoplay(id)
    )
      void coordinator.play(id, "automatic");
  }
  function playOnInteraction() {
    if (visible && video.paused) void coordinator.play(id, "user");
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
      setMuted(!video.muted);
      updateSoundButton();
      playOnInteraction();
    },
    { signal: controller.signal },
  );
  video.addEventListener("click", playOnInteraction, {
    signal: controller.signal,
  });
  video.addEventListener(
    "volumechange",
    () => {
      setMuted(video.muted);
      updateSoundButton();
    },
    { signal: controller.signal },
  );
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
      updateIcon(true);
    },
    { signal: controller.signal },
  );
  updateSoundButton();
  return () => {
    iconAnimations.forEach((animation) => animation.stop());
    controller.abort();
    observer.disconnect();
  };
}

import { animate } from "motion/mini";
import type { Dispose, MediaId } from "../../data/types";
import type { MediaCoordinator } from "./coordinator";

type AmbientSound = {
  muted: boolean;
  setMuted(muted: boolean): void;
};

export function initAmbientVideos(
  roots: Iterable<HTMLElement>,
  coordinator: MediaCoordinator,
): Dispose {
  const players = Array.from(roots, (root) => ({
    root,
    video: root.querySelector<HTMLVideoElement>("video")!,
  }));
  const sound: AmbientSound = {
    muted: false,
    setMuted(muted) {
      sound.muted = muted;
      for (const { video } of players) {
        if (video.muted !== muted) video.muted = muted;
      }
    },
  };
  const playersByRoot = new Map<Element, ReturnType<typeof initAmbientVideo>>(
    players.map(({ root, video }) => [
      root,
      initAmbientVideo(root, video, coordinator, sound),
    ]),
  );
  const threshold = 0.15;
  const observer = new IntersectionObserver(
    (entries) => {
      const entering = [];
      const latestEntries = new Map(
        entries.map((entry) => [entry.target, entry]),
      );
      for (const entry of latestEntries.values()) {
        const player = playersByRoot.get(entry.target);
        if (!player) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= threshold)
          entering.push(player);
        else player.setVisible(false);
      }
      for (const player of entering) player.setVisible(true);
    },
    { threshold },
  );
  for (const root of playersByRoot.keys()) observer.observe(root);
  return () => {
    observer.disconnect();
    for (const player of playersByRoot.values()) player.dispose();
  };
}

function initAmbientVideo(
  root: HTMLElement,
  video: HTMLVideoElement,
  coordinator: MediaCoordinator,
  sound: AmbientSound,
) {
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
  function canAttempt() {
    return (
      visible &&
      !document.hidden &&
      !reduced.matches &&
      !controller.signal.aborted &&
      coordinator.canAutoplay(id)
    );
  }
  async function attempt() {
    if (!canAttempt()) return;
    video.muted = sound.muted;
    await coordinator.play(id, "automatic");
    if (coordinator.reason(id) === "autoplay-blocked" && canAttempt()) {
      video.muted = true;
      void coordinator.play(id, "automatic");
    }
  }
  soundButton?.addEventListener(
    "click",
    () => {
      const enableSound = video.muted;
      sound.setMuted(!enableSound);
      updateSoundButton();
      if (visible && (enableSound || video.paused))
        void coordinator.play(id, "user");
    },
    { signal: controller.signal },
  );
  video.addEventListener(
    "click",
    () => {
      if (!visible) return;
      const restoreSound = video.muted && !sound.muted;
      if (restoreSound) video.muted = false;
      if (restoreSound || video.paused) void coordinator.play(id, "user");
    },
    { signal: controller.signal },
  );
  video.addEventListener("volumechange", updateSoundButton, {
    signal: controller.signal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden && !video.paused) coordinator.pause(id, "visibility");
      else void attempt();
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
  return {
    setVisible(inViewport: boolean) {
      visible = inViewport;
      if (visible) void attempt();
      else if (!video.paused) coordinator.pause(id, "visibility");
    },
    dispose() {
      iconAnimations.forEach((animation) => animation.stop());
      controller.abort();
    },
  };
}

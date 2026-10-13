import { initTranscript } from "./transcript";
import { animate } from "motion/mini";
import type { Dispose, MediaId } from "../../data/types";
import type { MediaCoordinator } from "./coordinator";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "--:--";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function initPodcastPlayer(
  root: HTMLElement,
  coordinator: MediaCoordinator,
): Dispose {
  const audio = root.querySelector<HTMLAudioElement>("audio")!;
  const id = audio.dataset.mediaId as MediaId;
  const origin = root.querySelector<HTMLElement>("[data-player-origin]")!;
  const surface = root.querySelector<HTMLElement>("[data-player-surface]")!;
  const playButton = root.querySelector<HTMLButtonElement>(
    "[data-podcast-play]",
  )!;
  const progress = root.querySelector<HTMLInputElement>(
    "[data-podcast-progress]",
  )!;
  const volume = root.querySelector<HTMLInputElement>("[data-podcast-volume]")!;
  const time = root.querySelector<HTMLElement>("[data-current-time]")!;
  const duration = root.querySelector<HTMLElement>("[data-duration]")!;
  const error = root.querySelector<HTMLElement>(".podcast-error")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController();
  let originVisible = true;
  let active = false;
  let compact = false;
  let resizeFrame = 0;
  let animation: ReturnType<typeof animate> | undefined;
  let requestedCompact = false;
  let transitionVersion = 0;
  root.querySelector<HTMLElement>(".player-controls")!.hidden = false;
  audio.hidden = true;
  audio.controls = false;

  function reserveSpace() {
    if (!compact && !animation)
      origin.style.minHeight = `${surface.offsetHeight}px`;
    if (active)
      document.documentElement.style.setProperty(
        "--compact-space",
        compact ? `${surface.offsetHeight + 16}px` : "0px",
      );
  }
  function clearTransition() {
    transitionVersion++;
    animation?.stop();
    animation = undefined;
    surface.style.removeProperty("transform");
    surface.style.removeProperty("opacity");
  }
  function applyLayout(next: boolean) {
    if (!compact) origin.style.minHeight = `${surface.offsetHeight}px`;
    compact = next;
    surface.classList.toggle("is-compact", next);
    reserveSpace();
  }
  async function setCompact(next: boolean, force = false) {
    if (requestedCompact === next && !force) return;
    requestedCompact = next;
    const version = ++transitionVersion;
    animation?.stop();
    if (reduced.matches || force) {
      clearTransition();
      applyLayout(next);
      return;
    }
    if (compact && !next) {
      animation = animate(
        surface,
        { opacity: 0, transform: "translateY(16px)" },
        { duration: 0.25, ease: [0.4, 0, 1, 1] },
      );
      await animation.finished;
      if (version !== transitionVersion) return;
    }
    const changed = compact !== next;
    applyLayout(next);
    if (changed) {
      surface.style.opacity = "0";
      surface.style.transform = `translateY(${next ? 24 : 8}px)`;
    }
    animation = animate(
      surface,
      { opacity: 1, transform: "translateY(0px)" },
      { duration: next ? 0.4 : 0.25, ease: [0.22, 1, 0.36, 1] },
    );
    await animation.finished;
    if (version !== transitionVersion) return;
    clearTransition();
    reserveSpace();
  }
  function updateLayout() {
    setCompact(active && !originVisible);
  }
  function updatePlayback() {
    const playing = !audio.paused && !audio.ended;
    playButton.setAttribute(
      "aria-label",
      `${playing ? "Pausar" : "Reproduzir"} ${root.querySelector("h3")!.textContent}`,
    );
    root.querySelector<HTMLElement>("[data-play-icon]")!.hidden = playing;
    root.querySelector<HTMLElement>("[data-pause-icon]")!.hidden = !playing;
    progress.style.setProperty(
      "--progress",
      `${Number.isFinite(audio.duration) && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0}%`,
    );
    time.textContent = formatTime(audio.currentTime);
    const known = Number.isFinite(audio.duration) && audio.duration > 0;
    duration.textContent = formatTime(audio.duration);
    progress.disabled = !known;
    if (known) {
      progress.max = String(audio.duration);
      progress.value = String(audio.currentTime);
    }
    progress.setAttribute(
      "aria-valuetext",
      `${formatTime(audio.currentTime)} de ${formatTime(audio.duration)}`,
    );
  }
  function activate() {
    active = true;
    error.hidden = true;
    document.dispatchEvent(
      new CustomEvent("longform:podcast-activated", {
        detail: { mediaId: id },
      }),
    );
    updateLayout();
    updatePlayback();
  }
  const observer = new IntersectionObserver(
    (entries) => {
      originVisible = entries[0].isIntersecting;
      updateLayout();
    },
    { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
  );
  observer.observe(origin);
  const sizeObserver = new ResizeObserver(reserveSpace);
  sizeObserver.observe(surface);
  playButton.addEventListener(
    "click",
    async () => {
      if (audio.paused) {
        if (!(await coordinator.play(id, "user"))) error.hidden = false;
      } else coordinator.pause(id, "manual");
      updatePlayback();
    },
    { signal: controller.signal },
  );
  progress.addEventListener(
    "input",
    () => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Number(progress.value);
        updatePlayback();
      }
    },
    { signal: controller.signal },
  );
  volume.addEventListener(
    "input",
    () => {
      audio.volume = Number(volume.value);
      audio.muted = false;
    },
    { signal: controller.signal },
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-podcast-skip]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          if (!Number.isFinite(audio.duration)) return;
          audio.currentTime = Math.min(
            audio.duration,
            Math.max(0, audio.currentTime + Number(button.dataset.podcastSkip)),
          );
          updatePlayback();
        },
        { signal: controller.signal },
      );
    });
  const speed = root.querySelector<HTMLButtonElement>("[data-podcast-speed]")!;
  const speeds = [1, 1.25, 1.5, 2];
  speed.addEventListener(
    "click",
    () => {
      audio.playbackRate =
        speeds[(speeds.indexOf(audio.playbackRate) + 1) % speeds.length];
      speed.textContent = `${audio.playbackRate.toLocaleString("pt-BR")}×`;
      speed.setAttribute(
        "aria-label",
        `Velocidade de reprodução: ${audio.playbackRate.toLocaleString("pt-BR")} vezes`,
      );
    },
    { signal: controller.signal },
  );
  const mute = root.querySelector<HTMLButtonElement>("[data-podcast-mute]")!;
  function updateVolume() {
    const silent = audio.muted || audio.volume === 0;
    mute.setAttribute("aria-pressed", String(silent));
    mute.setAttribute(
      "aria-label",
      silent ? "Ativar áudio" : "Silenciar áudio",
    );
    root
      .querySelector<SVGElement>("[data-volume-icon]")!
      .toggleAttribute("hidden", silent);
    root
      .querySelector<SVGElement>("[data-muted-icon]")!
      .toggleAttribute("hidden", !silent);
    volume.value = String(audio.muted ? 0 : audio.volume);
    volume.style.setProperty("--progress", `${Number(volume.value) * 100}%`);
  }
  mute.addEventListener(
    "click",
    () => {
      const silent = audio.muted || audio.volume === 0;
      if (audio.volume === 0) audio.volume = 1;
      audio.muted = !silent;
    },
    { signal: controller.signal },
  );
  audio.addEventListener("volumechange", updateVolume, {
    signal: controller.signal,
  });
  updateVolume();
  audio.addEventListener("play", activate, { signal: controller.signal });
  for (const event of [
    "pause",
    "ended",
    "timeupdate",
    "loadedmetadata",
    "durationchange",
  ])
    audio.addEventListener(event, updatePlayback, {
      signal: controller.signal,
    });
  audio.addEventListener(
    "error",
    () => {
      error.hidden = false;
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    "longform:podcast-activated",
    (event) => {
      if ((event as CustomEvent<{ mediaId: MediaId }>).detail.mediaId === id)
        return;
      active = false;
      setCompact(false);
    },
    { signal: controller.signal },
  );
  reduced.addEventListener(
    "change",
    () => setCompact(active && !originVisible, true),
    { signal: controller.signal },
  );
  window.addEventListener(
    "resize",
    () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        setCompact(active && !originVisible, true);
        reserveSpace();
      });
    },
    { signal: controller.signal },
  );
  root.querySelector("[data-podcast-close]")!.addEventListener(
    "click",
    () => {
      coordinator.pause(id, "manual");
      active = false;
      document.documentElement.style.setProperty("--compact-space", "0px");
      root.setAttribute("tabindex", "-1");
      root.focus({ preventScroll: true });
      void setCompact(false);
    },
    { signal: controller.signal },
  );
  const disposeTranscript = initTranscript(
    root.querySelector<HTMLDetailsElement>(".transcript")!,
  );
  updatePlayback();
  reserveSpace();
  return () => {
    disposeTranscript();
    controller.abort();
    observer.disconnect();
    sizeObserver.disconnect();
    cancelAnimationFrame(resizeFrame);
    animation?.stop();
    clearTransition();
    if (active)
      document.documentElement.style.setProperty("--compact-space", "0px");
  };
}

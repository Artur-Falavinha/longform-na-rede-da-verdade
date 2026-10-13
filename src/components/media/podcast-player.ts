import { initTranscript } from "./transcript";
import { gsap } from "../../scripts/gsap";
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
  let animation: gsap.core.Tween | undefined;
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
    animation?.kill();
    animation = undefined;
    gsap.set(surface, { clearProps: "transform,opacity" });
  }
  function setCompact(next: boolean, force = false) {
    if (compact === next && !force) return;
    clearTransition();
    if (!compact) origin.style.minHeight = `${surface.offsetHeight}px`;
    compact = next;
    surface.classList.toggle("is-compact", next);
    reserveSpace();
    if (reduced.matches || force) return;
    animation = gsap.fromTo(
      surface,
      { y: next ? 28 : 12, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: next ? 0.5 : 0.3,
        ease: "power3.out",
        clearProps: "transform,opacity",
        onComplete: () => {
          animation = undefined;
          reserveSpace();
        },
      },
    );
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
  root.querySelector("[data-podcast-return]")!.addEventListener(
    "click",
    () => {
      root.setAttribute("tabindex", "-1");
      requestAnimationFrame(() => root.focus({ preventScroll: true }));
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
    animation?.kill();
    clearTransition();
    if (active)
      document.documentElement.style.setProperty("--compact-space", "0px");
  };
}

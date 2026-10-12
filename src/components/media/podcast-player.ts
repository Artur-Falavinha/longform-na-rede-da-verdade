import { gsap, Flip } from "../../scripts/gsap";
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
  let animation: gsap.core.Timeline | undefined;
  root.querySelector<HTMLElement>(".player-controls")!.hidden = false;
  audio.hidden = true;
  audio.controls = false;

  function reserveSpace() {
    if (!compact)
      origin.style.minHeight = `${Math.max(192, surface.offsetHeight)}px`;
    if (active)
      document.documentElement.style.setProperty(
        "--compact-space",
        compact ? `${surface.offsetHeight + 16}px` : "0px",
      );
  }
  function clearFlip() {
    Flip.killFlipsOf(surface, false);
    animation = undefined;
    gsap.set(surface, {
      clearProps:
        "transform,width,height,top,left,right,bottom,position,minWidth,minHeight,maxWidth,maxHeight",
    });
  }
  function setCompact(next: boolean, force = false) {
    if (compact === next && !force) return;
    const captureOptions: Flip.FlipStateVars & { kill: boolean } = {
      kill: false,
    };
    const state = reduced.matches
      ? undefined
      : Flip.getState(surface, captureOptions);
    clearFlip();
    compact = next;
    surface.classList.toggle("is-compact", next);
    reserveSpace();
    if (state)
      animation = Flip.from(state, {
        duration: 0.38,
        ease: "power2.inOut",
        scale: true,
        onComplete: () => {
          animation = undefined;
          reserveSpace();
        },
      });
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
    root.querySelector<HTMLElement>("[data-play-icon]")!.textContent = playing
      ? "Ⅱ"
      : "▶";
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
  updatePlayback();
  reserveSpace();
  return () => {
    controller.abort();
    observer.disconnect();
    sizeObserver.disconnect();
    cancelAnimationFrame(resizeFrame);
    animation?.kill();
    clearFlip();
    if (active)
      document.documentElement.style.setProperty("--compact-space", "0px");
  };
}

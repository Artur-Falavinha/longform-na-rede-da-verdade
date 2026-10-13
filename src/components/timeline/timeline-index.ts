import { branchCompletionPosition } from "./timeline-progress";
import { animate } from "motion/mini";
import { gsap } from "../../scripts/gsap";
import type { Dispose } from "../../data/types";

export function initTimelineIndex(root: HTMLElement): Dispose {
  const nav = root.previousElementSibling as HTMLElement;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
  const events = [
    ...root.querySelectorAll<HTMLElement>("[data-timeline-event]"),
  ];
  const markers = events.map((event) =>
    event.querySelector<HTMLElement>("[data-timeline-marker]")!,
  );
  const controller = new AbortController();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const toggle = nav.querySelector<HTMLButtonElement>("[data-index-toggle]")!;
  toggle.addEventListener(
    "click",
    () => {
      const expanded = nav.toggleAttribute("data-expanded");
      toggle.setAttribute("aria-expanded", String(expanded));
    },
    { signal: controller.signal },
  );
  let entrance: ReturnType<typeof animate> | undefined;
  let hiddenTarget = true;
  let visibilityVersion = 0;
  let frame = 0;
  let navigation: gsap.core.Tween | undefined;

  function update() {
    frame = 0;
    const bounds = root.getBoundingClientRect();
    const hidden =
      bounds.top > innerHeight * 0.7 || bounds.bottom < innerHeight * 0.25;
    if (hiddenTarget !== hidden) {
      hiddenTarget = hidden;
      const version = ++visibilityVersion;
      entrance?.stop();
      if (!hidden && nav.hidden) {
        nav.hidden = false;
        nav.style.opacity = "0";
      }
      nav.inert = hidden;
      entrance = animate(
        nav,
        { opacity: hidden ? 0 : 1 },
        { duration: reduced.matches ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] },
      );
      void entrance.finished.then(() => {
        if (version === visibilityVersion) nav.hidden = hidden;
      });
    }
    const active = markers.reduce(
      (selected, marker, index) =>
        window.scrollY >= branchCompletionPosition(marker) - 0.5
          ? index
          : selected,
      0,
    );
    links.forEach((link, index) => {
      if (index === active) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function cancel() {
    navigation?.kill();
    navigation = undefined;
  }
  links.forEach((link, index) =>
    link.addEventListener(
      "click",
      (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        cancel();
        history.pushState(null, "", link.hash);
        const target = events[index];
        const destination = () =>
          Math.ceil(branchCompletionPosition(markers[index]));
        const from = window.scrollY;
        const progress = { value: 0 };
        navigation = gsap.to(progress, {
          value: 1,
          duration: reduced.matches ? 0 : 1.1,
          ease: "power3.inOut",
          onUpdate: () =>
            window.scrollTo({
              top: from + (destination() - from) * progress.value,
              behavior: "instant",
            }),
          onComplete: () => {
            nav.removeAttribute("data-expanded");
            toggle.setAttribute("aria-expanded", "false");
            target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
            navigation = undefined;
          },
        });
      },
      { signal: controller.signal },
    ),
  );
  window.addEventListener("scroll", schedule, {
    passive: true,
    signal: controller.signal,
  });
  window.addEventListener("resize", schedule, { signal: controller.signal });
  for (const event of ["wheel", "touchstart", "keydown"]) {
    window.addEventListener(event, cancel, {
      passive: true,
      signal: controller.signal,
    });
  }
  update();
  return () => {
    cancel();
    visibilityVersion++;
    entrance?.stop();
    cancelAnimationFrame(frame);
    controller.abort();
    nav.hidden = true;
  };
}

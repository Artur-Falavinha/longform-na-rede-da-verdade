import { gsap, ScrollTrigger } from "../../scripts/gsap";
import type { Dispose } from "../../data/types";

export function initTimeline(root: HTMLElement): Dispose {
  const fill = root.querySelector<HTMLElement>("[data-timeline-fill]")!;
  const rail = root.querySelector<HTMLElement>(".timeline-rail")!;
  const events = [
    ...root.querySelectorAll<HTMLElement>("[data-timeline-event]"),
  ];
  const markers = events.map((event) =>
    event.querySelector<HTMLElement>("[data-timeline-marker]")!,
  );
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController();
  let offsets: number[] = [];
  let distance = 0;
  let start = 0;
  let refreshTimer: ReturnType<typeof setTimeout>;
  let tween: gsap.core.Tween | undefined;
  let entryTweens: gsap.core.Tween[] = [];
  let disposed = false;

  function measure() {
    if (!markers.length) {
      rail.hidden = true;
      return;
    }
    const points = markers.map((marker) => {
      const rect = marker.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    start = points[0] + window.scrollY;
    distance = points.at(-1)! - points[0];
    offsets = points.map((point) => point - points[0]);
    rail.style.top = `${points[0] - root.getBoundingClientRect().top}px`;
    rail.style.height = `${Math.max(0, distance)}px`;
    rail.style.bottom = "auto";
  }
  function updateMarkers(progress: number) {
    events.forEach((event, i) => {
      event.dataset.reached = String(offsets[i] <= progress * distance + 0.5);
    });
  }
  function configure() {
    tween?.scrollTrigger?.kill();
    tween?.kill();
    tween = undefined;
    entryTweens.forEach((entry) => {
      entry.scrollTrigger?.kill();
      entry.kill();
    });
    entryTweens = [];
    const copies = events.map((event) =>
      event.querySelector<HTMLElement>(".event-copy")!,
    );
    gsap.set(copies, { clearProps: "opacity,transform" });
    measure();
    if (reduced.matches || markers.length < 2 || distance <= 0) {
      gsap.set(fill, { scaleY: 1 });
      updateMarkers(1);
      return;
    }
    entryTweens = copies.map((copy) =>
      gsap.fromTo(
        copy,
        { opacity: 0.65, x: 6 },
        {
          opacity: 1,
          x: 0,
          ease: "none",
          scrollTrigger: {
            trigger: copy,
            start: "top 94%",
            end: "top 72%",
            scrub: true,
          },
        },
      ),
    );
    tween = gsap.fromTo(
      fill,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: () => start - window.innerHeight * 0.6,
          end: () => start + distance - window.innerHeight * 0.6,
          scrub: true,
          invalidateOnRefresh: true,
          onRefreshInit: measure,
          onUpdate: (self) => updateMarkers(self.progress),
          onRefresh: (self) => updateMarkers(self.progress),
        },
      },
    );
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!disposed) {
        measure();
        ScrollTrigger.refresh();
      }
    }, 80);
  }
  const observer = new ResizeObserver(scheduleRefresh);
  observer.observe(root);
  if (document.querySelector("main"))
    observer.observe(document.querySelector("main")!);
  reduced.addEventListener("change", configure, { signal: controller.signal });
  document.fonts.ready.then(() => {
    if (!disposed) scheduleRefresh();
  });
  document.addEventListener("loadedmetadata", scheduleRefresh, {
    capture: true,
    signal: controller.signal,
  });
  configure();
  return () => {
    disposed = true;
    clearTimeout(refreshTimer);
    controller.abort();
    observer.disconnect();
    tween?.scrollTrigger?.kill();
    tween?.kill();
    entryTweens.forEach((entry) => {
      entry.scrollTrigger?.kill();
      entry.kill();
    });
    gsap.set(fill, { clearProps: "transform" });
    gsap.set(
      events.map((event) => event.querySelector(".event-copy")),
      { clearProps: "opacity,transform" },
    );
  };
}

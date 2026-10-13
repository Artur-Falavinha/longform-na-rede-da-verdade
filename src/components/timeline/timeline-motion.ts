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
  let entryTweens: gsap.core.Timeline[] = [];
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
    gsap.set(
      events.flatMap((event) => [
        ...event.querySelectorAll(
          ".event-copy > *, .timeline-connector > span",
        ),
      ]),
      { clearProps: "opacity,transform,clipPath,filter" },
    );
    measure();
    if (reduced.matches || markers.length < 2 || distance <= 0) {
      gsap.set(fill, { scaleY: 1 });
      updateMarkers(1);
      return;
    }
    entryTweens = events.map((event, index) => {
      const connector = event.querySelector(".timeline-connector > span")!;
      const parts = event.querySelectorAll(".event-copy > *");
      const direction = () =>
        matchMedia("(min-width: 900px)").matches && index % 2 === 0 ? -1 : 1;
      return gsap
        .timeline({
          scrollTrigger: {
            trigger: event,
            start: "top 84%",
            end: "top 55%",
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(
          connector,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.25, ease: "none" },
          0,
        )
        .fromTo(
          parts,
          {
            opacity: 0,
            x: () => direction() * 48,
            y: 24,
            clipPath: "inset(0 0 100% 0)",
            filter: "blur(3px)",
          },
          {
            opacity: 1,
            x: 0,
            y: 0,
            clipPath: "inset(0 0 0% 0)",
            filter: "blur(0px)",
            stagger: 0.12,
            duration: 0.5,
            ease: "power2.out",
          },
          0.1,
        );
    });
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
      events.flatMap((event) => [
        ...event.querySelectorAll(
          ".event-copy > *, .timeline-connector > span",
        ),
      ]),
      { clearProps: "opacity,transform,clipPath,filter" },
    );
  };
}

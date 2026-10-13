import { gsap, ScrollTrigger } from "../../scripts/gsap";
import {
  TIMELINE_READING_LINE,
  TIMELINE_BRANCH_DISTANCE,
} from "./timeline-progress";
import { initTimelineIndex } from "./timeline-index";
import type { Dispose } from "../../data/types";

export function initTimeline(root: HTMLElement): Dispose {
  const disposeIndex = initTimelineIndex(root);
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
  let progress = 0;
  let cursor: ReturnType<
    typeof import("./timeline-cursor").createTimelineCursor
  >;
  let cursorLoading = false;
  const cursorObserver = new IntersectionObserver(
    async ([entry]) => {
      if (!entry.isIntersecting || reduced.matches || cursor || cursorLoading)
        return;
      cursorLoading = true;
      try {
        const { createTimelineCursor } = await import("./timeline-cursor");
        if (!disposed && !reduced.matches) {
          cursor = createTimelineCursor(rail);
          cursor?.update(progress);
        }
      } catch {
        /* A linha em CSS permanece disponível sem WebGL. */
      } finally {
        cursorLoading = false;
      }
    },
    { rootMargin: "200px" },
  );
  cursorObserver.observe(root);

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
  function updateMarkers(value: number) {
    progress = value;
    cursor?.update(progress);
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
      cursor?.dispose();
      cursor = undefined;
      gsap.set(fill, { scaleY: 1 });
      updateMarkers(1);
      return;
    }
    entryTweens = events.flatMap((event, index) => {
      const connector = event.querySelector(".timeline-connector > span")!;
      const title = event.querySelector("h3")!;
      const body = event.querySelectorAll(".event-copy > :not(h3)");
      const anchor = () => start + offsets[index];
      const branch = gsap
        .timeline({
          scrollTrigger: {
            trigger: event,
            start: () => anchor() - innerHeight * TIMELINE_READING_LINE,
            end: () =>
              anchor() -
              innerHeight * TIMELINE_READING_LINE +
              TIMELINE_BRANCH_DISTANCE,
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(connector, { scaleX: 0 }, { scaleX: 1, ease: "none" });
      gsap.set(title, { opacity: 0, y: 36 });
      gsap.set(body, { opacity: 0, y: 20 });
      const content = gsap
        .timeline({
          scrollTrigger: {
            trigger: event,
            start: () => anchor() - innerHeight * 0.86,
            end: () => anchor() - innerHeight * 0.34,
            scrub: 0.6,
          },
        })
        .to(
          title,
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power3.out",
          },
          0,
        )
        .to(
          body,
          {
            opacity: 1,
            y: 0,
            duration: 0.65,
            stagger: 0.08,
            ease: "power2.out",
          },
          0.2,
        );
      return [branch, content];
    });
    tween = gsap.fromTo(
      fill,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: () => start - window.innerHeight * TIMELINE_READING_LINE,
          end: () =>
            start + distance - window.innerHeight * TIMELINE_READING_LINE,
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
        if (reduced.matches) return;
        const position = { top: window.scrollY, left: window.scrollX };
        ScrollTrigger.refresh();
        if (
          window.scrollY !== position.top ||
          window.scrollX !== position.left
        ) {
          window.scrollTo({ ...position, behavior: "instant" });
          ScrollTrigger.update();
        }
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
    disposeIndex();
    cursorObserver.disconnect();
    cursor?.dispose();
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

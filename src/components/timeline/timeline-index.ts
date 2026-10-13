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
  const compact = matchMedia("(max-width: 1199px)");
  const rows = links.map((link) => link.parentElement!);
  const rowAnimations = new Map<HTMLElement, ReturnType<typeof animate>>();
  const rowStates = new Map<HTMLElement, boolean>();
  let iconAnimation: ReturnType<typeof animate> | undefined;
  function renderRows() {
    if (nav.hidden) return;
    if (!compact.matches) {
      if (!rowAnimations.size) return;
      rows.forEach((row) => {
        rowAnimations.get(row)?.stop();
        row.style.removeProperty("height");
        row.style.removeProperty("opacity");
        row.inert = false;
      });
      rowStates.clear();
      rowAnimations.clear();
      return;
    }
    rows.forEach((row, index) => {
      const visible =
        nav.hasAttribute("data-expanded") ||
        links[index].hasAttribute("aria-current");
      if (rowStates.get(row) === visible) return;
      rowStates.set(row, visible);
      rowAnimations.get(row)?.stop();
      row.inert = !visible;
      rowAnimations.set(
        row,
        animate(
          row,
          {
            height: visible ? links[index].getBoundingClientRect().height : 0,
            opacity: visible ? 1 : 0,
          },
          {
            duration: reduced.matches || nav.hidden ? 0 : 0.3,
            ease: [0.22, 1, 0.36, 1],
          },
        ),
      );
    });
  }
  function setExpanded(expanded: boolean) {
    nav.toggleAttribute("data-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    iconAnimation?.stop();
    iconAnimation = animate(
      toggle.querySelector("span")!,
      { rotate: expanded ? 45 : 0 },
      { duration: reduced.matches ? 0 : 0.25 },
    );
    renderRows();
  }
  toggle.addEventListener(
    "click",
    () => {
      setExpanded(!nav.hasAttribute("data-expanded"));
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
    renderRows();
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
            setExpanded(false);
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
  window.addEventListener(
    "resize",
    () => {
      rowStates.clear();
      schedule();
    },
    { signal: controller.signal },
  );
  compact.addEventListener(
    "change",
    () => {
      rowStates.clear();
      renderRows();
    },
    { signal: controller.signal },
  );
  reduced.addEventListener(
    "change",
    () => {
      rowStates.clear();
      setExpanded(nav.hasAttribute("data-expanded"));
    },
    { signal: controller.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        compact.matches &&
        nav.hasAttribute("data-expanded")
      ) {
        setExpanded(false);
        toggle.focus();
      }
    },
    { signal: controller.signal },
  );
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
    iconAnimation?.stop();
    rowAnimations.forEach((animation) => animation.stop());
    cancelAnimationFrame(frame);
    controller.abort();
    nav.hidden = true;
  };
}

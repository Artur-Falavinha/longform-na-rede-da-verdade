import { animate } from "motion/mini";
import { gsap } from "../../scripts/gsap";
import type { Dispose } from "../../data/types";

export function initChapterIndex(root: HTMLElement): Dispose {
  const menu = root.querySelector<HTMLDetailsElement>("details")!;
  const summary = menu.querySelector<HTMLElement>("summary")!;
  const links = [...root.querySelectorAll<HTMLAnchorElement>("nav a")];
  const sections = links
    .map((link) => document.querySelector<HTMLElement>(link.hash))
    .filter((section): section is HTMLElement => Boolean(section));
  const current = root.querySelector<HTMLElement>("[data-current-chapter]")!;
  const controller = new AbortController();
  const icon = summary.querySelector("svg")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const nav = menu.querySelector<HTMLElement>("nav")!;
  const preview = root.querySelector<HTMLElement>("[data-chapter-preview]")!;
  const hover = matchMedia("(hover: hover) and (min-width: 900px)");
  let previewAnimations: ReturnType<typeof animate>[] = [];
  function updatePreview() {
    const visible =
      hover.matches &&
      (summary.matches(":hover") || summary.matches(":focus-visible"));
    previewAnimations.forEach((animation) => animation.stop());
    const options = {
      duration: reduced.matches ? 0 : 0.4,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    };
    previewAnimations = [
      animate(preview, { width: visible ? current.scrollWidth : 0 }, options),
      animate(
        current,
        {
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0px)" : "translateX(8px)",
        },
        options,
      ),
    ];
  }
  for (const event of ["pointerenter", "pointerleave", "focus", "blur"])
    summary.addEventListener(event, updatePreview, {
      signal: controller.signal,
    });
  hover.addEventListener("change", updatePreview, {
    signal: controller.signal,
  });
  reduced.addEventListener("change", updatePreview, {
    signal: controller.signal,
  });
  void document.fonts.ready.then(() => {
    if (!controller.signal.aborted) updatePreview();
  });
  let expanded = menu.open;
  let version = 0;
  let panelAnimation: ReturnType<typeof animate> | undefined;
  let iconAnimation: ReturnType<typeof animate> | undefined;
  function animateIcon() {
    iconAnimation?.stop();
    iconAnimation = animate(
      icon,
      { transform: expanded ? "rotate(45deg)" : "rotate(0deg)" },
      { duration: reduced.matches ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] },
    );
  }
  function setOpen(next: boolean) {
    expanded = next;
    const request = ++version;
    panelAnimation?.stop();
    if (next && !menu.open) {
      menu.open = true;
      nav.style.opacity = "0";
      nav.style.transform = "translateY(-12px) scale(0.98)";
    }
    nav.inert = !next;
    summary.setAttribute("aria-expanded", String(next));
    animateIcon();
    panelAnimation = animate(
      nav,
      {
        opacity: next ? 1 : 0,
        transform: next
          ? "translateY(0px) scale(1)"
          : "translateY(-8px) scale(0.98)",
      },
      {
        duration: reduced.matches ? 0 : next ? 0.35 : 0.22,
        ease: [0.22, 1, 0.36, 1],
      },
    );
    void panelAnimation.finished.then(() => {
      if (request === version && !expanded) menu.open = false;
    });
  }
  summary.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      setOpen(!expanded);
    },
    { signal: controller.signal },
  );
  reduced.addEventListener("change", () => setOpen(expanded), {
    signal: controller.signal,
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (expanded && !menu.contains(event.target as Node)) setOpen(false);
    },
    { signal: controller.signal },
  );
  let scrollAnimation: gsap.core.Tween | undefined;
  function stopScroll() {
    scrollAnimation?.kill();
    scrollAnimation = undefined;
  }
  function scrollToChapter(destination: HTMLElement) {
    stopScroll();
    if (reduced.matches) {
      destination.scrollIntoView({ behavior: "instant", block: "start" });
      return;
    }
    const origin = window.scrollY;
    const position = { progress: 0 };
    scrollAnimation = gsap.to(position, {
      progress: 1,
      duration: 1.4,
      ease: "power2.inOut",
      onUpdate: () => {
        const padding =
          parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ) || 0;
        const margin =
          parseFloat(getComputedStyle(destination).scrollMarginTop) || 0;
        const target = Math.max(
          0,
          destination.getBoundingClientRect().top + scrollY - padding - margin,
        );
        window.scrollTo({
          top: origin + (target - origin) * position.progress,
          behavior: "instant",
        });
      },
    });
  }
  for (const event of ["wheel", "touchstart", "pointerdown"])
    window.addEventListener(event, stopScroll, {
      passive: true,
      signal: controller.signal,
    });
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
          "Escape",
        ].includes(event.key)
      )
        stopScroll();
    },
    { signal: controller.signal },
  );
  reduced.addEventListener("change", stopScroll, { signal: controller.signal });
  let frame = 0;
  let anchorFrame = 0;
  const initialHash = location.hash;
  let interrupted = false;
  for (const event of ["pointerdown", "wheel", "keydown", "touchstart"]) {
    window.addEventListener(
      event,
      () => {
        interrupted = true;
      },
      {
        passive: true,
        once: true,
        signal: controller.signal,
      },
    );
  }
  if (initialHash) {
    void document.fonts.ready.then(() => {
      anchorFrame = requestAnimationFrame(() => {
        if (
          interrupted ||
          controller.signal.aborted ||
          location.hash !== initialHash
        )
          return;
        const target = sections.find(
          (section) => `#${section.id}` === initialHash,
        );
        target?.scrollIntoView({ block: "start", behavior: "instant" });
        update();
      });
    });
  }
  function update() {
    frame = 0;
    let active = sections[0];
    for (const section of sections)
      if (section.getBoundingClientRect().top <= 140) active = section;
    for (const link of links) {
      const selected = link.hash === `#${active.id}`;
      if (selected) {
        link.setAttribute("aria-current", "location");
        const title = link.textContent?.slice(2).trim() ?? "";
        if (current.textContent !== title) {
          current.textContent = title;
          updatePreview();
        }
      } else link.removeAttribute("aria-current");
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  root.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && menu.open) {
        setOpen(false);
        summary.focus();
      }
    },
    { signal: controller.signal },
  );
  for (const link of links)
    link.addEventListener(
      "click",
      (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const destination = document.querySelector<HTMLElement>(link.hash);
        if (!destination) return;
        event.preventDefault();
        setOpen(false);
        history.pushState(null, "", link.hash);
        destination.focus({ preventScroll: true });
        scrollToChapter(destination);
      },
      { signal: controller.signal },
    );
  window.addEventListener("scroll", schedule, {
    passive: true,
    signal: controller.signal,
  });
  window.addEventListener("resize", schedule, { signal: controller.signal });
  update();
  return () => {
    stopScroll();
    ++version;
    panelAnimation?.stop();
    previewAnimations.forEach((animation) => animation.stop());
    nav.inert = false;
    iconAnimation?.stop();
    icon.style.removeProperty("transform");
    controller.abort();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(anchorFrame);
  };
}

import { animate } from "motion/mini";
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
  let iconAnimation: ReturnType<typeof animate> | undefined;
  function animateIcon() {
    iconAnimation?.stop();
    iconAnimation = animate(
      icon,
      { transform: menu.open ? "rotate(45deg)" : "rotate(0deg)" },
      { duration: reduced.matches ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] },
    );
  }
  menu.addEventListener("toggle", animateIcon, { signal: controller.signal });
  reduced.addEventListener("change", animateIcon, {
    signal: controller.signal,
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    },
    { signal: controller.signal },
  );
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
        current.textContent = link.textContent?.slice(2).trim() ?? "";
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
        menu.open = false;
        summary.focus();
      }
    },
    { signal: controller.signal },
  );
  for (const link of links)
    link.addEventListener(
      "click",
      () => {
        if (matchMedia("(max-width: 899px)").matches) menu.open = false;
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>(link.hash)
            ?.focus({ preventScroll: true }),
        );
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
    iconAnimation?.stop();
    icon.style.removeProperty("transform");
    controller.abort();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(anchorFrame);
  };
}

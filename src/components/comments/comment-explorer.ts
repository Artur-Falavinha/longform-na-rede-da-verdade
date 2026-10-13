import { gsap, ScrollTrigger } from "../../scripts/gsap";
import type { Dispose } from "../../data/types";

export function initCommentExplorer(root: HTMLElement): Dispose {
  const tabs = [
    ...root.querySelectorAll<HTMLAnchorElement>("[data-group-select]"),
  ];
  const panels = [
    ...root.querySelectorAll<HTMLElement>("[data-comment-group]"),
  ];
  const controller = new AbortController();
  root.querySelector("[data-tab-list]")!.setAttribute("role", "tablist");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const carousels = [
    ...root.querySelectorAll<HTMLElement>("[data-comment-carousel]"),
  ].map((carousel) => {
    const track = carousel.querySelector<HTMLElement>(".comment-track")!;
    const cards = [...track.querySelectorAll<HTMLElement>(".comment")];
    const controls = carousel.querySelector<HTMLElement>(".comment-controls")!;
    const previous =
      carousel.querySelector<HTMLButtonElement>("[data-slide-prev]")!;
    const next =
      carousel.querySelector<HTMLButtonElement>("[data-slide-next]")!;
    const status = carousel.querySelector<HTMLElement>("[data-slide-status]")!;
    let index = 0;
    let target = 0;
    controls.hidden = cards.length < 2;
    track.dataset.enhanced = "true";
    function render() {
      status.textContent = `${index + 1} / ${cards.length}`;
      previous.disabled = index === 0;
      next.disabled = index === cards.length - 1;
      cards.forEach((card, i) => {
        card.inert = i !== index;
      });
    }
    function move(value: number, instant = false) {
      target = Math.max(0, Math.min(cards.length - 1, value));
      const offset = cards[target].offsetLeft - cards[0].offsetLeft;
      track.scrollTo({
        left: offset,
        behavior: instant || reduced.matches ? "instant" : "smooth",
      });
    }
    previous.addEventListener("click", () => move(target - 1), {
      signal: controller.signal,
    });
    next.addEventListener("click", () => move(target + 1), {
      signal: controller.signal,
    });
    track.addEventListener(
      "keydown",
      (event) => {
        if (event.target !== track) return;
        const destinations: Record<string, number> = {
          ArrowLeft: target - 1,
          ArrowRight: target + 1,
          Home: 0,
          End: cards.length - 1,
        };
        if (!(event.key in destinations)) return;
        event.preventDefault();
        move(destinations[event.key]);
      },
      { signal: controller.signal },
    );
    track.addEventListener(
      "scroll",
      () => {
        if (!track.clientWidth) return;
        const step =
          cards.length > 1
            ? cards[1].offsetLeft - cards[0].offsetLeft
            : track.clientWidth;
        index = Math.max(
          0,
          Math.min(cards.length - 1, Math.round(track.scrollLeft / step)),
        );
        render();
      },
      { signal: controller.signal, passive: true },
    );
    track.addEventListener(
      "scrollend",
      () => {
        target = index;
      },
      { signal: controller.signal },
    );
    const resize = new ResizeObserver(() => {
      if (track.clientWidth) move(index, true);
    });
    resize.observe(track);
    reduced.addEventListener("change", () => move(target, true), {
      signal: controller.signal,
    });
    render();
    return () => {
      resize.disconnect();
      delete track.dataset.enhanced;
      controls.hidden = true;
      cards.forEach((card) => {
        card.inert = false;
      });
    };
  });
  let activeIndex = -1;
  let transition: gsap.core.Timeline | undefined;
  function finishTransition() {
    transition?.progress(1).kill();
    transition = undefined;
  }
  reduced.addEventListener("change", finishTransition, {
    signal: controller.signal,
  });
  function select(index: number, userInitiated: boolean) {
    if (index === activeIndex) return;
    finishTransition();
    activeIndex = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (userInitiated && !reduced.matches) {
      const parts = panels[index].querySelectorAll(
        ".group-intro, .comment-context, .comment, .expert-quote",
      );
      transition = gsap.timeline({
        onComplete: () => {
          ScrollTrigger.refresh();
        },
      });
      transition.fromTo(
        parts,
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.055,
          ease: "power3.out",
          clearProps: "opacity,transform",
        },
      );
    }
    ScrollTrigger.refresh();
    if (userInitiated)
      root.dispatchEvent(
        new CustomEvent("longform:comment-open", {
          bubbles: true,
          detail: {
            groupId: tabs[index].dataset.groupSelect,
            userInitiated: true,
          },
        }),
      );
  }
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[index].id);
    panels[index].setAttribute("role", "tabpanel");
    panels[index].setAttribute("aria-labelledby", tab.id);
    tab.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        select(index, true);
      },
      { signal: controller.signal },
    );
    tab.addEventListener(
      "keydown",
      (event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft")
          next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (event.key === " ") {
          event.preventDefault();
          select(index, true);
          return;
        } else return;
        event.preventDefault();
        tabs[next].focus();
        select(next, true);
      },
      { signal: controller.signal },
    );
  });
  select(0, false);
  return () => {
    finishTransition();
    controller.abort();
    carousels.forEach((dispose) => dispose());
    panels.forEach((panel) => {
      panel.hidden = false;
      panel.removeAttribute("role");
    });
  };
}

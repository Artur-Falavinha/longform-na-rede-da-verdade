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
    let slide: gsap.core.Tween | undefined;
    let touching = false;
    let scrolling = false;
    let settleTimer = 0;
    controls.hidden = cards.length < 2;
    track.dataset.enhanced = "true";
    function render() {
      if (
        track.clientWidth &&
        !track.hasAttribute("data-dragging") &&
        !track.hasAttribute("data-sliding") &&
        !touching &&
        !scrolling
      )
        track.style.height = `${cards[index].offsetHeight}px`;
      status.textContent = `${index + 1} / ${cards.length}`;
      previous.disabled = index === 0;
      next.disabled = index === cards.length - 1;
      if (!touching && !scrolling) {
        cards.forEach((card, i) => {
          card.inert = i !== index;
        });
      }
    }
    function settle() {
      if (
        touching ||
        track.hasAttribute("data-dragging") ||
        track.hasAttribute("data-sliding")
      )
        return;
      clearTimeout(settleTimer);
      scrolling = false;
      target = index;
      const offset = cards[index].offsetLeft - cards[0].offsetLeft;
      if (Math.abs(track.scrollLeft - offset) > 1) {
        move(index);
        return;
      }
      render();
    }
    function scheduleSettle() {
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 180);
    }
    track.addEventListener(
      "touchstart",
      () => {
        touching = true;
        clearTimeout(settleTimer);
        slide?.kill();
        delete track.dataset.sliding;
      },
      { passive: true, signal: controller.signal },
    );
    for (const type of ["touchend", "touchcancel"]) {
      track.addEventListener(
        type,
        () => {
          touching = false;
          scheduleSettle();
        },
        { passive: true, signal: controller.signal },
      );
    }
    function move(value: number, instant = false) {
      clearTimeout(settleTimer);
      scrolling = false;
      target = Math.max(0, Math.min(cards.length - 1, value));
      const offset = cards[target].offsetLeft - cards[0].offsetLeft;
      slide?.kill();
      track.dataset.sliding = "true";
      slide = gsap.to(track, {
        scrollLeft: offset,
        duration: instant || reduced.matches ? 0 : 0.5,
        ease: "power3.out",
        onComplete: () => {
          delete track.dataset.sliding;
          index = target;
          render();
        },
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
        scrolling = true;
        const step =
          cards.length > 1
            ? cards[1].offsetLeft - cards[0].offsetLeft
            : track.clientWidth;
        index = Math.max(
          0,
          Math.min(cards.length - 1, Math.round(track.scrollLeft / step)),
        );
        render();
        scheduleSettle();
      },
      { signal: controller.signal, passive: true },
    );
    track.addEventListener("scrollend", settle, { signal: controller.signal });
    let width = 0;
    const resize = new ResizeObserver(() => {
      if (!track.clientWidth) return;
      render();
      if (width !== track.clientWidth) {
        width = track.clientWidth;
        move(index, true);
      }
    });
    resize.observe(track);
    cards.forEach((card) => resize.observe(card));
    let drag:
      | {
          x: number;
          left: number;
          desired: number;
          pointer: number;
          moved: boolean;
        }
      | undefined;
    track.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          (event.target as Element).closest("button, a, summary, input")
        )
          return;
        track.dataset.dragging = "true";
        slide?.kill();
        delete track.dataset.sliding;
        drag = {
          x: event.clientX,
          left: track.scrollLeft,
          desired: track.scrollLeft,
          pointer: event.pointerId,
          moved: false,
        };
      },
      { signal: controller.signal },
    );
    track.addEventListener(
      "pointermove",
      (event) => {
        if (!drag) return;
        const delta = event.clientX - drag.x;
        if (!drag.moved && Math.abs(delta) < 5) return;
        drag.moved = true;
        track.dataset.dragging = "true";
        track.setPointerCapture(drag.pointer);
        event.preventDefault();
        drag.desired = Math.max(
          0,
          Math.min(track.scrollWidth - track.clientWidth, drag.left - delta),
        );
        track.scrollLeft = drag.desired;
      },
      { signal: controller.signal },
    );
    function endDrag() {
      if (!drag) return;
      const { moved, pointer, desired } = drag;
      drag = undefined;
      if (moved) track.dataset.sliding = "true";
      delete track.dataset.dragging;
      if (track.hasPointerCapture(pointer))
        track.releasePointerCapture(pointer);
      if (moved) {
        window.getSelection()?.removeAllRanges();
        const step =
          cards.length > 1
            ? cards[1].offsetLeft - cards[0].offsetLeft
            : track.clientWidth;
        move(Math.round(desired / step));
      }
    }
    track.addEventListener("pointerup", endDrag, { signal: controller.signal });
    track.addEventListener("pointercancel", endDrag, {
      signal: controller.signal,
    });
    track.addEventListener("lostpointercapture", endDrag, {
      signal: controller.signal,
    });
    track.addEventListener(
      "pointerleave",
      () => {
        if (drag && !drag.moved) endDrag();
      },
      { signal: controller.signal },
    );
    reduced.addEventListener("change", () => move(target, true), {
      signal: controller.signal,
    });
    render();
    return () => {
      resize.disconnect();
      endDrag();
      slide?.kill();
      clearTimeout(settleTimer);
      delete track.dataset.sliding;
      track.style.removeProperty("height");
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

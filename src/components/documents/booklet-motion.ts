import { animate } from "motion/mini";
import type { Dispose } from "../../data/types";

export function initBookletMotion(root: HTMLElement): Dispose {
  const controller = new AbortController();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const cover = root.querySelector<HTMLElement>("[data-booklet-cover]")!;
  const download = root.querySelector<HTMLAnchorElement>(".booklet-download")!;
  const colors = getComputedStyle(root);
  const restingColor = colors.getPropertyValue("--text").trim();
  const activeColor = colors.getPropertyValue("--accent").trim();
  const animations = new Map<HTMLElement, ReturnType<typeof animate>>();
  let overCover = false;
  let overDownload = false;
  let pressed = false;

  function render() {
    const focused = root.querySelector(":focus-visible") !== null;
    const active = overCover || focused;
    const downloadActive = overDownload || download.matches(":focus-visible");
    animations.forEach((animation) => animation.stop());
    const options = {
      duration: reduced.matches ? 0 : active ? 0.28 : 0.2,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    };
    animations.set(
      cover,
      animate(
        cover,
        {
          transform: reduced.matches
            ? "none"
            : pressed
              ? "translateY(0px) rotate(0deg) scale(0.985)"
              : active
                ? "translateY(-4px) rotate(-0.7deg) scale(1)"
                : "translateY(0px) rotate(0deg) scale(1)",
        },
        options,
      ),
    );
    animations.set(
      download,
      animate(
        download,
        {
          backgroundColor: downloadActive ? activeColor : restingColor,
          transform:
            !reduced.matches && downloadActive ? "scale(1.06)" : "scale(1)",
        },
        options,
      ),
    );
  }

  const options = { signal: controller.signal };
  root.addEventListener(
    "pointerenter",
    (event) => {
      overCover = event.pointerType !== "touch" && finePointer.matches;
      render();
    },
    options,
  );
  root.addEventListener(
    "pointerleave",
    () => {
      overCover = overDownload = pressed = false;
      render();
    },
    options,
  );
  download.addEventListener(
    "pointerenter",
    (event) => {
      overDownload = event.pointerType !== "touch" && finePointer.matches;
      render();
    },
    options,
  );
  download.addEventListener(
    "pointerleave",
    () => {
      overDownload = false;
      render();
    },
    options,
  );
  root.addEventListener("focusin", render, options);
  root.addEventListener("focusout", render, options);
  root.addEventListener(
    "pointerdown",
    () => {
      pressed = true;
      render();
    },
    options,
  );
  window.addEventListener(
    "pointerup",
    () => {
      if (!pressed) return;
      pressed = false;
      render();
    },
    options,
  );
  root.addEventListener(
    "pointercancel",
    () => {
      pressed = false;
      render();
    },
    options,
  );
  reduced.addEventListener("change", render, options);
  finePointer.addEventListener(
    "change",
    () => {
      overCover = overDownload = false;
      render();
    },
    options,
  );
  return () => {
    controller.abort();
    animations.forEach((animation) => animation.stop());
    cover.style.removeProperty("transform");
    download.style.removeProperty("transform");
    download.style.removeProperty("background-color");
  };
}

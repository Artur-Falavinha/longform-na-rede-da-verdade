import { animate } from "motion/mini";
import type { Dispose } from "../../data/types";

export function initTranscript(details: HTMLDetailsElement): Dispose {
  const summary = details.querySelector("summary")!;
  const content = details.querySelector<HTMLElement>(".transcript-content")!;
  const icon = summary.querySelector("svg")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController();
  let expanded = details.open;
  let version = 0;
  let motion: ReturnType<typeof animate> | undefined;
  let rotation: ReturnType<typeof animate> | undefined;

  function toggle(next: boolean) {
    const current = ++version;
    expanded = next;
    motion?.stop();
    rotation?.stop();
    if (!details.open) {
      details.open = true;
      content.style.height = "0px";
      content.style.opacity = "0";
    }
    content.inert = !next;
    summary.setAttribute("aria-expanded", String(next));
    const duration = reduced.matches ? 0 : next ? 0.4 : 0.25;
    rotation = animate(
      icon,
      { transform: next ? "rotate(180deg)" : "rotate(0deg)" },
      { duration },
    );
    motion = animate(
      content,
      {
        height: next ? `${content.scrollHeight}px` : "0px",
        opacity: next ? 1 : 0,
      },
      { duration, ease: [0.22, 1, 0.36, 1] },
    );
    void motion.finished.then(() => {
      if (current !== version) return;
      details.open = next;
      if (next) content.style.height = "auto";
    });
  }
  summary.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      toggle(!expanded);
    },
    { signal: controller.signal },
  );
  reduced.addEventListener("change", () => toggle(expanded), {
    signal: controller.signal,
  });
  return () => {
    version++;
    controller.abort();
    motion?.stop();
    rotation?.stop();
  };
}

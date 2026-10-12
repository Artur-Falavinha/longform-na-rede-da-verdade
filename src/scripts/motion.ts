import { gsap } from "./gsap";
import type { Dispose } from "../data/types";

export function initSectionMotion(root: HTMLElement): Dispose {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let context: gsap.Context | undefined;

  function configure() {
    context?.revert();
    context = undefined;
    if (reduced.matches) return;
    // O lifecycle local evita que a reversão global de matchMedia restaure scroll obsoleto.
    context = gsap.context(() => {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0.65, y: 14 },
          {
            opacity: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: element,
              start: "top 94%",
              end: "top 72%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      });
    }, root);
  }

  reduced.addEventListener("change", configure);
  configure();
  return () => {
    reduced.removeEventListener("change", configure);
    context?.revert();
  };
}

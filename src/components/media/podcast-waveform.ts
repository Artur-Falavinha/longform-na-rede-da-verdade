import { animate } from "motion/mini";

const rhythms = [
  [1, 0.42, 0.95, 0.57, 1],
  [1, 0.8, 0.36, 1.12, 1],
  [1, 0.48, 1.15, 0.65, 1],
];

export function initPodcastWaveform(
  surface: HTMLElement,
  reduced: MediaQueryList,
) {
  const bars = [...surface.querySelectorAll<SVGLineElement>("[data-wave-bar]")];
  let animations: ReturnType<typeof animate>[] = [];

  return (playing: boolean) => {
    if (!playing || reduced.matches) {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      return;
    }
    if (animations.length) return;
    animations = bars.map((bar, index) => {
      const rhythm = index % rhythms.length;
      return animate(
        bar,
        { transform: rhythms[rhythm].map((scale) => `scaleY(${scale})`) },
        {
          duration: 0.72 + rhythm * 0.18,
          delay: index * 0.065,
          ease: "easeInOut",
          repeat: Infinity,
        },
      );
    });
  };
}

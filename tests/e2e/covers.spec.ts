import { test, expect, type Locator } from "@playwright/test";

async function reveal(chapter: Locator, fraction: number) {
  return chapter.evaluate(async (section, fraction) => {
    const opening = section.id === "abertura";
    const offset = innerHeight * fraction * (opening ? 1 : -1);
    window.scrollTo({
      top: scrollY + section.getBoundingClientRect().top + offset,
      behavior: "instant",
    });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const frame = section.getBoundingClientRect();
    const video = section.querySelector("video")!.getBoundingClientRect();
    const x = document.documentElement.clientWidth / 2;
    const visibleTop = Math.max(0, frame.top);
    const visibleBottom = Math.min(innerHeight, frame.bottom);
    const outside = opening
      ? (visibleBottom + innerHeight) / 2
      : visibleTop / 2;
    return {
      edge: opening ? video.top : video.bottom - innerHeight,
      width: video.width,
      height: video.height,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: innerHeight,
      visibleInside: section.contains(
        document.elementFromPoint(x, (visibleTop + visibleBottom) / 2),
      ),
      hiddenOutside: !section.contains(document.elementFromPoint(x, outside)),
      followsFrame: Math.abs(video.top - frame.top) < 1,
    };
  }, fraction);
}

test("teasers ficam fixos durante a transição reversível sem depender de clip-path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.addStyleTag({
    content: ".ambient-chapter .cover { clip-path: none !important; }",
  });
  await page.locator("#abertura [data-ambient-sound]").click();
  await page.evaluate(() => document.fonts.ready);
  for (const [id, fractions] of [
    ["abertura", [0, 0.5, 0.75, 0.25]],
    ["encerramento", [0.75, 0.25, 0.5, 0]],
  ] as const) {
    const chapter = page.locator("#" + id);
    for (const fraction of fractions) {
      const geometry = await reveal(chapter, fraction);
      expect(geometry.edge).toBeCloseTo(0, 0);
      expect(geometry.width).toBeCloseTo(geometry.viewportWidth, 0);
      expect(geometry.height).toBeCloseTo(geometry.viewportHeight, 0);
      expect(geometry.visibleInside).toBe(true);
      if (fraction > 0) expect(geometry.hiddenOutside).toBe(true);
    }
  }
  const closing = page.locator("#encerramento");
  await expect(closing.locator("video")).toHaveJSProperty("paused", false);
  await expect(page.locator("#abertura video")).toHaveJSProperty("paused", true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(closing.locator("video")).toHaveJSProperty("paused", true);
  expect((await reveal(closing, 0.5)).followsFrame).toBe(true);
});

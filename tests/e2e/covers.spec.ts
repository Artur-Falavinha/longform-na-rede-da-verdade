import { test, expect } from "@playwright/test";

test("encerramento ocupa o viewport e permanece fixo durante a revelação reversível", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const video = page.locator('[data-media-id="closing"]');
  const shell = video.locator("..");
  await expect(shell).toHaveCSS("position", "fixed");
  for (const fraction of [0.5, 0.25, 0.75, 0]) {
    await video.evaluate((element, fraction) => {
      const figure = element.closest("figure")!;
      window.scrollTo(
        0,
        window.scrollY +
          figure.getBoundingClientRect().top -
          innerHeight * fraction,
      );
    }, fraction);
    await expect
      .poll(() =>
        shell.evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBe(0);
    const geometry = await video.evaluate((element, fraction) => {
      const rect = element.getBoundingClientRect();
      const x = document.documentElement.clientWidth / 2;
      const below = document.elementFromPoint(
        x,
        innerHeight * (fraction + (1 - fraction) / 2),
      );
      const above =
        fraction > 0
          ? document.elementFromPoint(x, (innerHeight * fraction) / 2)
          : null;
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: innerHeight,
        visibleBelow: element.closest("figure")!.contains(below),
        coveredAbove: !element.closest("figure")!.contains(above),
      };
    }, fraction);
    expect(geometry.width).toBeCloseTo(geometry.viewportWidth, 0);
    expect(geometry.height).toBeCloseTo(geometry.viewportHeight, 0);
    expect(geometry.visibleBelow).toBe(true);
    expect(geometry.coveredAbove).toBe(true);
  }
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(shell).toHaveCSS("position", "relative");
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true);
});

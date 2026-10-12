import { test, expect } from "@playwright/test";

test("carregamento de mídia durante salto de capítulo conserva o destino", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      document
        .querySelector("video")!
        .dispatchEvent(new Event("loadedmetadata"));
      await new Promise((resolve) => setTimeout(resolve, 75));
      document.querySelector("#cartilha")!.scrollIntoView();
    });
    await page.waitForTimeout(350);
    const position = await page
      .locator("#cartilha")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(position).toBeGreaterThanOrEqual(50);
    expect(position).toBeLessThan(200);
  }
});

test("larguras, orientação e ampliação de 200% mantêm leitura e controles", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(2);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  const podcast = page.locator('[data-podcast="checking-future"]');
  await podcast.locator("[data-podcast-play]").click();
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await expect(podcast.locator("[data-player-surface]")).toHaveCSS(
    "position",
    "fixed",
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(podcast.locator("[data-podcast-play]")).toBeInViewport();
  await expect(podcast.locator("[data-podcast-return]")).toBeInViewport();
  await podcast.locator("[data-podcast-return]").click();
  await podcast.locator("summary").click();
  await expect(podcast.locator(".transcript p")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(2);
});

test("fonte tardia e falha do coletor preservam geometria, texto e navegação", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/fonts/*.woff2", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.route("**/*.posthog.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    (
      window as unknown as { __LONGFORM_TEST_SINK__: () => void }
    ).__LONGFORM_TEST_SINK__ = () => {
      throw new Error("Coletor indisponível");
    };
  });
  await page.goto("/#cronologia", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#cronologia h2")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const alignment = await page
    .locator("[data-timeline-event]")
    .evaluateAll((events) =>
      events.map((event) => {
        const marker = event
          .querySelector("[data-timeline-marker]")!
          .getBoundingClientRect();
        const date = event.querySelector("[data-event-date]")!;
        return Math.abs(
          marker.top +
            marker.height / 2 -
            date.getBoundingClientRect().top -
            parseFloat(getComputedStyle(date).lineHeight) / 2,
        );
      }),
    );
  expect(Math.max(...alignment)).toBeLessThanOrEqual(2);
  await page.getByRole("tab").nth(3).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("carga inicial preserva mídias distantes e escolhe variante estável", async ({
  page,
}) => {
  const mediaRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.(mp4|m4a)(\?|$)/.test(request.url()))
      mediaRequests.push(request.url());
  });
  await page.goto("/");
  await page.waitForTimeout(700);
  expect(mediaRequests.every((url) => url.includes("opening"))).toBe(true);
  const opening = page.locator('[data-media-id="opening"]');
  const source = await opening.getAttribute("src");
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await opening.getAttribute("src")).toBe(source);
});

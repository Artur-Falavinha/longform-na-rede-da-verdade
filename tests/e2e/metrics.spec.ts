import { test, expect, type Page } from "@playwright/test";
import type { MetricEnvelope } from "../../src/scripts/analytics";

async function captured(page: Page, name: string) {
  return page.evaluate(
    (eventName) =>
      (window as unknown as { metrics: MetricEnvelope[] }).metrics.filter(
        (event) => event.name === eventName,
      ),
    name,
  );
}

test.beforeEach(async ({ page }) => {
  test.skip(
    Boolean(process.env.TEST_URL?.startsWith("https:")),
    "O sink local não existe na publicação.",
  );
  await page.addInitScript(() => {
    const target = window as unknown as {
      metrics: MetricEnvelope[];
      __LONGFORM_TEST_SINK__: (event: MetricEnvelope) => void;
    };
    target.metrics = [];
    target.__LONGFORM_TEST_SINK__ = (event) => target.metrics.push(event);
  });
});

test("conta documento, seleção deliberada e reprodução efetiva com identidades estáveis", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => captured(page, "page_load").then((events) => events.length))
    .toBe(1);
  expect(await captured(page, "comment_group_opened")).toHaveLength(0);
  const tabs = page.getByRole("tab");
  await tabs.nth(1).click();
  await tabs.nth(2).click();
  await tabs.nth(1).click();
  expect(await captured(page, "comment_group_opened")).toHaveLength(2);
  const podcast = page.locator('[data-podcast="checking-future"]');
  await podcast.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      captured(page, "media_started").then(
        (events) =>
          events.filter(
            (event) =>
              "mediaId" in event && event.mediaId === "checking-future",
          ).length,
      ),
    )
    .toBe(1);
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await podcast.locator("[data-podcast-play]").click();
  await podcast.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      podcast
        .locator("audio")
        .evaluate((element: HTMLAudioElement) => element.paused),
    )
    .toBe(false);
  expect(
    (await captured(page, "media_started")).filter(
      (event) => "mediaId" in event && event.mediaId === "checking-future",
    ),
  ).toHaveLength(1);
  const original = (await captured(page, "page_load"))[0].pageLoadId;
  expect(
    (await captured(page, "comment_group_opened")).every(
      (event) => event.pageLoadId === original,
    ),
  ).toBe(true);
  await page.reload();
  await expect
    .poll(() => captured(page, "page_load").then((events) => events.length))
    .toBe(1);
  expect((await captured(page, "page_load"))[0].pageLoadId).not.toBe(original);
});

test("PDF conta cada ação de abrir e de baixar separadamente", async ({
  page,
}) => {
  await page.goto("/#cartilha");
  for (let i = 0; i < 2; i++) {
    const popup = page.waitForEvent("popup");
    await page.locator('[data-booklet-action="open"]').click();
    await (await popup).close();
  }
  const download = page.waitForEvent("download");
  await page.locator('[data-booklet-action="download"]').click();
  await download;
  expect(await captured(page, "booklet_opened")).toHaveLength(2);
  expect(await captured(page, "booklet_download_clicked")).toHaveLength(1);
});

test("marcador de capítulo exige um segundo contínuo e não soma no retorno", async ({
  page,
}) => {
  await page.goto("/#cronologia");
  await expect
    .poll(() =>
      captured(page, "chapter_reached").then((events) =>
        events.some(
          (event) => "chapterId" in event && event.chapterId === "cronologia",
        ),
      ),
    )
    .toBe(true);
  await page.locator("#cartilha").scrollIntoViewIfNeeded();
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1150);
  expect(
    (await captured(page, "chapter_reached")).filter(
      (event) => "chapterId" in event && event.chapterId === "cronologia",
    ),
  ).toHaveLength(1);
});

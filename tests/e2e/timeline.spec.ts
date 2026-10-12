import { test, expect, type Page } from "@playwright/test";

async function geometry(page: Page) {
  return page.locator("[data-timeline-event]").evaluateAll((events) =>
    events.map((event) => {
      const marker = event
        .querySelector("[data-timeline-marker]")!
        .getBoundingClientRect();
      const connector = event
        .querySelector("[data-timeline-connector]")!
        .getBoundingClientRect();
      const date = event.querySelector("[data-event-date]")!;
      const dateRect = date.getBoundingClientRect();
      const firstLineCenter =
        dateRect.top + parseFloat(getComputedStyle(date).lineHeight) / 2;
      return {
        marker: Math.abs(marker.top + marker.height / 2 - firstLineCenter),
        connector: Math.abs(
          connector.top + connector.height / 2 - firstLineCenter,
        ),
      };
    }),
  );
}
async function progressAt(page: Page, fraction: number) {
  await page.locator("[data-timeline]").evaluate((root, f) => {
    const markers = root.querySelectorAll("[data-timeline-marker]");
    const first = markers[0].getBoundingClientRect();
    const last = markers[markers.length - 1].getBoundingClientRect();
    window.scrollTo(
      0,
      window.scrollY +
        first.top +
        first.height / 2 +
        (last.top - first.top) * f -
        window.innerHeight * 0.6,
    );
  }, fraction);
  await expect
    .poll(() =>
      page
        .locator("[data-timeline-fill]")
        .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m22),
    )
    .toBeCloseTo(fraction, 1);
  return page
    .locator("[data-timeline-fill]")
    .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m22);
}
test("geometria usa primeira linha da data, inclusive com texto longo", async ({
  page,
}) => {
  await page.goto("/#cronologia");
  await page.evaluate(() => document.fonts.ready);
  for (const item of await geometry(page)) {
    expect(item.marker).toBeLessThanOrEqual(2);
    expect(item.connector).toBeLessThanOrEqual(2);
  }
  await page
    .locator("[data-timeline-event] .event-copy p")
    .first()
    .evaluate((e) => {
      e.textContent = e.textContent!.repeat(10);
    });
  await page.setViewportSize({ width: 768, height: 900 });
  for (const item of await geometry(page)) {
    expect(item.marker).toBeLessThanOrEqual(2);
    expect(item.connector).toBeLessThanOrEqual(2);
  }
});
test("preenchimento acompanha scroll, para e reverte sem fila temporal", async ({
  page,
}) => {
  await page.goto("/#cronologia");
  await page.evaluate(() => document.fonts.ready);
  await progressAt(page, 0.2);
  const middle = await progressAt(page, 0.5);
  await page.waitForTimeout(250);
  expect(
    await page
      .locator("[data-timeline-fill]")
      .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m22),
  ).toBeCloseTo(middle, 3);
  await progressAt(page, 0.8);
  await progressAt(page, 0.3);
  await progressAt(page, 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-timeline-fill]")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  for (const item of await geometry(page))
    expect(item.marker).toBeLessThanOrEqual(2);
});

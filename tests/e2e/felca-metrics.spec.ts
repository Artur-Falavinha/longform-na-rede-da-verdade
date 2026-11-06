import { test, expect } from "@playwright/test";

test("contadores usam a coleta inicial e atualizam nos dois sentidos", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/felca-metrics", async (route) => {
    calls += 1;
    if (calls === 1)
      return route.fulfill({
        json: {
          views: 53_300_000,
          comments: 300_800,
          updatedAt: "2026-11-06T15:00:00Z",
        },
      });
    return route.fulfill({ status: 503 });
  });
  await page.goto("/#contexto");
  const figure = page.locator("[data-felca-metrics]");
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('[data-count="views"]')).toHaveText("53.300.000");
  await expect(figure.locator('[data-count="comments"]')).toHaveText("300.800");
  await expect(figure.locator("[data-count-date]")).toContainText(
    "Atualizado em",
  );
  await page.clock.fastForward(60_000);
  await expect.poll(() => calls).toBe(2);
  await expect(figure.locator('[data-count="comments"]')).toHaveText("300.800");
});

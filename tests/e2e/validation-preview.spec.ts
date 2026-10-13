import { test, expect } from "@playwright/test";

test("índice acompanha a leitura e navega até o acontecimento", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.locator("[data-timeline-index]");
  await expect(nav).toBeHidden();
  const events = page.locator("[data-timeline-event]");
  await events.nth(2).evaluate((el) =>
    window.scrollTo({
      top: scrollY + el.getBoundingClientRect().top - innerHeight * 0.35,
      behavior: "instant",
    }),
  );
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="step"]')).toHaveAttribute(
    "href",
    `#${await events.nth(2).getAttribute("id")}`,
  );
  const toggle = nav.locator("[data-index-toggle]");
  if (await toggle.isVisible()) await toggle.click();
  else await nav.locator('[aria-current="step"]').focus();
  await nav.locator("a").nth(4).click();
  await expect
    .poll(async () =>
      events
        .nth(4)
        .evaluate((el) =>
          Math.abs(el.getBoundingClientRect().top - innerHeight * 0.25),
        ),
    )
    .toBeLessThan(3);
  await expect(nav.locator('[aria-current="step"]')).toHaveAttribute(
    "href",
    `#${await events.nth(4).getAttribute("id")}`,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (await toggle.isVisible()) await toggle.click();
  else await nav.locator('[aria-current="step"]').focus();
  await nav.locator("a").nth(1).click();
  await expect(events.nth(1)).toBeFocused();
  await expect(page.locator("[data-timeline] .source")).toHaveCount(0);
  await expect(page.locator("#podcast-jornalista-e-influenciador")).toHaveCount(
    1,
  );
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(
    /conteúdo inicial das autoras|\bN0\d\b|Transcrição pendente|CONTEÚDO DA ENTREVISTA/,
  );
});

test("hover da barra de vídeo mantém fundo transparente", async ({ page }) => {
  await page.goto("/");
  const range = page.locator("#comparacao media-time-range");
  await range.scrollIntoViewIfNeeded();
  await range.hover();
  expect(
    await range.evaluate((el) =>
      getComputedStyle(el)
        .getPropertyValue("--media-control-hover-background")
        .trim(),
    ),
  ).toBe("transparent");
  expect(
    await page
      .locator(".transcript")
      .first()
      .evaluate((el) => getComputedStyle(el).borderBottomWidth),
  ).toBe("0px");
});

test("índice conclui fade de saída e pode reverter durante a transição", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.locator("[data-timeline-index]");
  const event = page.locator("[data-timeline-event]").nth(2);
  await event.scrollIntoViewIfNeeded();
  await expect(nav).toHaveCSS("opacity", "1");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => nav.evaluate((e) => e.inert)).toBe(true);
  await expect(nav).toBeHidden();
  await event.scrollIntoViewIfNeeded();
  await expect(nav).toHaveCSS("opacity", "1");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await event.scrollIntoViewIfNeeded();
  await expect(nav).toBeVisible();
  await expect(nav).toHaveCSS("opacity", "1");
  expect(
    await event.locator("h3").evaluate((e) => getComputedStyle(e).clipPath),
  ).toBe("none");
});

import { test, expect } from "@playwright/test";

test("índice mantém o documento, revela destino e fecha no celular", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).navigationToken = "same-document";
  });
  const menu = page.locator("[data-chapter-index] details");
  await menu.locator("summary").click();
  await menu.locator('a[href="#cronologia"]').click();
  await expect(page).toHaveURL(/#cronologia$/);
  await expect
    .poll(() => page.evaluate(() => (window as any).navigationToken))
    .toBe("same-document");
  const target = page.locator("#cronologia");
  await expect(target).toBeFocused();
  await expect
    .poll(async () => (await target.boundingBox())!.y)
    .toBeLessThan(150);
  expect((await target.boundingBox())!.y).toBeGreaterThan(50);
  if (isMobile) await expect(menu).not.toHaveAttribute("open", "");
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect(page).toHaveURL(/#cronologia$/);
});

test("Escape recolhe índice e devolve foco ao controle", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator("[data-chapter-index] details");
  await menu.locator("summary").click();
  await menu.locator("a").first().focus();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(menu.locator("summary")).toBeFocused();
});

test("A denúncia aponta para o conteúdo depois da capa editorial", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".chapter-menu summary").click();
  await page
    .getByRole("link", { name: "Contextualização", exact: true })
    .click();
  await expect(page).toHaveURL(/#denuncia$/);
  await expect
    .poll(() =>
      page.locator("#denuncia").evaluate((e) => e.getBoundingClientRect().top),
    )
    .toBeLessThan(150);
  await expect(page.locator("#denuncia")).toBeFocused();
  expect(
    await page
      .locator("#report-title")
      .evaluate((e) => e.getBoundingClientRect().bottom),
  ).toBeLessThan(0);
});

test("prévia do capítulo não anima texto oculto ao alternar viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".chapter-menu summary").hover();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".current-chapter")).toBeHidden();
  await page.locator(".chapter-menu summary").click();
  await expect(page.locator(".chapter-menu nav")).toBeVisible();
  expect(errors).toEqual([]);
});

test("no desktop, o menu abre por hover e acompanha o mouse até os capítulos", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "O menu abre por toque no celular");
  await page.goto("/");
  const menu = page.locator(".chapter-menu");
  const summary = menu.locator("summary");
  const panel = menu.getByRole("navigation");
  await expect(menu).not.toHaveAttribute("open", "");

  await summary.hover();
  await expect(panel).toHaveCSS("opacity", "1");
  await expect(menu.locator("[data-current-chapter]")).toHaveCSS(
    "opacity",
    "1",
  );
  const chapter = panel.getByRole("link", {
    name: "Contextualização",
    exact: true,
  });
  const target = (await chapter.boundingBox())!;
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await expect(chapter).toBeVisible();
  await expect(summary).toHaveAttribute("aria-expanded", "true");

  await page.mouse.move(16, 160);
  await expect(menu).not.toHaveAttribute("open", "");
  await summary.hover();
  await expect(panel).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
});

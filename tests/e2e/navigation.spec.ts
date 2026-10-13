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

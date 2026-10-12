import { test, expect } from "@playwright/test";

test("seleção tem roving focus, painel conjunto e métrica apenas por ação", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).commentEvents = [];
    document.addEventListener("longform:comment-open", (e) =>
      (window as any).commentEvents.push((e as CustomEvent).detail),
    );
  });
  await page.goto("/#comentarios");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).commentEvents)).toEqual([]);
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator("[data-comment-id]")).toHaveCount(3);
  await expect(panel).toContainText("Ana Vaz");
  await panel.locator("summary").click();
  await expect(panel.locator(".analysis-body")).toBeVisible();
  await page.keyboard.press("End");
  expect(await page.evaluate(() => (window as any).commentEvents[0])).toEqual({
    groupId: "moral-authority",
    userInitiated: true,
  });
});

test("todos os grupos e análises continuam legíveis sem JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  for (const group of [
    "journalism",
    "moral-authority",
    "opposition",
    "adultization",
  ]) {
    const panel = page.locator(`[data-comment-group="${group}"]`);
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-comment-id]")).toHaveCount(3);
  }
  await context.close();
});

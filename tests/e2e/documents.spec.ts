import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("cartilha abre outra guia e baixa PDF real por ações independentes", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/#cartilha");
  const open = page.locator('[data-booklet-action="open"]');
  const popupPromise = context.waitForEvent("page");
  await open.click();
  const popup = await popupPromise;
  await popup
    .waitForLoadState("domcontentloaded", { timeout: 3000 })
    .catch(() => {});
  const response = await context.request.get(
    (await open.getAttribute("href"))!,
  );
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await popup.close();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-booklet-action="download"]').click();
  const download = await downloadPromise;
  const path = testInfo.outputPath("cartilha.pdf");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.toString()).toContain("%%EOF");
  await expect(page).toHaveURL(/#cartilha$/);
  await expect(page.locator("#cartilha .booklet-preview")).toBeVisible();
});
test("PDF corrompido apresenta recuperação na reportagem", async ({ page }) => {
  await page.route("**/cartilha-teste.pdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "arquivo inválido",
    }),
  );
  await page.goto("/#cartilha");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-booklet-action="download"]').click();
  await downloadPromise;
  await expect(page.locator("[data-document-error]")).toBeVisible();
  await expect(page.locator('[data-booklet-action="open"]')).toBeEnabled();
});

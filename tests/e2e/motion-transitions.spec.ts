import { test, expect } from "@playwright/test";

test("ramificações esperam a linha principal e revertem junto do conteúdo", async ({
  page,
}) => {
  await page.goto("/#cronologia");
  const item = page.locator("[data-timeline-event]").nth(1);
  const marker = item.locator("[data-timeline-marker]");
  const branch = item.locator(".timeline-connector > span");
  const position = async (fraction: number) =>
    marker.evaluate((el, f) => {
      const r = el.getBoundingClientRect();
      window.scrollTo({
        top: scrollY + r.top + r.height / 2 - innerHeight * f,
        behavior: "instant",
      });
    }, fraction);
  const scale = () =>
    branch.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await position(0.68);
  await expect(item).toHaveAttribute("data-reached", "false");
  await expect.poll(scale).toBe(0);
  await position(0.3);
  await expect(item).toHaveAttribute("data-reached", "true");
  await expect.poll(scale).toBe(1);
  await expect(item.locator("h3")).toHaveCSS("opacity", "1");
  await position(0.68);
  await expect.poll(scale).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(item.locator("h3")).toHaveCSS("opacity", "1");
});

test("menu anima, navega suavemente e suporta fechamento interrompido", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.locator(".chapter-menu");
  const summary = menu.locator("summary");
  await summary.click();
  await expect(menu.locator("nav")).toHaveCSS("opacity", "1");
  const samples = await page.evaluate(async () => {
    document
      .querySelector<HTMLAnchorElement>('.chapter-menu a[href="#cronologia"]')!
      .click();
    const values: number[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      values.push(scrollY);
    }
    return values;
  });
  expect(new Set(samples).size).toBeGreaterThan(2);
  await expect(menu).not.toHaveAttribute("open", "");
  await summary.click();
  await summary.click();
  await summary.click();
  await expect(menu.locator("nav")).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
});

test("linha de mute termina no estado correto após inversões rápidas", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.locator("#abertura [data-ambient-sound]");
  const off = button.locator(".sound-off");
  const slash = off.locator('path[d="m2 2 20 20"]');
  await button.click();
  await expect(off).toHaveCSS("opacity", "0");
  await expect(slash).toHaveCSS("stroke-dashoffset", "1px");
  await button.click();
  await button.click();
  await button.click();
  await expect(off).toHaveCSS("opacity", "1");
  await expect(slash).toHaveCSS("stroke-dashoffset", "0px");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button.click();
  await expect(off).toHaveCSS("opacity", "0");
});

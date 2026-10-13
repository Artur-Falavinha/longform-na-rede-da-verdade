import { test, expect } from "@playwright/test";
import { comments } from "../../src/data/comments";

test("trocas rápidas mantêm um painel e SVGs alternam com a seleção", async ({
  page,
}) => {
  await page.goto("/#comentarios");
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(tabs.nth(3).locator(".icon-active")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let i = 0; i < comments.length; i++) {
    await tabs.nth(i).click();
    const panel = page.getByRole("tabpanel");
    for (const [j, comment] of comments[i].comments.entries()) {
      const caption = panel.locator("figcaption").nth(j);
      await expect(caption).toContainText(
        comment.likesLiteral.replace(/^♥\s*/, ""),
      );
      await expect(caption).toContainText(
        comment.repliesLiteral.replace(/^↩\s*/, ""),
      );
      await expect(caption.locator("svg")).toHaveCount(2);
    }
    await expect(panel.locator(".comment").first()).toHaveCSS("opacity", "1");
  }
});

test("controles de podcast avançam, retornam, mudam velocidade e restauram volume zero", async ({
  page,
}) => {
  await page.goto("/#jornalismo");
  const player = page.locator("[data-podcast]").first();
  const audio = player.locator("audio");
  await player.locator("[data-podcast-play]").click();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0);
  await player.locator("[data-podcast-play]").click();
  await player.locator("[data-podcast-skip='15']").click();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(15);
  await player.locator("[data-podcast-skip='-15']").click();
  expect(
    await audio.evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeLessThan(5);
  await player.locator("[data-podcast-speed]").click();
  expect(await audio.evaluate((a: HTMLAudioElement) => a.playbackRate)).toBe(
    1.25,
  );
  await player.locator("[data-podcast-volume]").fill("0");
  await expect(player.locator("[data-podcast-mute]")).toHaveAttribute(
    "aria-label",
    "Ativar áudio",
  );
  await player.locator("[data-podcast-mute]").click();
  expect(
    await audio.evaluate((a: HTMLAudioElement) => !a.muted && a.volume > 0),
  ).toBe(true);
});

test("construção dos acontecimentos reverte e movimento reduzido restaura leitura", async ({
  page,
}) => {
  await page.goto("/#cronologia");
  const event = page.locator("[data-timeline-event]").nth(2);
  const heading = event.locator("h3");
  const position = async (fraction: number) => {
    await event.evaluate(
      (el, f) =>
        window.scrollTo({
          top: scrollY + el.getBoundingClientRect().top - innerHeight * f,
          behavior: "instant",
        }),
      fraction,
    );
  };
  await position(0.9);
  await expect
    .poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.3);
  await position(0.5);
  await expect(heading).toHaveCSS("opacity", "1");
  await position(0.9);
  await expect
    .poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(heading).toHaveCSS("opacity", "1");
  await expect(heading).toHaveCSS("transform", "none");
});

test("seis marcas vetoriais locais carregam e não há símbolos usados como ícones", async ({
  page,
}) => {
  await page.goto("/#comparacao");
  const logos = page.locator(".outlets img");
  await expect(logos).toHaveCount(6);
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        logo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(logo).toHaveAttribute("src", /\.svg$/);
  }
  expect(await page.locator("body").innerText()).not.toMatch(/[♥↩↗▶Ⅱ]/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

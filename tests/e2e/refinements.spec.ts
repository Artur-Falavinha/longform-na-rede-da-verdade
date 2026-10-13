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
      const quote = panel.locator(".comment blockquote").nth(j);
      await expect(quote).toHaveText(
        comment.text.replace(/^["“]([\s\S]*)["”]$/, "$1"),
      );
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

test("carrosséis mantêm cards iguais, navegação e posição após trocar eixo", async ({
  page,
}) => {
  await page.goto("/#comentarios");
  const panel = page.getByRole("tabpanel");
  const track = panel.locator(".comment-track");
  const cards = track.locator(".comment");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("background-color", "rgb(204, 31, 31)");
    await expect(card.locator(".quote-mark")).toHaveText("“");
  }
  await panel.getByRole("button", { name: "Próximo comentário" }).click();
  await expect(panel.locator("[data-slide-status]")).toHaveText("2 / 3");
  await track.focus();
  await page.keyboard.press("End");
  await expect(panel.locator("[data-slide-status]")).toHaveText("3 / 3");
  await expect(
    panel.getByRole("button", { name: "Próximo comentário" }),
  ).toBeDisabled();
  await page.keyboard.press("Home");
  await expect(panel.locator("[data-slide-status]")).toHaveText("1 / 3");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await track.evaluate((el) =>
    el.scrollTo({ left: el.scrollWidth, behavior: "instant" }),
  );
  await expect(panel.locator("[data-slide-status]")).toHaveText("3 / 3");
  await page.getByRole("tab").nth(1).click();
  await page.getByRole("tab").first().click();
  await expect(panel.locator("[data-slide-status]")).toHaveText("3 / 3");
  await expect
    .poll(() =>
      track.evaluate((el) => {
        const last = el.lastElementChild!.getBoundingClientRect();
        return Math.abs(last.left - el.getBoundingClientRect().left);
      }),
    )
    .toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("arraste do card reduz altura e preserva análise clicável", async ({
  page,
}) => {
  await page.goto("/#comentarios");
  const panel = page.getByRole("tabpanel");
  const track = panel.locator(".comment-track");
  await track.scrollIntoViewIfNeeded();
  const height = await track.evaluate((el) => el.clientHeight);
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + box.width - 25, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 25, box.y + 60, { steps: 20 });
  await page.mouse.up();
  await expect(panel.locator("[data-slide-status]")).toHaveText("2 / 3");
  await expect
    .poll(() => track.evaluate((el) => el.clientHeight))
    .toBeLessThan(height - 20);
  const active = panel.locator(".comment:not([inert])");
  await active.locator("summary").click();
  await expect(active.locator("details")).toHaveAttribute("open", "");
});

test("menu fecha fora e capas exibem apenas controle sonoro", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator(".cover-next, [data-ambient-play]")).toHaveCount(0);
  await expect(page.locator("[data-ambient-sound]")).toHaveCount(2);
  const menu = page.locator(".chapter-menu");
  const label = menu.locator(".current-chapter");
  if (isMobile) await expect(label).toBeHidden();
  else {
    await expect(label).toHaveCSS("opacity", "0");
    await menu.locator("summary").hover();
    await expect(label).toHaveCSS("opacity", "1");
  }
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await page.locator(".wordmark").click();
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(page.locator(".podcast header").first()).not.toContainText(
    "material de teste",
  );
  await expect(page.locator(".podcast header p")).toHaveCount(0);
});


test("capas mantêm somente volume mesmo pausadas e fora da tela", async ({ page }) => {
  await page.goto("/");
  for (const id of ["opening", "closing"]) {
    const video = page.locator(`[data-media-id="${id}"]`);
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.controls)).toBe(false);
    const root = video.locator("xpath=../..");
    await expect(root.locator(".lucide-volume-off")).toHaveCount(1);
    await expect(root.locator(".lucide-volume2, .lucide-volume-2")).toHaveCount(1);
  }
  await page.locator("#cartilha").scrollIntoViewIfNeeded();
  for (const video of await page.locator("[data-ambient] video").all()) {
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.controls)).toBe(false);
  }
});

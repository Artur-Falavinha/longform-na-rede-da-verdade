import { test, expect } from "@playwright/test";

test("arraste após setas acompanha o ponteiro sem deslocamento espontâneo", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Mouse validado no desktop; toque mantém rolagem nativa.",
  );
  await page.goto("/#comentarios");
  const track = page.locator("#comments-journalism");
  const next = page.locator(
    '[data-comment-group="journalism"] [data-slide-next]',
  );
  await next.click();
  await expect(track).not.toHaveAttribute("data-sliding");
  const box = (await track.boundingBox())!;
  const start = await track.evaluate((el) => el.scrollLeft);
  const x = box.x + box.width * 0.65;
  await page.mouse.move(x, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(x - 18, box.y + 60, { steps: 4 });
  const dragged = await track.evaluate((el) => el.scrollLeft);
  expect(dragged - start).toBeCloseTo(18, 0);
  const samples = await track.evaluate(async (el) => {
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      values.push(el.scrollLeft);
    }
    return values;
  });
  expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(1);
  await page.mouse.up();
  await expect(track).not.toHaveAttribute("data-sliding");
  expect(await track.evaluate((el) => el.scrollLeft)).toBeCloseTo(start, 0);
});

test("transcrição anima pelo teclado e mantém estado após inversões", async ({
  page,
}) => {
  await page.goto("/#jornalismo");
  const transcript = page.locator(".transcript").first();
  const summary = transcript.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(transcript.locator(".transcript-content")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() =>
      transcript
        .locator(".transcript-content")
        .evaluate((el) =>
          Math.abs(el.getBoundingClientRect().height - el.scrollHeight),
        ),
    )
    .toBeLessThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await summary.click();
  await expect(transcript).not.toHaveAttribute("open");
});

test("vídeo usa controles customizados para reprodução, busca e tela cheia", async ({
  page,
}) => {
  await page.goto("/#comparacao");
  const player = page.locator("#comparacao media-controller");
  const video = player.locator("video");
  await player.locator("media-play-button").click();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  await player.locator("media-play-button").click();
  const seek = player.locator('media-time-range input[type="range"]');
  await seek.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(10);
  const bounds = await player.evaluate((el) => {
    const a = el.getBoundingClientRect();
    const b = el.querySelector(".editorial-controls")!.getBoundingClientRect();
    return b.bottom <= a.bottom + 1 && b.top >= a.top;
  });
  expect(bounds).toBe(true);
  await player.locator("media-fullscreen-button").click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.keyboard.press("Escape");
});

test("deslize por toque sobre o card encaixa e permanece estável", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Gesto de toque validado no projeto mobile.");
  await page.goto("/#comentarios");
  const track = page.locator("#comments-journalism");
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const y = box.y + Math.min(60, box.height / 2);
  const x = box.x + box.width * 0.8;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 12; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - (box.width * 0.65 * i) / 12, y }],
    });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.locator('[data-comment-group="journalism"] [data-slide-status]'),
  ).toHaveText("2 / 3");
  await expect
    .poll(() =>
      track.evaluate((el) =>
        Math.abs(
          el.scrollLeft -
            (el.children[1] as HTMLElement).offsetLeft +
            (el.children[0] as HTMLElement).offsetLeft,
        ),
      ),
    )
    .toBeLessThan(1);
  await session.detach();
});

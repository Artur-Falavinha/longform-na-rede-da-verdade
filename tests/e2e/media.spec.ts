import { test, expect } from "@playwright/test";

test("vídeo nativo avança e retorna ao ponto solicitado", async ({ page }) => {
  await page.goto("/#comparacao");
  const video = page.locator('[data-media-id="comparison"]');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThan(0.1);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  for (const target of [12, 3]) {
    await video.evaluate((element: HTMLVideoElement, time) => {
      element.currentTime = time;
    }, target);
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.currentTime),
      )
      .toBeCloseTo(target, 1);
  }
});

test("podcast avança e retorna pela barra de progresso", async ({ page }) => {
  await page.goto("/#jornalismo");
  const podcast = page.locator('[data-podcast="checking-future"]');
  const audio = podcast.locator("audio");
  await podcast.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0.1);
  await podcast.locator("[data-podcast-play]").click();
  for (const target of [45, 8]) {
    await podcast.locator("[data-podcast-progress]").fill(String(target));
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.currentTime),
      )
      .toBeCloseTo(target, 1);
  }
});

test("ambientação retoma por visibilidade, mas respeita pausa manual", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opening = page.locator('[data-media-id="opening"]');
  await page.locator("#abertura [data-ambient-sound]").click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(false);
  await page.locator("#comentarios").scrollIntoViewIfNeeded();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(true);
  await page.locator("#abertura").scrollIntoViewIfNeeded();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(false);
  await opening.evaluate((e: HTMLVideoElement) => e.pause());
  await page.locator("#comentarios").scrollIntoViewIfNeeded();
  await page.locator("#abertura").scrollIntoViewIfNeeded();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(true);
});
test("teasers compartilham o som com reprodução e posição independentes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opening = page.locator('[data-media-id="opening"]');
  const closing = page.locator('[data-media-id="closing"]');
  const openingSound = page.locator("#abertura [data-ambient-sound]");
  const closingSound = page.locator("#encerramento [data-ambient-sound]");
  const mutedStates = () =>
    page
      .locator("[data-ambient] video")
      .evaluateAll((videos: HTMLVideoElement[]) =>
        videos.map((video) => video.muted),
      );
  await expect.poll(mutedStates).toEqual([false, false]);
  await expect(openingSound).toHaveAttribute("aria-label", "Desativar som");
  await expect(closingSound).toHaveAttribute("aria-label", "Desativar som");

  await opening.click();
  await expect
    .poll(() =>
      opening.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.1);
  await openingSound.click();
  await expect.poll(mutedStates).toEqual([true, true]);
  await expect(closingSound).toHaveAttribute("aria-label", "Ativar som");
  expect(
    await opening.evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(false);
  expect(
    await closing.evaluate((video: HTMLVideoElement) => ({
      paused: video.paused,
      time: video.currentTime,
    })),
  ).toEqual({ paused: true, time: 0 });

  await page.locator("#encerramento").scrollIntoViewIfNeeded();
  await expect
    .poll(() => opening.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  const position = await opening.evaluate(
    (video: HTMLVideoElement) => video.currentTime,
  );
  await expect(closingSound).toHaveAttribute("aria-label", "Ativar som");
  expect(
    await closing.evaluate((video: HTMLVideoElement) => video.paused),
  ).toBe(true);
  await closing.click();
  await expect
    .poll(() =>
      closing.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.1);
  await expect.poll(mutedStates).toEqual([true, true]);
  await closingSound.click();
  await expect.poll(mutedStates).toEqual([false, false]);
  await expect(openingSound).toHaveAttribute("aria-label", "Desativar som");
  expect(
    await opening.evaluate((video: HTMLVideoElement) => ({
      paused: video.paused,
      time: video.currentTime,
    })),
  ).toEqual({ paused: true, time: position });
});
test("movimento reduzido e autoplay rejeitado deixam reprodução manual disponível", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opening = page.locator('[data-media-id="opening"]');
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(true);
  await opening.click();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.currentTime))
    .toBeGreaterThan(0.1);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let rejectOnce = true;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.mediaId === "opening" && rejectOnce) {
        rejectOnce = false;
        this.dataset.autoplayRejected = "true";
        return Promise.reject(new DOMException("Denied", "NotAllowedError"));
      }
      return original.call(this);
    };
  });
  await page.reload();
  await expect(page.locator("#abertura [data-ambient-sound]")).toHaveAttribute(
    "aria-label",
    "Desativar som",
  );
  await expect(opening).toHaveAttribute("data-autoplay-rejected", "true");
  await expect(page.locator("[data-ambient-play]")).toHaveCount(0);
  await opening.click();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.currentTime))
    .toBeGreaterThan(0.1);
  expect(await opening.evaluate((e: HTMLVideoElement) => e.muted)).toBe(false);
});
test("unmute e vídeo editorial pausam podcast sem reiniciar posição", async ({
  page,
}) => {
  await page.goto("/#jornalismo");
  const podcast = page.locator('[data-podcast="checking-future"]');
  const opening = page.locator('[data-media-id="opening"]');
  const sound = page.locator("#abertura [data-ambient-sound]");
  await podcast.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.locator("#abertura").scrollIntoViewIfNeeded();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(true);
  expect(
    await podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
  ).toBe(false);
  await sound.click();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
  ).toBe(false);
  await sound.click();
  await expect
    .poll(() =>
      podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
    )
    .toBe(true);
  const position = await podcast
    .locator("audio")
    .evaluate((e: HTMLAudioElement) => e.currentTime);
  await podcast.locator("[data-podcast-play]").click();
  const video = page.locator('[data-media-id="comparison"]');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate((e: HTMLVideoElement) => e.play());
  await expect
    .poll(() =>
      podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
    )
    .toBe(true);
  expect(
    await podcast
      .locator("audio")
      .evaluate((e: HTMLAudioElement) => e.currentTime),
  ).toBeGreaterThanOrEqual(position);
  await page.locator("#cartilha").scrollIntoViewIfNeeded();
  await video.scrollIntoViewIfNeeded();
  expect(
    await video.evaluate((e: HTMLVideoElement) => e.currentTime),
  ).toBeGreaterThan(0);
  expect(
    await page
      .locator("audio,video")
      .evaluateAll(
        (els: HTMLMediaElement[]) =>
          els.filter((e) => !e.paused && !e.muted && e.volume > 0).length,
      ),
  ).toBeLessThanOrEqual(1);
});
test("arquivo ausente tem recuperação sem bloquear leitura", async ({
  page,
}) => {
  await page.goto("/#comparacao");
  const video = page.locator('[data-media-id="comparison"]');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate((element: HTMLVideoElement) => {
    element.src = "/media/arquivo-ausente.mp4";
    element.load();
    void element.play().catch(() => {});
  });
  await expect(video.locator("..").locator(".media-error")).toBeVisible();
  await expect(
    page.locator("#comentarios .story-copy p").first(),
  ).toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => {
    // Restaura a mídia no gesto de retry; o pipeline de mídia do WebKit ignora page.route.
    element
      .parentElement!.querySelector("[data-media-retry]")!
      .addEventListener(
        "click",
        () => {
          element.src = element.dataset.mediaSrc!;
        },
        { capture: true, once: true },
      );
  });
  await video.locator("..").locator("[data-media-retry]").click();
  await expect
    .poll(() => video.evaluate((e: HTMLVideoElement) => e.currentTime))
    .toBeGreaterThan(0.1);
});

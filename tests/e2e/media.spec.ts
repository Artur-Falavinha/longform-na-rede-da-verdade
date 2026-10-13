import { test, expect } from "@playwright/test";

test("vídeo nativo avança e retorna ao ponto solicitado", async ({ page }) => {
  await page.goto("/#contexto");
  const video = page.locator('[data-media-id="felca"]');
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
  await page.goto("/");
  const opening = page.locator('[data-media-id="opening"]');
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
test("movimento reduzido e autoplay rejeitado deixam reprodução manual disponível", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opening = page.locator('[data-media-id="opening"]');
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.paused))
    .toBe(true);
  await page.locator("#abertura [data-ambient-sound]").click();
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
        return Promise.reject(new DOMException("Denied", "NotAllowedError"));
      }
      return original.call(this);
    };
  });
  await page.reload();
  await expect(page.locator("#abertura [data-ambient-sound]")).toHaveAttribute(
    "aria-label",
    "Ativar som",
  );
  await page.locator("#abertura [data-ambient-sound]").click();
  await expect
    .poll(() => opening.evaluate((e: HTMLVideoElement) => e.currentTime))
    .toBeGreaterThan(0.1);
});
test("unmute e vídeo editorial pausam podcast sem reiniciar posição", async ({
  page,
}) => {
  await page.goto("/");
  const podcast = page.locator('[data-podcast="checking-future"]');
  await podcast.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.locator("#abertura").scrollIntoViewIfNeeded();
  await page.locator("#abertura [data-ambient-sound]").click();
  await expect
    .poll(() =>
      podcast.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
    )
    .toBe(true);
  const position = await podcast
    .locator("audio")
    .evaluate((e: HTMLAudioElement) => e.currentTime);
  await podcast.locator("[data-podcast-play]").click();
  const video = page.locator('[data-media-id="felca"]');
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
  await page.goto("/#contexto");
  const video = page.locator('[data-media-id="felca"]');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate((element: HTMLVideoElement) => {
    element.src = "/media/arquivo-ausente.mp4";
    element.load();
    void element.play().catch(() => {});
  });
  await expect(video.locator("..").locator(".media-error")).toBeVisible();
  await expect(page.locator("#comentarios h2")).toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => {
    // Restaura a fixture no gesto de retry; o pipeline de mídia do WebKit ignora page.route.
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

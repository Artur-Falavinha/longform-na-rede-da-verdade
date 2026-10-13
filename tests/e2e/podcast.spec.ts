import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    (window as any).podcastDiagnostics = events;
    const record = (event: string, details: unknown) => {
      events.push({ event, details, y: scrollY, time: performance.now() });
    };
    const scroll = window.scrollTo;
    window.scrollTo = function (...args: any[]) {
      record("scrollTo", { args, stack: new Error().stack });
      return (scroll as any).apply(this, args);
    };
    for (const event of [
      "play",
      "playing",
      "pause",
      "loadedmetadata",
      "error",
      "waiting",
    ]) {
      document.addEventListener(
        event,
        (e) => {
          const media = e.target as HTMLMediaElement;
          if (media.dataset?.mediaId)
            record(event, {
              id: media.dataset.mediaId,
              paused: media.paused,
              currentTime: media.currentTime,
              readyState: media.readyState,
              error: media.error?.message,
            });
        },
        true,
      );
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const diagnostic = await page.evaluate(() => ({
    y: scrollY,
    active: document.activeElement?.outerHTML,
    events: (window as any).podcastDiagnostics,
  }));
  await testInfo.attach("podcast-diagnostics", {
    body: JSON.stringify(diagnostic, null, 2),
    contentType: "application/json",
  });
});

test("mesmo áudio continua durante compactação, pausa e retorno", async ({
  page,
}) => {
  await page.goto("/#jornalismo");
  const root = page.locator('[data-podcast="checking-future"]');
  const audio = root.locator("audio");
  const surface = root.locator("[data-player-surface]");
  await root.scrollIntoViewIfNeeded();
  await audio.evaluate((element) => {
    (window as any).originalAudio = element;
    (window as any).audioLoads = 0;
    element.addEventListener("loadstart", () => {
      (window as any).audioLoads++;
    });
  });
  await root.locator("[data-podcast-play]").click();
  await expect
    .poll(() => audio.evaluate((e: HTMLAudioElement) => e.currentTime))
    .toBeGreaterThan(0.1);
  const loads = await page.evaluate(() => (window as any).audioLoads);
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await expect(surface).toHaveCSS("position", "fixed");
  const before = await audio.evaluate((e: HTMLAudioElement) => e.currentTime);
  await expect
    .poll(() => audio.evaluate((e: HTMLAudioElement) => e.currentTime))
    .toBeGreaterThan(before + 0.2);
  expect(await audio.evaluate((e) => e === (window as any).originalAudio)).toBe(
    true,
  );
  expect(await page.evaluate(() => (window as any).audioLoads)).toBe(loads);
  await root.locator("[data-podcast-play]").click();
  await expect
    .poll(() => audio.evaluate((e: HTMLAudioElement) => e.paused))
    .toBe(true);
  await expect(surface).toHaveCSS("position", "fixed");
  await root.locator("[data-podcast-play]").click();
  await root.scrollIntoViewIfNeeded();
  await expect(surface).not.toHaveCSS("position", "fixed");
  expect(await audio.evaluate((e) => e === (window as any).originalAudio)).toBe(
    true,
  );
  expect(
    await audio.evaluate((e: HTMLAudioElement) => e.currentTime),
  ).toBeGreaterThan(before);
});

test("interromper Flip e trocar podcast preserva foco, destino e áudio único", async ({
  page,
}) => {
  await page.goto("/#jornalismo");
  const first = page.locator('[data-podcast="checking-future"]');
  const next = page.locator('[data-podcast="journalist-influencer"]');
  await first.scrollIntoViewIfNeeded();
  await first.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      first.locator("audio").evaluate((e: HTMLAudioElement) => e.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await first.locator("[data-podcast-play]").focus();
  await page.setViewportSize({ width: 500, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(first.locator("[data-podcast-play]")).toBeFocused();
  await expect(first.locator("[data-player-surface]")).toHaveCSS(
    "transform",
    "none",
  );
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator("[data-player-surface]")).not.toHaveCSS(
    "position",
    "fixed",
  );
  await next.locator("[data-podcast-play]").click();
  await expect
    .poll(() =>
      first.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
    )
    .toBe(true);
  await page.locator("#cartilha").scrollIntoViewIfNeeded();
  await expect(next.locator("[data-player-surface]")).toHaveCSS(
    "position",
    "fixed",
  );
  await expect(first.locator("[data-player-surface]")).not.toHaveCSS(
    "position",
    "fixed",
  );
  expect(
    await page
      .locator("audio")
      .evaluateAll(
        (els: HTMLAudioElement[]) =>
          els.filter((e) => !e.paused && !e.muted && e.volume > 0).length,
      ),
  ).toBe(1);
  const compactHeight = await next
    .locator("[data-player-surface]")
    .evaluate((e) => e.getBoundingClientRect().height);
  expect(
    await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--compact-space",
        ),
      ),
    ),
  ).toBeGreaterThanOrEqual(compactHeight - 1);
});

test("duração pendente e inversões rápidas preservam controles e posição", async ({
  page,
}) => {
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'src="/media/checking-future-test.m4a"',
      'data-held-src="/media/checking-future-test.m4a"',
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator('[data-podcast="checking-future"]');
  const audio = root.locator("audio");
  const progress = root.locator("[data-podcast-progress]");
  await expect(progress).toBeDisabled();
  await expect(root.locator("[data-duration]")).toHaveText("--:--");
  await audio.evaluate((element: HTMLAudioElement) => {
    element.src = element.dataset.heldSrc!;
    element.load();
  });
  await root.locator("[data-podcast-play]").click();
  await expect(progress).toBeEnabled();
  await progress.focus();
  await progress.press("ArrowRight");
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
  const position = await audio.evaluate(
    (element: HTMLAudioElement) => element.currentTime,
  );
  await page.evaluate(async () => {
    const origin = document.querySelector('[data-podcast="checking-future"]')!;
    const destination = document.querySelector("#cronologia")!;
    for (let i = 0; i < 3; i++) {
      destination.scrollIntoView();
      await new Promise((resolve) => setTimeout(resolve, 60));
      origin.scrollIntoView();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    destination.scrollIntoView();
  });
  await expect(root.locator("[data-player-surface]")).toHaveCSS(
    "position",
    "fixed",
  );
  await expect
    .poll(() =>
      root.locator("[data-player-surface]").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= -1 &&
          rect.right <= innerWidth + 1 &&
          rect.bottom <= innerHeight + 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(position);
  await root.locator("[data-podcast-volume]").fill("0.5");
  expect(
    await audio.evaluate((element: HTMLAudioElement) => element.volume),
  ).toBeCloseTo(0.5);
});

test("fechar o player pausa o áudio e impede reaparecimento ao rolar", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator('[data-podcast="checking-future"]');
  const surface = root.locator("[data-player-surface]");
  await root.locator("[data-podcast-play]").click();
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await expect(surface).toHaveClass(/is-compact/);
  await root.locator("[data-podcast-close]").click();
  await expect
    .poll(() =>
      root.locator("audio").evaluate((e: HTMLAudioElement) => e.paused),
    )
    .toBe(true);
  await expect(surface).not.toHaveClass(/is-compact/);
  await page.locator("#cartilha").scrollIntoViewIfNeeded();
  await expect(surface).not.toHaveClass(/is-compact/);
  await root.locator("[data-podcast-play]").click();
  await page.locator("#cronologia").scrollIntoViewIfNeeded();
  await expect(surface).toHaveClass(/is-compact/);
});

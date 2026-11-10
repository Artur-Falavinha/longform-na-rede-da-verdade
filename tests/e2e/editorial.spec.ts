import { test, expect } from "@playwright/test";
import duasTrajetorias from "../../src/data/transcripts/duas-trajetorias.json" with { type: "json" };
import quemInforma from "../../src/data/transcripts/quem-informa.json" with { type: "json" };
import inventory from "../../validation/content-inventory.json" with { type: "json" };

test("textos das autoras aparecem integralmente e na ordem editorial", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const normalize = (text: string) =>
    text.replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
  const sourceRecords = inventory.records.filter(
    (record) =>
      record.id.startsWith("docs-") && record.verification === "literal",
  );
  const offsets = new Map<string, number>();
  for (const record of sourceRecords) {
    const text = normalize(
      await page.locator("#" + record.targetChapter).innerText(),
    );
    const offset = text.indexOf(
      normalize(record.sourceText),
      offsets.get(record.targetChapter) ?? 0,
    );
    expect(
      offset,
      record.id + ": " + record.sourceLocator,
    ).toBeGreaterThanOrEqual(0);
    offsets.set(
      record.targetChapter,
      offset + normalize(record.sourceText).length,
    );
  }
  await expect(page.locator("[data-timeline-event]")).toHaveCount(19);
  expect(
    await page
      .locator("[data-chapter-start]")
      .evaluateAll((nodes) => nodes.map((node) => node.id)),
  ).toEqual([
    "abertura",
    "contexto",
    "alcance",
    "comentarios",
    "comparacao",
    "jornalismo",
    "cronologia",
    "sobre-caso",
    "adultizacao",
    "encerramento",
  ]);
  expect(
    await page
      .locator("#adultizacao")
      .evaluate((node) => node.nextElementSibling?.nextElementSibling?.id),
  ).toBe("encerramento");
  const credits = page.locator("footer.credits-block");
  await expect(credits).toContainText("Isabelle Sestari");
  await expect(credits.locator("p")).toHaveText(
    /Orientador: .*Apoio técnico e desenvolvimento do site — Artur Lachoman Falavinha.*Universidade Positivo/s,
  );
  await expect(page.locator("#contexto")).not.toContainText("Isabelle Sestari");
  await expect(
    page.locator("#jornalismo > .story-copy:has(+ .reuters-figure) p"),
  ).toHaveCount(5);
  await expect(
    page.locator("#jornalismo > .reuters-figure + .story-copy p"),
  ).toHaveCount(4);
  const editorialSequence = [
    "#report-title",
    ".standfirst",
    "#denuncia",
    "[data-felca-metrics]",
    "#alcance",
    "#comentarios",
    "#comparacao video",
    "#jornalismo > .story-copy:has(+ .reuters-figure)",
    "#jornalismo .reuters-figure",
    "#jornalismo > .reuters-figure + .story-copy",
    "#podcast-checagem-e-futuro",
    "#podcast-jornalista-e-influenciador",
    "#cronologia",
    "#sobre-caso",
    "#adultizacao video",
    "#cartilha",
  ];
  expect(
    await page.evaluate((selectors) => {
      const elements = selectors.map((selector) =>
        document.querySelector(selector),
      );
      return elements.every(
        (element, index) =>
          element &&
          (index === 0 ||
            Boolean(
              (elements[index - 1]?.compareDocumentPosition(element) ?? 0) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            )),
      );
    }, editorialSequence),
  ).toBe(true);
  for (const [id, transcript] of [
    ["checking-future", duasTrajetorias],
    ["journalist-influencer", quemInforma],
  ] as const) {
    await expect(
      page.locator(`[data-podcast="${id}"] .transcript-content p`),
    ).toHaveText(transcript.map(({ text }) => text));
  }

  await expect(page.locator("#comparacao h2")).toHaveText(
    "Entre a influência e o jornalismo",
  );
  await expect(page.locator("#cronologia h2")).toHaveText(
    "A realidade dos fatos",
  );
  await expect(
    page.locator(".findings, .education-list, footer.credits"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("cartilha acompanha a chamada e mantém as margens e os controles", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#cartilha");
  await page.evaluate(() => document.fonts.ready);
  const preview = page.locator(".booklet-preview");
  await expect
    .poll(() =>
      preview
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const column = await page.locator("#adultizacao").boundingBox();
  const booklet = await preview.boundingBox();
  const download = await page.locator(".booklet-download").boundingBox();
  expect(column).not.toBeNull();
  expect(booklet!.height).toBeGreaterThan(booklet!.width);
  expect(booklet!.x + booklet!.width).toBeCloseTo(column!.x + column!.width, 0);
  expect(download!.x).toBeGreaterThan(booklet!.x);
  expect(download!.y).toBeGreaterThanOrEqual(booklet!.y);
  expect(download!.y - booklet!.y).toBeLessThan(16);
  const lastParagraph = await page
    .locator("#adultizacao p[data-reveal]")
    .last()
    .boundingBox();
  const desktop = await page.evaluate(
    () =>
      matchMedia("(min-width: 900px)").matches &&
      CSS.supports("shape-outside", "inset(0)"),
  );
  expect(lastParagraph!.x).toBeCloseTo(column!.x, 0);
  if (desktop) {
    const paragraphs = await page
      .locator(".booklet-copy p")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return [...range.getClientRects()].map(({ top, right, bottom }) => ({
            top,
            right,
            bottom,
          }));
        }),
      );
    expect(
      paragraphs[0].some(
        (line) => line.bottom <= booklet!.y && line.right > booklet!.x,
      ),
    ).toBe(true);
    for (const lines of paragraphs) {
      const alongside = lines.filter(
        (line) =>
          line.top < booklet!.y + booklet!.height && line.bottom > booklet!.y,
      );
      expect(alongside.length).toBeGreaterThan(0);
      expect(Math.max(...alongside.map((line) => line.right))).toBeLessThan(
        booklet!.x,
      );
    }
  } else {
    expect(booklet!.y).toBeGreaterThan(
      lastParagraph!.y + lastParagraph!.height,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(preview).toHaveAttribute("target", "_blank");
  await expect(page.locator(".booklet-download")).toHaveAttribute(
    "download",
    /.+\.pdf$/,
  );
});

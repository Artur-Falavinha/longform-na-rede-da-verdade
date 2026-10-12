import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAssets } from "../scripts/validate-assets";
import { validateContent } from "../scripts/validate-content";

interface ContentFixture {
  html: string;
  chapters: Array<{ id: string }>;
  records: Array<{
    id: string;
    sourceLocator: string;
    sourceText: string;
    targetChapter: string;
    verification: string;
    adaptation?: string;
    status: string;
  }>;
  commentGroups: Array<{
    id: string;
    comments: Array<{
      id: string;
      status?: string;
      likes?: number | null;
      replies?: number | null;
      likesState?: string;
    }>;
  }>;
  timeline: Array<{ id: string; status?: string }>;
  media: Array<{ id: string; status?: string; pendingId?: string }>;
  assets: Array<{
    id: string;
    status?: string;
    localPath: string;
    bytes: number;
  }>;
  pending: Array<{ id: string; status?: string }>;
  documents: Array<{ id: string; status?: string; pendingId?: string }>;
  additionalData?: unknown;
}

const temporaryRoots: string[] = [];

function createPublicDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), "longform-validator-"));
  temporaryRoots.push(root);
  const publicDirectory = join(root, "public");
  mkdirSync(publicDirectory);
  return publicDirectory;
}

function createContentInput(): ContentFixture {
  return {
    html: '<section id="contexto" data-chapter-start><h2 style="text-transform: uppercase">Texto</h2><p>&amp; informação final.</p></section><section id="comentarios" data-chapter-start><div data-comment-group="journalism" hidden>Comentário de teste</div></section>',
    chapters: [{ id: "contexto" }, { id: "comentarios" }],
    records: [
      {
        id: "source-001",
        sourceLocator: "denuncia:p[0]",
        sourceText: " TEXTO   & informação final. ",
        targetChapter: "contexto",
        verification: "literal",
        status: "received",
      },
      {
        id: "source-002",
        sourceLocator: "abertura:leaf[0]",
        sourceText: "Título adaptado",
        targetChapter: "contexto",
        verification: "adapted-interface",
        adaptation: "Adaptação aprovada para o componente acessível.",
        status: "received",
      },
    ],
    commentGroups: [
      {
        id: "journalism",
        comments: [
          { id: "journalism-01", status: "received", likes: null, replies: 2 },
        ],
      },
    ],
    timeline: [{ id: "publication-01", status: "received" }],
    media: [{ id: "opening", status: "placeholder", pendingId: "N01" }],
    assets: [
      {
        id: "opening-asset",
        status: "placeholder",
        localPath: "/media/opening.mp4",
        bytes: 20,
      },
    ],
    pending: [{ id: "N01", status: "placeholder" }],
    documents: [],
  };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("validateContent", () => {
  it("aceita literal com whitespace, caixa CSS e entidade HTML normalizados", () => {
    expect(validateContent(createContentInput())).toEqual([]);
  });

  it("trata br como separador entre palavras de um título quebrado", () => {
    const input = createContentInput();
    input.records[0] = {
      ...input.records[0],
      sourceText: "Na Rede da Verdade",
    };
    input.html =
      '<section id="contexto" data-chapter-start><h1>Na Rede<br>da Verdade</h1></section><section id="comentarios" data-chapter-start><div data-comment-group="journalism"></div></section>';

    expect(
      validateContent(input).some((error) => error.includes("source-001")),
    ).toBe(false);
  });

  it("detecta IDs duplicados em registros, grupos, comentários, capítulos, timeline e mídia", () => {
    const input = createContentInput();
    input.records.push({ ...input.records[0] });
    input.commentGroups.push({
      id: "journalism",
      comments: [{ id: "journalism-01" }],
    });
    input.chapters.push({ id: "contexto" });
    input.timeline.push({ id: "publication-01" });
    input.media.push({ id: "opening" });

    const errors = validateContent(input);

    expect(
      errors.some(
        (error) => error.includes("registros") && error.includes("source-001"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) => error.includes("grupos") && error.includes("journalism"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) =>
          error.includes("comentários") && error.includes("journalism-01"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) => error.includes("capítulos") && error.includes("contexto"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) =>
          error.includes("timeline") && error.includes("publication-01"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) => error.includes("mídia") && error.includes("opening"),
      ),
    ).toBe(true);
  });

  it("rejeita destino de capítulo inexistente", () => {
    const input = createContentInput();
    input.records[0] = { ...input.records[0], targetChapter: "inexistente" };

    expect(
      validateContent(input).some((error) => error.includes("inexistente")),
    ).toBe(true);
  });

  it("exige descrição explícita para adaptação de interface", () => {
    const input = createContentInput();
    input.records[1] = { ...input.records[1], adaptation: "" };

    expect(
      validateContent(input).some((error) =>
        error.includes("adaptação de interface"),
      ),
    ).toBe(true);
  });

  it("detecta trecho literal ausente no HTML do capítulo indicado", () => {
    const input = createContentInput();
    input.records[0] = {
      ...input.records[0],
      sourceText: "Trecho literal obrigatório",
    };
    input.html +=
      '<section id="cronologia" data-chapter-start>Trecho literal obrigatório</section>';

    expect(
      validateContent(input).some(
        (error) => error.includes("source-001") && error.includes("contexto"),
      ),
    ).toBe(true);
  });

  it("não conta texto guardado em script, estilo ou template como conteúdo do capítulo", () => {
    const input = createContentInput();
    input.records[0] = {
      ...input.records[0],
      sourceText: "Trecho só em código",
    };
    input.html =
      '<section id="contexto" data-chapter-start><script>const copy = "Trecho só em código";</script></section><section id="comentarios" data-chapter-start><div data-comment-group="journalism"></div></section>';

    expect(
      validateContent(input).some(
        (error) => error.includes("source-001") && error.includes("contexto"),
      ),
    ).toBe(true);
  });

  it("rejeita zero usado em dado ainda pendente", () => {
    const input = createContentInput();
    input.commentGroups[0].comments[0] = {
      id: "journalism-01",
      status: "placeholder",
      likes: 0,
      replies: null,
    };

    expect(
      validateContent(input).some(
        (error) => error.includes("zero") || error.includes("pendente"),
      ),
    ).toBe(true);
  });

  it("no modo final aponta materiais ainda não aprovados e pendências", () => {
    const input = createContentInput();

    expect(
      validateContent({ ...input, final: true }).some((error) =>
        error.includes("final"),
      ),
    ).toBe(true);
    expect(
      validateContent({
        ...input,
        final: true,
        additionalData: { method: "[DADOS DA PESQUISA A INSERIR]" },
      }).some((error) => error.includes("texto provisório")),
    ).toBe(true);
  });

  it("não trata texto editorial legítimo como placeholder no modo final", () => {
    const input = createContentInput();
    const errors = validateContent({
      ...input,
      final: true,
      additionalData: { method: "Dados da pesquisa de campo" },
    });

    expect(errors.some((error) => error.includes("texto provisório"))).toBe(
      false,
    );
  });
});

describe("validateAssets", () => {
  it("aceita PDF íntegro e licença de fonte como arquivos estáticos comuns", () => {
    const publicDirectory = createPublicDirectory();
    mkdirSync(join(publicDirectory, "documents"));
    mkdirSync(join(publicDirectory, "fonts"));
    const pdf = Buffer.from("%PDF-1.7\nfixture\n%%EOF\n");
    const license = Buffer.from("SIL OPEN FONT LICENSE");
    writeFileSync(join(publicDirectory, "documents", "guide.pdf"), pdf);
    writeFileSync(join(publicDirectory, "fonts", "OFL.txt"), license);

    expect(
      validateAssets({
        publicDirectory,
        assets: [
          {
            id: "guide",
            localPath: "/documents/guide.pdf",
            bytes: pdf.length,
            status: "placeholder",
          },
          {
            id: "font-license",
            localPath: "/fonts/OFL.txt",
            bytes: license.length,
            status: "approved",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejeita caminho fora de public e arquivo ausente", () => {
    const publicDirectory = createPublicDirectory();

    const errors = validateAssets({
      publicDirectory,
      assets: [
        { id: "escape", localPath: "/../secret.pdf", bytes: 1 },
        { id: "missing", localPath: "/documents/missing.pdf", bytes: 1 },
      ],
    });

    expect(
      errors.some(
        (error) => error.includes("escape") && error.includes("public"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) => error.includes("missing") && error.includes("não existe"),
      ),
    ).toBe(true);
  });

  it("rejeita PDF sem assinatura ou marcador de fim e bytes divergentes", () => {
    const publicDirectory = createPublicDirectory();
    mkdirSync(join(publicDirectory, "documents"));
    const pdf = Buffer.from("%PDF-1.7\nsem marcador de fim");
    writeFileSync(join(publicDirectory, "documents", "broken.pdf"), pdf);

    const errors = validateAssets({
      publicDirectory,
      assets: [
        {
          id: "broken-pdf",
          localPath: "/documents/broken.pdf",
          bytes: pdf.length + 1,
        },
      ],
    });

    expect(errors.some((error) => error.includes("%%EOF"))).toBe(true);
    expect(errors.some((error) => error.includes("bytes"))).toBe(true);
  });

  it("exige metadado de bytes e verifica ftyp em arquivos de mídia", () => {
    const publicDirectory = createPublicDirectory();
    mkdirSync(join(publicDirectory, "media"));
    const audio = Buffer.alloc(12);
    audio.writeUInt32BE(16, 0);
    Buffer.from("ftyp").copy(audio, 4);
    Buffer.from("M4A ").copy(audio, 8);
    writeFileSync(join(publicDirectory, "media", "audio.m4a"), audio);
    writeFileSync(
      join(publicDirectory, "media", "broken.mp4"),
      Buffer.alloc(12),
    );

    const errors = validateAssets({
      publicDirectory,
      assets: [
        { id: "audio", localPath: "/media/audio.m4a", bytes: audio.length },
        { id: "metadata-missing", localPath: "/media/audio.m4a" },
        { id: "broken-video", localPath: "/media/broken.mp4", bytes: 12 },
      ],
    });

    expect(
      errors.some(
        (error) =>
          error.includes("metadata-missing") && error.includes("bytes"),
      ),
    ).toBe(true);
    expect(
      errors.some(
        (error) => error.includes("broken-video") && error.includes("ftyp"),
      ),
    ).toBe(true);
  });

  it("rejeita arquivo maior que 25 MiB", () => {
    const publicDirectory = createPublicDirectory();
    mkdirSync(join(publicDirectory, "media"));
    const oversizedPath = join(publicDirectory, "media", "large.bin");
    writeFileSync(oversizedPath, Buffer.alloc(1));
    truncateSync(oversizedPath, 26_214_401);

    expect(statSync(oversizedPath).size).toBe(26_214_401);
    expect(
      validateAssets({
        publicDirectory,
        assets: [
          { id: "large", localPath: "/media/large.bin", bytes: 26_214_401 },
        ],
      }).some((error) => error.includes("25 MiB")),
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHTML } from "entities";
import { chapters } from "../src/data/chapters";
import { comments } from "../src/data/comments";
import { booklet } from "../src/data/documents";
import { media } from "../src/data/media";
import { research } from "../src/data/research";
import { timeline } from "../src/data/timeline";

interface IdentifiedRecord {
  id?: unknown;
  status?: unknown;
  pendingId?: unknown;
}

interface ContentRecordInput extends IdentifiedRecord {
  sourceLocator?: unknown;
  sourceText?: unknown;
  targetChapter?: unknown;
  verification?: unknown;
  adaptation?: unknown;
}

interface CommentInput extends IdentifiedRecord {
  likes?: unknown;
  replies?: unknown;
  likesState?: unknown;
}

interface CommentGroupInput extends IdentifiedRecord {
  comments?: readonly CommentInput[];
}

interface ChapterInput {
  id?: unknown;
}

export interface ContentValidationInput {
  html: string;
  chapters: readonly ChapterInput[];
  records: readonly ContentRecordInput[];
  commentGroups?: readonly CommentGroupInput[];
  timeline?: readonly IdentifiedRecord[];
  media?: readonly IdentifiedRecord[];
  assets?: readonly IdentifiedRecord[];
  pending?: readonly IdentifiedRecord[];
  documents?: readonly IdentifiedRecord[];
  additionalData?: unknown;
  final?: boolean;
}

interface OpenElement {
  tagName: string;
  chapterId?: string;
}

interface ParsedHtml {
  chapterTexts: Map<string, string>;
  chapterMarkers: Map<string, number>;
  attributeValues: Set<string>;
}

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const blockElements = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const pendingTextPattern =
  /\b(?:pendente|a inserir|a confirmar)\b|\[(?:dado|dados|data|datas)[^\]]*\]/iu;

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern =
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;

  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLocaleLowerCase("en-US");
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, decodeHTML(value));
  }

  return attributes;
}

function parseHtml(html: string): ParsedHtml {
  const chapterTexts = new Map<string, string>();
  const chapterMarkers = new Map<string, number>();
  const attributeValues = new Set<string>();
  const openElements: OpenElement[] = [];
  const renderedMarkup = html.replace(
    /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
    " ",
  );
  const tokens = renderedMarkup.matchAll(
    /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/gu,
  );

  for (const tokenMatch of tokens) {
    const token = tokenMatch[0];

    if (token.startsWith("<!--") || token.startsWith("<!")) {
      continue;
    }

    const tagMatch = token.match(
      /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b([\s\S]*?)>$/u,
    );
    if (!tagMatch) {
      const activeChapterId = openElements.at(-1)?.chapterId;
      if (activeChapterId) {
        chapterTexts.set(
          activeChapterId,
          `${chapterTexts.get(activeChapterId) ?? ""}${token}`,
        );
      }
      continue;
    }

    const isClosing = tagMatch[1] === "/";
    const tagName = tagMatch[2].toLocaleLowerCase("en-US");

    if (isClosing) {
      if (blockElements.has(tagName)) {
        const activeChapterId = openElements.at(-1)?.chapterId;
        if (activeChapterId) {
          chapterTexts.set(
            activeChapterId,
            `${chapterTexts.get(activeChapterId) ?? ""} `,
          );
        }
      }
      for (let index = openElements.length - 1; index >= 0; index -= 1) {
        if (openElements[index].tagName === tagName) {
          openElements.splice(index);
          break;
        }
      }
      continue;
    }

    const rawAttributes = tagMatch[3];
    const attributes = readAttributes(rawAttributes);
    for (const value of attributes.values()) {
      attributeValues.add(value.trim());
    }

    let chapterId = openElements.at(-1)?.chapterId;
    if (tagName === "section" && attributes.has("data-chapter-start")) {
      const id = attributes.get("id")?.trim();
      if (id) {
        chapterId = id;
        chapterTexts.set(id, chapterTexts.get(id) ?? "");
        chapterMarkers.set(id, (chapterMarkers.get(id) ?? 0) + 1);
      }
    }

    if (blockElements.has(tagName) && chapterId) {
      chapterTexts.set(chapterId, `${chapterTexts.get(chapterId) ?? ""} `);
    }

    const isSelfClosing = /\/\s*>$/u.test(token);
    if (!isSelfClosing && !voidElements.has(tagName)) {
      openElements.push({ tagName, chapterId });
    }
  }

  return { chapterTexts, chapterMarkers, attributeValues };
}

function normalizeComparableText(value: string): string {
  return decodeHTML(value)
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function validateUniqueIds(
  label: string,
  records: readonly IdentifiedRecord[],
  errors: string[],
): void {
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      errors.push(`ID ausente ou inválido em ${label} (posição ${index + 1}).`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`ID duplicado em ${label}: ${id}.`);
      return;
    }
    seen.add(id);
  });
}

function hasPendingMarker(value: unknown): boolean {
  if (typeof value === "string") {
    return pendingTextPattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasPendingMarker);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(hasPendingMarker);
  }
  return false;
}

function validatePendingNumbers(
  value: unknown,
  errors: string[],
  path = "dados",
  inheritedPending = false,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validatePendingNumbers(
        entry,
        errors,
        `${path}[${index}]`,
        inheritedPending,
      ),
    );
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const ownPending =
    inheritedPending ||
    record.status === "placeholder" ||
    (typeof record.pendingId === "string" &&
      record.pendingId.trim().length > 0) ||
    record.likesState === "placeholder" ||
    hasPendingMarker(record);

  for (const [key, child] of Object.entries(record)) {
    const fieldPath = `${path}.${key}`;
    if (ownPending && typeof child === "number" && child === 0) {
      errors.push(`Valor numérico zero em conteúdo pendente: ${fieldPath}.`);
    }
    if (ownPending && typeof child === "string" && child.trim() === "0") {
      errors.push(`Valor numérico zero em conteúdo pendente: ${fieldPath}.`);
    }
    if (child && typeof child === "object") {
      validatePendingNumbers(child, errors, fieldPath, ownPending);
    }
  }
}

function validateFinalStatuses(
  input: ContentValidationInput,
  errors: string[],
): void {
  if (!input.final) {
    return;
  }

  const collections: Array<[string, readonly IdentifiedRecord[]]> = [
    ["registros de conteúdo", input.records],
    ["grupos de comentários", input.commentGroups ?? []],
    [
      "comentários",
      (input.commentGroups ?? []).flatMap((group) => group.comments ?? []),
    ],
    ["timeline", input.timeline ?? []],
    ["mídia", input.media ?? []],
    ["ativos do inventário", input.assets ?? []],
    ["documentos", input.documents ?? []],
    ["pendências", input.pending ?? []],
  ];

  for (const [label, records] of collections) {
    for (const record of records) {
      if (record.status !== undefined && record.status !== "approved") {
        errors.push(
          `Modo final: ${label} ${String(record.id ?? "(sem ID)")} está com status ${String(record.status)}, não approved.`,
        );
      }
    }
  }

  validateFinalPlaceholders(
    [
      input.records,
      input.commentGroups,
      input.timeline,
      input.media,
      input.assets,
      input.pending,
      input.documents,
      input.additionalData,
    ],
    errors,
    "conteúdo",
  );
}

function validateFinalPlaceholders(
  value: unknown,
  errors: string[],
  path: string,
): void {
  if (typeof value === "string") {
    if (pendingTextPattern.test(value)) {
      errors.push(`Modo final: texto provisório em ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateFinalPlaceholders(entry, errors, `${path}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      validateFinalPlaceholders(child, errors, `${path}.${key}`);
    }
  }
}

export function validateContent(input: ContentValidationInput): string[] {
  const errors: string[] = [];
  const commentGroups = input.commentGroups ?? [];
  const chapterIds = new Set<string>();

  validateUniqueIds("registros", input.records, errors);
  validateUniqueIds("grupos de comentários", commentGroups, errors);
  validateUniqueIds(
    "comentários",
    commentGroups.flatMap((group) => group.comments ?? []),
    errors,
  );
  validateUniqueIds("capítulos", input.chapters, errors);
  validateUniqueIds("timeline", input.timeline ?? [], errors);
  validateUniqueIds("mídia", input.media ?? [], errors);
  validateUniqueIds("ativos do inventário", input.assets ?? [], errors);
  validateUniqueIds("pendências", input.pending ?? [], errors);
  validateUniqueIds("documentos", input.documents ?? [], errors);

  for (const chapter of input.chapters) {
    if (typeof chapter.id === "string") {
      chapterIds.add(chapter.id.trim());
    }
  }

  const parsedHtml = parseHtml(input.html);
  for (const chapterId of chapterIds) {
    if (!parsedHtml.chapterTexts.has(chapterId)) {
      errors.push(
        `Capítulo #${chapterId} não possui section com data-chapter-start no HTML.`,
      );
    }
    if ((parsedHtml.chapterMarkers.get(chapterId) ?? 0) > 1) {
      errors.push(
        `Capítulo #${chapterId} possui mais de uma section com data-chapter-start no HTML.`,
      );
    }
  }

  for (const group of commentGroups) {
    const groupId = typeof group.id === "string" ? group.id.trim() : "";
    if (groupId && !parsedHtml.attributeValues.has(groupId)) {
      errors.push(
        `Grupo de comentários ${groupId} não está representado no HTML.`,
      );
    }
  }

  for (const record of input.records) {
    const id = String(record.id ?? "(sem ID)");
    const targetChapter =
      typeof record.targetChapter === "string"
        ? record.targetChapter.trim()
        : "";
    if (!targetChapter || !chapterIds.has(targetChapter)) {
      errors.push(
        `Registro ${id} aponta para capítulo inexistente: ${targetChapter || "(vazio)"}.`,
      );
      continue;
    }

    if (record.verification === "literal") {
      const sourceText =
        typeof record.sourceText === "string"
          ? normalizeComparableText(record.sourceText)
          : "";
      const chapterText = normalizeComparableText(
        parsedHtml.chapterTexts.get(targetChapter) ?? "",
      );
      if (!sourceText) {
        errors.push(`Registro literal ${id} não possui texto de origem.`);
      } else if (!chapterText.includes(sourceText)) {
        const locator =
          typeof record.sourceLocator === "string"
            ? ` (${record.sourceLocator})`
            : "";
        errors.push(
          `Trecho literal ausente em #${targetChapter}: ${id}${locator}.`,
        );
      }
    } else if (record.verification === "adapted-interface") {
      if (
        typeof record.adaptation !== "string" ||
        record.adaptation.trim().length === 0
      ) {
        errors.push(
          `Registro adaptado ${id} não descreve a adaptação de interface.`,
        );
      }
    } else {
      errors.push(`Registro ${id} possui tipo de verificação inválido.`);
    }
  }

  validatePendingNumbers(
    [
      input.records,
      input.commentGroups,
      input.timeline,
      input.media,
      input.assets,
      input.pending,
      input.documents,
      input.additionalData,
    ],
    errors,
  );
  validateFinalStatuses(input, errors);

  return errors;
}

function runCli(): void {
  const projectDirectory = process.cwd();
  const htmlPath = resolve(projectDirectory, "dist", "index.html");
  const final = process.argv.includes("--final");

  try {
    const html = readFileSync(htmlPath, "utf8");
    const inventory = JSON.parse(
      readFileSync(
        resolve(projectDirectory, "validation", "content-inventory.json"),
        "utf8",
      ),
    ) as {
      records: ContentRecordInput[];
      pending: IdentifiedRecord[];
      assets: IdentifiedRecord[];
    };
    const errors = validateContent({
      html,
      chapters,
      records: inventory.records,
      commentGroups: comments,
      timeline,
      media,
      assets: inventory.assets,
      pending: inventory.pending,
      documents: [booklet],
      additionalData: research,
      final,
    });

    if (errors.length > 0) {
      console.error(errors.map((error) => `- ${error}`).join("\n"));
      process.exitCode = 1;
      return;
    }

    console.log(
      final
        ? "Validação final de conteúdo aprovada."
        : "Validação provisória de conteúdo aprovada.",
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" &&
      !readFileExists(htmlPath)
    ) {
      console.error(
        "dist/index.html não existe. Execute npm run build antes da validação de conteúdo.",
      );
    } else {
      console.error(
        `Falha ao carregar os arquivos de validação: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}

function readFileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli();
}

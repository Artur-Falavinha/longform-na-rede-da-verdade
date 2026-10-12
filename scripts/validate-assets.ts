import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { media } from "../src/data/media";
import { booklet } from "../src/data/documents";

const maximumAssetBytes = 26_214_400;

interface AssetRecordInput {
  id?: unknown;
  localPath?: unknown;
  bytes?: unknown;
  status?: unknown;
}

interface MediaInput {
  id?: unknown;
  src?: unknown;
  mobileSrc?: unknown;
  poster?: unknown;
}

interface DocumentInput {
  id?: unknown;
  src?: unknown;
  cover?: unknown;
}

interface AssetReference {
  id: string;
  path: string;
  expectedBytes?: number;
  source: string;
}

export interface AssetValidationInput {
  publicDirectory: string;
  assets: readonly AssetRecordInput[];
  media?: readonly MediaInput[];
  documents?: readonly DocumentInput[];
}

interface ResolvedAsset {
  fullPath: string;
  normalizedPath: string;
}

function createReferences(input: AssetValidationInput): AssetReference[] {
  const references: AssetReference[] = input.assets.map((asset, index) => ({
    id: typeof asset.id === "string" ? asset.id : `inventário ${index + 1}`,
    path: typeof asset.localPath === "string" ? asset.localPath : "",
    expectedBytes: typeof asset.bytes === "number" ? asset.bytes : undefined,
    source: "inventário",
  }));

  for (const asset of input.media ?? []) {
    const id = typeof asset.id === "string" ? asset.id : "mídia";
    for (const key of ["src", "mobileSrc", "poster"] as const) {
      const path = asset[key];
      if (path !== undefined && path !== "") {
        references.push({
          id,
          path: typeof path === "string" ? path : "",
          source: `mídia ${key}`,
        });
      }
    }
  }

  for (const document of input.documents ?? []) {
    const id = typeof document.id === "string" ? document.id : "documento";
    for (const key of ["src", "cover"] as const) {
      const path = document[key];
      if (path !== undefined && path !== "") {
        references.push({
          id,
          path: typeof path === "string" ? path : "",
          source: `documento ${key}`,
        });
      }
    }
  }

  return references;
}

function resolveAssetPath(
  publicDirectory: string,
  reference: AssetReference,
  errors: string[],
): ResolvedAsset | undefined {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(reference.path).replace(/\\/gu, "/");
  } catch {
    errors.push(
      `${reference.source} ${reference.id} tem caminho inválido: ${reference.path}.`,
    );
    return undefined;
  }

  if (
    !decodedPath.startsWith("/") ||
    decodedPath.startsWith("//") ||
    /^[A-Za-z]:/u.test(decodedPath) ||
    decodedPath.includes("?") ||
    decodedPath.includes("#")
  ) {
    errors.push(
      `${reference.source} ${reference.id} deve usar caminho local iniciado por /: ${reference.path}.`,
    );
    return undefined;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const pathSegments = relativePath.split("/");
  if (pathSegments.some((segment) => segment === "..")) {
    errors.push(
      `${reference.source} ${reference.id} tenta sair de public: ${reference.path}.`,
    );
    return undefined;
  }

  const publicRoot = resolve(publicDirectory);
  const fullPath = resolve(publicRoot, ...pathSegments);
  const relativePathFromRoot = relative(publicRoot, fullPath);
  if (
    !relativePathFromRoot ||
    relativePathFromRoot === ".." ||
    relativePathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativePathFromRoot)
  ) {
    errors.push(
      `${reference.source} ${reference.id} deve apontar para um arquivo dentro de public: ${reference.path}.`,
    );
    return undefined;
  }

  try {
    const realRoot = realpathSync(publicRoot);
    const realFile = realpathSync(fullPath);
    const realRelativePath = relative(realRoot, realFile);
    if (
      !realRelativePath ||
      realRelativePath === ".." ||
      realRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(realRelativePath)
    ) {
      errors.push(
        `${reference.source} ${reference.id} resolve para fora de public: ${reference.path}.`,
      );
      return undefined;
    }
  } catch {
    errors.push(
      `${reference.source} ${reference.id} não existe em public: ${reference.path}.`,
    );
    return undefined;
  }

  return { fullPath, normalizedPath: decodedPath };
}

function readHeader(path: string, size: number): Buffer {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(size);
    const bytesRead = readSync(descriptor, buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

function readTail(
  path: string,
  fileSize: number,
  maximumLength: number,
): Buffer {
  const descriptor = openSync(path, "r");
  try {
    const length = Math.min(fileSize, maximumLength);
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(
      descriptor,
      buffer,
      0,
      length,
      fileSize - length,
    );
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

function validateFile(
  reference: AssetReference,
  resolved: ResolvedAsset,
  errors: string[],
): void {
  let fileStats;
  try {
    fileStats = statSync(resolved.fullPath);
  } catch {
    errors.push(
      `${reference.source} ${reference.id} não existe em public: ${reference.path}.`,
    );
    return;
  }

  if (!fileStats.isFile()) {
    errors.push(
      `${reference.source} ${reference.id} não aponta para um arquivo: ${reference.path}.`,
    );
    return;
  }

  if (fileStats.size > maximumAssetBytes) {
    errors.push(
      `${reference.source} ${reference.id} excede o limite de 25 MiB (26.214.400 bytes): ${reference.path}.`,
    );
  }

  if (
    reference.expectedBytes !== undefined &&
    reference.expectedBytes !== fileStats.size
  ) {
    errors.push(
      `${reference.source} ${reference.id} declara ${reference.expectedBytes} bytes, mas o arquivo tem ${fileStats.size} bytes.`,
    );
  }

  const extension = extname(resolved.normalizedPath).toLocaleLowerCase("en-US");
  try {
    if (extension === ".pdf") {
      const header = readHeader(resolved.fullPath, 5);
      if (header.toString("ascii") !== "%PDF-") {
        errors.push(
          `${reference.source} ${reference.id} não começa com %PDF-: ${reference.path}.`,
        );
      }
      const tail = readTail(resolved.fullPath, fileStats.size, 1024);
      if (!tail.includes(Buffer.from("%%EOF"))) {
        errors.push(
          `${reference.source} ${reference.id} não contém %%EOF no fim do PDF: ${reference.path}.`,
        );
      }
    }

    if (extension === ".mp4" || extension === ".m4a") {
      const header = readHeader(resolved.fullPath, 12);
      if (header.length < 12 || header.toString("ascii", 4, 8) !== "ftyp") {
        errors.push(
          `${reference.source} ${reference.id} não possui cabeçalho ftyp verificável: ${reference.path}.`,
        );
      }
    }
  } catch {
    errors.push(
      `${reference.source} ${reference.id} não pôde ser lido para verificar o arquivo: ${reference.path}.`,
    );
  }
}

export function validateAssets(input: AssetValidationInput): string[] {
  const errors: string[] = [];
  const references = createReferences(input);

  input.assets.forEach((asset, index) => {
    if (
      typeof asset.bytes !== "number" ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 0
    ) {
      const id =
        typeof asset.id === "string" ? asset.id : `inventário ${index + 1}`;
      errors.push(`Inventário ${id} não informa metadado bytes válido.`);
    }
  });

  for (const reference of references) {
    if (!reference.path) {
      errors.push(
        `${reference.source} ${reference.id} não informa um caminho local válido.`,
      );
      continue;
    }

    const resolved = resolveAssetPath(input.publicDirectory, reference, errors);
    if (resolved) {
      validateFile(reference, resolved, errors);
    }
  }

  return errors;
}

function runCli(): void {
  const projectDirectory = process.cwd();
  try {
    const inventory = JSON.parse(
      readFileSync(
        resolve(projectDirectory, "validation", "content-inventory.json"),
        "utf8",
      ),
    ) as {
      assets: AssetRecordInput[];
    };
    const errors = validateAssets({
      publicDirectory: resolve(projectDirectory, "public"),
      assets: inventory.assets,
      media,
      documents: [booklet],
    });

    if (errors.length > 0) {
      console.error(errors.map((error) => `- ${error}`).join("\n"));
      process.exitCode = 1;
      return;
    }

    console.log("Validação de ativos aprovada.");
  } catch (error) {
    console.error(
      `Falha ao carregar inventário ou ativos: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli();
}

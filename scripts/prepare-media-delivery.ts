import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const mediaDirectory = join(process.cwd(), "public", "media");
const manifest: Record<string, { bytes: number; sha256: string }> = {};
for (const file of await readdir(mediaDirectory, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!file.isFile()) continue;
  const filePath = join(file.parentPath, file.name);
  const bytes = await readFile(filePath);
  if (bytes.length > 26_214_400) {
    throw new Error(`Mídia excede o limite de 25 MiB: ${file.name}`);
  }
  const assetPath = relative(mediaDirectory, filePath)
    .split(/[\\/]/)
    .map(encodeURIComponent)
    .join("/");
  manifest[`/media/${assetPath}`] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
await mkdir(".generated", { recursive: true });
await writeFile(
  ".generated/media-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`${Object.keys(manifest).length} mídias preparadas para entrega.`);

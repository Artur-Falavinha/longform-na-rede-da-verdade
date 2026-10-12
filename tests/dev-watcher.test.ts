import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createServer } from "vite";
import { expect, test } from "vitest";
import config from "../astro.config.mjs";

test("arquivos preservados não disparam eventos, mas código-fonte continua observado", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "longform-watcher-"));
  const files = [
    "src/probe.ts",
    "pr-assets/arquivo/tsconfig.json",
    "pr-assets/arquivo/playwright-report/index.html",
    "tmp/playwright-report/index.html",
    ".playwright-mcp/probe.json",
  ];
  for (const file of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "{}");
  }
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    server: { middlewareMode: true, watch: config.vite?.server?.watch },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const changed: string[] = [];
  server.watcher.on("change", (file) =>
    changed.push(relative(root, file).replaceAll("\\", "/")),
  );
  try {
    await expect
      .poll(() =>
        Object.values(server.watcher.getWatched()).flat().includes("probe.ts"),
      )
      .toBe(true);
    for (const file of files)
      await writeFile(join(root, file), '{"changed":true}');
    await expect.poll(() => changed.includes("src/probe.ts")).toBe(true);
    await setTimeout(500);
    expect(changed.filter((file) => file !== "src/probe.ts")).toEqual([]);
  } finally {
    await server.close();
    await rm(root, { recursive: true });
  }
}, 15_000);

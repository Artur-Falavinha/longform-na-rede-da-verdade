import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";

export default defineConfig({
  output: "static",
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
  devToolbar: { enabled: false },
  vite: {
    cacheDir: "node_modules/.vite-astro",
    server: {
      watch: {
        ignored: [/(?:^|[/\\])(?:pr-assets|tmp|\.playwright-mcp)(?:[/\\]|$)/],
      },
    },
    build: { sourcemap: false },
  },
});

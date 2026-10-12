import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";

export default defineConfig({
  output: "static",
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
  devToolbar: { enabled: false },
  vite: { build: { sourcemap: false } },
});

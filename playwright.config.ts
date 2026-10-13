import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  webServer:
    process.env.CI && !process.env.TEST_URL
      ? {
          command: "npm run dev",
          url: "http://127.0.0.1:4325",
          reuseExistingServer: false,
          timeout: 60_000,
        }
      : undefined,
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tmp/playwright-report" }],
  ],
  outputDir: "tmp/test-results",
  use: {
    baseURL: process.env.TEST_URL ?? "http://127.0.0.1:4325",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
    },
  ],
});

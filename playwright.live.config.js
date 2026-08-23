import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 180_000 },
  use: {
    baseURL: "http://127.0.0.1:5197",
    viewport: { width: 1480, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "anna-app dev --port 5197 --llm-account https://anna.partners",
    url: "http://127.0.0.1:5197/",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});

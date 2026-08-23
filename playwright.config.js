import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:5196",
    viewport: { width: 1480, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "anna-app dev --port 5196 --mock-llm fixtures/decision-analysis.jsonl",
    url: "http://127.0.0.1:5196/",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});

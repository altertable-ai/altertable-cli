import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.DATA_APP_TEST_PORT ?? 26418);
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "bun server.ts",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});

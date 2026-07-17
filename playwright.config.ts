import { defineConfig, devices } from "@playwright/test";

/*
 * E2E runs against a dedicated file DB (e2e.db) with frozen time:
 * period started 2026-07-10, "now" is 2026-07-17 07:00 SAST → today = day 7.
 * X is lowered to 5 in the fixture so the grand-reward flow is reachable
 * within the frozen week. Specs run serially (01→06) and share DB state
 * deliberately — each spec owns one kid to avoid cross-talk.
 */

export const E2E_ENV = {
  STAR_CHART_DB_URL: "file:e2e.db",
  FAMILY_TOKEN: "e2e",
  PARENT_PIN: "1234",
  SESSION_SECRET: "e2e-secret",
  STAR_CHART_FAKE_NOW: "2026-07-17T07:00:00+02:00",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 7"], // chromium-based mobile profile
  },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: E2E_ENV,
    timeout: 60_000,
  },
});

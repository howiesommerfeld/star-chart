import { test, expect } from "@playwright/test";
import { parentApi, apiConfirm, kidUrl } from "./helpers";

/*
 * Grand reward fires exactly once (unique ledger event + per-device ack):
 * celebration on first sight, not again on reload.
 */
test("grand-reward celebration fires once, not on reload", async ({ page }) => {
  // Ivy has days 1-3 qualifying from spec 03; X=5 → two more
  const api = await parentApi();
  await apiConfirm(api, { kidId: 3, dayNo: 4, status: "yes" });
  await apiConfirm(api, { kidId: 3, dayNo: 5, status: "no", grace: true }); // graced qualifies
  await api.dispose();

  await page.goto(kidUrl(3));
  const overlay = page.getByTestId("celebration-grand");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Trip to the zoo");
  await overlay.click(); // dismiss

  // Reload: acked in localStorage, must NOT fire again
  await page.reload();
  await expect(page.getByText("of 5 nights")).toBeVisible(); // page loaded
  await expect(overlay).toBeHidden();

  // Journey shows EARNED
  await expect(page.getByText(/EARNED/)).toBeVisible();
});

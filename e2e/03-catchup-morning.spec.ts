import { test, expect } from "@playwright/test";
import { parentApi, apiConfirm, kidUrl } from "./helpers";

/*
 * Catch-up morning (Premise 3): three retro-confirmed days become three
 * independently playable back-dated boards.
 */
test("three retro-confirmed days give three flips", async ({ page }) => {
  const api = await parentApi();
  for (const dayNo of [1, 2, 3]) {
    await apiConfirm(api, { kidId: 3, dayNo, status: "yes" });
  }
  await api.dispose();

  let total = 0;
  for (const dayNo of [1, 2, 3]) {
    await page.goto(kidUrl(3, dayNo));
    const tiles = page.getByTestId("board").locator("button");
    await tiles.nth(dayNo).click();
    await expect(
      page.getByTestId("board").locator("[data-covered='false']"),
    ).toHaveCount(16);
    const text = await page.getByTestId("points").textContent();
    const points = Number(text?.replace(/\D/g, ""));
    expect(points).toBeGreaterThan(total); // strictly grows each flip
    total = points;
  }

  // Journey shows all three as played
  await page.goto(kidUrl(3));
  for (const dayNo of [1, 2, 3]) {
    await expect(page.getByTestId(`day-${dayNo}`)).toHaveAttribute(
      "data-state",
      "played",
    );
  }
});

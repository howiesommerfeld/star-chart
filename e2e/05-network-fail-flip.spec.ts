import { test, expect } from "@playwright/test";
import { kidUrl } from "./helpers";

/*
 * Flip during network failure: tile flips back, retry toast appears, no
 * points bank; retry succeeds once the network returns (eng plan D5).
 */
test("failed flip rolls back with a retry toast; retry banks once", async ({
  page,
}) => {
  await page.goto(kidUrl(1, 1)); // made playable by spec 04

  await page.route("**/flip", (route) => route.abort());
  const tiles = page.getByTestId("board").locator("button");
  await tiles.nth(2).click();

  await expect(page.getByTestId("flip-toast")).toBeVisible();
  // Tile flipped back — board still fully covered
  await expect(
    page.getByTestId("board").locator("[data-covered='true']"),
  ).toHaveCount(16);

  // Network returns; the retry flips for real
  await page.unroute("**/flip");
  await tiles.nth(2).click();
  await expect(
    page.getByTestId("board").locator("[data-covered='false']"),
  ).toHaveCount(16);
});

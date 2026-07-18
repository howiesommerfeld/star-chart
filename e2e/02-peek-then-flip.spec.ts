import { test, expect } from "@playwright/test";
import { kidUrl } from "./helpers";

/* Peek reveals the truth briefly, then the kid flips a different tile. */
test("peek shows a value, re-covers, then flip works", async ({ page }) => {
  await page.goto(kidUrl(2, 7)); // Finn, day 7, 1 peek pre-seeded

  const peekBtn = page.getByTestId("peek-btn");
  await expect(peekBtn).toContainText("1 left");
  await peekBtn.click();
  await expect(peekBtn).toContainText("tap a tile");

  const tiles = page.getByTestId("board").locator("button");
  await tiles.nth(5).click();

  // Peek face shows a coin value, then flips back within ~2s
  await expect(tiles.nth(5)).toContainText(/\d+/);
  await expect(peekBtn).toBeHidden(); // 0 peeks left → control disappears
  await page.waitForTimeout(2300);

  // Now flip a different tile — still works after peeking
  await tiles.nth(8).click();
  await expect(page.getByTestId("board").locator("[data-covered='false']")).toHaveCount(16);
});

import { test, expect } from "@playwright/test";

/*
 * The core kid loop: entry → journey → today's board → flip → reveal +
 * points banked → journey reflects it. Includes the double-tap guard.
 */
test("kid flip loop: avatar → journey → flip → banked", async ({ page }) => {
  await page.goto("/f/e2e");
  await page.getByText("Maya").click();

  // Journey: day 7 glows playable
  const day7 = page.getByTestId("day-7");
  await expect(day7).toHaveAttribute("data-state", "playable");
  await day7.click();

  // Board: flip tile 3
  await expect(page.getByText("Tap a tile!")).toBeVisible();
  const tiles = page.getByTestId("board").locator("button");
  await tiles.nth(3).click();

  // Reveal: the whole board turns over; points chip updates
  await expect(page.getByTestId("board").locator("[data-covered='false']")).toHaveCount(16);
  // .last(): during the chip's crossfade two points spans coexist briefly
  const points = await page.getByTestId("points").last().textContent();
  const banked = Number(points?.replace(/\D/g, ""));
  expect(banked).toBeGreaterThan(0);

  // Double-tap another tile: nothing changes (flip is spent, idempotent)
  await tiles.nth(9).click({ force: true });
  await page.waitForTimeout(400);
  await expect(page.getByTestId("points").last()).toHaveText(points!);

  // Journey reflects the played day with the points won
  await page.goBack();
  await expect(page.getByTestId("day-7")).toHaveAttribute("data-state", "played");
});

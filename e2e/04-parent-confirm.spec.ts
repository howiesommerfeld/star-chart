import { test, expect } from "@playwright/test";

/*
 * Parent confirm end-to-end in under 10 seconds (design doc success
 * criterion): PIN → pick pending night → yes + behaviour → save.
 */
test("parent confirms a night in under 10 seconds", async ({ page }) => {
  await page.goto("/f/e2e/parent");

  const started = Date.now();
  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }

  // Maya's first pending night
  await page.getByRole("button", { name: /Night 1(?!\d)/ }).first().click();
  await page.getByRole("button", { name: "✅ Yes" }).click();
  await page.getByRole("button", { name: /In bed by lights-out/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Sheet closes and the night leaves the pending list
  await expect(page.getByRole("button", { name: "Save" })).toBeHidden();
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(10_000);

  // The kid's journey now shows day 1 playable
  await page.goto("/f/e2e/kids/1");
  await expect(page.getByTestId("day-1")).toHaveAttribute(
    "data-state",
    "playable",
  );
});

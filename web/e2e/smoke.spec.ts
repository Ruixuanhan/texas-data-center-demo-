import { expect, test } from "@playwright/test";

test("situation screen loads: map, feed, KPIs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Live signal feed")).toBeVisible();
  await expect(page.getByLabel("Texas project map")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Projects tracked")).toBeVisible();
});

test("feed leads to dossier", async ({ page }) => {
  await page.goto("/");
  const firstAttributed = page.locator("aside button", { hasNot: page.getByText("Unattributed") }).first();
  await firstAttributed.click();
  await expect(page.locator("section[aria-label^='Dossier']")).toBeVisible();
  await expect(page.getByText("Stage inference")).toBeVisible();
  await expect(page.getByText("Source record", { exact: false })).toBeVisible();
});

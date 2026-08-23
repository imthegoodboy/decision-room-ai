import { expect, test } from "@playwright/test";

test("capture native Anna app views for visual QA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const frame = page.frameLocator("iframe#app");
  await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
  await frame.locator("html").screenshot({ path: "output/playwright/home-desktop.png", animations: "disabled" });

  await frame.getByRole("link", { name: /Open a new room/ }).click();
  await frame.locator("html").screenshot({ path: "output/playwright/create-desktop.png", animations: "disabled" });
  await frame.getByText("Career move", { exact: true }).click();
  await frame.getByLabel("What decision are you facing?").fill("Should I accept the product lead offer?");
  await frame.getByLabel("What context should the room understand?").fill("The role offers more scope, but changes my commute and gives up a trusted team.");
  await frame.getByRole("button", { name: /Enter the room/ }).click();
  await expect(frame.getByRole("heading", { name: /Name what is really at stake/ })).toBeVisible();
  await frame.getByRole("link", { name: /Coach/ }).last().evaluate((link) => link.click());
  await expect(frame.getByRole("heading", { name: /Think it through with a sharp partner/ })).toBeVisible();
  const dismiss = frame.getByRole("button", { name: "Dismiss message" });
  if (await dismiss.count()) await dismiss.click();
  await frame.locator("html").screenshot({ path: "output/playwright/coach-desktop.png", animations: "disabled" });

  await page.locator("iframe#app").evaluate((node) => {
    node.style.width = "390px";
    node.style.height = "780px";
  });
  await expect(frame.locator(".mobile-stage-nav")).toBeVisible();
  await frame.locator("html").screenshot({ path: "output/playwright/coach-mobile.png", animations: "disabled" });
});

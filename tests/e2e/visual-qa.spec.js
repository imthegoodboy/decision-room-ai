import { expect, test } from "@playwright/test";

test("capture native Anna app views for visual QA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const frame = page.frameLocator("iframe#app");
  await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
  let frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/home-desktop.png", animations: "disabled", clip: frameBox });

  await frame.getByRole("link", { name: /Open a new room/ }).click();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/create-desktop.png", animations: "disabled", clip: frameBox });
  await frame.getByText("Career move", { exact: true }).click();
  await frame.getByLabel("What decision are you facing?").fill("Should I accept the product lead offer?");
  await frame.getByText("Refine the setup", { exact: true }).click();
  await frame.getByLabel("What context should the room understand?").fill("The role offers more scope, but changes my commute and gives up a trusted team.");
  await frame.getByRole("button", { name: /Enter the room/ }).click();
  await expect(frame.getByRole("heading", { name: /Name what is really at stake/ })).toBeVisible();
  await expect(frame.locator(".draft-studio")).toBeVisible();
  const dismiss = frame.getByRole("button", { name: "Dismiss message" });
  if (await dismiss.count()) await dismiss.click();
  await frame.locator(".draft-studio").scrollIntoViewIfNeeded();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/ai-draft-desktop.png", animations: "disabled", clip: frameBox });

  await frame.getByRole("link", { name: /Compare/ }).last().evaluate((link) => link.click());
  await expect(frame.locator(".compare-ai")).toBeVisible();
  await frame.locator(".compare-ai").scrollIntoViewIfNeeded();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/ai-compare-desktop.png", animations: "disabled", clip: frameBox });

  await frame.getByRole("link", { name: /Challenge/ }).last().evaluate((link) => link.click());
  await expect(frame.locator(".premortem-panel article")).toHaveCount(5);
  await frame.locator(".premortem-panel").scrollIntoViewIfNeeded();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/ai-premortem-desktop.png", animations: "disabled", clip: frameBox });

  await frame.getByRole("link", { name: /Commit/ }).last().evaluate((link) => link.click());
  await expect(frame.locator(".commit-draft-note")).toBeVisible();
  await frame.locator(".commit-draft-note").scrollIntoViewIfNeeded();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/ai-commit-desktop.png", animations: "disabled", clip: frameBox });

  await frame.getByRole("link", { name: /Coach/ }).last().evaluate((link) => link.click());
  await expect(frame.getByRole("heading", { name: /Think it through with a sharp partner/ })).toBeVisible();
  if (await dismiss.count()) await dismiss.click();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/coach-desktop.png", animations: "disabled", clip: frameBox });

  await page.locator("iframe#app").evaluate((node) => {
    node.style.width = "390px";
    node.style.height = "780px";
  });
  await expect(frame.locator(".mobile-stage-nav")).toBeVisible();
  frameBox = await page.locator("iframe#app").boundingBox();
  await page.screenshot({ path: "output/playwright/coach-mobile.png", animations: "disabled", clip: frameBox });
});

import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

async function openRoom(page) {
  await page.goto("/");
  const frame = page.frameLocator("iframe#app");
  await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
  if (await frame.locator(".decision-row").count()) {
    await frame.getByRole("link", { name: "Settings" }).click();
    await frame.getByRole("button", { name: /Clear all data/ }).click();
    await frame.getByRole("button", { name: "Clear all data", exact: true }).last().click();
    await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
  }
  return frame;
}

async function createCareerDecision(frame) {
  await frame.getByRole("link", { name: /Open a new room/ }).click();
  await expect(frame.getByRole("heading", { name: /First, name the real choice/ })).toBeVisible();
  await frame.getByText("Career move", { exact: true }).click();
  await frame.getByLabel("What decision are you facing?").fill("Should I accept the product lead offer?");
  await frame.getByLabel("What context should the room understand?").fill("The role offers more scope, but it changes my commute and gives up a trusted team.");
  await frame.getByRole("button", { name: /Enter the room/ }).click();
  await expect(frame.getByRole("heading", { name: /Name what is really at stake/ })).toBeVisible();
}

test("complete frame-to-outcome workflow works inside the Anna harness", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const frame = await openRoom(page);
  await createCareerDecision(frame);

  const optionNames = frame.locator('[data-option-field="name"]');
  await optionNames.nth(0).fill("Accept the offer");
  await optionNames.nth(1).fill("Stay with current team");
  await frame.getByRole("link", { name: /Compare options/ }).click();
  await expect(frame.getByRole("heading", { name: /Make the trade-offs visible/ })).toBeVisible();
  await frame.locator("[data-rating]").nth(0).fill("5");
  await frame.locator("[data-rating]").nth(1).fill("4");
  await frame.locator("[data-evidence]").first().fill("The written offer includes ownership of the full product line.");
  await expect(frame.getByText("Sensitivity check")).toBeVisible();

  await frame.getByRole("link", { name: /Challenge/ }).last().click();
  await frame.getByRole("button", { name: /Add/ }).first().click();
  await frame.locator('[data-assumption-field="text"]').fill("The new manager will preserve the promised autonomy.");
  await frame.getByRole("button", { name: "Challenge my thinking" }).click();
  await expect(frame.getByRole("heading", { name: "The score gap rests on evidence you have not written down" })).toBeVisible({ timeout: 20_000 });

  await frame.getByRole("link", { name: /Ask the Coach/ }).click();
  await expect(frame.getByRole("heading", { name: /Think it through with a sharp partner/ })).toBeVisible();
  await frame.getByRole("button", { name: /What assumption should I test first/ }).click();
  await frame.getByRole("button", { name: "Send" }).click();
  await expect(frame.getByText(/current ranking is directionally useful/i)).toBeVisible({ timeout: 20_000 });

  await frame.getByRole("link", { name: /Commit/ }).last().click();
  await frame.getByLabel("Chosen option").selectOption({ label: "Accept the offer" });
  await frame.getByLabel("Why this option?").fill("It creates the strongest learning path, and I can test the commute before starting.");
  await frame.getByLabel("First concrete action").fill("Request a written 30-day autonomy plan.");
  await frame.getByRole("button", { name: /Record my decision/ }).click();
  await expect(frame.getByText("Commitment recorded", { exact: false })).toBeVisible();

  await frame.getByRole("link", { name: /Review/ }).last().click();
  await frame.getByLabel("Describe the outcome").fill("The written plan clarified ownership and reduced the main uncertainty.");
  await frame.getByLabel("What should future-you remember?").fill("Test the riskiest promise before treating it as evidence.");
  await frame.getByRole("button", { name: /Complete the loop/ }).click();
  await expect(frame.getByText("Lesson retained")).toBeVisible();
  expect(errors).toEqual([]);
});

test("library search, duplication, export, and settings are usable", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const frame = await openRoom(page);
  await createCareerDecision(frame);
  await frame.getByRole("link", { name: /All decisions/ }).click();
  await frame.getByRole("searchbox", { name: "Search decisions" }).fill("product lead");
  await expect(frame.getByRole("heading", { name: "Should I accept the product lead offer?" })).toBeVisible();
  await frame.getByRole("button", { name: /More actions/ }).click();
  await frame.getByRole("button", { name: /Duplicate room/ }).evaluate((button) => button.click());
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  await expect(frame.locator('[data-decision-field="title"]')).toHaveValue(/copy$/);
  await frame.getByRole("link", { name: /All decisions/ }).click();
  await expect(frame.locator(".decision-row")).toHaveCount(2);
  await frame.getByRole("link", { name: "Settings" }).click();
  await frame.getByText("Reduce motion").click();
  await expect(frame.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await expect(frame.getByRole("button", { name: /Export all data/ })).toBeVisible();
});

test("narrow Anna window has no horizontal overflow and keeps Coach usable", async ({ page }) => {
  const frame = await openRoom(page);
  await createCareerDecision(frame);
  await page.locator("iframe#app").evaluate((node) => {
    node.style.width = "390px";
    node.style.height = "780px";
  });
  await expect(frame.locator(".mobile-stage-nav")).toBeVisible();
  await frame.locator(".mobile-stage-nav").getByRole("link", { name: /Coach/ }).evaluate((link) => link.click());
  await expect(frame.getByLabel("Message the Decision Coach")).toBeVisible();
  const dimensions = await frame.locator("html").evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
  expect(dimensions.scroll).toBe(dimensions.width);
});

test("home and creation screens pass an automated accessibility scan", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frame = await openRoom(page);
  await frame.locator(".reveal").last().waitFor({ state: "visible" });
  const appFrame = page.frames().find((candidate) => candidate.url().includes("/anna-apps/"));
  expect(appFrame).toBeTruthy();
  await appFrame.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
  const result = await appFrame.evaluate(async () => axe.run(document, { rules: { "color-contrast": { enabled: true } } }));
  expect(result.violations).toEqual([]);
  await frame.getByRole("link", { name: /Open a new room/ }).click();
  const creationResult = await appFrame.evaluate(async () => axe.run(document));
  expect(creationResult.violations).toEqual([]);
});

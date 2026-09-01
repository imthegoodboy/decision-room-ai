import { expect, test } from "@playwright/test";

test("Anna-backed full decision lifecycle works end to end", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/");
  const frame = page.frameLocator("iframe#app");
  await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
  await frame.getByRole("link", { name: /Open a new room/ }).click();
  await frame.getByText("Career move", { exact: true }).click();
  await frame.getByLabel("What decision are you facing?").fill("Should I accept a product lead role or stay with my current team?");
  await frame.getByText("Refine the setup", { exact: true }).click();
  await frame.getByLabel("What context should the room understand?").fill("The offer increases scope and learning, but adds a longer commute. I can test the commute before deciding.");
  await frame.getByRole("button", { name: /Build my first draft/ }).click();

  const draftSource = frame.locator(".draft-studio .eyebrow");
  const draftAction = frame.getByRole("button", { name: /with Anna/ });
  await expect(draftAction).toBeEnabled({ timeout: 240_000 });
  if (!String(await draftSource.textContent()).includes("Anna first draft")) {
    await draftAction.click();
    await expect(draftAction).toBeEnabled({ timeout: 240_000 });
  }
  await expect(draftSource).toContainText("Anna first draft");
  await expect(frame.locator("[data-option-field='name']")).toHaveCount(3);
  await expect(frame.locator("[data-criterion-field='name']")).toHaveCount(4);
  await expect(frame.locator(".draft-questions li")).toHaveCount(2);

  await frame.getByRole("link", { name: /Compare options/ }).click();
  await expect(frame.locator(".compare-ai")).toBeVisible();
  await expect(frame.locator(".compare-ai__signals > div")).toHaveCount(4);
  await frame.locator("[data-rating]").first().fill("5");
  await frame.locator("[data-evidence]").first().fill("The offer includes ownership of the full product line.");

  await frame.getByRole("link", { name: /03 Challenge/ }).click();
  await expect(frame.getByRole("heading", { name: /If this decision fails/ })).toBeVisible();
  await frame.getByRole("button", { name: "Run a premortem" }).click();
  await expect(frame.locator(".analysis-sheet").last()).toBeVisible({ timeout: 240_000 });
  await expect(frame.locator(".analysis-sheet").last()).toContainText("Anna");
  await expect(frame.locator(".analysis-sheet").last()).not.toContainText("Local fallback");
  await expect(frame.locator(".premortem-item")).toHaveCount(5);

  await frame.getByRole("link", { name: /Ask the Coach/ }).click();
  await frame.getByRole("button", { name: /What assumption should I test first/ }).click();
  await frame.getByRole("button", { name: "Send" }).click();
  const reply = frame.locator(".chat-message--assistant p").last();
  await expect(reply).toBeVisible({ timeout: 240_000 });
  await expect(reply).not.toHaveText(/^\s*\{/);
  await expect(frame.locator(".chat-message--assistant header").last()).not.toContainText("Local fallback");

  await frame.getByRole("link", { name: /05 Commit/ }).click();
  await expect(frame.getByLabel("Chosen option")).toBeVisible();
  await frame.getByLabel("Why this option?").fill("It creates the strongest learning path while the commute remains testable.");
  await frame.getByLabel("First concrete action").fill("Request a written 30-day autonomy plan.");
  await frame.getByLabel("Review date").fill("2026-12-01");
  await frame.getByRole("button", { name: /Record my decision/ }).click();
  await expect(frame.getByText("Commitment recorded", { exact: false })).toBeVisible();

  await frame.getByRole("link", { name: /Review/ }).last().click();
  await expect(frame.getByText("Dec 1, 2026", { exact: true })).toBeVisible();
  await frame.getByLabel("Describe the outcome").fill("The trial clarified the commute and the role's autonomy.");
  await frame.getByLabel("What should future-you remember?").fill("Test the riskiest promise before treating it as evidence.");
  await frame.getByRole("button", { name: /Complete the loop/ }).click();
  await expect(frame.getByText("Lesson retained")).toBeVisible();

  const appFrame = page.frames().find((candidate) => candidate.url().includes("/anna-apps/"));
  expect(appFrame).toBeTruthy();
  await Promise.all([
    appFrame.waitForNavigation({ waitUntil: "domcontentloaded" }),
    appFrame.evaluate(() => location.reload()),
  ]);
  const restored = page.frameLocator("iframe#app");
  await expect(restored.getByRole("heading", { name: /What actually happened/ })).toBeVisible();
  await expect(restored.getByText("Lesson retained")).toBeVisible();
  expect(errors).toEqual([]);
});

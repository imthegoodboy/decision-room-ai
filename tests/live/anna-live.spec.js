import { expect, test } from "@playwright/test";

test("Anna's live LLM completes structured analysis and Coach chat", async ({ page }) => {
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
  await frame.getByLabel("What context should the room understand?").fill("The offer increases scope and learning, but adds a longer commute. I can ask for a two-week trial commute before deciding.");
  await frame.getByRole("button", { name: /Enter the room/ }).click();

  await frame.getByRole("link", { name: /Challenge/ }).last().click();
  await frame.getByRole("button", { name: "Challenge my thinking" }).click();
  await expect(frame.locator(".analysis-sheet")).toBeVisible();
  await expect(frame.locator(".analysis-sheet .analysis-type")).toContainText("Anna");
  await expect(frame.locator(".analysis-sheet .analysis-summary")).not.toBeEmpty();

  await frame.getByRole("link", { name: /Ask the Coach/ }).click();
  await frame.getByRole("button", { name: /What assumption should I test first/ }).click();
  await frame.getByRole("button", { name: "Send" }).click();
  const reply = frame.locator(".chat-message--assistant p").last();
  await expect(reply).toBeVisible();
  await expect(reply).not.toHaveText(/^\s*\{/);
  await expect(frame.locator(".chat-message--assistant header").last()).not.toContainText("Local fallback");
  expect(errors).toEqual([]);

  await frame.getByRole("button", { name: "Decision actions" }).click();
  await frame.getByRole("button", { name: /Delete decision/ }).click();
  await frame.getByRole("button", { name: "Delete decision", exact: true }).last().click();
  await expect(frame.getByRole("heading", { name: /Make the choice/ })).toBeVisible();
});

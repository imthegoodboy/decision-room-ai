import { expect, test } from "@playwright/test";

test("Anna's live LLM completes the automatic first draft and grounded Coach chat", async ({ page }) => {
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
  await frame.getByRole("button", { name: /Build my first draft/ }).click();

  const draftAction = frame.getByRole("button", { name: /with Anna/ });
  await expect(draftAction).toBeEnabled({ timeout: 240_000 });
  const draftSource = frame.locator(".draft-studio .eyebrow");
  if (!String(await draftSource.textContent()).includes("Anna first draft")) {
    await draftAction.click();
    await expect(draftAction).toBeEnabled({ timeout: 240_000 });
  }
  await expect(draftSource).toContainText("Anna first draft");
  await expect(frame.locator(".draft-questions li")).toHaveCount(2);

  await frame.getByRole("link", { name: /03 Challenge/ }).click();
  await expect(frame.getByRole("link", { name: /Ask the Coach/ })).toBeVisible();
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

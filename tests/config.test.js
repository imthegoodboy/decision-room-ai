import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("Anna permissions declare the complete review-safe agent session shape", async () => {
  const manifest = await readJson("manifest.json");
  assert.deepEqual(manifest.ui.host_api.agent, {
    session: { auto: true, fixed: { client_ids: [] } },
    tools: [],
  });
  assert.deepEqual(manifest.required_executas, []);
  assert.deepEqual(manifest.optional_executas, []);
  assert.match(manifest.system_prompt_addendum, /never make the final decision/i);
});

test("listing, package, and lock versions stay aligned", async () => {
  const [listing, pkg, lock] = await Promise.all([
    readJson("app.json"),
    readJson("package.json"),
    readJson("package-lock.json"),
  ]);
  assert.equal(listing.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
});

test("Marketplace listing includes real product screenshots", async () => {
  const listing = await readJson("app.json");
  assert.ok(listing.screenshots.length >= 3);
  for (const path of listing.screenshots) {
    const file = await stat(path);
    assert.ok(file.size > 10_000, `${path} must contain a rendered product screenshot`);
  }
});

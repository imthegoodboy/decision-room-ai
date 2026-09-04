import assert from "node:assert/strict";
import test from "node:test";
import { createDecision, normalizeStore, STORE_KEY } from "../src/core.js";
import { DecisionPlatform } from "../src/platform.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    async get({ key }) { return { value: values.get(key) }; },
    async set({ key, value }) { values.set(key, structuredClone(value)); },
    async delete({ key }) { values.delete(key); },
  };
}

test("Anna Storage shards decisions, restores them, and keeps every value below the platform limit", async () => {
  const storage = memoryStorage();
  const decision = createDecision({
    title: "Which launch plan should we choose?",
    context: "A grounded launch decision with customer, budget, and timing constraints.",
    template: "venture",
  });
  decision.options[0].notes = "Evidence-backed option. ".repeat(60);
  decision.evidence[decision.options[0].id][decision.criteria[0].id] = "Five customer calls support this rating. ".repeat(18);
  decision.analyses = Array.from({ length: 8 }, (_, index) => ({
    id: `analysis-${index}`,
    type: "challenger",
    source: "anna",
    headline: `Challenge ${index + 1}`,
    summary: "Grounded analysis. ".repeat(80),
    blindSpots: Array(8).fill("A specific uncertainty remains untested. ".repeat(12)),
    questions: Array(8).fill("What evidence would change this rating? ".repeat(12)),
    scenarios: Array(8).fill("A conditional scenario based on recorded evidence. ".repeat(10)),
    experiments: Array(8).fill("Run a reversible test before committing. ".repeat(12)),
    recommendation: "Treat the leader as a hypothesis. ".repeat(25),
    caveat: "No external research was performed. ".repeat(16),
    createdAt: new Date().toISOString(),
  }));
  decision.coach = Array.from({ length: 24 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? "assistant" : "user",
    source: "anna",
    text: "A room-grounded coaching message. ".repeat(index % 2 ? 100 : 30),
    createdAt: new Date().toISOString(),
  }));
  const expected = normalizeStore({ decisions: [decision], preferences: { reduceMotion: true } });

  const writer = new DecisionPlatform();
  writer.anna = { storage };
  writer.storageMode = "anna";
  await writer.save(expected);

  assert.equal(storage.values.has(STORE_KEY), false);
  assert.equal(storage.values.size, 4);
  for (const [key, value] of storage.values) {
    assert.ok(Buffer.byteLength(JSON.stringify(value), "utf8") < 262_144, `${key} exceeds Anna's observed per-value limit`);
  }

  const reader = new DecisionPlatform();
  reader.anna = { storage };
  reader.storageMode = "anna";
  const restored = await reader.load();
  assert.equal(restored.decisions.length, 1);
  assert.equal(restored.decisions[0].title, expected.decisions[0].title);
  assert.equal(restored.decisions[0].options[0].notes, expected.decisions[0].options[0].notes);
  assert.equal(restored.decisions[0].analyses.length, expected.decisions[0].analyses.length);
  assert.equal(restored.decisions[0].coach.length, expected.decisions[0].coach.length);
  assert.equal(restored.preferences.reduceMotion, true);
});

test("legacy single-key workspaces migrate without losing decisions", async () => {
  const legacy = normalizeStore({ decisions: [createDecision({ title: "Should we migrate this room?" })] });
  const storage = memoryStorage({ [STORE_KEY]: legacy });
  const platform = new DecisionPlatform();
  platform.anna = { storage };
  platform.storageMode = "anna";

  const restored = await platform.load();

  assert.equal(restored.decisions[0].title, "Should we migrate this room?");
  assert.equal(storage.values.has(STORE_KEY), false);
  assert.equal(storage.values.has("decision-room:v2:index"), true);
});

test("overlapping edits are serialized so a slower old save cannot overwrite newer data", async () => {
  const storage = memoryStorage();
  const originalSet = storage.set.bind(storage);
  storage.set = async ({ key, value }) => {
    if (key.endsWith(":core") && value.title === "Older title") await new Promise((resolve) => setTimeout(resolve, 25));
    await originalSet({ key, value });
  };
  const first = createDecision({ title: "Older title" });
  const second = structuredClone(first);
  second.title = "Newest title";
  const platform = new DecisionPlatform();
  platform.anna = { storage };
  platform.storageMode = "anna";

  await Promise.all([
    platform.save(normalizeStore({ decisions: [first] })),
    platform.save(normalizeStore({ decisions: [second] })),
  ]);

  const reader = new DecisionPlatform();
  reader.anna = { storage };
  const restored = await reader.load();
  assert.equal(restored.decisions[0].title, "Newest title");
});

test("Anna LLM completion retries one transient failure with a bounded timeout", async () => {
  const calls = [];
  const platform = new DecisionPlatform();
  platform.anna = {
    llm: {
      async complete(request, options) {
        calls.push({ request, options });
        if (calls.length === 1) throw new Error("temporary route timeout");
        return { content: { text: "Recovered Anna response" } };
      },
    },
  };

  const result = await platform.complete({ messages: [] });

  assert.equal(result, "Recovered Anna response");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ options }) => options.timeoutMs), [100000, 100000]);
});

test("Anna LLM completion treats whitespace-only output as empty and retries", async () => {
  let calls = 0;
  const platform = new DecisionPlatform();
  platform.anna = {
    llm: {
      async complete() {
        calls += 1;
        return calls === 1 ? { content: { text: "   \n" } } : { content: { text: "  Complete response.  " } };
      },
    },
  };
  assert.equal(await platform.complete({ messages: [] }), "Complete response.");
  assert.equal(calls, 2);
});

test("Anna LLM completion honors a shorter single-attempt budget for background refinement", async () => {
  const calls = [];
  const platform = new DecisionPlatform();
  platform.anna = {
    llm: {
      async complete(request, options) {
        calls.push({ request, options });
        throw new Error("route unavailable");
      },
    },
  };

  await assert.rejects(
    platform.complete({ messages: [] }, { timeoutMs: 40_000, attempts: 1 }),
    /route unavailable/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.timeoutMs, 40_000);
});

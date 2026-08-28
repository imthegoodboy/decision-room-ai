import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DECISIONS,
  applyDecisionDraft,
  buildAnalysisPrompt,
  buildDecisionDraftPrompt,
  buildFallbackDraft,
  buildCoachPrompt,
  buildFallbackAnalysis,
  buildFallbackCoachResponse,
  calculateScores,
  compareInsight,
  confidenceLens,
  createDecision,
  decisionProgress,
  duplicateDecision,
  formatCoachResponse,
  normalizeDecision,
  normalizeStore,
  parseStructuredJson,
  sensitivityAnalysis,
} from "../src/core.js";

test("career template creates a complete editable decision frame", () => {
  const decision = createDecision({ title: "Should I accept the offer?", template: "career", mode: "deep" }, new Date("2026-08-24T10:00:00Z"));
  assert.equal(decision.options.length, 2);
  assert.equal(decision.criteria.length, 5);
  assert.equal(decision.criteria[0].name, "Learning and growth");
  assert.equal(decision.ratings[decision.options[0].id][decision.criteria[0].id], 3);
  assert.equal(decision.status, "draft");
});

test("AI first draft fills the room instead of leaving a blank worksheet", () => {
  const now = new Date("2026-08-28T10:00:00Z");
  const decision = createDecision({ title: "Should I accept the Shanghai role or stay remote?", context: "Career growth matters, and I need to care for family.", template: "career" }, now);
  const draft = buildFallbackDraft(decision, now);
  applyDecisionDraft(decision, draft, { source: "local", generatedAt: now.toISOString() });
  assert.ok(decision.options.length >= 2);
  assert.equal(decision.criteria.length, 5);
  assert.equal(decision.deadline, "2026-09-27");
  assert.equal(decision.premortem.length, 5);
  assert.ok(decision.assumptions.length >= 3);
  assert.ok(decision.risks.length >= 2);
  assert.ok(decision.draftMeta.clarifyingQuestions.length >= 2);
  assert.ok(decision.commitSuggestion.rationale.length > 20);
  assert.match(decision.evidence[decision.options[0].id][decision.criteria[0].id], /Draft hypothesis/i);
});

test("AI draft and comparison prompts make the proactive role explicit", () => {
  const decision = createDecision({ title: "Should we launch or run a pilot?", context: "The evidence is incomplete." });
  applyDecisionDraft(decision, buildFallbackDraft(decision), { source: "local" });
  const prompt = buildDecisionDraftPrompt(decision, new Date("2026-08-28T00:00:00Z"));
  const insight = compareInsight(decision);
  assert.match(prompt, /exactly five premortem causes/i);
  assert.match(prompt, /initial 1–5 scores/i);
  assert.match(insight.headline, /leads/i);
  assert.match(insight.reason, /contributing/i);
  assert.match(insight.sensitivity, /weight|leader/i);
});

test("weighted scores are normalized to a transparent 0-100 scale", () => {
  const decision = createDecision({ title: "Choose a path" });
  const [first, second] = decision.options;
  for (const criterion of decision.criteria) {
    decision.ratings[first.id][criterion.id] = 5;
    decision.ratings[second.id][criterion.id] = 1;
  }
  const scores = calculateScores(decision);
  assert.equal(scores[0].optionId, first.id);
  assert.equal(scores[0].score, 100);
  assert.equal(scores[1].score, 20);
});

test("evidence coverage and readiness react to recorded support", () => {
  const decision = createDecision({ title: "Choose a path" });
  const before = confidenceLens(decision);
  for (const option of decision.options) {
    for (const criterion of decision.criteria) decision.evidence[option.id][criterion.id] = "Observed evidence from a real trial.";
  }
  const after = confidenceLens(decision);
  assert.equal(after.evidenceCoverage, 100);
  assert.ok(after.readiness > before.readiness);
});

test("sensitivity analysis detects a leader that changes with criterion weight", () => {
  const decision = createDecision({ title: "Choose a path" });
  decision.criteria = decision.criteria.slice(0, 2);
  decision.criteria[0].weight = 40;
  decision.criteria[1].weight = 40;
  const [a, b] = decision.options;
  const [c1, c2] = decision.criteria;
  decision.ratings[a.id] = { [c1.id]: 5, [c2.id]: 2 };
  decision.ratings[b.id] = { [c1.id]: 2, [c2.id]: 5 };
  decision.evidence[a.id] = { [c1.id]: "", [c2.id]: "" };
  decision.evidence[b.id] = { [c1.id]: "", [c2.id]: "" };
  decision.criteria[0].weight = 50;
  decision.criteria[1].weight = 40;
  const result = sensitivityAnalysis(decision);
  assert.equal(result.stable, false);
  assert.ok(result.switches.some((item) => item.criterionId === c1.id || item.criterionId === c2.id));
});

test("stored decisions are bounded and malformed values are normalized", () => {
  const seed = createDecision({ title: "Valid decision" });
  const store = normalizeStore({ decisions: Array.from({ length: MAX_DECISIONS + 5 }, () => seed), preferences: { reduceMotion: 1 } });
  assert.equal(store.decisions.length, MAX_DECISIONS);
  assert.equal(store.preferences.reduceMotion, true);
  assert.ok(store.decisions.every((decision) => decision.options.length >= 2));
});

test("duplicate creates a fresh room without commitment, analysis, or chat", () => {
  const decision = createDecision({ title: "Original" });
  decision.commitment = { optionId: decision.options[0].id, confidence: 4, rationale: "Because", nextAction: "Act", reviewDate: "2026-09-24", decidedAt: "2026-08-24T00:00:00Z" };
  decision.analyses.push({ type: "advisor", headline: "Advice" });
  decision.coach.push({ id: "m1", role: "user", text: "Question", createdAt: "2026-08-24T00:00:00Z" });
  const copy = duplicateDecision(decision, new Date("2026-08-25T00:00:00Z"));
  assert.notEqual(copy.id, decision.id);
  assert.match(copy.title, /copy$/);
  assert.equal(copy.commitment, null);
  assert.deepEqual(copy.analyses, []);
  assert.deepEqual(copy.coach, []);
  assert.notEqual(copy.options[0].id, decision.options[0].id);
});

test("analysis JSON parser accepts fenced output and rejects prose", () => {
  assert.deepEqual(parseStructuredJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.throws(() => parseStructuredJson("No structured result"), /unreadable/);
});

test("Coach responses stay readable when an Anna mock returns analysis JSON", () => {
  const response = formatCoachResponse(JSON.stringify({
    summary: "The score gap is still based on thin evidence.",
    recommendation: "Test the autonomy promise before committing.",
    questions: ["What written evidence would change your confidence?"],
  }));
  assert.match(response, /thin evidence/);
  assert.match(response, /Test the autonomy promise/);
  assert.doesNotMatch(response, /^\s*\{/);
  assert.equal(formatCoachResponse("Ask for a reversible trial."), "Ask for a reversible trial.");
});

test("local AI fallbacks stay grounded, useful, and transparent", () => {
  const decision = createDecision({ title: "Choose a path", template: "career" });
  const analysis = buildFallbackAnalysis(decision, "challenger");
  assert.equal(analysis.source, "local");
  assert.match(analysis.summary, /evidence coverage/i);
  assert.ok(analysis.blindSpots.length > 0);
  assert.ok(analysis.experiments.length > 0);
  const premortem = buildFallbackAnalysis(decision, "premortem");
  assert.equal(premortem.premortem.length, 5);
  assert.ok(premortem.premortem.every((item) => item.cause && item.warning && item.mitigation));
  const reply = buildFallbackCoachResponse(decision, "What assumption should I test first?");
  assert.match(reply, /live reply was unavailable/i);
  assert.match(reply, /belief|assumption/i);
});

test("AI prompts stay grounded in the active room", () => {
  const decision = normalizeDecision(createDecision({ title: "Should we launch?", context: "A reversible pilot is possible." }));
  const analysis = buildAnalysisPrompt(decision, "premortem");
  const coach = buildCoachPrompt(decision, "What should we test?");
  assert.match(analysis, /ANALYSIS MODE: PREMORTEM/);
  assert.match(analysis, /Never claim external research/i);
  assert.match(coach, /Should we launch/);
  assert.match(coach, /What should we test/);
});

test("progress reflects the complete decision lifecycle", () => {
  const decision = createDecision({ title: "Choose a path" });
  const early = decisionProgress(decision);
  decision.commitment = { optionId: decision.options[0].id };
  decision.outcome = { result: "Done", lesson: "Learned" };
  assert.ok(decisionProgress(decision) > early);
});

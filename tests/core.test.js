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
  decisionDraftQualityIssues,
  decisionProgress,
  duplicateDecision,
  formatCoachResponse,
  normalizeDecision,
  normalizeStore,
  parseStructuredJson,
  isAnalysisPayload,
  isDecisionDraftPayload,
  sensitivityAnalysis,
} from "../src/core.js";
import { renderSafeMarkdown } from "../src/markdown.js";

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
  assert.equal(decision.criteria.length, 4);
  assert.equal(decision.deadline, "2026-09-27");
  assert.equal(decision.premortem.length, 5);
  assert.ok(decision.assumptions.length >= 3);
  assert.ok(decision.risks.length >= 2);
  assert.ok(decision.draftMeta.clarifyingQuestions.length >= 2);
  assert.ok(decision.commitSuggestion.rationale.length > 20);
  assert.match(decision.evidence[decision.options[0].id][decision.criteria[0].id], /Anna inference/i);

  assert.equal(decision.options.length, 3);
  assert.match(decision.options[2].name, /hybrid trial/i);
  assert.deepEqual(decision.criteria.map((criterion) => criterion.name), ["Career growth", "Commute and life fit", "Role scope and support", "Total reward"]);
  assert.doesNotMatch(JSON.stringify(decision.evidence), /verify how/i);
  assert.equal(decision.evidenceSources[decision.options[0].id][decision.criteria[0].id], "ai");
});

test("AI draft and comparison prompts make the proactive role explicit", () => {
  const decision = createDecision({ title: "Should we launch or run a pilot?", context: "The evidence is incomplete." });
  applyDecisionDraft(decision, buildFallbackDraft(decision), { source: "local" });
  const prompt = buildDecisionDraftPrompt(decision, new Date("2026-08-28T00:00:00Z"));
  const insight = compareInsight(decision);
  assert.match(prompt, /exactly five premortem causes/i);
  assert.match(prompt, /initial 1–5 scores/i);
  assert.match(prompt, /visible response under 1200 tokens/i);
  assert.match(insight.headline, /leads/i);
  assert.match(insight.reason, /contributing/i);
  assert.match(insight.sensitivity, /weight|leader/i);
});

test("compact Anna draft schema expands into the complete editable room", () => {
  const decision = createDecision({ title: "Should I launch now or run a pilot?", context: "Customer evidence is incomplete." });
  applyDecisionDraft(decision, {
    d: "2026-09-30",
    o: [["Launch now", "Move quickly."], ["Run a pilot", "Test the riskiest assumption."]],
    c: [["Learning", 60, "Reduce uncertainty."], ["Speed", 40, "Capture timing value."]],
    s: [[0, 0, 2, "Little direct evidence."], [0, 1, 5, "Fastest path."], [1, 0, 5, "Produces evidence."], [1, 1, 3, "Adds one week."]],
    a: [["The opportunity remains available.", 3, "Confirm the deadline."]],
    r: [[0, "Launch misses a key need.", 3, 5, "Stage the rollout."], [1, "Pilot delays learning.", 2, 3, "Time-box it."]],
    p: [["Wrong need", "Low activation", "Interview users"], ["Slow launch", "Milestones slip", "Time-box scope"], ["Weak demand", "No repeats", "Test retention"], ["Cost overrun", "Budget rises", "Cap spend"], ["Team overload", "Work queues", "Reduce scope"]],
    q: ["Which assumption is least certain?"],
    m: [1, 3, "Pilot first while evidence is thin.", "Run a one-week pilot."],
    why: "The pilot buys evidence before a larger commitment.",
  }, { source: "anna", generatedAt: "2026-08-30T00:00:00Z" });
  assert.equal(decision.options[1].name, "Run a pilot");
  assert.equal(decision.criteria[0].weight, 60);
  assert.equal(decision.ratings[decision.options[1].id][decision.criteria[0].id], 5);
  assert.equal(decision.premortem.length, 5);
  assert.equal(decision.commitSuggestion.optionId, decision.options[1].id);
  assert.equal(decision.draftMeta.source, "anna");
});

test("draft validation rejects an unrelated analysis payload", () => {
  const challenger = { headline: "The score gap rests on evidence", summary: "A challenger response." };
  assert.equal(isDecisionDraftPayload(challenger), false);
  const decision = createDecision({ title: "Choose a path" });
  assert.throws(() => applyDecisionDraft(decision, challenger, { source: "anna" }), /incomplete first draft/i);
});

test("malformed stored dates are cleared instead of rendering invalid dates", () => {
  const decision = normalizeDecision({
    title: "Choose a path",
    deadline: "not-a-date",
    commitment: { optionId: "option-1", reviewDate: "not-a-date" },
  });
  assert.equal(decision.deadline, "");
  assert.equal(decision.commitment, null);
});

test("impossible calendar dates are rejected", () => {
  const decision = normalizeDecision({
    title: "Calendar safety",
    deadline: "2026-02-31",
    commitment: { optionId: "missing", reviewDate: "2026-13-40" },
  });
  assert.equal(decision.deadline, "");
  assert.equal(decision.commitment, null);
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

test("only user-confirmed notes raise evidence coverage and preparation", () => {
  const decision = createDecision({ title: "Choose a path" });
  const before = confidenceLens(decision);
  for (const option of decision.options) {
    for (const criterion of decision.criteria) {
      decision.evidence[option.id][criterion.id] = "Anna inference about the option.";
      decision.evidenceSources[option.id][criterion.id] = "ai";
    }
  }
  assert.equal(confidenceLens(decision).evidenceCoverage, 0);
  for (const option of decision.options) {
    for (const criterion of decision.criteria) {
      decision.evidence[option.id][criterion.id] = "Observed evidence from a real trial.";
      decision.evidenceSources[option.id][criterion.id] = "user";
    }
  }
  const after = confidenceLens(decision);
  assert.equal(after.evidenceCoverage, 100);
  assert.ok(after.readiness > before.readiness);
});

test("legacy draft notes migrate conservatively as AI inference", () => {
  const original = createDecision({ title: "Choose a path" });
  const option = original.options[0];
  const criterion = original.criteria[0];
  original.evidence[option.id][criterion.id] = "Strongest draw for talent and morale.";
  original.draftMeta = { source: "anna", status: "ready" };
  delete original.evidenceSources;
  const restored = normalizeDecision(original);
  assert.equal(restored.evidenceSources[option.id][criterion.id], "ai");
  assert.equal(calculateScores(restored).find((item) => item.optionId === option.id).evidenceCoverage, 0);
});

test("draft quality gate rejects generic model output", () => {
  const generic = {
    o: [["Option A", "Generic"], ["Option B", "Generic"]],
    c: [["C1", 25, ""], ["C2", 25, ""], ["C3", 25, ""], ["C4", 25, ""]],
    s: Array.from({ length: 8 }, (_, index) => [Math.floor(index / 4), index % 4, 3, "Verify how Option A fits Criterion A."]),
    a: [["A", 3, "Test"], ["B", 3, "Test"], ["C", 3, "Test"]],
    r: [[0, "Risk A", 3, 3, "Mitigate"], [1, "Risk B", 3, 3, "Mitigate"]],
    p: Array.from({ length: 5 }, () => ["Failure", "Signal", "Mitigation"]),
  };
  assert.ok(decisionDraftQualityIssues(generic).length > 0);
});

test("draft quality gate rejects a detailed response grounded in the wrong decision", () => {
  const wrongDraft = {
    o: [["Accept the offer", "More responsibility"], ["Stay remote", "Keep flexibility"]],
    c: [["Growth", 25, "Career"], ["Commute", 25, "Travel"], ["Team", 25, "People"], ["Pay", 25, "Reward"]],
    s: Array.from({ length: 8 }, (_, index) => [Math.floor(index / 4), index % 4, 3, "The written role details support this rating."]),
    a: [["Offer is current", 3, "Confirm"], ["Role is accurate", 3, "Review"], ["Team is stable", 3, "Ask"]],
    r: [[0, "Commute fatigue", 3, 3, "Test travel"], [1, "Growth stalls", 3, 3, "Set milestone"]],
    p: Array.from({ length: 5 }, () => ["Role disappoints", "Scope stays vague", "Get it in writing"]),
  };
  const decision = createDecision({ title: "Should we move to a four-day week or run a three-month pilot?" });
  assert.match(decisionDraftQualityIssues(wrongDraft, decision).join(" "), /specific terms/i);
});

test("Coach Markdown renders emphasis and lists while escaping HTML", () => {
  const rendered = renderSafeMarkdown("**Output Parity**\n\n- Check one\n- Check two\n\n<script>alert(1)</script>");
  assert.match(rendered, /<strong>Output Parity<\/strong>/);
  assert.match(rendered, /<ul><li>Check one<\/li><li>Check two<\/li><\/ul>/);
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
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

test("analysis validation rejects truncated premortems before persistence", () => {
  const base = { headline: "A specific insight", summary: "Evidence-aware synthesis." };
  assert.equal(isAnalysisPayload({ ...base, premortem: Array.from({ length: 4 }, () => ({ cause: "Cause", warning: "Signal", mitigation: "Action" })) }, "premortem"), false);
  assert.equal(isAnalysisPayload({ ...base, premortem: Array.from({ length: 5 }, () => ({ cause: "Cause", warning: "Signal", mitigation: "Action" })) }, "premortem"), true);
  assert.equal(isAnalysisPayload({ ...base, premortem: [{ cause: "Cause", warning: "", mitigation: "Action" }, ...Array.from({ length: 4 }, () => ({ cause: "Cause", warning: "Signal", mitigation: "Action" }))] }, "premortem"), false);
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
  assert.match(analysis.summary, /user-confirmed support/i);
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

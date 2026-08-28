// src/core.js
var STORE_KEY = "decision-room:v1:workspace";
var STORE_VERSION = 1;
var MAX_DECISIONS = 24;
var MAX_OPTIONS = 6;
var MAX_CRITERIA = 8;
var MAX_PREMORTEM_ITEMS = 5;
var clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
var clean = (value, max = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
var cleanLong = (value, max = 4e3) => String(value ?? "").trim().slice(0, max);
var dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}
function createId(prefix = "item") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
var TEMPLATES = {
  blank: {
    name: "Start from scratch",
    eyebrow: "Open canvas",
    prompt: "What decision are you facing?",
    options: ["Option A", "Option B"],
    criteria: [
      ["Expected impact", 30],
      ["Practical fit", 25],
      ["Cost and effort", 20],
      ["Reversibility", 15],
      ["Personal alignment", 10]
    ]
  },
  career: {
    name: "Career move",
    eyebrow: "Work & growth",
    prompt: "Which career path should I choose?",
    options: ["New opportunity", "Current path"],
    criteria: [
      ["Learning and growth", 30],
      ["Role fit", 25],
      ["Total reward", 20],
      ["People and culture", 15],
      ["Life flexibility", 10]
    ]
  },
  purchase: {
    name: "Major purchase",
    eyebrow: "Spend deliberately",
    prompt: "Which option gives me the best long-term value?",
    options: ["Leading option", "Alternative"],
    criteria: [
      ["Real-world fit", 30],
      ["Long-term value", 25],
      ["Reliability", 20],
      ["Upfront cost", 15],
      ["Resale or exit", 10]
    ]
  },
  move: {
    name: "Where to live",
    eyebrow: "Place & lifestyle",
    prompt: "Where should I live next?",
    options: ["Location A", "Location B"],
    criteria: [
      ["Quality of daily life", 30],
      ["Opportunity", 25],
      ["Affordability", 20],
      ["Community", 15],
      ["Access and mobility", 10]
    ]
  },
  venture: {
    name: "Startup idea",
    eyebrow: "Build or pass",
    prompt: "Which opportunity should we pursue?",
    options: ["Idea A", "Idea B"],
    criteria: [
      ["Problem strength", 25],
      ["Distribution advantage", 25],
      ["Ability to execute", 20],
      ["Economic potential", 20],
      ["Learning value", 10]
    ]
  },
  hire: {
    name: "Hiring choice",
    eyebrow: "People decision",
    prompt: "Who is the strongest fit for this role?",
    options: ["Candidate A", "Candidate B"],
    criteria: [
      ["Role evidence", 30],
      ["Problem-solving", 25],
      ["Team contribution", 20],
      ["Growth capacity", 15],
      ["Practical constraints", 10]
    ]
  }
};
function createDecision(input = {}, now = /* @__PURE__ */ new Date()) {
  const template = TEMPLATES[input.template] || TEMPLATES.blank;
  const id = createId("decision");
  const options = template.options.map((name) => ({ id: createId("option"), name, notes: "" }));
  const criteria = template.criteria.map(([name, weight]) => ({
    id: createId("criterion"),
    name,
    weight,
    description: ""
  }));
  const ratings = Object.fromEntries(options.map((option) => [
    option.id,
    Object.fromEntries(criteria.map((criterion) => [criterion.id, 3]))
  ]));
  const evidence = Object.fromEntries(options.map((option) => [
    option.id,
    Object.fromEntries(criteria.map((criterion) => [criterion.id, ""]))
  ]));
  const timestamp = now.toISOString();
  return {
    id,
    title: clean(input.title || template.prompt, 140),
    context: cleanLong(input.context, 2400),
    mode: input.mode === "quick" ? "quick" : "deep",
    template: Object.hasOwn(TEMPLATES, input.template) ? input.template : "blank",
    status: "draft",
    deadline: clean(input.deadline, 20),
    createdAt: timestamp,
    updatedAt: timestamp,
    options,
    criteria,
    ratings,
    evidence,
    assumptions: [],
    risks: [],
    analyses: [],
    coach: [],
    premortem: [],
    draftMeta: null,
    commitSuggestion: null,
    commitment: null,
    outcome: null
  };
}
function normalizeDecision(raw, now = /* @__PURE__ */ new Date()) {
  if (!raw || typeof raw !== "object") return null;
  const fallback = createDecision({ title: raw.title || "Untitled decision" }, now);
  const options = Array.isArray(raw.options) ? raw.options.slice(0, MAX_OPTIONS).map((option, index) => ({
    id: clean(option?.id, 100) || `option-${index + 1}`,
    name: clean(option?.name, 100) || `Option ${index + 1}`,
    notes: cleanLong(option?.notes, 1800)
  })) : fallback.options;
  while (options.length < 2) options.push({ id: createId("option"), name: `Option ${options.length + 1}`, notes: "" });
  const criteria = Array.isArray(raw.criteria) ? raw.criteria.slice(0, MAX_CRITERIA).map((criterion, index) => ({
    id: clean(criterion?.id, 100) || `criterion-${index + 1}`,
    name: clean(criterion?.name, 100) || `Criterion ${index + 1}`,
    weight: clamp(criterion?.weight ?? 10, 1, 100),
    description: clean(criterion?.description, 300)
  })) : fallback.criteria;
  while (criteria.length < 2) criteria.push({ id: createId("criterion"), name: `Criterion ${criteria.length + 1}`, weight: 10, description: "" });
  const ratings = {};
  const evidence = {};
  for (const option of options) {
    ratings[option.id] = {};
    evidence[option.id] = {};
    for (const criterion of criteria) {
      ratings[option.id][criterion.id] = clamp(raw.ratings?.[option.id]?.[criterion.id] ?? 3, 1, 5);
      evidence[option.id][criterion.id] = cleanLong(raw.evidence?.[option.id]?.[criterion.id], 800);
    }
  }
  const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.slice(0, 16).map((item) => ({
    id: clean(item?.id, 100) || createId("assumption"),
    text: clean(item?.text, 500),
    confidence: clamp(item?.confidence ?? 3, 1, 5),
    evidence: clean(item?.evidence, 600)
  })).filter((item) => item.text) : [];
  const risks = Array.isArray(raw.risks) ? raw.risks.slice(0, 16).map((item) => ({
    id: clean(item?.id, 100) || createId("risk"),
    optionId: options.some((option) => option.id === item?.optionId) ? item.optionId : options[0].id,
    text: clean(item?.text, 500),
    likelihood: clamp(item?.likelihood ?? 3, 1, 5),
    impact: clamp(item?.impact ?? 3, 1, 5),
    mitigation: clean(item?.mitigation, 600)
  })).filter((item) => item.text) : [];
  const analyses = Array.isArray(raw.analyses) ? raw.analyses.slice(-8).map(normalizeAnalysis).filter(Boolean) : [];
  const coach = Array.isArray(raw.coach) ? raw.coach.slice(-24).map((message) => ({
    id: clean(message?.id, 100) || createId("message"),
    role: message?.role === "assistant" ? "assistant" : "user",
    text: cleanLong(message?.text, message?.role === "assistant" ? 4e3 : 1200),
    source: message?.role === "assistant" && message?.source === "local" ? "local" : "anna",
    createdAt: clean(message?.createdAt, 40) || now.toISOString()
  })).filter((message) => message.text) : [];
  const premortem = Array.isArray(raw.premortem) ? raw.premortem.slice(0, MAX_PREMORTEM_ITEMS).map((item) => ({
    id: clean(item?.id, 100) || createId("premortem"),
    cause: clean(item?.cause, 500),
    warning: clean(item?.warning, 500),
    mitigation: clean(item?.mitigation, 600)
  })).filter((item) => item.cause || item.warning || item.mitigation) : [];
  const draftMeta = raw.draftMeta && typeof raw.draftMeta === "object" ? {
    source: raw.draftMeta.source === "anna" ? "anna" : "local",
    generatedAt: clean(raw.draftMeta.generatedAt, 40) || now.toISOString(),
    reasoning: cleanLong(raw.draftMeta.reasoning, 1200),
    clarifyingQuestions: Array.isArray(raw.draftMeta.clarifyingQuestions) ? raw.draftMeta.clarifyingQuestions.slice(0, 4).map((item) => clean(item, 500)).filter(Boolean) : [],
    status: ["ready", "refining", "fallback", "error"].includes(raw.draftMeta.status) ? raw.draftMeta.status : "ready"
  } : null;
  const optionIds = new Set(options.map((option) => option.id));
  const commitSuggestion = raw.commitSuggestion && optionIds.has(raw.commitSuggestion.optionId) ? {
    optionId: raw.commitSuggestion.optionId,
    confidence: clamp(raw.commitSuggestion.confidence ?? 3, 1, 5),
    rationale: cleanLong(raw.commitSuggestion.rationale, 1800),
    nextAction: clean(raw.commitSuggestion.nextAction, 500)
  } : null;
  const commitment = raw.commitment && optionIds.has(raw.commitment.optionId) ? {
    optionId: raw.commitment.optionId,
    confidence: clamp(raw.commitment.confidence ?? 3, 1, 5),
    rationale: cleanLong(raw.commitment.rationale, 1800),
    nextAction: clean(raw.commitment.nextAction, 500),
    reviewDate: clean(raw.commitment.reviewDate, 20),
    decidedAt: clean(raw.commitment.decidedAt, 40) || now.toISOString()
  } : null;
  const outcome = raw.outcome ? {
    result: cleanLong(raw.outcome.result, 1800),
    score: clamp(raw.outcome.score ?? 3, 1, 5),
    lesson: cleanLong(raw.outcome.lesson, 1400),
    reviewedAt: clean(raw.outcome.reviewedAt, 40) || now.toISOString()
  } : null;
  return {
    ...fallback,
    id: clean(raw.id, 100) || fallback.id,
    title: clean(raw.title, 140) || "Untitled decision",
    context: cleanLong(raw.context, 2400),
    mode: raw.mode === "quick" ? "quick" : "deep",
    template: Object.hasOwn(TEMPLATES, raw.template) ? raw.template : "blank",
    status: outcome ? "reviewed" : commitment ? "decided" : "draft",
    deadline: clean(raw.deadline, 20),
    createdAt: clean(raw.createdAt, 40) || fallback.createdAt,
    updatedAt: clean(raw.updatedAt, 40) || fallback.updatedAt,
    options,
    criteria,
    ratings,
    evidence,
    assumptions,
    risks,
    analyses,
    coach,
    premortem,
    draftMeta,
    commitSuggestion,
    commitment,
    outcome
  };
}
function normalizeStore(raw) {
  const decisions = Array.isArray(raw?.decisions) ? raw.decisions.map((decision) => normalizeDecision(decision)).filter(Boolean).slice(0, MAX_DECISIONS) : [];
  return {
    version: STORE_VERSION,
    decisions,
    preferences: {
      reduceMotion: Boolean(raw?.preferences?.reduceMotion),
      compactMatrix: Boolean(raw?.preferences?.compactMatrix)
    }
  };
}
function inferredOptions(decision) {
  const title = clean(decision.title, 140).replace(/^\s*(should|shall|do)\s+(i|we)\s+/i, "").replace(/[?!.]+$/, "");
  const split = title.split(/\s+(?:or|versus|vs\.?|\/),?\s+/i).map((item) => clean(item, 100)).filter(Boolean);
  if (split.length >= 2) return split.slice(0, 3).map((item) => item.replace(/^whether\s+/i, ""));
  const byTemplate = {
    career: ["Accept the new opportunity", "Stay on the current path", "Negotiate a reversible trial"],
    purchase: ["Buy the leading option", "Choose the alternative", "Delay and test the need"],
    move: ["Move to the preferred location", "Stay where I am", "Run a short relocation experiment"],
    venture: ["Pursue the opportunity", "Keep the current focus", "Run a constrained pilot"],
    hire: ["Hire the leading candidate", "Continue the search", "Run a paid work sample"]
  };
  return byTemplate[decision.template] || ["Take the leading path", "Keep the current path", "Run a smaller reversible test"];
}
function inferredCriteria(decision) {
  const template = TEMPLATES[decision.template] || TEMPLATES.blank;
  return template.criteria.map(([name, weight], index) => ({
    name,
    weight,
    description: [
      "The outcome this decision is meant to improve.",
      "How well the option fits the real situation.",
      "The money, time, and effort required.",
      "How easily you can learn or change course.",
      "How well the choice fits your stated priorities."
    ][index] || "A factor that should be compared consistently."
  }));
}
function draftPremortem(options, criteria) {
  const top = criteria[0]?.name || "the most important criterion";
  const lead = options[0]?.name || "the leading option";
  return [
    { cause: `The ${top} benefit of ${lead} was overestimated.`, warning: "Early evidence is weaker than the score suggests.", mitigation: `Run one observable test of ${top} before making the commitment irreversible.` },
    { cause: "A non-negotiable constraint was treated as flexible.", warning: "A required condition is repeatedly deferred or explained away.", mitigation: "Write the constraint down and define a stop condition before proceeding." },
    { cause: "The decision ignored a credible third path.", warning: "The choice is framed as a forced either/or despite a pilot or hybrid.", mitigation: "Name one smaller, delayed, or negotiated option and score it explicitly." },
    { cause: "The execution cost arrives later than the visible benefit.", warning: "The first weeks require more time, money, or support than expected.", mitigation: "Estimate the first 30 days and secure one concrete support or exit route." },
    { cause: "New information is discounted because of sunk effort or emotion.", warning: "You defend the original choice more often than you update it.", mitigation: "Schedule a review date and decide in advance what evidence would change course." }
  ];
}
function buildFallbackDraft(decision, now = /* @__PURE__ */ new Date()) {
  const optionNames = inferredOptions(decision);
  const criteria = inferredCriteria(decision);
  const options = optionNames.map((name, optionIndex) => ({
    name,
    notes: optionIndex === 0 ? "AI-suggested starting point \u2014 verify the upside and constraints before relying on it." : "AI-suggested alternative \u2014 add the strongest evidence for and against this path."
  }));
  const ratings = {};
  const evidence = {};
  options.forEach((option, optionIndex) => {
    ratings[option.name] = {};
    evidence[option.name] = {};
    criteria.forEach((criterion, criterionIndex) => {
      const rating = Math.min(5, Math.max(1, 3 + (optionIndex === 0 ? criterionIndex === 0 ? 1 : 0 : optionIndex === 1 ? criterionIndex === 2 ? 1 : 0 : criterionIndex === 3 ? 1 : 0)));
      ratings[option.name][criterion.name] = rating;
      evidence[option.name][criterion.name] = `Draft hypothesis (${rating}/5): ${option.name} may be a ${rating >= 4 ? "strong" : rating <= 2 ? "weak" : "mixed"} fit for ${criterion.name}. Replace this with an observable fact.`;
    });
  });
  return {
    deadline: dateOnly(decision.deadline) || addDays(now, 30),
    options,
    criteria,
    ratings,
    evidence,
    assumptions: [
      { text: "The facts in the initial prompt are current and complete.", confidence: 3, evidence: "Confirm the most decision-critical fact before committing." },
      { text: "The leading option can deliver its main benefit without breaking a non-negotiable constraint.", confidence: 3, evidence: "Name the constraint and the evidence that would test it." },
      { text: "The criteria reflect what matters most over the decision horizon.", confidence: 3, evidence: "Ask which criterion you would defend if the option names were hidden." }
    ],
    risks: options.slice(0, 3).map((option, index) => ({ option: option.name, text: `${option.name} underdelivers on the highest-stakes constraint.`, likelihood: index === 0 ? 3 : 2, impact: 4, mitigation: "Run a small test and define a clear exit condition before scaling the choice." })),
    premortem: draftPremortem(options, criteria),
    clarifyingQuestions: decision.context ? ["Which fact in this context is least certain?", "What would make you change the current leading path?"] : ["What constraint is truly non-negotiable?", "What evidence would make you change the leading path?"],
    reasoning: "I turned the initial prompt into an editable first pass. The scores and notes are hypotheses, not facts; review the assumptions and replace each draft rationale with evidence from your situation.",
    commitSuggestion: { option: options[0]?.name, confidence: 3, rationale: `The first-pass comparison currently favors ${options[0]?.name || "the leading option"}, but the ranking is provisional until the highest-weighted criterion has direct evidence.`, nextAction: `Run one small test of ${criteria[0]?.name || "the top criterion"} before committing.` }
  };
}
function buildDecisionDraftPrompt(decision, now = /* @__PURE__ */ new Date()) {
  const fallback = buildFallbackDraft(decision, now);
  return [
    "You are the first-pass decision architect inside Decision Room AI.",
    "Turn the user's initial decision question and context into a useful, editable analysis instead of a blank worksheet.",
    "Propose 2\u20134 realistic options (include a pilot, hybrid, delay, or negotiated path when plausible), 3\u20136 criteria with weights that add to 100, initial 1\u20135 scores for every option/criterion, and a short reason for every score.",
    "Infer a review deadline only when the prompt does not provide one; if inferred, make clear it is a suggested date.",
    "Proactively surface assumptions, risks, overlooked trade-offs, 2\u20133 clarifying questions, and exactly five premortem causes with an early warning signal and mitigation.",
    "Also draft a conditional commit recommendation, confidence, rationale, and next action.",
    "Use only the supplied context; do not invent external facts. Return JSON only in this shape:",
    JSON.stringify({ deadline: "YYYY-MM-DD", options: [{ name: "", notes: "" }], criteria: [{ name: "", weight: 20, description: "" }], scores: [{ option: "", criterion: "", rating: 1, reasoning: "" }], assumptions: [{ text: "", confidence: 3, evidence: "" }], risks: [{ option: "", text: "", likelihood: 3, impact: 3, mitigation: "" }], premortem: [{ cause: "", warning: "", mitigation: "" }], clarifyingQuestions: [""], commitSuggestion: { option: "", confidence: 3, rationale: "", nextAction: "" }, reasoning: "" }),
    `TODAY: ${now.toISOString().slice(0, 10)}`,
    `DECISION QUESTION: ${decision.title}`,
    `CONTEXT: ${decision.context || "No additional context was supplied."}`,
    `STARTER SHAPE (use only as a fallback, improve it when the context supports doing so): ${JSON.stringify({ options: fallback.options.map((item) => item.name), criteria: fallback.criteria.map((item) => item.name) })}`
  ].join("\n\n");
}
function applyDecisionDraft(decision, raw, { source = "local", generatedAt = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const candidate = raw && typeof raw === "object" ? raw : {};
  const fallback = buildFallbackDraft(decision, new Date(generatedAt));
  const rawOptions = Array.isArray(candidate.options) ? candidate.options : fallback.options;
  const options = rawOptions.slice(0, MAX_OPTIONS).map((item, index) => ({ id: createId("option"), name: clean(item?.name, 100) || fallback.options[index]?.name || `Option ${index + 1}`, notes: cleanLong(item?.notes, 1800) || fallback.options[index]?.notes || "" }));
  while (options.length < 2) options.push({ id: createId("option"), name: fallback.options[options.length]?.name || `Option ${options.length + 1}`, notes: "AI-suggested alternative \u2014 verify before relying on it." });
  const rawCriteria = Array.isArray(candidate.criteria) ? candidate.criteria : fallback.criteria;
  const criteria = rawCriteria.slice(0, MAX_CRITERIA).map((item, index) => ({ id: createId("criterion"), name: clean(item?.name, 100) || fallback.criteria[index]?.name || `Criterion ${index + 1}`, weight: clamp(item?.weight ?? fallback.criteria[index]?.weight ?? 10, 1, 100), description: clean(item?.description, 300) || fallback.criteria[index]?.description || "A factor to compare consistently." }));
  while (criteria.length < 2) criteria.push({ id: createId("criterion"), name: fallback.criteria[criteria.length]?.name || `Criterion ${criteria.length + 1}`, weight: 10, description: "A factor to compare consistently." });
  const lookup = (collection, value, fallbackIndex) => {
    const key = clean(value, 100).toLowerCase();
    const index = collection.findIndex((item) => item.name.toLowerCase() === key);
    return collection[index >= 0 ? index : Math.min(fallbackIndex, collection.length - 1)];
  };
  const scoreItems = Array.isArray(candidate.scores) ? candidate.scores : [];
  const ratings = Object.fromEntries(options.map((option) => [option.id, Object.fromEntries(criteria.map((criterion) => [criterion.id, 3]))]));
  const evidence = Object.fromEntries(options.map((option) => [option.id, Object.fromEntries(criteria.map((criterion) => [criterion.id, "Draft hypothesis \u2014 replace with an observable fact."]))]));
  options.forEach((option, optionIndex) => criteria.forEach((criterion, criterionIndex) => {
    const item = scoreItems.find((entry) => lookup(options, entry?.option, optionIndex)?.name === option.name && lookup(criteria, entry?.criterion, criterionIndex)?.name === criterion.name);
    const fallbackRating = fallback.ratings[fallback.options[optionIndex]?.name]?.[fallback.criteria[criterionIndex]?.name] || 3;
    ratings[option.id][criterion.id] = clamp(item?.rating ?? fallbackRating, 1, 5);
    evidence[option.id][criterion.id] = cleanLong(item?.reasoning, 800) || `Draft hypothesis (${ratings[option.id][criterion.id]}/5): verify how ${option.name} fits ${criterion.name}.`;
  }));
  const assumptions = (Array.isArray(candidate.assumptions) ? candidate.assumptions : fallback.assumptions).slice(0, 16).map((item) => ({ id: createId("assumption"), text: clean(item?.text, 500), confidence: clamp(item?.confidence ?? 3, 1, 5), evidence: clean(item?.evidence, 600) })).filter((item) => item.text);
  const risks = (Array.isArray(candidate.risks) ? candidate.risks : fallback.risks).slice(0, 16).map((item, index) => ({ id: createId("risk"), optionId: lookup(options, item?.option, index)?.id || options[0].id, text: clean(item?.text, 500), likelihood: clamp(item?.likelihood ?? 3, 1, 5), impact: clamp(item?.impact ?? 3, 1, 5), mitigation: clean(item?.mitigation, 600) })).filter((item) => item.text);
  const premortem = (Array.isArray(candidate.premortem) ? candidate.premortem : fallback.premortem).slice(0, MAX_PREMORTEM_ITEMS).map((item) => ({ id: createId("premortem"), cause: clean(item?.cause, 500), warning: clean(item?.warning, 500), mitigation: clean(item?.mitigation, 600) })).filter((item) => item.cause || item.warning || item.mitigation);
  const leaderOption = lookup(options, candidate.commitSuggestion?.option, 0) || options[0];
  decision.options = options;
  decision.criteria = criteria;
  decision.ratings = ratings;
  decision.evidence = evidence;
  decision.deadline = dateOnly(candidate.deadline) || dateOnly(fallback.deadline);
  decision.assumptions = assumptions;
  decision.risks = risks;
  decision.premortem = premortem.length ? premortem : fallback.premortem;
  decision.commitSuggestion = {
    optionId: leaderOption.id,
    confidence: clamp(candidate.commitSuggestion?.confidence ?? 3, 1, 5),
    rationale: cleanLong(candidate.commitSuggestion?.rationale, 1800) || `The first-pass comparison currently favors ${leaderOption.name}, but the ranking is provisional until the highest-weighted criterion has direct evidence.`,
    nextAction: clean(candidate.commitSuggestion?.nextAction, 500) || `Run one small test of ${criteria[0].name} before committing.`
  };
  decision.draftMeta = {
    source: source === "anna" ? "anna" : "local",
    generatedAt,
    reasoning: cleanLong(candidate.reasoning, 1200) || fallback.reasoning,
    clarifyingQuestions: (Array.isArray(candidate.clarifyingQuestions) ? candidate.clarifyingQuestions : fallback.clarifyingQuestions).slice(0, 4).map((item) => clean(item, 500)).filter(Boolean),
    status: source === "anna" ? "ready" : "fallback"
  };
  return decision;
}
function compareInsight(decision) {
  const scores = calculateScores(decision);
  const leader = scores[0];
  const runnerUp = scores[1];
  const topCriterion = decision.criteria.slice().sort((a, b) => b.weight - a.weight)[0];
  const sensitivity = sensitivityAnalysis(decision);
  const strongest = leader?.contributions?.[0];
  return {
    headline: leader ? `${leader.name} leads the first-pass comparison.` : "Add options to compare the decision.",
    summary: leader ? `${leader.name} is ahead by ${runnerUp ? (leader.score - runnerUp.score).toFixed(1) : "0"} points. This is a directional read of the current inputs, not an objective verdict.` : "The room needs at least two named options before Anna can compare them.",
    reason: leader && strongest ? `The lead is carried most by ${strongest.name} (${strongest.rating}/5), contributing ${strongest.points.toFixed(1)} points to the current score.` : "Each rating contributes to the normalized score.",
    weight: topCriterion ? `${topCriterion.name} has the highest current weight (${topCriterion.weight}). A change here matters more than a small shift in a low-weight criterion.` : "Weights are normalized automatically.",
    sensitivity: sensitivity.stable ? "The current leader survives a practical \xB120-point weight test." : sensitivity.summary,
    evidence: leader ? `${leader.evidenceCoverage}% of the leader's rating cells have supporting notes.` : "Add evidence notes to make the comparison defensible."
  };
}
function calculateScores(decision) {
  if (!decision?.options?.length || !decision?.criteria?.length) return [];
  const totalWeight = decision.criteria.reduce((sum, criterion) => sum + clamp(criterion.weight, 1, 100), 0) || 1;
  return decision.options.map((option) => {
    const contributions = decision.criteria.map((criterion) => {
      const rating = clamp(decision.ratings?.[option.id]?.[criterion.id] ?? 3, 1, 5);
      const points = rating / 5 * (criterion.weight / totalWeight) * 100;
      return { criterionId: criterion.id, name: criterion.name, rating, points };
    });
    const score = contributions.reduce((sum, item) => sum + item.points, 0);
    const evidenceCount = decision.criteria.filter((criterion) => cleanLong(decision.evidence?.[option.id]?.[criterion.id]).length >= 8).length;
    return {
      optionId: option.id,
      name: option.name,
      score: Math.round(score * 10) / 10,
      evidenceCoverage: Math.round(evidenceCount / decision.criteria.length * 100),
      contributions: contributions.sort((a, b) => b.points - a.points)
    };
  }).sort((a, b) => b.score - a.score);
}
function confidenceLens(decision) {
  const scores = calculateScores(decision);
  const first = scores[0];
  const second = scores[1];
  const gap = first && second ? Math.round((first.score - second.score) * 10) / 10 : 0;
  const evidenceCoverage = scores.length ? Math.round(scores.reduce((sum, option) => sum + option.evidenceCoverage, 0) / scores.length) : 0;
  const assumptionConfidence = decision.assumptions.length ? Math.round(decision.assumptions.reduce((sum, item) => sum + item.confidence, 0) / (decision.assumptions.length * 5) * 100) : 50;
  const riskLoad = decision.risks.reduce((sum, risk) => sum + risk.likelihood * risk.impact, 0);
  const readiness = Math.round(clamp(
    evidenceCoverage * 0.45 + assumptionConfidence * 0.25 + Math.min(gap * 3, 30) - Math.min(riskLoad, 25) * 0.2 + 15,
    0,
    100
  ));
  let label = "Fragile";
  if (readiness >= 76) label = "Well supported";
  else if (readiness >= 56) label = "Promising";
  else if (readiness >= 36) label = "Still uncertain";
  return { readiness, label, gap, evidenceCoverage, assumptionConfidence, riskLoad, leader: first || null };
}
function sensitivityAnalysis(decision) {
  const base = calculateScores(decision);
  if (base.length < 2) return { stable: true, switches: [], summary: "Add at least two options to test sensitivity." };
  const leaderId = base[0].optionId;
  const switches = [];
  for (const criterion of decision.criteria) {
    for (const delta of [-20, -10, 10, 20]) {
      const clone = structuredClone(decision);
      const target = clone.criteria.find((item) => item.id === criterion.id);
      target.weight = clamp(target.weight + delta, 1, 100);
      const result = calculateScores(clone);
      if (result[0]?.optionId !== leaderId) {
        switches.push({
          criterionId: criterion.id,
          criterion: criterion.name,
          delta,
          newLeader: result[0].name,
          score: result[0].score
        });
        break;
      }
    }
  }
  const sorted = switches.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  return {
    stable: sorted.length === 0,
    switches: sorted,
    summary: sorted.length ? `${sorted[0].criterion} is the nearest weight change that could alter the current leader.` : "The current leader survives a \xB120 weight test across every criterion."
  };
}
function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = (value, max = 8) => Array.isArray(value) ? value.slice(0, max).map((item) => clean(item, 600)).filter(Boolean) : [];
  const premortem = Array.isArray(raw.premortem) ? raw.premortem.slice(0, MAX_PREMORTEM_ITEMS).map((item) => ({ cause: clean(item?.cause, 500), warning: clean(item?.warning, 500), mitigation: clean(item?.mitigation, 600) })).filter((item) => item.cause || item.warning || item.mitigation) : [];
  return {
    id: clean(raw.id, 100) || createId("analysis"),
    type: ["challenger", "premortem", "scenarios", "advisor"].includes(raw.type) ? raw.type : "advisor",
    source: raw.source === "local" ? "local" : "anna",
    createdAt: clean(raw.createdAt, 40) || (/* @__PURE__ */ new Date()).toISOString(),
    headline: clean(raw.headline, 220) || "A clearer view of the decision",
    summary: cleanLong(raw.summary, 1800),
    blindSpots: list(raw.blindSpots),
    questions: list(raw.questions),
    scenarios: list(raw.scenarios),
    experiments: list(raw.experiments),
    recommendation: cleanLong(raw.recommendation, 1200),
    caveat: cleanLong(raw.caveat, 700),
    premortem
  };
}
function buildFallbackAnalysis(decision, type = "advisor") {
  const scores = calculateScores(decision);
  const lens = confidenceLens(decision);
  const sensitivity = sensitivityAnalysis(decision);
  const leader = scores[0];
  const runnerUp = scores[1];
  const weakestEvidence = scores.slice().sort((a, b) => a.evidenceCoverage - b.evidenceCoverage)[0];
  const topCriterion = decision.criteria.slice().sort((a, b) => b.weight - a.weight)[0];
  const gapText = leader && runnerUp ? `${leader.name} leads ${runnerUp.name} by ${lens.gap} points` : "the current room does not yet have a comparable runner-up";
  const modeHeadlines = {
    challenger: lens.gap <= 3 ? "The current ranking is too close to carry the decision." : "The leader still depends on untested judgment.",
    premortem: "The most preventable failure is treating an assumption as evidence.",
    scenarios: "The ranking changes meaning when the important assumptions change.",
    advisor: "Reduce one important uncertainty before you commit."
  };
  const blindSpots = [];
  if (lens.evidenceCoverage < 60) blindSpots.push(`Only ${lens.evidenceCoverage}% of rating cells have supporting notes; the remaining scores are judgments without recorded evidence.`);
  if (!decision.assumptions.length) blindSpots.push("No assumptions are recorded, so the beliefs underneath the ratings are still hidden.");
  if (!decision.risks.length) blindSpots.push("No risks are recorded for the options, which makes downside comparisons incomplete.");
  if (decision.options.length === 2) blindSpots.push("The room contains only two options; a hybrid, delay, or small pilot may be missing.");
  if (!blindSpots.length) blindSpots.push(`The least-supported option is ${weakestEvidence?.name || "not yet identifiable"} at ${weakestEvidence?.evidenceCoverage || 0}% evidence coverage.`);
  return normalizeAnalysis({
    source: "local",
    type,
    headline: modeHeadlines[type] || modeHeadlines.advisor,
    summary: `${gapText}, with ${lens.evidenceCoverage}% average evidence coverage. This local fallback reads only the scores, notes, assumptions, and risks saved in this room.`,
    blindSpots,
    questions: [topCriterion ? `What observable evidence would justify the current ${topCriterion.name} ratings?` : "What fact would most change the current ranking?"],
    scenarios: [
      "Best case: the leading option delivers its highest-weighted benefits and the recorded risks remain manageable.",
      "Expected case: the trade-offs remain mixed and the decision depends on which uncertainty you test first.",
      "Difficult case: a low-confidence assumption fails and the most exposed option becomes harder to reverse."
    ],
    experiments: [
      topCriterion && leader ? `Run one small test that produces evidence for ${leader.name} on ${topCriterion.name}.` : "Add one evidence note to each option before rescoring.",
      sensitivity.stable ? "Ask what new fact\u2014not another weight adjustment\u2014could change the leader." : `Revisit ${sensitivity.switches[0]?.criterion || "the most sensitive criterion"}, because a practical weight change can alter the leader.`
    ],
    recommendation: leader ? `Treat ${leader.name} as a working hypothesis, not a verdict. Test the highest-impact uncertainty, record what you learn, and then rescore before committing.` : "Complete the option comparison, record evidence, and test one important uncertainty before committing.",
    caveat: "This fallback uses no external research and cannot verify the accuracy of the user-supplied ratings or notes.",
    premortem: type === "premortem" ? draftPremortem(decision.options, decision.criteria) : []
  });
}
function buildFallbackCoachResponse(decision, question) {
  const lens = confidenceLens(decision);
  const sensitivity = sensitivityAnalysis(decision);
  const leader = lens.leader?.name || "the current leader";
  const prompt = String(question || "").toLowerCase();
  const prefix = "Anna\u2019s live reply was unavailable, so this is a local read of the information already in your room.";
  if (prompt.includes("assumption")) {
    const lowest = decision.assumptions.slice().sort((a, b) => a.confidence - b.confidence)[0];
    return `${prefix}

${lowest ? `Test \u201C${lowest.text}\u201D first because it has the lowest recorded confidence (${lowest.confidence}/5).` : "Start by writing the belief that would most weaken the leading option if it proved false."} Choose one observable result that would raise or lower your confidence.`;
  }
  if (prompt.includes("revers")) {
    return `${prefix}

Make the next step smaller than the final commitment: run a time-boxed trial, request concrete evidence, or delay only long enough to test the highest-weighted criterion. The goal is to learn before the expensive part becomes irreversible.`;
  }
  if (prompt.includes("rational") || prompt.includes("bias")) {
    return `${prefix}

${leader} currently leads by ${lens.gap} points with ${lens.evidenceCoverage}% evidence coverage. Ask which rating you would defend differently if the option names were hidden; that is the first place to look for motivated reasoning.`;
  }
  if (prompt.includes("missing") || prompt.includes("option")) {
    return `${prefix}

Test whether the room is forcing a false either/or. Consider a pilot, a negotiated variant, a deliberate delay with a deadline, or a combination that preserves the strongest benefit of each option.`;
  }
  return `${prefix}

${leader} currently leads by ${lens.gap} points, and the room is ${sensitivity.stable ? "stable under the weight test" : "sensitive to at least one criterion weight"}. The most useful next move is to add evidence where coverage is weakest, then rescore and see whether the ranking survives.`;
}
function parseStructuredJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Anna returned analysis in an unreadable format.");
  return JSON.parse(cleaned.slice(first, last + 1));
}
function formatCoachResponse(text) {
  const raw = String(text || "").trim();
  if (!raw) return "I could not form a useful response from that result. Try asking one narrower question.";
  try {
    const parsed = parseStructuredJson(raw);
    const sections = [
      parsed.summary,
      parsed.recommendation,
      Array.isArray(parsed.questions) ? parsed.questions[0] : ""
    ].map((value) => cleanLong(value, 1600)).filter(Boolean);
    if (sections.length) return sections.join("\n\n").slice(0, 4e3);
  } catch {
  }
  return raw.slice(0, 4e3);
}
function buildAnalysisPrompt(decision, type) {
  const scores = calculateScores(decision);
  const analysisLabels = {
    challenger: "CHALLENGER \u2014 challenge framing, ratings, biases, and missing options",
    premortem: "PREMORTEM \u2014 imagine the chosen path failed and identify preventable causes",
    scenarios: "SCENARIOS \u2014 explore best, expected, and difficult futures without false precision",
    advisor: "ADVISOR \u2014 synthesize the evidence and propose reversible next steps"
  };
  const evidenceLines = [];
  for (const option of decision.options) {
    for (const criterion of decision.criteria) {
      const note = cleanLong(decision.evidence?.[option.id]?.[criterion.id], 500);
      if (note) evidenceLines.push(`- ${option.name} / ${criterion.name}: ${note}`);
    }
  }
  return `ANALYSIS MODE: ${analysisLabels[type] || analysisLabels.advisor}

DECISION
${decision.title}

CONTEXT
${decision.context || "No additional context provided."}

OPTIONS AND CURRENT SCORES
${scores.map((item) => `- ${item.name}: ${item.score}/100; evidence coverage ${item.evidenceCoverage}%`).join("\n")}

CRITERIA
${decision.criteria.map((item) => `- ${item.name}: weight ${item.weight}`).join("\n")}

EVIDENCE NOTES
${evidenceLines.join("\n") || "No evidence notes recorded yet."}

ASSUMPTIONS
${decision.assumptions.map((item) => `- ${item.text} (confidence ${item.confidence}/5)`).join("\n") || "None recorded."}

RISKS
${decision.risks.map((item) => `- ${item.text} (likelihood ${item.likelihood}/5, impact ${item.impact}/5)`).join("\n") || "None recorded."}

Return exactly one JSON object with this shape:
{
  "headline": "specific insight, not a generic title",
  "summary": "concise evidence-aware synthesis",
  "blindSpots": ["missing fact, bias, or assumption"],
  "questions": ["high-value question to answer next"],
  "scenarios": ["scenario and what would make it more likely"],
  "experiments": ["small reversible action that reduces uncertainty"],
  "recommendation": "conditional recommendation that names the evidence behind it",
  "caveat": "what the available information cannot establish",
  "premortem": [{"cause":"failure cause","warning":"early warning signal","mitigation":"preventive action"}]
}
For PREMORTEM mode, return exactly five premortem items. Use only the user's supplied decision data. Treat scores as subjective inputs, not facts. Never claim external research or certainty. Return JSON only.`;
}
function buildCoachPrompt(decision, question) {
  const scores = calculateScores(decision);
  const recentCoach = decision.coach.slice(-8).map((message) => `${message.role === "assistant" ? "COACH" : "USER"}: ${message.text}`).join("\n");
  return `ACTIVE DECISION
${decision.title}

CONTEXT
${decision.context || "No additional context provided."}

OPTIONS AND SCORES
${scores.map((item) => `- ${item.name}: ${item.score}/100, ${item.evidenceCoverage}% evidence coverage`).join("\n")}

CRITERIA
${decision.criteria.map((item) => `- ${item.name}: weight ${item.weight}`).join("\n")}

ASSUMPTIONS
${decision.assumptions.map((item) => `- ${item.text} (${item.confidence}/5 confidence)`).join("\n") || "None recorded."}

RISKS
${decision.risks.map((item) => `- ${item.text} (${item.likelihood}\xD7${item.impact})`).join("\n") || "None recorded."}

RECENT CONVERSATION
${recentCoach || "This is the first message."}

USER QUESTION
${cleanLong(question, 1200)}

Answer as a concise decision coach. Ground every specific observation in the supplied decision. Distinguish the user's evidence from your inference. Ask at most one sharp follow-up question. Do not claim external research, do not make the decision for the user, and do not output JSON.`;
}
function decisionProgress(decision) {
  let completed = 1;
  if (decision.options.length >= 2 && decision.options.every((option) => option.name.trim())) completed += 1;
  if (decision.criteria.length >= 2) completed += 1;
  if (calculateScores(decision).some((score) => score.evidenceCoverage > 0)) completed += 1;
  if (decision.analyses.length || decision.assumptions.length || decision.risks.length) completed += 1;
  if (decision.commitment) completed += 1;
  if (decision.outcome) completed += 1;
  return Math.round(completed / 7 * 100);
}
function duplicateDecision(decision, now = /* @__PURE__ */ new Date()) {
  const copy = normalizeDecision(structuredClone(decision), now);
  const ids = /* @__PURE__ */ new Map();
  copy.id = createId("decision");
  copy.title = `${copy.title} \u2014 copy`.slice(0, 140);
  copy.createdAt = now.toISOString();
  copy.updatedAt = copy.createdAt;
  copy.status = "draft";
  copy.commitment = null;
  copy.outcome = null;
  copy.analyses = [];
  copy.coach = [];
  copy.options = copy.options.map((option) => {
    const id = createId("option");
    ids.set(option.id, id);
    return { ...option, id };
  });
  const criterionIds = /* @__PURE__ */ new Map();
  copy.criteria = copy.criteria.map((criterion) => {
    const id = createId("criterion");
    criterionIds.set(criterion.id, id);
    return { ...criterion, id };
  });
  copy.ratings = {};
  copy.evidence = {};
  for (const oldOption of decision.options) {
    const newOptionId = ids.get(oldOption.id);
    copy.ratings[newOptionId] = {};
    copy.evidence[newOptionId] = {};
    for (const oldCriterion of decision.criteria) {
      const newCriterionId = criterionIds.get(oldCriterion.id);
      copy.ratings[newOptionId][newCriterionId] = decision.ratings?.[oldOption.id]?.[oldCriterion.id] ?? 3;
      copy.evidence[newOptionId][newCriterionId] = decision.evidence?.[oldOption.id]?.[oldCriterion.id] ?? "";
    }
  }
  if (copy.commitSuggestion) copy.commitSuggestion.optionId = ids.get(decision.commitSuggestion?.optionId) || copy.options[0].id;
  copy.assumptions = copy.assumptions.map((item) => ({ ...item, id: createId("assumption") }));
  copy.risks = copy.risks.map((item) => ({ ...item, id: createId("risk"), optionId: ids.get(item.optionId) || copy.options[0].id }));
  copy.premortem = copy.premortem.map((item) => ({ ...item, id: createId("premortem") }));
  return copy;
}

// src/icons.js
var paths = {
  home: '<path d="M4.75 10.5 12 4.75l7.25 5.75v8a.75.75 0 0 1-.75.75h-13a.75.75 0 0 1-.75-.75v-8Z"/><path d="M9.25 19.25v-5.5h5.5v5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  frame: '<path d="M7 3.75H4.5a.75.75 0 0 0-.75.75V7M17 3.75h2.5a.75.75 0 0 1 .75.75V7M7 20.25H4.5a.75.75 0 0 1-.75-.75V17M17 20.25h2.5a.75.75 0 0 0 .75-.75V17"/><path d="M8 12h8M12 8v8"/>',
  compare: '<path d="M5.25 19.25V11.5h3.5v7.75h-3.5ZM10.25 19.25V4.75h3.5v14.5h-3.5ZM15.25 19.25V8h3.5v11.25h-3.5Z"/>',
  challenge: '<path d="M12 3.5a6.5 6.5 0 0 0-3.92 11.68c.58.44.92 1.12.92 1.85v.22h6v-.22c0-.73.34-1.41.92-1.85A6.5 6.5 0 0 0 12 3.5Z"/><path d="M9.5 20.25h5M9 17.25h6M12 7v5l3 1.5"/>',
  commit: '<path d="m4.75 12.25 4.5 4.5 10-10"/>',
  review: '<path d="M20 11.5a8 8 0 1 1-2.35-5.65"/><path d="M20.25 4.5v5h-5M8.5 12h3.5V8.5M12 12l2.5 2.25"/>',
  settings: '<circle cx="12" cy="12" r="3.25"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3v-4h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5c.36.28.7.6 1 .98.24.31.38.7.4 1.12v.1h.9v4h-.9v.1c-.02.42-.16.81-.4 1.2Z"/>',
  arrow: '<path d="M5 12h13M13.5 6.5 19 12l-5.5 5.5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  more: '<circle cx="5" cy="12" r=".75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".75" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r=".75" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4.5 7h15M9 4.25h6M7 7l.75 13h8.5L17 7M9.5 10.25v6.5M14.5 10.25v6.5"/>',
  copy: '<rect x="8" y="8" width="11.5" height="11.5" rx="2"/><path d="M16 8V6.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  spark: '<path d="m12 3 .8 3.2a6.5 6.5 0 0 0 4.7 4.7l3.2.8-3.2.8a6.5 6.5 0 0 0-4.7 4.7L12 20.4l-.8-3.2a6.5 6.5 0 0 0-4.7-4.7l-3.2-.8 3.2-.8a6.5 6.5 0 0 0 4.7-4.7L12 3Z"/>',
  search: '<circle cx="10.75" cy="10.75" r="6.5"/><path d="m15.5 15.5 4.25 4.25"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3.75v11.5M7.5 11l4.5 4.5 4.5-4.5M4 20.25h16"/>',
  print: '<path d="M7 8V3.75h10V8M7 16.25H4.5a1 1 0 0 1-1-1V10a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v5.25a1 1 0 0 1-1 1H17"/><path d="M7 13.25h10v7H7z"/>',
  alert: '<path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.25v.25"/>'
};
function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

// src/platform.js
var LOCAL_KEY = `anna-preview:${STORE_KEY}`;
var STORAGE_PREFIX = "decision-room:v2";
var INDEX_KEY = `${STORAGE_PREFIX}:index`;
var STORAGE_VALUE_BUDGET = 22e4;
var decisionKey = (id, part) => `${STORAGE_PREFIX}:decision:${id}:${part}`;
function storageValue(response) {
  return response?.value ?? response?.result?.value ?? response?.result ?? response;
}
function serialized(value) {
  return JSON.stringify(value);
}
function boundedList(value) {
  const items = Array.isArray(value) ? [...value] : [];
  while (items.length && new TextEncoder().encode(serialized(items)).length > STORAGE_VALUE_BUDGET) items.shift();
  return items;
}
function splitDecision(decision) {
  const { analyses, coach, ...core } = decision;
  const parts = { core, analyses: boundedList(analyses), coach: boundedList(coach) };
  const coreSize = new TextEncoder().encode(serialized(core)).length;
  if (coreSize > STORAGE_VALUE_BUDGET) throw new Error("This decision is too large to sync safely. Export it, then shorten its longest evidence notes.");
  return parts;
}
function llmText(response) {
  return response?.content?.text || response?.result?.content?.text || response?.text || "";
}
var DecisionPlatform = class {
  constructor() {
    this.anna = null;
    this.connected = false;
    this.storageMode = "device";
    this.persistedIds = /* @__PURE__ */ new Set();
    this.fingerprints = /* @__PURE__ */ new Map();
    this.saveQueue = Promise.resolve();
  }
  async connect() {
    try {
      const { AnnaAppRuntime } = await import("/static/anna-apps/_sdk/latest/index.js");
      this.anna = await Promise.race([
        AnnaAppRuntime.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Anna host handshake timed out")), 2500))
      ]);
      this.connected = true;
      this.storageMode = "anna";
      await this.anna.window.set_title({ title: "Decision Room AI" });
      await this.anna.window.ready?.({});
    } catch {
      this.anna = null;
      this.connected = false;
      this.storageMode = "device";
    }
    return this;
  }
  async load() {
    if (this.anna?.storage?.get) {
      const index = storageValue(await this.anna.storage.get({ key: INDEX_KEY }));
      if (index?.storageVersion === 2 && Array.isArray(index.decisionIds)) {
        const decisions = (await Promise.all(index.decisionIds.map(async (id) => {
          const [core, analyses, coach] = await Promise.all([
            this.anna.storage.get({ key: decisionKey(id, "core") }).then(storageValue),
            this.anna.storage.get({ key: decisionKey(id, "analyses") }).then(storageValue),
            this.anna.storage.get({ key: decisionKey(id, "coach") }).then(storageValue)
          ]);
          if (!core || typeof core !== "object") return null;
          const parts = { core, analyses: Array.isArray(analyses) ? analyses : [], coach: Array.isArray(coach) ? coach : [] };
          for (const [part, value] of Object.entries(parts)) this.fingerprints.set(decisionKey(id, part), serialized(value));
          return { ...core, analyses: parts.analyses, coach: parts.coach };
        }))).filter(Boolean);
        this.persistedIds = new Set(index.decisionIds);
        this.fingerprints.set(INDEX_KEY, serialized(index));
        return normalizeStore({ version: index.version, preferences: index.preferences, decisions });
      }
      const legacy = storageValue(await this.anna.storage.get({ key: STORE_KEY }));
      const migrated = normalizeStore(legacy && typeof legacy === "object" ? legacy : {});
      if (migrated.decisions.length || legacy?.preferences) {
        await this.save(migrated);
        if (this.anna.storage.delete) await this.anna.storage.delete({ key: STORE_KEY }).catch(() => {
        });
      }
      return migrated;
    }
    try {
      return normalizeStore(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"));
    } catch {
      return normalizeStore({});
    }
  }
  async save(store) {
    const cleanStore = normalizeStore(store);
    this.saveQueue = this.saveQueue.catch(() => {
    }).then(() => this.saveClean(cleanStore));
    return this.saveQueue;
  }
  async saveClean(cleanStore) {
    if (this.anna?.storage?.set) {
      const nextIds = new Set(cleanStore.decisions.map((decision) => decision.id));
      for (const decision of cleanStore.decisions) {
        const parts = splitDecision(decision);
        for (const [part, value] of Object.entries(parts)) {
          const key = decisionKey(decision.id, part);
          const fingerprint = serialized(value);
          if (this.fingerprints.get(key) === fingerprint) continue;
          await this.anna.storage.set({ key, value });
          this.fingerprints.set(key, fingerprint);
        }
      }
      const index = {
        storageVersion: 2,
        version: cleanStore.version,
        decisionIds: cleanStore.decisions.map((decision) => decision.id),
        preferences: cleanStore.preferences
      };
      const indexFingerprint = serialized(index);
      if (this.fingerprints.get(INDEX_KEY) !== indexFingerprint) {
        await this.anna.storage.set({ key: INDEX_KEY, value: index });
        this.fingerprints.set(INDEX_KEY, indexFingerprint);
      }
      for (const id of this.persistedIds) {
        if (nextIds.has(id)) continue;
        for (const part of ["core", "analyses", "coach"]) {
          const key = decisionKey(id, part);
          if (this.anna.storage.delete) await this.anna.storage.delete({ key }).catch(() => {
          });
          this.fingerprints.delete(key);
        }
      }
      this.persistedIds = nextIds;
      return;
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cleanStore));
  }
  async clear() {
    await this.saveQueue.catch(() => {
    });
    if (this.anna?.storage?.delete) {
      for (const id of this.persistedIds) {
        for (const part of ["core", "analyses", "coach"]) await this.anna.storage.delete({ key: decisionKey(id, part) }).catch(() => {
        });
      }
      await this.anna.storage.delete({ key: INDEX_KEY }).catch(() => {
      });
      await this.anna.storage.delete({ key: STORE_KEY }).catch(() => {
      });
      this.persistedIds.clear();
      this.fingerprints.clear();
      return;
    }
    localStorage.removeItem(LOCAL_KEY);
  }
  async complete(request) {
    if (!this.anna?.llm?.complete) {
      throw new Error("Open Decision Room AI inside Anna to run AI analysis. Your scoring workspace still works in preview mode.");
    }
    const response = await this.anna.llm.complete(request, { timeoutMs: 18e4 });
    const text = llmText(response);
    if (!text) throw new Error("Anna returned an empty analysis. Please retry.");
    return text;
  }
};

// src/app.js
var app = document.getElementById("app");
var toastRegion = document.getElementById("toast-region");
var modalRoot = document.getElementById("modal-root");
var busyRoot = document.getElementById("busy-root");
var state = {
  platform: new DecisionPlatform(),
  store: normalizeStore({}),
  route: { name: "home" },
  query: "",
  filter: "all",
  selectedTemplate: "blank",
  aiBusy: false,
  draftBusy: false,
  coachBusy: false,
  coachDraft: "",
  saving: false,
  saveTimer: null
};
var escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
var attr = escapeHtml;
var shortDate = (value) => value ? new Intl.DateTimeFormat(void 0, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Not set";
var relativeDate = (value) => {
  if (!value) return "Not set";
  const days = Math.round((new Date(value).getTime() - Date.now()) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
};
function activeDecision() {
  return state.store.decisions.find((decision) => decision.id === state.route.id) || null;
}
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length || parts[0] === "home") return { name: "home" };
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "decision" && parts[1]) {
    return { name: "decision", id: parts[1], view: ["frame", "compare", "challenge", "coach", "commit", "review", "report"].includes(parts[2]) ? parts[2] : "frame" };
  }
  return { name: "home" };
}
function decisionUrl(decision, view = "frame") {
  return `#/decision/${encodeURIComponent(decision.id)}/${view}`;
}
function setSyncLabel(kind, text) {
  const node = document.getElementById("sync-label");
  if (!node) return;
  node.dataset.kind = kind;
  node.innerHTML = `<span class="sync-dot" aria-hidden="true"></span>${escapeHtml(text)}`;
}
function toast(message, tone = "default", duration = 4200) {
  const node = document.createElement("div");
  node.className = `toast toast--${tone}`;
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  node.innerHTML = `<span>${tone === "error" ? icon("alert") : icon("spark")}</span><p>${escapeHtml(message)}</p><button type="button" aria-label="Dismiss message">${icon("close")}</button>`;
  node.querySelector("button").addEventListener("click", () => node.remove());
  toastRegion.append(node);
  setTimeout(() => node.remove(), duration);
}
function showBusy(title, detail) {
  state.aiBusy = true;
  busyRoot.hidden = false;
  busyRoot.innerHTML = `<div class="busy-dialog" role="status" aria-live="polite">
    <div class="thinking-mark" aria-hidden="true"><span></span><span></span><span></span></div>
    <p class="eyebrow">Anna is thinking</p>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(detail)}</p>
  </div>`;
}
function hideBusy() {
  state.aiBusy = false;
  busyRoot.hidden = true;
  busyRoot.innerHTML = "";
}
function showConfirm({ title, message, confirmLabel = "Continue", destructive = false, onConfirm }) {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div>
    <section class="modal-shell" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-core">
        <button class="icon-control modal-close" type="button" data-action="close-modal" aria-label="Close">${icon("close")}</button>
        <p class="eyebrow">Please confirm</p>
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="button button--quiet" type="button" data-action="close-modal">Cancel</button>
          <button class="button ${destructive ? "button--danger" : "button--ink"}" type="button" id="modal-confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </section>`;
  const close = () => {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
  };
  modalRoot.querySelectorAll('[data-action="close-modal"]').forEach((node) => node.addEventListener("click", close));
  modalRoot.querySelector("#modal-confirm").addEventListener("click", async () => {
    close();
    await onConfirm?.();
  });
  modalRoot.querySelector("#modal-confirm").focus();
}
function touch(decision) {
  decision.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  scheduleSave();
}
function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 420);
  setSyncLabel("saving", "Saving changes");
}
async function saveNow() {
  clearTimeout(state.saveTimer);
  state.saving = true;
  try {
    await state.platform.save(state.store);
    setSyncLabel("ready", state.platform.storageMode === "anna" ? "Saved to Anna" : "Saved on this device");
  } catch (error) {
    setSyncLabel("error", "Changes not saved");
    toast(error?.message || "The latest change could not be saved.", "error", 6500);
  } finally {
    state.saving = false;
  }
}
function logoMarkup() {
  return `<svg class="brand-mark" viewBox="0 0 48 48" role="img" aria-label="Decision Room AI">
    <rect x="2" y="2" width="44" height="44" rx="15" fill="currentColor"/>
    <path d="M14 15.5h8.5c7 0 11.5 3.2 11.5 8.5s-4.5 8.5-11.5 8.5H14" fill="none" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="m24 18 6 6-6 6" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
function shell(content, decision = activeDecision()) {
  const isDecision = state.route.name === "decision" && decision;
  const routeView = state.route.view;
  const stages = decision ? [
    ["frame", "Frame", "frame"],
    ["compare", "Compare", "compare"],
    ["challenge", "Challenge", "challenge"],
    ["coach", "Coach", "spark"],
    ["commit", "Commit", "commit"],
    ["review", "Review", "review"]
  ] : [];
  const nav = isDecision ? stages.map(([view, label, iconName]) => `<a class="rail-link ${routeView === view ? "is-active" : ""}" href="${decisionUrl(decision, view)}" aria-current="${routeView === view ? "page" : "false"}">${icon(iconName)}<span>${label}</span></a>`).join("") : `
    <a class="rail-link ${state.route.name === "home" ? "is-active" : ""}" href="#/home">${icon("home")}<span>Decisions</span></a>
    <a class="rail-link ${state.route.name === "new" ? "is-active" : ""}" href="#/new">${icon("plus")}<span>New room</span></a>`;
  return `<div class="app-shell">
    <aside class="side-rail" aria-label="Primary navigation">
      <a class="brand-lockup" href="#/home" aria-label="Decision Room AI home">${logoMarkup()}<span><strong>Decision Room</strong><small>Think in the open.</small></span></a>
      ${isDecision ? `<a class="back-link" href="#/home">${icon("arrow", "icon--back")}<span>All decisions</span></a>` : ""}
      <nav class="rail-nav">${nav}</nav>
      <div class="rail-footer">
        <div class="sync-label" id="sync-label" data-kind="ready"><span class="sync-dot" aria-hidden="true"></span>${state.platform.storageMode === "anna" ? "Saved to Anna" : "Device preview"}</div>
        <a class="rail-link ${state.route.name === "settings" ? "is-active" : ""}" href="#/settings">${icon("settings")}<span>Settings</span></a>
      </div>
    </aside>
    <div class="mobile-bar">
      <a class="mobile-brand" href="#/home">${logoMarkup()}<span>Decision Room</span></a>
      <a class="icon-control" href="#/new" aria-label="Create a decision">${icon("plus")}</a>
    </div>
    <main id="workspace" class="workspace" tabindex="-1">${content}</main>
    ${isDecision ? `<nav class="mobile-stage-nav" aria-label="Decision stages">${stages.map(([view, label, iconName]) => `<a class="${routeView === view ? "is-active" : ""}" href="${decisionUrl(decision, view)}">${icon(iconName)}<span>${label}</span></a>`).join("")}</nav>` : ""}
  </div>`;
}
function progressRing(value) {
  const safe = Math.max(0, Math.min(100, value));
  return `<span class="progress-ring" style="--progress:${safe}" aria-label="${safe}% complete"><span>${safe}%</span></span>`;
}
function statusLabel(decision) {
  if (decision.status === "reviewed") return "Reviewed";
  if (decision.status === "decided") return "Committed";
  return "In progress";
}
function renderHome() {
  const all = state.store.decisions;
  const visible = all.filter((decision) => {
    const matchesQuery = !state.query || `${decision.title} ${decision.context}`.toLowerCase().includes(state.query.toLowerCase());
    const matchesFilter = state.filter === "all" || decision.status === state.filter;
    return matchesQuery && matchesFilter;
  });
  const open = all.filter((decision) => decision.status === "draft").length;
  const committed = all.filter((decision) => decision.status === "decided").length;
  const reviewed = all.filter((decision) => decision.status === "reviewed").length;
  const list = visible.length ? `<div class="decision-list">${visible.map((decision) => {
    const scores = calculateScores(decision);
    const chosen = decision.commitment ? decision.options.find((option) => option.id === decision.commitment.optionId) : null;
    return `<article class="decision-row reveal">
      <a class="decision-row__main" href="${decisionUrl(decision, decision.commitment ? "review" : "frame")}">
        <div class="decision-index">${String(all.indexOf(decision) + 1).padStart(2, "0")}</div>
        <div class="decision-copy"><span class="status-chip status-chip--${decision.status}">${statusLabel(decision)}</span><h2>${escapeHtml(decision.title)}</h2><p>${escapeHtml(decision.context || "Add context so the trade-offs become easier to test.")}</p></div>
        <div class="decision-result"><span>${chosen ? "Chosen" : scores[0] ? "Current lead" : "Unscored"}</span><strong>${escapeHtml(chosen?.name || scores[0]?.name || "\u2014")}</strong></div>
        ${progressRing(decisionProgress(decision))}
      </a>
      <button class="icon-control row-menu" type="button" data-action="decision-menu" data-id="${attr(decision.id)}" aria-label="More actions for ${attr(decision.title)}">${icon("more")}</button>
    </article>`;
  }).join("")}</div>` : `<div class="empty-state reveal">
      <div class="empty-glyph" aria-hidden="true">?</div>
      <h2>${all.length ? "No decisions match this view." : "Your first clear decision starts here."}</h2>
      <p>${all.length ? "Try another search or status filter." : "Give the choice a name. We\u2019ll help you expose the trade-offs without taking the decision away from you."}</p>
      <a class="button button--accent button--nested" href="#/new"><span>${all.length ? "Start a new room" : "Frame a decision"}</span><i>${icon("arrow")}</i></a>
    </div>`;
  return shell(`<div class="page page--home">
    <header class="home-hero reveal">
      <div><p class="eyebrow">Your decision practice</p><h1>Make the choice.<br><em>Understand why.</em></h1></div>
      <div class="hero-aside"><p>Move from instinct to a decision you can explain, act on, and learn from.</p><a class="button button--ink button--nested" href="#/new"><span>Open a new room</span><i>${icon("arrow")}</i></a></div>
    </header>
    <section class="signal-strip reveal" aria-label="Decision summary">
      <div><strong>${all.length}</strong><span>Total rooms</span></div><div><strong>${open}</strong><span>In progress</span></div><div><strong>${committed}</strong><span>Committed</span></div><div><strong>${reviewed}</strong><span>Reviewed</span></div>
    </section>
    <section class="library-section reveal">
      <div class="section-heading"><div><p class="eyebrow">Decision library</p><h2>Every choice, in context.</h2></div>
        <div class="library-tools"><label class="search-field">${icon("search")}<span class="sr-only">Search decisions</span><input id="decision-search" type="search" placeholder="Search" value="${attr(state.query)}"></label>
          <select id="decision-filter" aria-label="Filter decisions"><option value="all" ${state.filter === "all" ? "selected" : ""}>All status</option><option value="draft" ${state.filter === "draft" ? "selected" : ""}>In progress</option><option value="decided" ${state.filter === "decided" ? "selected" : ""}>Committed</option><option value="reviewed" ${state.filter === "reviewed" ? "selected" : ""}>Reviewed</option></select></div>
      </div>${list}
    </section>
  </div>`);
}
function templateIcon(key) {
  const marks = { blank: "?", career: "\u2197", purchase: "\u25C7", move: "\u2316", venture: "\u25B3", hire: "+1" };
  return marks[key] || "?";
}
function renderNew() {
  return shell(`<div class="page page--new">
    <header class="new-intro reveal"><a class="text-link" href="#/home">${icon("arrow", "icon--back")} Back to decisions</a><p class="eyebrow">Open a decision room</p><h1>First, name the<br><em>real choice.</em></h1><p>One clear question is enough. Compare the real options, ask Anna to challenge the evidence, then record a decision you can revisit.</p></header>
    <form id="new-decision-form" class="new-composer reveal">
      <fieldset class="template-fieldset"><legend>Choose a starting frame</legend><div class="template-grid">${Object.entries(TEMPLATES).map(([key, template]) => `<label class="template-choice ${state.selectedTemplate === key ? "is-selected" : ""}"><input type="radio" name="template" value="${key}" ${state.selectedTemplate === key ? "checked" : ""}><span class="template-mark">${templateIcon(key)}</span><span><small>${escapeHtml(template.eyebrow)}</small><strong>${escapeHtml(template.name)}</strong></span></label>`).join("")}</div></fieldset>
      <div class="composer-core">
        <label class="field field--hero"><span>What decision are you facing?</span><textarea name="title" id="new-title" rows="2" maxlength="140" required placeholder="${attr(TEMPLATES[state.selectedTemplate].prompt)}"></textarea><small class="field-guidance">Write it as one concrete choice. You can refine every detail inside the room.</small></label>
        <details class="composer-details">
          <summary><span><strong>Refine the setup</strong><small>Optional context, deadline, and depth</small></span>${icon("arrow")}</summary>
          <div class="composer-details__body">
            <label class="field"><span>What context should the room understand?</span><textarea name="context" rows="3" maxlength="2400" placeholder="What changed, what is at stake, and what constraints matter?"></textarea></label>
            <div class="composer-row"><fieldset class="mode-switch"><legend>Depth</legend><label><input type="radio" name="mode" value="quick" checked><span>Quick</span></label><label><input type="radio" name="mode" value="deep"><span>Deep</span></label></fieldset><label class="field field--date"><span>Decision date <small>Optional</small></span><input type="date" name="deadline"></label></div>
          </div>
        </details>
        <div class="composer-action"><p>Anna will turn this prompt into an editable first draft of options, criteria, scores, and the questions worth answering.</p><button class="button button--accent button--nested" type="submit"><span>Enter the room \xB7 build first draft</span><i>${icon("arrow")}</i></button></div>
      </div>
    </form>
  </div>`);
}
function stageHeader(decision, view, eyebrow, title, description) {
  const progress = decisionProgress(decision);
  return `<header class="stage-header reveal">
    <div class="stage-heading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${title}</h1><p>${escapeHtml(description)}</p></div>
    <div class="stage-meta"><span>${statusLabel(decision)}</span>${progressRing(progress)}<button class="icon-control" type="button" data-action="decision-menu" data-id="${attr(decision.id)}" aria-label="Decision actions">${icon("more")}</button></div>
  </header>
  <nav class="stage-tabs reveal" aria-label="Decision workflow">
    ${[["frame", "01", "Frame"], ["compare", "02", "Compare"], ["challenge", "03", "Challenge"], ["coach", "04", "Coach"], ["commit", "05", "Commit"], ["review", "06", "Review"]].map(([key, number, label]) => `<a class="${view === key ? "is-active" : ""}" href="${decisionUrl(decision, key)}"><small>${number}</small><span>${label}</span></a>`).join("")}
  </nav>`;
}
function draftStudio(decision) {
  const meta = decision.draftMeta;
  if (!meta) return "";
  const source = meta.source === "anna" ? "Anna first draft" : "Starter draft \xB7 ready to refine";
  const status = state.draftBusy ? "Anna is refining this room\u2026" : source;
  return `<section class="draft-studio reveal" aria-labelledby="draft-studio-title">
    <div class="draft-studio__mark">${icon("spark")}</div>
    <div class="draft-studio__copy"><p class="eyebrow">${escapeHtml(status)}</p><h2 id="draft-studio-title">A working analysis, not a blank worksheet.</h2><p>${escapeHtml(meta.reasoning || "Review Anna's suggestions, then correct anything that does not match your situation.")}</p>
      <div class="draft-facts"><span><strong>${decision.options.length}</strong> options</span><span><strong>${decision.criteria.length}</strong> criteria</span><span><strong>${decision.premortem.length || 5}</strong> premortem causes</span><span><strong>${decision.deadline ? shortDate(decision.deadline) : "Not set"}</strong> review date</span></div>
      ${meta.clarifyingQuestions?.length ? `<div class="draft-questions"><strong>Questions to tighten the draft</strong><ul>${meta.clarifyingQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul></div>` : ""}
    </div><button class="button button--quiet" type="button" data-action="refine-draft" ${state.draftBusy ? "disabled" : ""}>${icon("spark")} ${meta.source === "anna" ? "Refresh with Anna" : "Refine with Anna"}</button>
  </section>`;
}
function renderFrame(decision) {
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "frame", "01 \xB7 Frame", "Name what is\nreally at stake.", "A strong decision begins with a precise question, credible options, and criteria that reflect your real priorities.")}
    ${draftStudio(decision)}
    <section class="frame-layout reveal">
      <div class="paper-shell paper-shell--large"><div class="paper-core">
        <div class="section-heading"><div><p class="eyebrow">Decision statement</p><h2>The question</h2></div><span class="mode-badge">${decision.mode === "quick" ? "Quick room" : "Deep room"}</span></div>
        <label class="field field--hero"><span>Decision</span><textarea data-decision-field="title" maxlength="140" rows="2">${escapeHtml(decision.title)}</textarea></label>
        <label class="field"><span>Context</span><textarea data-decision-field="context" maxlength="2400" rows="5" placeholder="What changed, what is at stake, and what would a good outcome look like?">${escapeHtml(decision.context)}</textarea></label>
        <label class="field field--date"><span>Decision date <small>Optional</small></span><input data-decision-field="deadline" type="date" value="${attr(decision.deadline)}"></label>
      </div></div>
      <aside class="frame-note"><span class="note-number">01</span><p>Write the choice so a thoughtful outsider could understand it in one reading.</p><blockquote>\u201CWhich path best serves the next twelve months?\u201D is stronger than \u201CWhat should I do?\u201D</blockquote></aside>
    </section>
    <section class="editorial-section reveal">
      <div class="section-heading"><div><p class="eyebrow">The field</p><h2>Options on the table.</h2></div><button class="button button--quiet" type="button" data-action="add-option" ${decision.options.length >= MAX_OPTIONS ? "disabled" : ""}>${icon("plus")} Add option</button></div>
      <div class="option-stack">${decision.options.map((option, index) => `<article class="option-editor">
        <span class="option-ordinal">${String(index + 1).padStart(2, "0")}</span>
        <div><label class="field field--bare"><span>Option name</span><input data-option-field="name" data-option-id="${attr(option.id)}" maxlength="100" value="${attr(option.name)}"></label><label class="field field--bare"><span>Notes</span><textarea data-option-field="notes" data-option-id="${attr(option.id)}" maxlength="1800" rows="2" placeholder="What makes this option distinct?">${escapeHtml(option.notes)}</textarea></label></div>
        <button class="icon-control" type="button" data-action="remove-option" data-id="${attr(option.id)}" aria-label="Remove ${attr(option.name)}" ${decision.options.length <= 2 ? "disabled" : ""}>${icon("trash")}</button>
      </article>`).join("")}</div>
    </section>
    <section class="editorial-section reveal">
      <div class="section-heading"><div><p class="eyebrow">What matters</p><h2>Weight the criteria.</h2><p>Weights do not need to total 100; the room normalizes them automatically.</p></div><button class="button button--quiet" type="button" data-action="add-criterion" ${decision.criteria.length >= MAX_CRITERIA ? "disabled" : ""}>${icon("plus")} Add criterion</button></div>
      <div class="criteria-list">${decision.criteria.map((criterion, index) => `<article class="criterion-editor">
        <span class="criterion-index">C${index + 1}</span>
        <label class="field field--bare"><span>Criterion</span><input data-criterion-field="name" data-criterion-id="${attr(criterion.id)}" maxlength="100" value="${attr(criterion.name)}"></label>
        <label class="weight-control"><span>Importance</span><input type="range" min="1" max="100" data-criterion-field="weight" data-criterion-id="${attr(criterion.id)}" value="${criterion.weight}"><output>${criterion.weight}</output></label>
        <button class="icon-control" type="button" data-action="remove-criterion" data-id="${attr(criterion.id)}" aria-label="Remove ${attr(criterion.name)}" ${decision.criteria.length <= 2 ? "disabled" : ""}>${icon("trash")}</button>
      </article>`).join("")}</div>
      <div class="stage-continue"><p>Next, score every option against the same yardstick.</p><a class="button button--ink button--nested" href="${decisionUrl(decision, "compare")}"><span>Compare options</span><i>${icon("arrow")}</i></a></div>
    </section>
  </div>`, decision);
}
function scoreSummary(decision) {
  const scores = calculateScores(decision);
  if (!scores.length) return "";
  return `<div class="score-summary" id="score-summary">${scores.map((score, index) => `<article class="score-bar ${index === 0 ? "is-leading" : ""}">
    <div><span>${index === 0 ? "Current lead" : `Rank ${index + 1}`}</span><h3>${escapeHtml(score.name)}</h3></div>
    <div class="score-meter"><span style="transform:scaleX(${score.score / 100})"></span></div>
    <strong>${score.score}<small>/100</small></strong>
  </article>`).join("")}</div>`;
}
function renderCompare(decision) {
  const scores = calculateScores(decision);
  const sensitivity = sensitivityAnalysis(decision);
  const insight = compareInsight(decision);
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "compare", "02 \xB7 Compare", "Make the trade-offs\nvisible.", "Score consistently, record the evidence behind each rating, and notice where a small assumption changes the leader.")}
    <section class="compare-ai reveal" aria-labelledby="compare-ai-title"><div class="compare-ai__head"><span class="ai-spark">${icon("spark")}</span><div><p class="eyebrow">${decision.draftMeta?.source === "anna" ? "Anna analysis" : "AI first-pass analysis"}</p><h2 id="compare-ai-title">${escapeHtml(insight.headline)}</h2></div><span class="draft-chip">Editable suggestion</span></div><p>${escapeHtml(insight.summary)}</p><div class="compare-ai__signals"><div><span>Why it leads</span><strong>${escapeHtml(insight.reason)}</strong></div><div><span>Most influential</span><strong>${escapeHtml(insight.weight)}</strong></div><div><span>Stability</span><strong>${escapeHtml(insight.sensitivity)}</strong></div><div><span>Evidence</span><strong>${escapeHtml(insight.evidence)}</strong></div></div></section>
    <section class="compare-lead reveal"><div><p class="eyebrow">Live ranking</p><h2>Clarity, not false precision.</h2><p>The matrix converts your inputs into a comparable 0\u2013100 view. It does not turn judgment into fact.</p></div>${scoreSummary(decision)}</section>
    <section class="matrix-section reveal">
      <div class="section-heading"><div><p class="eyebrow">Comparison matrix</p><h2>Score each fit from 1 to 5.</h2></div><div class="scale-key"><span>1 \xB7 Poor fit</span><span>3 \xB7 Mixed</span><span>5 \xB7 Strong fit</span></div></div>
      <div class="matrix-scroll"><table class="decision-matrix"><thead><tr><th scope="col">Criterion <small>Weight</small></th>${decision.options.map((option) => `<th scope="col">${escapeHtml(option.name)}</th>`).join("")}</tr></thead><tbody>${decision.criteria.map((criterion) => `<tr><th scope="row"><strong>${escapeHtml(criterion.name)}</strong><span>${criterion.weight} weight</span></th>${decision.options.map((option) => {
    const rating = decision.ratings[option.id][criterion.id];
    return `<td><label class="rating-control"><span class="sr-only">${attr(option.name)} score for ${attr(criterion.name)}</span><output data-rating-value="${attr(option.id)}:${attr(criterion.id)}">${rating}</output><input type="range" min="1" max="5" step="1" value="${rating}" data-rating data-option-id="${attr(option.id)}" data-criterion-id="${attr(criterion.id)}"></label></td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>
    </section>
    <section class="sensitivity-strip reveal">
      <div class="sensitivity-mark" aria-hidden="true">\xB1</div>
      <div><p class="eyebrow">Sensitivity check</p><h2>${sensitivity.stable ? "The ranking is stable under a practical weight test." : escapeHtml(sensitivity.summary)}</h2><p>${sensitivity.stable ? "No single criterion changed the leader when its weight moved up or down by as much as 20 points." : `If ${sensitivity.switches[0].criterion} moved ${sensitivity.switches[0].delta > 0 ? "up" : "down"} by ${Math.abs(sensitivity.switches[0].delta)} weight points, ${sensitivity.switches[0].newLeader} would lead.`}</p></div>
      <span class="stability-chip ${sensitivity.stable ? "is-stable" : ""}">${sensitivity.stable ? "Stable" : "Sensitive"}</span>
    </section>
    <section class="evidence-section reveal">
      <div class="section-heading"><div><p class="eyebrow">Evidence notes</p><h2>Write down what the scores mean.</h2><p>Specific evidence makes the matrix useful when confidence fades later.</p></div></div>
      <div class="evidence-columns">${decision.options.map((option) => `<article class="paper-shell"><div class="paper-core"><h3>${escapeHtml(option.name)}</h3>${decision.criteria.map((criterion) => `<label class="field field--evidence"><span>${escapeHtml(criterion.name)}</span><textarea data-evidence data-option-id="${attr(option.id)}" data-criterion-id="${attr(criterion.id)}" rows="2" maxlength="800" placeholder="Replace Anna's draft rationale with evidence">${escapeHtml(decision.evidence[option.id][criterion.id])}</textarea></label>`).join("")}</div></article>`).join("")}</div>
      <div class="stage-continue"><p>${scores[0] ? `${escapeHtml(scores[0].name)} currently leads by ${scores[1] ? (scores[0].score - scores[1].score).toFixed(1) : "0"} points.` : "Complete the matrix to see a ranking."}</p><a class="button button--ink button--nested" href="${decisionUrl(decision, "challenge")}"><span>Challenge the result</span><i>${icon("arrow")}</i></a></div>
    </section>
  </div>`, decision);
}
function analysisCard(analysis) {
  const sections = [
    ["Blind spots", analysis.blindSpots],
    ["Questions worth answering", analysis.questions],
    ["Possible futures", analysis.scenarios],
    ["Reversible experiments", analysis.experiments]
  ].filter(([, items]) => items.length);
  return `<article class="analysis-sheet reveal">
    <header><div><span class="analysis-type">${escapeHtml(analysis.type)} \xB7 ${analysis.source === "local" ? "Local fallback" : "Anna"}</span><h2>${escapeHtml(analysis.headline)}</h2></div><time>${shortDate(analysis.createdAt)}</time></header>
    <p class="analysis-summary">${escapeHtml(analysis.summary)}</p>
    <div class="analysis-grid">${sections.map(([title, items]) => `<section><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`).join("")}</div>
    ${analysis.premortem?.length ? `<div class="analysis-premortem"><h3>Premortem causes</h3>${analysis.premortem.map((item, index) => `<div><strong>${String(index + 1).padStart(2, "0")}. ${escapeHtml(item.cause)}</strong><span><b>Signal:</b> ${escapeHtml(item.warning)}</span><span><b>Mitigation:</b> ${escapeHtml(item.mitigation)}</span></div>`).join("")}</div>` : ""}
    ${analysis.recommendation ? `<blockquote><span>Conditional recommendation</span><p>${escapeHtml(analysis.recommendation)}</p></blockquote>` : ""}
    ${analysis.caveat ? `<p class="analysis-caveat"><strong>What this cannot establish:</strong> ${escapeHtml(analysis.caveat)}</p>` : ""}
  </article>`;
}
function renderChallenge(decision) {
  const lens = confidenceLens(decision);
  const latest = decision.analyses.at(-1);
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "challenge", "03 \xB7 Challenge", "Look for what the\nmatrix cannot see.", "Pressure-test the framing, assumptions, and failure modes before a tidy score becomes an excuse to stop thinking.")}
    <section class="lens-layout reveal">
      <div class="readiness-orbit" style="--readiness:${lens.readiness}"><div><strong>${lens.readiness}</strong><span>readiness</span></div></div>
      <div class="lens-copy"><p class="eyebrow">Decision readiness</p><h2>${escapeHtml(lens.label)}</h2><p>Readiness blends evidence coverage, score separation, assumption confidence, and recorded risk. It measures preparation\u2014not whether a choice is objectively correct.</p></div>
      <dl class="lens-signals"><div><dt>Score gap</dt><dd>${lens.gap} pts</dd></div><div><dt>Evidence coverage</dt><dd>${lens.evidenceCoverage}%</dd></div><div><dt>Assumption confidence</dt><dd>${lens.assumptionConfidence}%</dd></div></dl>
    </section>
    <section class="register-layout reveal">
      <div class="register-column"><div class="section-heading"><div><p class="eyebrow">Assumptions</p><h2>What must be true?</h2></div><button class="button button--quiet" type="button" data-action="add-assumption">${icon("plus")} Add</button></div>
        <div class="register-list">${decision.assumptions.length ? decision.assumptions.map((item, index) => `<article class="register-item"><span>${String(index + 1).padStart(2, "0")}</span><div><label class="field field--bare"><span>Assumption</span><input data-assumption-field="text" data-id="${attr(item.id)}" maxlength="500" value="${attr(item.text)}"></label><label class="compact-range"><span>Confidence</span><input type="range" min="1" max="5" value="${item.confidence}" data-assumption-field="confidence" data-id="${attr(item.id)}"><output>${item.confidence}/5</output></label></div><button class="icon-control" type="button" data-action="remove-assumption" data-id="${attr(item.id)}" aria-label="Remove assumption">${icon("trash")}</button></article>`).join("") : `<p class="register-empty">No assumptions recorded yet. Add the belief that would hurt most if it proved false.</p>`}</div>
      </div>
      <div class="register-column"><div class="section-heading"><div><p class="eyebrow">Risks</p><h2>What could derail it?</h2></div><button class="button button--quiet" type="button" data-action="add-risk">${icon("plus")} Add</button></div>
        <div class="register-list">${decision.risks.length ? decision.risks.map((item, index) => `<article class="register-item"><span>R${index + 1}</span><div><label class="field field--bare"><span>Risk</span><input data-risk-field="text" data-id="${attr(item.id)}" maxlength="500" value="${attr(item.text)}"></label><div class="risk-row"><label><span>For</span><select data-risk-field="optionId" data-id="${attr(item.id)}">${decision.options.map((option) => `<option value="${attr(option.id)}" ${option.id === item.optionId ? "selected" : ""}>${escapeHtml(option.name)}</option>`).join("")}</select></label><label><span>Likelihood</span><input type="number" min="1" max="5" data-risk-field="likelihood" data-id="${attr(item.id)}" value="${item.likelihood}"></label><label><span>Impact</span><input type="number" min="1" max="5" data-risk-field="impact" data-id="${attr(item.id)}" value="${item.impact}"></label></div></div><button class="icon-control" type="button" data-action="remove-risk" data-id="${attr(item.id)}" aria-label="Remove risk">${icon("trash")}</button></article>`).join("") : `<p class="register-empty">No risks recorded yet. Start with the most plausible way the leading option disappoints.</p>`}</div>
      </div>
    </section>
    <section class="premortem-panel reveal" aria-labelledby="premortem-title"><div class="section-heading"><div><p class="eyebrow">AI premortem</p><h2 id="premortem-title">If this decision fails, we want to see it early.</h2><p>Five preventable failure modes, with a signal to watch and a mitigation to test. Edit the assumptions above as your context improves.</p></div><span class="analysis-count">${decision.premortem.length || 0} / 5 causes</span></div><div class="premortem-list">${decision.premortem.length ? decision.premortem.map((item, index) => `<article class="premortem-item"><span class="premortem-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.cause)}</h3><dl><div><dt>Early signal</dt><dd>${escapeHtml(item.warning || "Watch for evidence that this assumption is weakening.")}</dd></div><div><dt>Mitigation</dt><dd>${escapeHtml(item.mitigation || "Define a small test before committing.")}</dd></div></dl></div></article>`).join("") : `<p class="register-empty">Run the premortem lens to generate five failure causes, warning signals, and mitigations.</p>`}</div></section>
    <section class="ai-studio reveal">
      <div class="ai-studio__intro"><p class="eyebrow">Anna thinking studio</p><h2>Invite a useful disagreement.</h2><p>Choose a lens. Anna receives only this decision\u2019s current context and returns a structured advisory note. It cannot alter your scores or commit for you.</p></div>
      <div class="analysis-actions">${[["challenger", "Challenge my thinking", "Find bias, missing options, and weak evidence."], ["premortem", "Run a premortem", "Imagine failure and expose preventable causes."], ["scenarios", "Explore scenarios", "Map best, expected, and difficult futures."], ["advisor", "Synthesize next steps", "Turn uncertainty into reversible experiments."]].map(([type, title, text]) => `<button class="analysis-action" type="button" data-action="run-analysis" data-type="${type}" ${state.aiBusy ? "disabled" : ""}><span>${icon("spark")}</span><strong>${title}</strong><small>${text}</small>${icon("arrow")}</button>`).join("")}</div>
    </section>
    ${latest ? `<section class="latest-analysis"><div class="section-heading"><div><p class="eyebrow">Latest analysis</p><h2>A second perspective.</h2></div>${decision.analyses.length > 1 ? `<span class="analysis-count">${decision.analyses.length} saved analyses</span>` : ""}</div>${analysisCard(latest)}</section>` : `<section class="analysis-empty reveal"><span>${icon("spark")}</span><div><h2>No AI analysis yet.</h2><p>Your deterministic readiness lens is already active. Run an Anna lens when you want a structured second opinion.</p></div></section>`}
    <div class="stage-continue reveal"><p>You still own the decision. Ask the Coach about any tension, or move directly to commitment.</p><div class="button-row"><a class="button button--quiet" href="${decisionUrl(decision, "coach")}">${icon("spark")} Ask the Coach</a><a class="button button--ink button--nested" href="${decisionUrl(decision, "commit")}"><span>Move to commitment</span><i>${icon("arrow")}</i></a></div></div>
  </div>`, decision);
}
function coachTime(value) {
  return new Intl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function renderCoach(decision) {
  const lens = confidenceLens(decision);
  const messages = decision.coach || [];
  const starters = [
    "What assumption should I test first?",
    "Where might I be rationalizing?",
    "What would make this decision reversible?",
    "What important option could be missing?"
  ];
  return shell(`<div class="page page--stage page--coach">
    ${stageHeader(decision, "coach", "04 \xB7 Coach", "Think it through\nwith a sharp partner.", "Ask about this decision in plain language. The Coach stays grounded in your room and keeps judgment in your hands.")}
    <section class="coach-layout reveal">
      <aside class="coach-context"><div class="coach-avatar">${icon("spark")}</div><p class="eyebrow">Decision Coach</p><h2>Grounded in this room.</h2><p>I can question the framing, unpack a trade-off, or turn uncertainty into a small next step. I won\u2019t invent research or choose for you.</p><dl><div><dt>Current leader</dt><dd>${escapeHtml(lens.leader?.name || "Not scored")}</dd></div><div><dt>Readiness</dt><dd>${lens.readiness}/100</dd></div><div><dt>Saved context</dt><dd>${decision.options.length} options \xB7 ${decision.criteria.length} criteria</dd></div></dl><button class="text-link" type="button" data-action="clear-coach" ${messages.length ? "" : "disabled"}>Clear conversation</button></aside>
      <div class="chat-shell"><div class="chat-core">
        <header class="chat-head"><div><span class="presence-dot"></span><strong>Decision Coach</strong><small>${state.platform.connected ? "Powered by Anna" : "Anna required for replies"}</small></div><a class="button button--quiet" href="${decisionUrl(decision, "challenge")}">Open challenge tools</a></header>
        <div class="chat-log" id="chat-log" aria-live="polite">${messages.length ? messages.map((message) => `<article class="chat-message chat-message--${message.role}"><div class="message-avatar">${message.role === "assistant" ? icon("spark") : "You"}</div><div><header><strong>${message.role === "assistant" ? "Coach" : "You"}</strong>${message.role === "assistant" && message.source === "local" ? "<span>Local fallback</span>" : ""}<time>${coachTime(message.createdAt)}</time></header><p>${escapeHtml(message.text).replaceAll("\n", "<br>")}</p></div></article>`).join("") : `<div class="chat-welcome"><span>${icon("challenge")}</span><h2>Bring me the part that still feels unresolved.</h2><p>The best question is often narrower than the decision itself.</p><div class="starter-grid">${starters.map((question) => `<button type="button" data-action="coach-starter" data-question="${attr(question)}">${escapeHtml(question)}${icon("arrow")}</button>`).join("")}</div></div>`}${state.coachBusy ? `<article class="chat-message chat-message--assistant is-pending"><div class="message-avatar">${icon("spark")}</div><div><header><strong>Coach</strong><span>Reading the room</span></header><div class="typing-dots" aria-label="Coach is thinking"><i></i><i></i><i></i></div></div></article>` : ""}</div>
        <form id="coach-form" class="chat-composer"><label><span class="sr-only">Message the Decision Coach</span><textarea name="question" id="coach-input" rows="1" maxlength="1200" placeholder="Ask about a trade-off, assumption, or next step\u2026" ${state.coachBusy ? "disabled" : ""}>${escapeHtml(state.coachDraft)}</textarea></label><div><span id="coach-count">${state.coachDraft.length}/1200</span><small><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</small><button class="button button--accent button--nested" type="submit" ${state.coachBusy ? "disabled" : ""}><span>Send</span><i>${icon("arrow")}</i></button></div></form>
      </div></div>
    </section>
  </div>`, decision);
}
function renderCommit(decision) {
  const scores = calculateScores(decision);
  const leader = scores[0];
  const commitment = decision.commitment;
  const suggestion = !commitment ? decision.commitSuggestion : null;
  const draft = commitment || suggestion;
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "commit", "04 \xB7 Commit", "Choose deliberately.\nLeave a trail.", "Record the choice, confidence, and first action. A clear rationale is insurance against hindsight bias.")}
    <section class="commit-layout reveal">
      <aside class="recommendation-panel"><p class="eyebrow">What the matrix says</p><span class="recommendation-score">${leader?.score ?? "\u2014"}<small>/100</small></span><h2>${escapeHtml(leader?.name || "No leader yet")}</h2><p>${leader ? `Currently leads the weighted comparison${scores[1] ? ` by ${(leader.score - scores[1].score).toFixed(1)} points` : ""}.` : "Complete the comparison matrix first."}</p><div class="principle-note"><strong>Remember</strong><p>A score is a summary of your assumptions. It is not permission to ignore your judgment.</p></div></aside>
      <form id="commit-form" class="paper-shell paper-shell--large"><div class="paper-core">
        <p class="eyebrow">Your commitment</p><h2>${commitment ? "Update the decision record." : suggestion ? "Review Anna's recommendation." : "What will you do?"}</h2>
        ${suggestion ? `<div class="commit-draft-note"><span>${icon("spark")}</span><p><strong>Anna drafted this from your room.</strong> Confirm or edit every field before recording a commitment. It is advisory, not a decision.</p></div>` : ""}
        <label class="field"><span>Chosen option</span><select name="optionId" required><option value="">Select one</option>${decision.options.map((option) => `<option value="${attr(option.id)}" ${draft?.optionId === option.id ? "selected" : ""}>${escapeHtml(option.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Why this option?</span><textarea name="rationale" rows="5" maxlength="1800" required placeholder="Name the evidence, trade-offs, and uncertainty you are accepting.">${escapeHtml(draft?.rationale || "")}</textarea></label>
        <label class="field"><span>First concrete action</span><input name="nextAction" maxlength="500" required value="${attr(draft?.nextAction || "")}" placeholder="The next observable step"></label>
        <div class="form-split"><label class="field"><span>Confidence</span><select name="confidence"><option value="1" ${draft?.confidence === 1 ? "selected" : ""}>1 \xB7 Very uncertain</option><option value="2" ${draft?.confidence === 2 ? "selected" : ""}>2 \xB7 Cautious</option><option value="3" ${!draft || draft.confidence === 3 ? "selected" : ""}>3 \xB7 Balanced</option><option value="4" ${draft?.confidence === 4 ? "selected" : ""}>4 \xB7 Confident</option><option value="5" ${draft?.confidence === 5 ? "selected" : ""}>5 \xB7 Very confident</option></select></label><label class="field"><span>Review date</span><input type="date" name="reviewDate" required value="${attr(commitment?.reviewDate || defaultReviewDate())}"></label></div>
        <div class="form-submit"><p>You can revise this record until you complete the outcome review.</p><button class="button button--accent button--nested" type="submit"><span>${commitment ? "Update commitment" : "Record my decision"}</span><i>${icon("commit")}</i></button></div>
      </div></form>
    </section>
    ${commitment ? `<section class="commitment-receipt reveal"><span class="receipt-mark">\u2713</span><div><p class="eyebrow">Committed ${shortDate(commitment.decidedAt)}</p><h2>${escapeHtml(decision.options.find((option) => option.id === commitment.optionId)?.name || "Chosen option")}</h2><p>${escapeHtml(commitment.rationale)}</p></div><a class="button button--quiet" href="${decisionUrl(decision, "report")}">${icon("print")} Open decision brief</a></section>` : ""}
  </div>`, decision);
}
function defaultReviewDate() {
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}
function renderReview(decision) {
  const commitment = decision.commitment;
  const chosen = commitment ? decision.options.find((option) => option.id === commitment.optionId) : null;
  if (!commitment) {
    return shell(`<div class="page page--stage">${stageHeader(decision, "review", "05 \xB7 Review", "Learning begins\nafter the choice.", "Review the result without rewriting what you knew at the time.")}<section class="locked-review reveal"><span>05</span><div><h2>Commit before reviewing.</h2><p>The outcome review is intentionally locked until you record a choice, rationale, and review date.</p><a class="button button--ink button--nested" href="${decisionUrl(decision, "commit")}"><span>Go to commitment</span><i>${icon("arrow")}</i></a></div></section></div>`, decision);
  }
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "review", "05 \xB7 Review", "Close the loop.\nKeep the lesson.", "Separate decision quality from outcome luck, then carry the useful lesson into your next choice.")}
    <section class="review-timeline reveal"><div><span>Decided</span><strong>${shortDate(commitment.decidedAt)}</strong></div><i></i><div><span>Review planned</span><strong>${shortDate(commitment.reviewDate)}</strong><small>${relativeDate(commitment.reviewDate)}</small></div><i></i><div class="${decision.outcome ? "is-complete" : ""}"><span>Outcome</span><strong>${decision.outcome ? "Recorded" : "Open"}</strong></div></section>
    <section class="review-layout reveal">
      <aside class="decision-memory"><p class="eyebrow">The record</p><h2>${escapeHtml(chosen?.name || "Chosen option")}</h2><blockquote>${escapeHtml(commitment.rationale)}</blockquote><dl><div><dt>Confidence then</dt><dd>${commitment.confidence}/5</dd></div><div><dt>First action</dt><dd>${escapeHtml(commitment.nextAction)}</dd></div></dl></aside>
      <form id="outcome-form" class="paper-shell paper-shell--large"><div class="paper-core"><p class="eyebrow">Outcome review</p><h2>What actually happened?</h2><label class="field"><span>Describe the outcome</span><textarea name="result" rows="5" maxlength="1800" required placeholder="What changed after the decision?">${escapeHtml(decision.outcome?.result || "")}</textarea></label><label class="field"><span>What should future-you remember?</span><textarea name="lesson" rows="4" maxlength="1400" required placeholder="A principle, warning, or repeatable move">${escapeHtml(decision.outcome?.lesson || "")}</textarea></label><fieldset class="outcome-score"><legend>Outcome quality</legend>${[1, 2, 3, 4, 5].map((score) => `<label><input type="radio" name="score" value="${score}" ${Number(decision.outcome?.score || 3) === score ? "checked" : ""}><span>${score}</span><small>${["Poor", "Weak", "Mixed", "Good", "Strong"][score - 1]}</small></label>`).join("")}</fieldset><div class="form-submit"><p>A difficult outcome does not always mean the decision process was poor.</p><button class="button button--accent button--nested" type="submit"><span>${decision.outcome ? "Update review" : "Complete the loop"}</span><i>${icon("review")}</i></button></div></div></form>
    </section>
    ${decision.outcome ? `<section class="lesson-banner reveal"><p class="eyebrow">Lesson retained</p><h2>${escapeHtml(decision.outcome.lesson)}</h2><a class="button button--quiet" href="${decisionUrl(decision, "report")}">${icon("print")} View full brief</a></section>` : ""}
  </div>`, decision);
}
function renderReport(decision) {
  const scores = calculateScores(decision);
  const lens = confidenceLens(decision);
  const chosen = decision.commitment ? decision.options.find((option) => option.id === decision.commitment.optionId) : null;
  return shell(`<div class="page page--report"><header class="report-toolbar"><a class="text-link" href="${decisionUrl(decision, "commit")}">${icon("arrow", "icon--back")} Back to room</a><div><button class="button button--quiet" type="button" data-action="export-decision">${icon("download")} Export JSON</button><button class="button button--ink" type="button" data-action="print">${icon("print")} Print brief</button></div></header>
    <article class="decision-brief" id="decision-brief"><header><div>${logoMarkup()}<p>Decision Room / Brief</p></div><time>${shortDate(decision.updatedAt)}</time><h1>${escapeHtml(decision.title)}</h1><p>${escapeHtml(decision.context || "No additional context recorded.")}</p></header>
      <section class="brief-verdict"><span>Recorded choice</span><h2>${escapeHtml(chosen?.name || "Not committed yet")}</h2><strong>${decision.commitment ? `${decision.commitment.confidence}/5 confidence` : `${lens.readiness}/100 readiness`}</strong></section>
      <section><p class="eyebrow">Comparison</p><h2>Weighted result</h2><div class="brief-scores">${scores.map((score, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(score.name)}</strong><i><b style="transform:scaleX(${score.score / 100})"></b></i><em>${score.score}</em></div>`).join("")}</div></section>
      <section class="brief-columns"><div><p class="eyebrow">Assumptions</p><ul>${decision.assumptions.length ? decision.assumptions.map((item) => `<li>${escapeHtml(item.text)} <small>${item.confidence}/5 confidence</small></li>`).join("") : "<li>None recorded.</li>"}</ul></div><div><p class="eyebrow">Risks</p><ul>${decision.risks.length ? decision.risks.map((item) => `<li>${escapeHtml(item.text)} <small>${item.likelihood}\xD7${item.impact} exposure</small></li>`).join("") : "<li>None recorded.</li>"}</ul></div></section>
      ${decision.commitment ? `<section><p class="eyebrow">Commitment</p><blockquote>${escapeHtml(decision.commitment.rationale)}</blockquote><dl class="brief-details"><div><dt>Next action</dt><dd>${escapeHtml(decision.commitment.nextAction)}</dd></div><div><dt>Review date</dt><dd>${shortDate(decision.commitment.reviewDate)}</dd></div></dl></section>` : ""}
      ${decision.outcome ? `<section class="brief-outcome"><p class="eyebrow">Outcome & lesson</p><h2>${escapeHtml(decision.outcome.lesson)}</h2><p>${escapeHtml(decision.outcome.result)}</p><strong>${decision.outcome.score}/5 outcome quality</strong></section>` : ""}
      <footer>Scores summarize user-supplied judgments. AI notes are advisory and do not constitute external research.</footer>
    </article>
  </div>`, decision);
}
function renderSettings() {
  return shell(`<div class="page page--settings"><header class="settings-header reveal"><p class="eyebrow">Settings & data</p><h1>A quiet place for<br><em>the practical things.</em></h1><p>Control local behavior and keep a portable copy of your decision practice.</p></header>
    <section class="settings-grid reveal"><article class="settings-section"><p class="eyebrow">Experience</p><h2>Motion and density</h2><label class="setting-row"><span><strong>Reduce motion</strong><small>Keep transitions minimal inside this app.</small></span><input type="checkbox" id="reduce-motion" ${state.store.preferences.reduceMotion ? "checked" : ""}></label><label class="setting-row"><span><strong>Compact comparison</strong><small>Use a tighter matrix when many criteria are present.</small></span><input type="checkbox" id="compact-matrix" ${state.store.preferences.compactMatrix ? "checked" : ""}></label></article>
      <article class="settings-section"><p class="eyebrow">Data portability</p><h2>Keep your own copy</h2><p>Export all rooms as JSON or restore a previously exported Decision Room file.</p><div class="settings-actions"><button class="button button--quiet" type="button" data-action="export-all">${icon("download")} Export all data</button><label class="button button--quiet file-button">${icon("plus")} Import data<input id="import-data" type="file" accept="application/json,.json"></label></div></article>
      <article class="settings-section settings-section--danger"><p class="eyebrow">Reset</p><h2>Clear every room</h2><p>This permanently removes all Decision Room AI data from ${state.platform.storageMode === "anna" ? "Anna Storage" : "this browser"}.</p><button class="button button--danger" type="button" data-action="clear-all">${icon("trash")} Clear all data</button></article>
      <aside class="storage-note"><span class="storage-orb"></span><div><strong>${state.platform.storageMode === "anna" ? "Anna Storage connected" : "Standalone device preview"}</strong><p>${state.platform.storageMode === "anna" ? "Your decision library follows your signed-in Anna account." : "Open the app inside Anna to sync decisions across sessions."}</p></div></aside>
    </section></div>`);
}
function renderNotFound() {
  return shell(`<div class="page"><section class="empty-state"><div class="empty-glyph">?</div><h1>This decision room no longer exists.</h1><p>It may have been deleted or imported under another identifier.</p><a class="button button--ink" href="#/home">Return to decisions</a></section></div>`);
}
function render() {
  state.route = parseRoute();
  let html;
  if (state.route.name === "home") html = renderHome();
  else if (state.route.name === "new") html = renderNew();
  else if (state.route.name === "settings") html = renderSettings();
  else {
    const decision = activeDecision();
    if (!decision) html = renderNotFound();
    else if (state.route.view === "frame") html = renderFrame(decision);
    else if (state.route.view === "compare") html = renderCompare(decision);
    else if (state.route.view === "challenge") html = renderChallenge(decision);
    else if (state.route.view === "coach") html = renderCoach(decision);
    else if (state.route.view === "commit") html = renderCommit(decision);
    else if (state.route.view === "review") html = renderReview(decision);
    else html = renderReport(decision);
  }
  app.innerHTML = html;
  document.documentElement.dataset.reduceMotion = state.store.preferences.reduceMotion ? "true" : "false";
  document.documentElement.dataset.compactMatrix = state.store.preferences.compactMatrix ? "true" : "false";
  requestAnimationFrame(() => document.querySelectorAll(".reveal").forEach((node, index) => {
    node.style.setProperty("--reveal-delay", `${Math.min(index * 55, 260)}ms`);
    node.classList.add("is-visible");
  }));
}
function addOption(decision) {
  if (decision.options.length >= MAX_OPTIONS) return;
  const option = { id: createId("option"), name: `Option ${decision.options.length + 1}`, notes: "" };
  decision.options.push(option);
  decision.ratings[option.id] = {};
  decision.evidence[option.id] = {};
  for (const criterion of decision.criteria) {
    decision.ratings[option.id][criterion.id] = 3;
    decision.evidence[option.id][criterion.id] = "";
  }
  touch(decision);
  render();
}
function removeOption(decision, id) {
  if (decision.options.length <= 2) return;
  decision.options = decision.options.filter((option) => option.id !== id);
  delete decision.ratings[id];
  delete decision.evidence[id];
  decision.risks = decision.risks.filter((risk) => risk.optionId !== id);
  if (decision.commitment?.optionId === id) decision.commitment = null;
  touch(decision);
  render();
}
function addCriterion(decision) {
  if (decision.criteria.length >= MAX_CRITERIA) return;
  const criterion = { id: createId("criterion"), name: `Criterion ${decision.criteria.length + 1}`, weight: 10, description: "" };
  decision.criteria.push(criterion);
  for (const option of decision.options) {
    decision.ratings[option.id][criterion.id] = 3;
    decision.evidence[option.id][criterion.id] = "";
  }
  touch(decision);
  render();
}
function removeCriterion(decision, id) {
  if (decision.criteria.length <= 2) return;
  decision.criteria = decision.criteria.filter((criterion) => criterion.id !== id);
  for (const option of decision.options) {
    delete decision.ratings[option.id][id];
    delete decision.evidence[option.id][id];
  }
  touch(decision);
  render();
}
async function refineDecisionDraft(decision, { automatic = false } = {}) {
  if (state.draftBusy) return;
  const baseline = decision.updatedAt;
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  state.draftBusy = true;
  decision.draftMeta = { ...decision.draftMeta || {}, status: "refining", generatedAt };
  if (activeDecision()?.id === decision.id) render();
  try {
    const text = await state.platform.complete({
      messages: [{ role: "user", content: { type: "text", text: buildDecisionDraftPrompt(decision, /* @__PURE__ */ new Date()) } }],
      systemPrompt: "You are Decision Room's first-pass decision architect. Build an editable draft from the user's supplied decision only. Propose realistic options, weighted criteria, initial scores with reasoning, assumptions, risks, clarifying questions, exactly five premortem causes with warning signals and mitigations, and a conditional commit draft. Never invent external facts or make the final decision. Return JSON only.",
      maxTokens: 5200,
      temperature: 0.2
    });
    const parsed = parseStructuredJson(text);
    if (automatic && decision.updatedAt !== baseline) {
      decision.draftMeta.status = decision.draftMeta.source === "anna" ? "ready" : "fallback";
      return;
    }
    applyDecisionDraft(decision, parsed, { source: "anna", generatedAt });
    touch(decision);
    await saveNow();
    if (!automatic) toast("Anna's first draft is ready. Review the suggestions before you rely on them.", "success");
  } catch (error) {
    if (!decision.draftMeta) decision.draftMeta = {};
    decision.draftMeta.status = "fallback";
    if (!automatic) toast("Anna could not refine this draft, so the transparent starter analysis remains available.", "default", 7e3);
  } finally {
    state.draftBusy = false;
    if (decision.draftMeta?.status === "refining") decision.draftMeta.status = decision.draftMeta.source === "anna" ? "ready" : "fallback";
    if (activeDecision()?.id === decision.id) render();
  }
}
async function runAnalysis(decision, type) {
  if (state.aiBusy) return;
  showBusy(
    type === "premortem" ? "Imagining the failure before it happens" : type === "scenarios" ? "Opening three possible futures" : type === "challenger" ? "Looking for the uncomfortable question" : "Turning uncertainty into next steps",
    "Anna is reading only the evidence and assumptions in this room."
  );
  try {
    const prompt = buildAnalysisPrompt(decision, type);
    let text = await state.platform.complete({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      systemPrompt: "You are Decision Room's rigorous decision advisor. Stay grounded in the supplied decision data, distinguish evidence from assumptions, and prefer conditional advice and reversible experiments over certainty. Return valid JSON only.",
      maxTokens: 4200,
      temperature: 0.2
    });
    let parsed;
    try {
      parsed = parseStructuredJson(text);
    } catch {
      text = await state.platform.complete({
        messages: [{ role: "user", content: { type: "text", text: `Repair the following into exactly one valid JSON object without adding new claims. Return JSON only.

${text}` } }],
        systemPrompt: "Repair malformed JSON. Output JSON only.",
        maxTokens: 3200,
        temperature: 0
      });
      parsed = parseStructuredJson(text);
    }
    const analysis = normalizeAnalysis({ ...parsed, id: createId("analysis"), type, source: "anna", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    decision.analyses.push(analysis);
    if (type === "premortem" && analysis.premortem?.length) decision.premortem = analysis.premortem.map((item) => ({ ...item, id: createId("premortem") }));
    if (decision.analyses.length > 8) decision.analyses = decision.analyses.slice(-8);
    touch(decision);
    await saveNow();
    render();
    toast("Anna\u2019s analysis is ready and saved with this decision.", "success");
  } catch (error) {
    const analysis = buildFallbackAnalysis(decision, type);
    decision.analyses.push(analysis);
    if (type === "premortem" && analysis.premortem?.length) decision.premortem = analysis.premortem.map((item) => ({ ...item, id: createId("premortem") }));
    if (decision.analyses.length > 8) decision.analyses = decision.analyses.slice(-8);
    touch(decision);
    await saveNow();
    render();
    toast("Anna\u2019s live response was unavailable, so a transparent local analysis was saved instead.", "default", 7e3);
  } finally {
    hideBusy();
  }
}
async function sendCoachMessage(decision, question) {
  const cleanQuestion = String(question || "").trim().slice(0, 1200);
  if (!cleanQuestion || state.coachBusy) return;
  const userMessage = { id: createId("message"), role: "user", text: cleanQuestion, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  decision.coach.push(userMessage);
  if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
  state.coachBusy = true;
  state.coachDraft = "";
  touch(decision);
  render();
  requestAnimationFrame(() => document.getElementById("chat-log")?.lastElementChild?.scrollIntoView({ block: "end", behavior: state.store.preferences.reduceMotion ? "auto" : "smooth" }));
  try {
    const text = await state.platform.complete({
      messages: [{ role: "user", content: { type: "text", text: buildCoachPrompt(decision, cleanQuestion) } }],
      systemPrompt: "You are Decision Room's concise decision coach. Use only the active room context. Distinguish recorded evidence from inference, challenge kindly, prefer reversible next steps, and never make the decision for the user.",
      maxTokens: 2600,
      temperature: 0.35
    });
    decision.coach.push({ id: createId("message"), role: "assistant", source: "anna", text: formatCoachResponse(text), createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
    touch(decision);
    await saveNow();
  } catch (error) {
    decision.coach.push({ id: createId("message"), role: "assistant", source: "local", text: buildFallbackCoachResponse(decision, cleanQuestion), createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
    touch(decision);
    await saveNow();
    toast("Anna\u2019s live reply was unavailable. The Coach used a transparent local fallback.", "default", 7e3);
  } finally {
    state.coachBusy = false;
    render();
    requestAnimationFrame(() => {
      document.getElementById("chat-log")?.lastElementChild?.scrollIntoView({ block: "end", behavior: "auto" });
      document.getElementById("coach-input")?.focus();
    });
  }
}
function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function openDecisionMenu(decision) {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><section class="action-sheet" role="dialog" aria-modal="true" aria-labelledby="actions-title"><div class="action-sheet__head"><div><p class="eyebrow">Decision actions</p><h2 id="actions-title">${escapeHtml(decision.title)}</h2></div><button class="icon-control" type="button" data-action="close-modal" aria-label="Close">${icon("close")}</button></div><div class="action-list"><a href="${decisionUrl(decision, "report")}">${icon("print")}<span><strong>Open decision brief</strong><small>See the complete printable record.</small></span></a><button type="button" data-action="duplicate-decision" data-id="${attr(decision.id)}">${icon("copy")}<span><strong>Duplicate room</strong><small>Reuse the structure for a fresh decision.</small></span></button><button type="button" data-action="export-decision" data-id="${attr(decision.id)}">${icon("download")}<span><strong>Export JSON</strong><small>Keep a portable copy of this room.</small></span></button><button class="danger-action" type="button" data-action="delete-decision" data-id="${attr(decision.id)}">${icon("trash")}<span><strong>Delete decision</strong><small>This cannot be undone.</small></span></button></div></section>`;
}
app.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "new-decision-form") {
    if (state.store.decisions.length >= MAX_DECISIONS) {
      toast(`Decision Room stores up to ${MAX_DECISIONS} active rooms. Export or delete an older room first.`, "error");
      return;
    }
    const title = String(data.get("title") || "").trim();
    if (title.length < 6) {
      toast("Give the decision a specific question of at least six characters.", "error");
      document.getElementById("new-title")?.focus();
      return;
    }
    const decision = createDecision({ title, context: data.get("context"), mode: data.get("mode"), deadline: data.get("deadline"), template: data.get("template") });
    applyDecisionDraft(decision, buildFallbackDraft(decision), { source: "local" });
    state.store.decisions.unshift(decision);
    await saveNow();
    location.hash = decisionUrl(decision, "frame").slice(1);
    toast("A first-pass decision draft is ready. Anna is refining it in the background.", "success");
    void refineDecisionDraft(decision, { automatic: true });
  } else if (form.id === "commit-form") {
    const decision = activeDecision();
    if (!decision) return;
    const optionId = String(data.get("optionId") || "");
    if (!decision.options.some((option) => option.id === optionId)) {
      toast("Choose one of the options before committing.", "error");
      return;
    }
    decision.commitment = {
      optionId,
      confidence: Number(data.get("confidence") || 3),
      rationale: String(data.get("rationale") || "").trim().slice(0, 1800),
      nextAction: String(data.get("nextAction") || "").trim().slice(0, 500),
      reviewDate: String(data.get("reviewDate") || ""),
      decidedAt: decision.commitment?.decidedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
    decision.status = "decided";
    touch(decision);
    await saveNow();
    render();
    toast("Commitment recorded. The outcome review is now open.", "success");
  } else if (form.id === "outcome-form") {
    const decision = activeDecision();
    if (!decision?.commitment) return;
    decision.outcome = {
      result: String(data.get("result") || "").trim().slice(0, 1800),
      lesson: String(data.get("lesson") || "").trim().slice(0, 1400),
      score: Number(data.get("score") || 3),
      reviewedAt: decision.outcome?.reviewedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
    decision.status = "reviewed";
    touch(decision);
    await saveNow();
    render();
    toast("The loop is closed and the lesson is saved.", "success");
  } else if (form.id === "coach-form") {
    const decision = activeDecision();
    if (!decision) return;
    const question = String(data.get("question") || "");
    if (!question.trim()) {
      toast("Write a question for the Coach first.", "error");
      document.getElementById("coach-input")?.focus();
      return;
    }
    await sendCoachMessage(decision, question);
  }
});
app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  const decision = activeDecision();
  if (target.id === "decision-search") {
    state.query = target.value;
    const list = target.closest(".library-section");
    const selection = [target.selectionStart, target.selectionEnd];
    render();
    const next = document.getElementById("decision-search");
    next?.focus();
    next?.setSelectionRange?.(...selection);
    list?.scrollIntoView?.({ block: "nearest" });
    return;
  }
  if (target.id === "coach-input") {
    state.coachDraft = target.value.slice(0, 1200);
    const count = document.getElementById("coach-count");
    if (count) count.textContent = `${state.coachDraft.length}/1200`;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
    return;
  }
  if (!decision) return;
  const field = target.dataset.decisionField;
  if (field && ["title", "context", "deadline"].includes(field)) {
    decision[field] = target.value.slice(0, field === "context" ? 2400 : 140);
    touch(decision);
  }
  if (target.dataset.optionField) {
    const option = decision.options.find((item) => item.id === target.dataset.optionId);
    if (option) {
      option[target.dataset.optionField] = target.value.slice(0, target.dataset.optionField === "notes" ? 1800 : 100);
      touch(decision);
    }
  }
  if (target.dataset.criterionField) {
    const criterion = decision.criteria.find((item) => item.id === target.dataset.criterionId);
    if (criterion) {
      criterion[target.dataset.criterionField] = target.dataset.criterionField === "weight" ? Number(target.value) : target.value.slice(0, 100);
      target.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(String(target.value)));
      touch(decision);
    }
  }
  if (target.hasAttribute("data-rating")) {
    decision.ratings[target.dataset.optionId][target.dataset.criterionId] = Number(target.value);
    document.querySelector(`[data-rating-value="${CSS.escape(`${target.dataset.optionId}:${target.dataset.criterionId}`)}"]`)?.replaceChildren(document.createTextNode(target.value));
    touch(decision);
  }
  if (target.hasAttribute("data-evidence")) {
    decision.evidence[target.dataset.optionId][target.dataset.criterionId] = target.value.slice(0, 800);
    touch(decision);
  }
  const assumptionField = target.dataset.assumptionField;
  if (assumptionField) {
    const item = decision.assumptions.find((entry) => entry.id === target.dataset.id);
    if (item) {
      item[assumptionField] = assumptionField === "confidence" ? Number(target.value) : target.value.slice(0, 500);
      target.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(`${target.value}/5`));
      touch(decision);
    }
  }
  const riskField = target.dataset.riskField;
  if (riskField) {
    const item = decision.risks.find((entry) => entry.id === target.dataset.id);
    if (item) {
      item[riskField] = ["likelihood", "impact"].includes(riskField) ? Number(target.value) : target.value.slice(0, 500);
      touch(decision);
    }
  }
});
app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.name === "template") {
    state.selectedTemplate = target.value;
    render();
    document.getElementById("new-title")?.focus();
  } else if (target.id === "decision-filter") {
    state.filter = target.value;
    render();
  } else if (target.id === "reduce-motion" || target.id === "compact-matrix") {
    state.store.preferences[target.id === "reduce-motion" ? "reduceMotion" : "compactMatrix"] = target.checked;
    scheduleSave();
    render();
  } else if (target.hasAttribute("data-rating") || target.dataset.criterionField === "weight") {
    render();
  } else if (target.id === "import-data" && target.files?.[0]) {
    target.files[0].text().then(async (text) => {
      try {
        const imported = normalizeStore(JSON.parse(text));
        if (!imported.decisions.length) throw new Error("No valid decisions were found in this file.");
        state.store = imported;
        await saveNow();
        location.hash = "#/home";
        render();
        toast(`${imported.decisions.length} decision room${imported.decisions.length === 1 ? "" : "s"} imported.`, "success");
      } catch (error) {
        toast(error?.message || "This file could not be imported.", "error");
      }
    });
  }
});
document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;
  const decision = activeDecision() || state.store.decisions.find((item) => item.id === trigger.dataset.id);
  if (action === "add-option" && decision) addOption(decision);
  else if (action === "remove-option" && decision) removeOption(decision, trigger.dataset.id);
  else if (action === "add-criterion" && decision) addCriterion(decision);
  else if (action === "remove-criterion" && decision) removeCriterion(decision, trigger.dataset.id);
  else if (action === "add-assumption" && decision) {
    decision.assumptions.push({ id: createId("assumption"), text: "", confidence: 3, evidence: "" });
    touch(decision);
    render();
    document.querySelector('[data-assumption-field="text"]:last-of-type')?.focus();
  } else if (action === "remove-assumption" && decision) {
    decision.assumptions = decision.assumptions.filter((item) => item.id !== trigger.dataset.id);
    touch(decision);
    render();
  } else if (action === "add-risk" && decision) {
    decision.risks.push({ id: createId("risk"), optionId: decision.options[0].id, text: "", likelihood: 3, impact: 3, mitigation: "" });
    touch(decision);
    render();
  } else if (action === "remove-risk" && decision) {
    decision.risks = decision.risks.filter((item) => item.id !== trigger.dataset.id);
    touch(decision);
    render();
  } else if (action === "refine-draft" && decision) await refineDecisionDraft(decision);
  else if (action === "run-analysis" && decision) await runAnalysis(decision, trigger.dataset.type);
  else if (action === "coach-starter" && decision) {
    state.coachDraft = trigger.dataset.question || "";
    render();
    document.getElementById("coach-input")?.focus();
  } else if (action === "clear-coach" && decision) {
    showConfirm({ title: "Clear this conversation?", message: "This removes the saved Coach messages from this decision. Your matrix and analyses stay unchanged.", confirmLabel: "Clear conversation", destructive: true, onConfirm: async () => {
      decision.coach = [];
      state.coachDraft = "";
      touch(decision);
      await saveNow();
      render();
      toast("Coach conversation cleared.");
    } });
  } else if (action === "decision-menu" && decision) openDecisionMenu(decision);
  else if (action === "close-modal") {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
  } else if (action === "duplicate-decision" && decision) {
    if (state.store.decisions.length >= MAX_DECISIONS) {
      toast(`Delete an older room before duplicating.`, "error");
      return;
    }
    const copy = duplicateDecision(decision);
    state.store.decisions.unshift(copy);
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    await saveNow();
    location.hash = decisionUrl(copy, "frame").slice(1);
    toast("A fresh copy is ready.", "success");
  } else if (action === "delete-decision" && decision) {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    showConfirm({ title: "Delete this decision?", message: "Its matrix, analysis, commitment, and outcome record will be permanently removed.", confirmLabel: "Delete decision", destructive: true, onConfirm: async () => {
      state.store.decisions = state.store.decisions.filter((item) => item.id !== decision.id);
      await saveNow();
      location.hash = "#/home";
      render();
      toast("Decision deleted.");
    } });
  } else if (action === "export-decision" && decision) {
    downloadJson(`decision-room-${decision.id}.json`, { app: "Decision Room AI", version: 1, decision });
  } else if (action === "export-all") {
    downloadJson("decision-room-ai-backup.json", state.store);
  } else if (action === "clear-all") {
    showConfirm({ title: "Clear every decision?", message: "This removes the entire Decision Room library. Export a backup first if you may need it later.", confirmLabel: "Clear all data", destructive: true, onConfirm: async () => {
      await state.platform.clear();
      state.store = normalizeStore({});
      location.hash = "#/home";
      render();
      toast("All Decision Room data was cleared.");
    } });
  } else if (action === "print") window.print();
});
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.getElementById("workspace")?.focus({ preventScroll: true });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalRoot.hidden) {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
  }
  if (event.key === "Enter" && event.ctrlKey && document.activeElement?.id === "coach-input") {
    event.preventDefault();
    document.getElementById("coach-form")?.requestSubmit();
  }
});
async function boot() {
  app.innerHTML = `<div class="boot-screen">${logoMarkup()}<p>Opening the room\u2026</p></div>`;
  await state.platform.connect();
  try {
    state.store = await state.platform.load();
  } catch (error) {
    state.platform.anna = null;
    state.platform.storageMode = "device";
    state.store = await state.platform.load();
    toast(`Anna Storage was unavailable, so this session is using device storage. ${error?.message || ""}`, "error", 7e3);
  }
  if (!location.hash) location.hash = "#/home";
  render();
}
boot();

export const STORE_KEY = "decision-room:v1:workspace";
export const STORE_VERSION = 1;
export const MAX_DECISIONS = 24;
export const MAX_OPTIONS = 6;
export const MAX_CRITERIA = 8;
export const MAX_PREMORTEM_ITEMS = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const clean = (value, max = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanLong = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
export const dateOnly = (value) => {
  const candidate = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate ? "" : candidate;
};

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export function createId(prefix = "item") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export const TEMPLATES = {
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
      ["Personal alignment", 10],
    ],
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
      ["Life flexibility", 10],
    ],
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
      ["Resale or exit", 10],
    ],
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
      ["Access and mobility", 10],
    ],
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
      ["Learning value", 10],
    ],
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
      ["Practical constraints", 10],
    ],
  },
};

export function createDecision(input = {}, now = new Date()) {
  const template = TEMPLATES[input.template] || TEMPLATES.blank;
  const id = createId("decision");
  const options = template.options.map((name) => ({ id: createId("option"), name, notes: "" }));
  const criteria = template.criteria.map(([name, weight]) => ({
    id: createId("criterion"),
    name,
    weight,
    description: "",
  }));
  const ratings = Object.fromEntries(options.map((option) => [
    option.id,
    Object.fromEntries(criteria.map((criterion) => [criterion.id, 3])),
  ]));
  const evidence = Object.fromEntries(options.map((option) => [
    option.id,
    Object.fromEntries(criteria.map((criterion) => [criterion.id, ""])),
  ]));
  const evidenceSources = Object.fromEntries(options.map((option) => [
    option.id,
    Object.fromEntries(criteria.map((criterion) => [criterion.id, "none"])),
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
    evidenceSources,
    assumptions: [],
    risks: [],
    analyses: [],
    coach: [],
    premortem: [],
    draftMeta: null,
    commitSuggestion: null,
    commitment: null,
    outcome: null,
  };
}

export function normalizeDecision(raw, now = new Date()) {
  if (!raw || typeof raw !== "object") return null;
  const fallback = createDecision({ title: raw.title || "Untitled decision" }, now);
  const options = Array.isArray(raw.options) ? raw.options.slice(0, MAX_OPTIONS).map((option, index) => ({
    id: clean(option?.id, 100) || `option-${index + 1}`,
    name: clean(option?.name, 100) || `Option ${index + 1}`,
    notes: cleanLong(option?.notes, 1800),
  })) : fallback.options;
  while (options.length < 2) options.push({ id: createId("option"), name: `Option ${options.length + 1}`, notes: "" });

  const criteria = Array.isArray(raw.criteria) ? raw.criteria.slice(0, MAX_CRITERIA).map((criterion, index) => ({
    id: clean(criterion?.id, 100) || `criterion-${index + 1}`,
    name: clean(criterion?.name, 100) || `Criterion ${index + 1}`,
    weight: clamp(criterion?.weight ?? 10, 1, 100),
    description: clean(criterion?.description, 300),
  })) : fallback.criteria;
  while (criteria.length < 2) criteria.push({ id: createId("criterion"), name: `Criterion ${criteria.length + 1}`, weight: 10, description: "" });

  const ratings = {};
  const evidence = {};
  const evidenceSources = {};
  for (const option of options) {
    ratings[option.id] = {};
    evidence[option.id] = {};
    evidenceSources[option.id] = {};
    for (const criterion of criteria) {
      ratings[option.id][criterion.id] = clamp(raw.ratings?.[option.id]?.[criterion.id] ?? 3, 1, 5);
      const note = cleanLong(raw.evidence?.[option.id]?.[criterion.id], 800);
      const storedSource = raw.evidenceSources?.[option.id]?.[criterion.id];
      evidence[option.id][criterion.id] = note;
      evidenceSources[option.id][criterion.id] = !note
        ? "none"
        : ["user", "ai", "unknown"].includes(storedSource)
          ? storedSource
          : raw.draftMeta
            ? "ai"
            : "unknown";
    }
  }

  const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.slice(0, 16).map((item) => ({
    id: clean(item?.id, 100) || createId("assumption"),
    text: clean(item?.text, 500),
    confidence: clamp(item?.confidence ?? 3, 1, 5),
    evidence: clean(item?.evidence, 600),
  })).filter((item) => item.text) : [];

  const risks = Array.isArray(raw.risks) ? raw.risks.slice(0, 16).map((item) => ({
    id: clean(item?.id, 100) || createId("risk"),
    optionId: options.some((option) => option.id === item?.optionId) ? item.optionId : options[0].id,
    text: clean(item?.text, 500),
    likelihood: clamp(item?.likelihood ?? 3, 1, 5),
    impact: clamp(item?.impact ?? 3, 1, 5),
    mitigation: clean(item?.mitigation, 600),
  })).filter((item) => item.text) : [];

  const analyses = Array.isArray(raw.analyses) ? raw.analyses.slice(-8).map(normalizeAnalysis).filter(Boolean) : [];
  const coach = Array.isArray(raw.coach) ? raw.coach.slice(-24).map((message) => ({
    id: clean(message?.id, 100) || createId("message"),
    role: message?.role === "assistant" ? "assistant" : "user",
    text: cleanLong(message?.text, message?.role === "assistant" ? 4000 : 1200),
    source: message?.role === "assistant" && message?.source === "local" ? "local" : "anna",
    createdAt: clean(message?.createdAt, 40) || now.toISOString(),
  })).filter((message) => message.text) : [];
  const premortem = Array.isArray(raw.premortem) ? raw.premortem.slice(0, MAX_PREMORTEM_ITEMS).map((item) => ({
    id: clean(item?.id, 100) || createId("premortem"),
    cause: clean(item?.cause, 500),
    warning: clean(item?.warning, 500),
    mitigation: clean(item?.mitigation, 600),
  })).filter((item) => item.cause || item.warning || item.mitigation) : [];
  const draftMeta = raw.draftMeta && typeof raw.draftMeta === "object" ? {
    source: raw.draftMeta.source === "anna" ? "anna" : "local",
    generatedAt: clean(raw.draftMeta.generatedAt, 40) || now.toISOString(),
    reasoning: cleanLong(raw.draftMeta.reasoning, 1200),
    clarifyingQuestions: Array.isArray(raw.draftMeta.clarifyingQuestions) ? raw.draftMeta.clarifyingQuestions.slice(0, 4).map((item) => clean(item, 500)).filter(Boolean) : [],
    status: ["ready", "refining", "fallback", "error"].includes(raw.draftMeta.status) ? raw.draftMeta.status : "ready",
  } : null;
  const optionIds = new Set(options.map((option) => option.id));
  const commitSuggestion = raw.commitSuggestion && optionIds.has(raw.commitSuggestion.optionId) ? {
    optionId: raw.commitSuggestion.optionId,
    confidence: clamp(raw.commitSuggestion.confidence ?? 3, 1, 5),
    rationale: cleanLong(raw.commitSuggestion.rationale, 1800),
    nextAction: clean(raw.commitSuggestion.nextAction, 500),
  } : null;
  const commitment = raw.commitment && optionIds.has(raw.commitment.optionId) ? {
    optionId: raw.commitment.optionId,
    confidence: clamp(raw.commitment.confidence ?? 3, 1, 5),
    rationale: cleanLong(raw.commitment.rationale, 1800),
    nextAction: clean(raw.commitment.nextAction, 500),
    reviewDate: dateOnly(raw.commitment.reviewDate),
    decidedAt: clean(raw.commitment.decidedAt, 40) || now.toISOString(),
  } : null;
  const outcome = raw.outcome ? {
    result: cleanLong(raw.outcome.result, 1800),
    score: clamp(raw.outcome.score ?? 3, 1, 5),
    lesson: cleanLong(raw.outcome.lesson, 1400),
    reviewedAt: clean(raw.outcome.reviewedAt, 40) || now.toISOString(),
  } : null;

  return {
    ...fallback,
    id: clean(raw.id, 100) || fallback.id,
    title: clean(raw.title, 140) || "Untitled decision",
    context: cleanLong(raw.context, 2400),
    mode: raw.mode === "quick" ? "quick" : "deep",
    template: Object.hasOwn(TEMPLATES, raw.template) ? raw.template : "blank",
    status: outcome ? "reviewed" : commitment ? "decided" : "draft",
    deadline: dateOnly(raw.deadline),
    createdAt: clean(raw.createdAt, 40) || fallback.createdAt,
    updatedAt: clean(raw.updatedAt, 40) || fallback.updatedAt,
    options,
    criteria,
    ratings,
    evidence,
    evidenceSources,
    assumptions,
    risks,
    analyses,
    coach,
    premortem,
    draftMeta,
    commitSuggestion,
    commitment,
    outcome,
  };
}

export function normalizeStore(raw) {
  const decisions = Array.isArray(raw?.decisions)
    ? raw.decisions.map((decision) => normalizeDecision(decision)).filter(Boolean).slice(0, MAX_DECISIONS)
    : [];
  return {
    version: STORE_VERSION,
    decisions,
    preferences: {
      reduceMotion: Boolean(raw?.preferences?.reduceMotion),
      compactMatrix: Boolean(raw?.preferences?.compactMatrix),
    },
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
    hire: ["Hire the leading candidate", "Continue the search", "Run a paid work sample"],
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
      "How well the choice fits your stated priorities.",
    ][index] || "A factor that should be compared consistently.",
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
    { cause: "New information is discounted because of sunk effort or emotion.", warning: "You defend the original choice more often than you update it.", mitigation: "Schedule a review date and decide in advance what evidence would change course." },
  ];
}

export function buildFallbackDraft(decision, now = new Date()) {
  const optionNames = inferredOptions(decision);
  const criteria = inferredCriteria(decision);
  const options = optionNames.map((name, optionIndex) => ({
    name,
    notes: optionIndex === 0 ? "AI-suggested starting point — verify the upside and constraints before relying on it." : "AI-suggested alternative — add the strongest evidence for and against this path.",
  }));
  const ratings = {};
  const evidence = {};
  options.forEach((option, optionIndex) => {
    ratings[option.name] = {};
    evidence[option.name] = {};
    criteria.forEach((criterion, criterionIndex) => {
      const rating = Math.min(5, Math.max(1, 3 + (optionIndex === 0 ? (criterionIndex === 0 ? 1 : 0) : optionIndex === 1 ? (criterionIndex === 2 ? 1 : 0) : (criterionIndex === 3 ? 1 : 0))));
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
      { text: "The criteria reflect what matters most over the decision horizon.", confidence: 3, evidence: "Ask which criterion you would defend if the option names were hidden." },
    ],
    risks: options.slice(0, 3).map((option, index) => ({ option: option.name, text: `${option.name} underdelivers on the highest-stakes constraint.`, likelihood: index === 0 ? 3 : 2, impact: 4, mitigation: "Run a small test and define a clear exit condition before scaling the choice." })),
    premortem: draftPremortem(options, criteria),
    clarifyingQuestions: decision.context ? ["Which fact in this context is least certain?", "What would make you change the current leading path?"] : ["What constraint is truly non-negotiable?", "What evidence would make you change the leading path?"],
    reasoning: "I turned the initial prompt into an editable first pass. The scores and notes are hypotheses, not facts; review the assumptions and replace each draft rationale with evidence from your situation.",
    commitSuggestion: { option: options[0]?.name, confidence: 3, rationale: `The first-pass comparison currently favors ${options[0]?.name || "the leading option"}, but the ranking is provisional until the highest-weighted criterion has direct evidence.`, nextAction: `Run one small test of ${criteria[0]?.name || "the top criterion"} before committing.` },
  };
}

export function buildDecisionDraftPrompt(decision, now = new Date()) {
  const fallback = buildFallbackDraft(decision, now);
  return [
    "/no_think",
    "You are the first-pass decision architect inside Decision Room AI.",
    "Turn the user's initial decision question and context into a useful, editable analysis instead of a blank worksheet.",
    "Propose 2–3 realistic options (include a pilot, hybrid, delay, or negotiated path when plausible), exactly 4 criteria with integer weights that add to 100, initial 1–5 scores for every option/criterion, and one concise reason for every score.",
    "Infer a review deadline only when the prompt does not provide one. The d value must be only YYYY-MM-DD with no explanation.",
    "Proactively surface exactly 3 assumptions, one risk per option, 2 clarifying questions, and exactly five premortem causes with an early warning signal and mitigation.",
    "Also draft a conditional commit recommendation, confidence, rationale, and next action. Never make the final decision.",
    "Use only the supplied context; do not invent external facts. Keep every string under 14 words and the visible response under 1200 tokens.",
    "Return one minified JSON object only. Use this compact schema (array indexes in s, r, and m refer to o and c):",
    JSON.stringify({ d: "YYYY-MM-DD", o: [["option", "note"]], c: [["criterion", 25, "why it matters"]], s: [[0, 0, 3, "score reason"]], a: [["assumption", 3, "evidence or test"]], r: [[0, "risk", 3, 4, "mitigation"]], p: [["failure cause", "early warning", "mitigation"]], q: ["question"], m: [0, 3, "conditional rationale", "next action"], why: "brief overview" }),
    `TODAY: ${now.toISOString().slice(0, 10)}`,
    `DECISION QUESTION: ${decision.title}`,
    `CONTEXT: ${decision.context || "No additional context was supplied."}`,
    `STARTER SHAPE (use only as a fallback, improve it when the context supports doing so): ${JSON.stringify({ options: fallback.options.map((item) => item.name), criteria: fallback.criteria.map((item) => item.name) })}`,
  ].join("\n\n");
}

function expandCompactDraft(raw) {
  if (!raw || typeof raw !== "object" || (!Array.isArray(raw.o) && !Array.isArray(raw.c))) return raw;
  const options = (Array.isArray(raw.o) ? raw.o : []).map((item) => ({ name: item?.[0], notes: item?.[1] }));
  const criteria = (Array.isArray(raw.c) ? raw.c : []).map((item) => ({ name: item?.[0], weight: item?.[1], description: item?.[2] }));
  const optionName = (index) => options[Number(index)]?.name || options[0]?.name || "";
  const criterionName = (index) => criteria[Number(index)]?.name || criteria[0]?.name || "";
  return {
    deadline: raw.d,
    options,
    criteria,
    scores: (Array.isArray(raw.s) ? raw.s : []).map((item) => ({ option: optionName(item?.[0]), criterion: criterionName(item?.[1]), rating: item?.[2], reasoning: item?.[3] })),
    assumptions: (Array.isArray(raw.a) ? raw.a : []).map((item) => ({ text: item?.[0], confidence: item?.[1], evidence: item?.[2] })),
    risks: (Array.isArray(raw.r) ? raw.r : []).map((item) => ({ option: optionName(item?.[0]), text: item?.[1], likelihood: item?.[2], impact: item?.[3], mitigation: item?.[4] })),
    premortem: (Array.isArray(raw.p) ? raw.p : []).map((item) => ({ cause: item?.[0], warning: item?.[1], mitigation: item?.[2] })),
    clarifyingQuestions: Array.isArray(raw.q) ? raw.q : [],
    commitSuggestion: Array.isArray(raw.m) ? { option: optionName(raw.m[0]), confidence: raw.m[1], rationale: raw.m[2], nextAction: raw.m[3] } : {},
    reasoning: raw.why,
  };
}

export function isDecisionDraftPayload(raw) {
  if (!raw || typeof raw !== "object") return false;
  const compact = Array.isArray(raw.o) && Array.isArray(raw.c);
  const expanded = Array.isArray(raw.options) && Array.isArray(raw.criteria);
  if (!compact && !expanded) return false;
  const options = compact ? raw.o : raw.options;
  const criteria = compact ? raw.c : raw.criteria;
  if (options.length < 2 || criteria.length < 2) return false;
  if (!options.every((item) => compact ? Array.isArray(item) && String(item?.[0] || "").trim() : String(item?.name || "").trim())) return false;
  if (!criteria.every((item) => compact ? Array.isArray(item) && String(item?.[0] || "").trim() : String(item?.name || "").trim())) return false;
  return true;
}

export function decisionDraftQualityIssues(raw, decision = null) {
  if (!isDecisionDraftPayload(raw)) return ["incomplete structure"];
  const draft = expandCompactDraft(raw);
  const options = Array.isArray(draft.options) ? draft.options : [];
  const criteria = Array.isArray(draft.criteria) ? draft.criteria : [];
  const scores = Array.isArray(draft.scores) ? draft.scores : [];
  const issues = [];
  const genericReason = /verify how\s+.+\s+fits\s+.+|draft hypothesis\s*\([^)]*\)\s*:\s*verify/i;
  const genericName = /^(?:option [a-z0-9]+|take the leading path|keep the current path)$/i;
  if (options.length < 2 || options.length > 3) issues.push("use two or three distinct options");
  if (criteria.length !== 4) issues.push("return exactly four criteria");
  if (scores.length !== options.length * criteria.length) issues.push("include one score and reason for every option/criterion pair");
  if (scores.some((item) => cleanLong(item?.reasoning, 800).length < 12 || genericReason.test(cleanLong(item?.reasoning, 800)))) issues.push("replace generic score reasons with context-specific reasoning");
  if (!Array.isArray(draft.assumptions) || draft.assumptions.length !== 3) issues.push("return exactly three assumptions");
  if (!Array.isArray(draft.risks) || draft.risks.length < options.length) issues.push("return one complete risk per option");
  if (!Array.isArray(draft.premortem) || draft.premortem.length !== MAX_PREMORTEM_ITEMS) issues.push("return exactly five premortem items");
  if (options.some((item) => genericName.test(clean(item?.name, 100)))) issues.push("replace placeholder option names with realistic paths");
  if (decision) {
    const stopWords = new Set(["about", "after", "before", "could", "first", "from", "have", "into", "more", "should", "than", "that", "their", "there", "these", "they", "this", "what", "when", "where", "which", "with", "would"]);
    const sourceTokens = [...new Set(`${decision.title || ""} ${decision.context || ""}`.toLowerCase().match(/[a-z0-9]+/g) || [])]
      .filter((token) => token.length >= 4 && !stopWords.has(token));
    const renderedDraft = JSON.stringify(draft).toLowerCase();
    const overlap = sourceTokens.filter((token) => renderedDraft.includes(token));
    if (sourceTokens.length >= 2 && overlap.length < Math.min(2, sourceTokens.length)) issues.push("ground the draft in at least two specific terms from the user's decision");
  }
  return [...new Set(issues)];
}

export function applyDecisionDraft(decision, raw, { source = "local", generatedAt = new Date().toISOString() } = {}) {
  if (!isDecisionDraftPayload(raw)) throw new Error("Anna returned an incomplete first draft.");
  const expanded = expandCompactDraft(raw);
  const candidate = expanded && typeof expanded === "object" ? expanded : {};
  const fallback = buildFallbackDraft(decision, new Date(generatedAt));
  const rawOptions = Array.isArray(candidate.options) ? candidate.options : fallback.options;
  const options = rawOptions.slice(0, MAX_OPTIONS).map((item, index) => ({ id: createId("option"), name: clean(item?.name, 100) || fallback.options[index]?.name || `Option ${index + 1}`, notes: cleanLong(item?.notes, 1800) || fallback.options[index]?.notes || "" }));
  while (options.length < 2) options.push({ id: createId("option"), name: fallback.options[options.length]?.name || `Option ${options.length + 1}`, notes: "AI-suggested alternative — verify before relying on it." });
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
  const evidence = Object.fromEntries(options.map((option) => [option.id, Object.fromEntries(criteria.map((criterion) => [criterion.id, "Draft hypothesis — replace with an observable fact."]))]));
  const evidenceSources = Object.fromEntries(options.map((option) => [option.id, Object.fromEntries(criteria.map((criterion) => [criterion.id, "ai"]))]));
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
  decision.evidenceSources = evidenceSources;
  decision.deadline = dateOnly(candidate.deadline) || dateOnly(fallback.deadline);
  decision.assumptions = assumptions;
  decision.risks = risks;
  decision.premortem = premortem.length ? premortem : fallback.premortem;
  decision.commitSuggestion = {
    optionId: leaderOption.id,
    confidence: clamp(candidate.commitSuggestion?.confidence ?? 3, 1, 5),
    rationale: cleanLong(candidate.commitSuggestion?.rationale, 1800) || `The first-pass comparison currently favors ${leaderOption.name}, but the ranking is provisional until the highest-weighted criterion has direct evidence.`,
    nextAction: clean(candidate.commitSuggestion?.nextAction, 500) || `Run one small test of ${criteria[0].name} before committing.`,
  };
  decision.draftMeta = {
    source: source === "anna" ? "anna" : "local",
    generatedAt,
    reasoning: cleanLong(candidate.reasoning, 1200) || fallback.reasoning,
    clarifyingQuestions: (Array.isArray(candidate.clarifyingQuestions) ? candidate.clarifyingQuestions : fallback.clarifyingQuestions).slice(0, 4).map((item) => clean(item, 500)).filter(Boolean),
    status: source === "anna" ? "ready" : "fallback",
  };
  return decision;
}

export function compareInsight(decision) {
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
    sensitivity: sensitivity.stable ? "The current leader survives a practical ±20-point weight test." : sensitivity.summary,
    evidence: leader ? `${leader.evidenceCoverage}% of the leader's rating cells have user-confirmed support.` : "Add user-confirmed evidence to make the comparison defensible.",
  };
}

export function calculateScores(decision) {
  if (!decision?.options?.length || !decision?.criteria?.length) return [];
  const totalWeight = decision.criteria.reduce((sum, criterion) => sum + clamp(criterion.weight, 1, 100), 0) || 1;
  return decision.options.map((option) => {
    const contributions = decision.criteria.map((criterion) => {
      const rating = clamp(decision.ratings?.[option.id]?.[criterion.id] ?? 3, 1, 5);
      const points = (rating / 5) * (criterion.weight / totalWeight) * 100;
      return { criterionId: criterion.id, name: criterion.name, rating, points };
    });
    const score = contributions.reduce((sum, item) => sum + item.points, 0);
    const evidenceCount = decision.criteria.filter((criterion) => {
      const note = cleanLong(decision.evidence?.[option.id]?.[criterion.id]);
      return note.length >= 8 && decision.evidenceSources?.[option.id]?.[criterion.id] === "user";
    }).length;
    return {
      optionId: option.id,
      name: option.name,
      score: Math.round(score * 10) / 10,
      evidenceCoverage: Math.round((evidenceCount / decision.criteria.length) * 100),
      contributions: contributions.sort((a, b) => b.points - a.points),
    };
  }).sort((a, b) => b.score - a.score);
}

export function confidenceLens(decision) {
  const scores = calculateScores(decision);
  const first = scores[0];
  const second = scores[1];
  const gap = first && second ? Math.round((first.score - second.score) * 10) / 10 : 0;
  const evidenceCoverage = scores.length
    ? Math.round(scores.reduce((sum, option) => sum + option.evidenceCoverage, 0) / scores.length)
    : 0;
  const assumptionConfidence = decision.assumptions.length
    ? Math.round((decision.assumptions.reduce((sum, item) => sum + item.confidence, 0) / (decision.assumptions.length * 5)) * 100)
    : 50;
  const scoreSeparation = Math.round(clamp((gap / 20) * 100, 0, 100));
  const riskPreparedness = decision.risks.length
    ? Math.round((decision.risks.filter((risk) => clean(risk.mitigation, 600).length >= 8).length / decision.risks.length) * 100)
    : 0;
  const readiness = Math.round(clamp(
    evidenceCoverage * 0.45 + assumptionConfidence * 0.30 + scoreSeparation * 0.15 + riskPreparedness * 0.10,
    0,
    100,
  ));
  let label = "Early working draft";
  if (readiness >= 80) label = "Ready for a decision";
  else if (readiness >= 60) label = "Structured, still uncertain";
  else if (readiness >= 40) label = "Needs stronger support";
  return { readiness, label, gap, evidenceCoverage, assumptionConfidence, scoreSeparation, riskPreparedness, leader: first || null };
}

export function sensitivityAnalysis(decision) {
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
          score: result[0].score,
        });
        break;
      }
    }
  }
  const sorted = switches.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  return {
    stable: sorted.length === 0,
    switches: sorted,
    summary: sorted.length
      ? `${sorted[0].criterion} is the nearest weight change that could alter the current leader.`
      : "The current leader survives a ±20 weight test across every criterion.",
  };
}

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = (value, max = 8) => Array.isArray(value) ? value.slice(0, max).map((item) => clean(item, 600)).filter(Boolean) : [];
  const premortem = Array.isArray(raw.premortem) ? raw.premortem.slice(0, MAX_PREMORTEM_ITEMS).map((item) => ({ cause: clean(item?.cause, 500), warning: clean(item?.warning, 500), mitigation: clean(item?.mitigation, 600) })).filter((item) => item.cause || item.warning || item.mitigation) : [];
  return {
    id: clean(raw.id, 100) || createId("analysis"),
    type: ["challenger", "premortem", "scenarios", "advisor"].includes(raw.type) ? raw.type : "advisor",
    source: raw.source === "local" ? "local" : "anna",
    createdAt: clean(raw.createdAt, 40) || new Date().toISOString(),
    headline: clean(raw.headline, 220) || "A clearer view of the decision",
    summary: cleanLong(raw.summary, 1800),
    blindSpots: list(raw.blindSpots),
    questions: list(raw.questions),
    scenarios: list(raw.scenarios),
    experiments: list(raw.experiments),
    recommendation: cleanLong(raw.recommendation, 1200),
    caveat: cleanLong(raw.caveat, 700),
    premortem,
  };
}

/**
 * Guard the boundary between an Anna response and persisted app state.
 * A syntactically valid JSON fragment is not necessarily a usable analysis;
 * in particular, a truncated premortem must never replace the complete local
 * fallback with zero or partial failure modes.
 */
export function isAnalysisPayload(raw, type = "advisor") {
  if (!raw || typeof raw !== "object") return false;
  const headline = clean(raw.headline, 220);
  const summary = cleanLong(raw.summary, 1800);
  if (!headline || !summary) return false;
  if (type !== "premortem") return true;
  if (!Array.isArray(raw.premortem) || raw.premortem.length !== MAX_PREMORTEM_ITEMS) return false;
  return raw.premortem.every((item) => item && clean(item.cause, 500) && clean(item.warning, 500) && clean(item.mitigation, 600));
}

export function buildFallbackAnalysis(decision, type = "advisor") {
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
    advisor: "Reduce one important uncertainty before you commit.",
  };
  const blindSpots = [];
  if (lens.evidenceCoverage < 60) blindSpots.push(`Only ${lens.evidenceCoverage}% of rating cells have user-confirmed support; the remaining scores rely on unverified reasoning or have no recorded basis.`);
  if (!decision.assumptions.length) blindSpots.push("No assumptions are recorded, so the beliefs underneath the ratings are still hidden.");
  if (!decision.risks.length) blindSpots.push("No risks are recorded for the options, which makes downside comparisons incomplete.");
  if (decision.options.length === 2) blindSpots.push("The room contains only two options; a hybrid, delay, or small pilot may be missing.");
  if (!blindSpots.length) blindSpots.push(`The least-supported option is ${weakestEvidence?.name || "not yet identifiable"} at ${weakestEvidence?.evidenceCoverage || 0}% user-confirmed support.`);

  return normalizeAnalysis({
    source: "local",
    type,
    headline: modeHeadlines[type] || modeHeadlines.advisor,
    summary: `${gapText}, with ${lens.evidenceCoverage}% average user-confirmed support. This local fallback reads only the scores, notes, assumptions, and risks saved in this room.`,
    blindSpots,
    questions: [topCriterion ? `What observable evidence would justify the current ${topCriterion.name} ratings?` : "What fact would most change the current ranking?"],
    scenarios: [
      "Best case: the leading option delivers its highest-weighted benefits and the recorded risks remain manageable.",
      "Expected case: the trade-offs remain mixed and the decision depends on which uncertainty you test first.",
      "Difficult case: a low-confidence assumption fails and the most exposed option becomes harder to reverse.",
    ],
    experiments: [
      topCriterion && leader ? `Run one small test that produces evidence for ${leader.name} on ${topCriterion.name}.` : "Add one evidence note to each option before rescoring.",
      sensitivity.stable ? "Ask what new fact—not another weight adjustment—could change the leader." : `Revisit ${sensitivity.switches[0]?.criterion || "the most sensitive criterion"}, because a practical weight change can alter the leader.`,
    ],
    recommendation: leader ? `Treat ${leader.name} as a working hypothesis, not a verdict. Test the highest-impact uncertainty, record what you learn, and then rescore before committing.` : "Complete the option comparison, record evidence, and test one important uncertainty before committing.",
    caveat: "This fallback uses no external research and cannot verify the accuracy of the user-supplied ratings or notes.",
    premortem: type === "premortem" ? draftPremortem(decision.options, decision.criteria) : [],
  });
}

export function buildFallbackCoachResponse(decision, question) {
  const lens = confidenceLens(decision);
  const sensitivity = sensitivityAnalysis(decision);
  const leader = lens.leader?.name || "the current leader";
  const prompt = String(question || "").toLowerCase();
  const prefix = "Anna’s live reply was unavailable, so this is a local read of the information already in your room.";
  if (prompt.includes("assumption")) {
    const lowest = decision.assumptions.slice().sort((a, b) => a.confidence - b.confidence)[0];
    return `${prefix}\n\n${lowest ? `Test “${lowest.text}” first because it has the lowest recorded confidence (${lowest.confidence}/5).` : "Start by writing the belief that would most weaken the leading option if it proved false."} Choose one observable result that would raise or lower your confidence.`;
  }
  if (prompt.includes("revers")) {
    return `${prefix}\n\nMake the next step smaller than the final commitment: run a time-boxed trial, request concrete evidence, or delay only long enough to test the highest-weighted criterion. The goal is to learn before the expensive part becomes irreversible.`;
  }
  if (prompt.includes("rational") || prompt.includes("bias")) {
    return `${prefix}\n\n${leader} currently leads by ${lens.gap} points with ${lens.evidenceCoverage}% user-confirmed support. Ask which rating you would defend differently if the option names were hidden; that is the first place to look for motivated reasoning.`;
  }
  if (prompt.includes("missing") || prompt.includes("option")) {
    return `${prefix}\n\nTest whether the room is forcing a false either/or. Consider a pilot, a negotiated variant, a deliberate delay with a deadline, or a combination that preserves the strongest benefit of each option.`;
  }
  return `${prefix}\n\n${leader} currently leads by ${lens.gap} points, and the room is ${sensitivity.stable ? "stable under the weight test" : "sensitive to at least one criterion weight"}. The most useful next move is to add evidence where coverage is weakest, then rescore and see whether the ranking survives.`;
}

export function parseStructuredJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Anna returned analysis in an unreadable format.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

export function formatCoachResponse(text) {
  const raw = String(text || "").trim();
  if (!raw) return "I could not form a useful response from that result. Try asking one narrower question.";
  try {
    const parsed = parseStructuredJson(raw);
    const sections = [
      parsed.summary,
      parsed.recommendation,
      Array.isArray(parsed.questions) ? parsed.questions[0] : "",
    ].map((value) => cleanLong(value, 1600)).filter(Boolean);
    if (sections.length) return sections.join("\n\n").slice(0, 4000);
  } catch {
    // Normal Coach responses are plain text. JSON parsing is only a compatibility
    // path for older Anna mock fixtures that match the wrong LLM response.
  }
  return raw.slice(0, 4000);
}

export function buildAnalysisPrompt(decision, type) {
  const scores = calculateScores(decision);
  const analysisLabels = {
    challenger: "CHALLENGER — challenge framing, ratings, biases, and missing options",
    premortem: "PREMORTEM — imagine the chosen path failed and identify preventable causes",
    scenarios: "SCENARIOS — explore best, expected, and difficult futures without false precision",
    advisor: "ADVISOR — synthesize the evidence and propose reversible next steps",
  };
  const evidenceLines = [];
  for (const option of decision.options) {
    for (const criterion of decision.criteria) {
      const note = cleanLong(decision.evidence?.[option.id]?.[criterion.id], 500);
      if (note) {
        const source = decision.evidenceSources?.[option.id]?.[criterion.id] === "user" ? "USER-CONFIRMED" : "AI INFERENCE";
        evidenceLines.push(`- [${source}] ${option.name} / ${criterion.name}: ${note}`);
      }
    }
  }
  return `/no_think\nANALYSIS MODE: ${analysisLabels[type] || analysisLabels.advisor}\n\nDECISION\n${decision.title}\n\nCONTEXT\n${decision.context || "No additional context provided."}\n\nOPTIONS AND CURRENT SCORES\n${scores.map((item) => `- ${item.name}: ${item.score}/100; user-confirmed support ${item.evidenceCoverage}%`).join("\n")}\n\nCRITERIA\n${decision.criteria.map((item) => `- ${item.name}: weight ${item.weight}`).join("\n")}\n\nEVIDENCE AND INFERENCE NOTES\n${evidenceLines.join("\n") || "No notes recorded yet."}\n\nASSUMPTIONS\n${decision.assumptions.map((item) => `- ${item.text} (confidence ${item.confidence}/5)`).join("\n") || "None recorded."}\n\nRISKS\n${decision.risks.map((item) => `- ${item.text} (likelihood ${item.likelihood}/5, impact ${item.impact}/5)`).join("\n") || "None recorded."}\n\nReturn exactly one JSON object with this shape:\n{\n  "headline": "specific insight, not a generic title",\n  "summary": "concise evidence-aware synthesis",\n  "blindSpots": ["missing fact, bias, or assumption"],\n  "questions": ["high-value question to answer next"],\n  "scenarios": ["scenario and what would make it more likely"],\n  "experiments": ["small reversible action that reduces uncertainty"],\n  "recommendation": "conditional recommendation that names the evidence behind it",\n  "caveat": "what the available information cannot establish",\n  "premortem": [{"cause":"failure cause","warning":"early warning signal","mitigation":"preventive action"}]\n}\nFor PREMORTEM mode, return exactly five premortem items. Use only the user's supplied decision data. Treat scores and AI inference notes as subjective inputs, not verified facts. Never claim external research or certainty. Return JSON only.`;
}

export function buildCoachPrompt(decision, question) {
  const scores = calculateScores(decision);
  const recentCoach = decision.coach.slice(-8).map((message) => `${message.role === "assistant" ? "COACH" : "USER"}: ${message.text}`).join("\n");
  return `/no_think\nACTIVE DECISION\n${decision.title}\n\nCONTEXT\n${decision.context || "No additional context provided."}\n\nOPTIONS AND SCORES\n${scores.map((item) => `- ${item.name}: ${item.score}/100, ${item.evidenceCoverage}% user-confirmed support`).join("\n")}\n\nCRITERIA\n${decision.criteria.map((item) => `- ${item.name}: weight ${item.weight}`).join("\n")}\n\nASSUMPTIONS\n${decision.assumptions.map((item) => `- ${item.text} (${item.confidence}/5 confidence)`).join("\n") || "None recorded."}\n\nRISKS\n${decision.risks.map((item) => `- ${item.text} (${item.likelihood}×${item.impact})`).join("\n") || "None recorded."}\n\nRECENT CONVERSATION\n${recentCoach || "This is the first message."}\n\nUSER QUESTION\n${cleanLong(question, 1200)}\n\nAnswer as a concise decision coach. Ground every specific observation in the supplied decision. Distinguish user-confirmed evidence from AI inference. Ask at most one sharp follow-up question. Do not claim external research, do not make the decision for the user, and do not output JSON.`;
}

export function decisionProgress(decision) {
  let completed = 1;
  if (decision.options.length >= 2 && decision.options.every((option) => option.name.trim())) completed += 1;
  if (decision.criteria.length >= 2) completed += 1;
  if (calculateScores(decision).some((score) => score.evidenceCoverage > 0)) completed += 1;
  if (decision.analyses.length || decision.assumptions.length || decision.risks.length) completed += 1;
  if (decision.commitment) completed += 1;
  if (decision.outcome) completed += 1;
  return Math.round((completed / 7) * 100);
}

export function duplicateDecision(decision, now = new Date()) {
  const copy = normalizeDecision(structuredClone(decision), now);
  const ids = new Map();
  copy.id = createId("decision");
  copy.title = `${copy.title} — copy`.slice(0, 140);
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
  const criterionIds = new Map();
  copy.criteria = copy.criteria.map((criterion) => {
    const id = createId("criterion");
    criterionIds.set(criterion.id, id);
    return { ...criterion, id };
  });
  copy.ratings = {};
  copy.evidence = {};
  copy.evidenceSources = {};
  for (const oldOption of decision.options) {
    const newOptionId = ids.get(oldOption.id);
    copy.ratings[newOptionId] = {};
    copy.evidence[newOptionId] = {};
    copy.evidenceSources[newOptionId] = {};
    for (const oldCriterion of decision.criteria) {
      const newCriterionId = criterionIds.get(oldCriterion.id);
      copy.ratings[newOptionId][newCriterionId] = decision.ratings?.[oldOption.id]?.[oldCriterion.id] ?? 3;
      copy.evidence[newOptionId][newCriterionId] = decision.evidence?.[oldOption.id]?.[oldCriterion.id] ?? "";
      copy.evidenceSources[newOptionId][newCriterionId] = decision.evidenceSources?.[oldOption.id]?.[oldCriterion.id] ?? "unknown";
    }
  }
  if (copy.commitSuggestion) copy.commitSuggestion.optionId = ids.get(decision.commitSuggestion?.optionId) || copy.options[0].id;
  copy.assumptions = copy.assumptions.map((item) => ({ ...item, id: createId("assumption") }));
  copy.risks = copy.risks.map((item) => ({ ...item, id: createId("risk"), optionId: ids.get(item.optionId) || copy.options[0].id }));
  copy.premortem = copy.premortem.map((item) => ({ ...item, id: createId("premortem") }));
  return copy;
}

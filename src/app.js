import {
  MAX_CRITERIA,
  MAX_DECISIONS,
  MAX_OPTIONS,
  TEMPLATES,
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
  createId,
  dateOnly,
  decisionDraftQualityIssues,
  decisionProgress,
  duplicateDecision,
  formatCoachResponse,
  normalizeAnalysis,
  normalizeStore,
  parseStructuredJson,
  isAnalysisPayload,
  sensitivityAnalysis,
} from "./core.js";
import { icon } from "./icons.js";
import { renderSafeMarkdown } from "./markdown.js";
import { DecisionPlatform } from "./platform.js";

const app = document.getElementById("app");
const toastRegion = document.getElementById("toast-region");
const modalRoot = document.getElementById("modal-root");
const busyRoot = document.getElementById("busy-root");

const state = {
  platform: new DecisionPlatform(),
  store: normalizeStore({}),
  route: { name: "home" },
  query: "",
  filter: "all",
  selectedTemplate: "blank",
  aiBusy: false,
  draftBusy: false,
  draftPromise: null,
  coachBusy: false,
  coachDraft: "",
  saving: false,
  saveTimer: null,
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const attr = escapeHtml;
function parseDisplayDate(value) {
  const normalized = dateOnly(value);
  const parsed = normalized ? new Date(`${normalized}T12:00:00`) : new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const shortDate = (value) => {
  const date = parseDisplayDate(value);
  return date ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : "Not set";
};
const relativeDate = (value) => {
  const date = parseDisplayDate(value);
  if (!date) return "Not set";
  const days = Math.round((date.getTime() - Date.now()) / 86400000);
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
  decision.updatedAt = new Date().toISOString();
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
    ["review", "Review", "review"],
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
        <div class="decision-result"><span>${chosen ? "Chosen" : scores[0] ? "Current lead" : "Unscored"}</span><strong>${escapeHtml(chosen?.name || scores[0]?.name || "—")}</strong></div>
        ${progressRing(decisionProgress(decision))}
      </a>
      <button class="icon-control row-menu" type="button" data-action="decision-menu" data-id="${attr(decision.id)}" aria-label="More actions for ${attr(decision.title)}">${icon("more")}</button>
    </article>`;
  }).join("")}</div>` : `<div class="empty-state reveal">
      <div class="empty-glyph" aria-hidden="true">?</div>
      <h2>${all.length ? "No decisions match this view." : "Your first clear decision starts here."}</h2>
      <p>${all.length ? "Try another search or status filter." : "Give the choice a name. We’ll help you expose the trade-offs without taking the decision away from you."}</p>
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
  const marks = { blank: "?", career: "↗", purchase: "◇", move: "⌖", venture: "△", hire: "+1" };
  return marks[key] || "?";
}

function renderNew() {
  return shell(`<div class="page page--new">
    <header class="new-toolbar reveal">
      <a class="text-link" href="#/home">${icon("arrow", "icon--back")} Back to decisions</a>
      <p><span>New room</span><small>Anna builds the first draft</small></p>
    </header>
    <form id="new-decision-form" class="new-composer reveal">
      <div class="composer-core">
        <div class="new-prompt-heading"><div><p class="eyebrow">Start here</p><h1>What are you deciding?</h1></div><p>Anna proposes the options, criteria, scores, risks, and questions for you to review.</p></div>
        <label class="field field--hero"><span class="sr-only">What decision are you facing?</span><textarea name="title" id="new-title" rows="2" maxlength="140" required placeholder="${attr(TEMPLATES[state.selectedTemplate].prompt)}"></textarea><small class="field-guidance">Describe one concrete choice. Everything stays editable.</small></label>
        <details class="composer-details">
          <summary><span><strong>Refine the setup</strong><small>Optional context, deadline, and depth</small></span>${icon("arrow")}</summary>
          <div class="composer-details__body">
            <label class="field"><span>What context should the room understand?</span><textarea name="context" rows="3" maxlength="2400" placeholder="What changed, what is at stake, and what constraints matter?"></textarea></label>
            <div class="composer-row"><fieldset class="mode-switch"><legend>Depth</legend><label><input type="radio" name="mode" value="quick" checked><span>Quick</span></label><label><input type="radio" name="mode" value="deep"><span>Deep</span></label></fieldset><label class="field field--date"><span>Decision deadline <small>Optional</small></span><input type="date" name="deadline"></label></div>
          </div>
        </details>
        <div class="composer-action"><p>Your decision stays yours. Anna prepares the analysis.</p><button class="button button--accent button--nested" type="submit"><span>Build my first draft</span><i>${icon("arrow")}</i></button></div>
      </div>
      <fieldset class="template-fieldset"><legend><span>Optional starting frames</span><small>Choose one only if it helps.</small></legend><div class="template-grid">${Object.entries(TEMPLATES).map(([key, template]) => `<label class="template-choice ${state.selectedTemplate === key ? "is-selected" : ""}"><input type="radio" name="template" value="${key}" ${state.selectedTemplate === key ? "checked" : ""}><span class="template-mark">${templateIcon(key)}</span><span><small>${escapeHtml(template.eyebrow)}</small><strong>${escapeHtml(template.name)}</strong></span></label>`).join("")}</div></fieldset>
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
  const source = meta.source === "anna" ? "Anna first draft" : "Starter draft · ready to refine";
  const status = state.draftBusy ? "Anna is refining this room…" : source;
  return `<section class="draft-studio reveal" aria-labelledby="draft-studio-title">
    <div class="draft-studio__mark">${icon("spark")}</div>
    <div class="draft-studio__copy"><p class="eyebrow">${escapeHtml(status)}</p><h2 id="draft-studio-title">A working analysis, not a blank worksheet.</h2><p>${escapeHtml(meta.reasoning || "Review Anna's suggestions, then correct anything that does not match your situation.")}</p>
      <div class="draft-facts"><span><strong>${decision.options.length}</strong> options</span><span><strong>${decision.criteria.length}</strong> criteria</span><span><strong>${decision.premortem.length || 5}</strong> premortem causes</span><span><strong>${decision.deadline ? shortDate(decision.deadline) : "Not set"}</strong> decision deadline</span></div>
      ${meta.clarifyingQuestions?.length ? `<div class="draft-questions"><strong>Questions to tighten the draft</strong><ul>${meta.clarifyingQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul></div>` : ""}
    </div><button class="button button--quiet" type="button" data-action="refine-draft" ${state.draftBusy ? "disabled" : ""}>${icon("spark")} ${meta.source === "anna" ? "Refresh with Anna" : "Refine with Anna"}</button>
  </section>`;
}

function renderFrame(decision) {
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "frame", "01 · Frame", "Name what is\nreally at stake.", "A strong decision begins with a precise question, credible options, and criteria that reflect your real priorities.")}
    ${draftStudio(decision)}
    <section class="frame-layout reveal">
      <div class="paper-shell paper-shell--large"><div class="paper-core">
        <div class="section-heading"><div><p class="eyebrow">Decision statement</p><h2>The question</h2></div><span class="mode-badge">${decision.mode === "quick" ? "Quick room" : "Deep room"}</span></div>
        <label class="field field--hero"><span>Decision</span><textarea data-decision-field="title" maxlength="140" rows="2">${escapeHtml(decision.title)}</textarea></label>
        <label class="field"><span>Context</span><textarea data-decision-field="context" maxlength="2400" rows="5" placeholder="What changed, what is at stake, and what would a good outcome look like?">${escapeHtml(decision.context)}</textarea></label>
        <label class="field field--date"><span>Decision deadline <small>Optional</small></span><input data-decision-field="deadline" type="date" value="${attr(decision.deadline)}"></label>
      </div></div>
      <aside class="frame-note"><span class="note-number">01</span><p>Write the choice so a thoughtful outsider could understand it in one reading.</p><blockquote>“Which path best serves the next twelve months?” is stronger than “What should I do?”</blockquote></aside>
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
    ${stageHeader(decision, "compare", "02 · Compare", "Make the trade-offs\nvisible.", "Score consistently, record the evidence behind each rating, and notice where a small assumption changes the leader.")}
    <section class="compare-ai reveal" aria-labelledby="compare-ai-title"><div class="compare-ai__head"><span class="ai-spark">${icon("spark")}</span><div><p class="eyebrow">${decision.draftMeta?.source === "anna" ? "Anna analysis" : "AI first-pass analysis"}</p><h2 id="compare-ai-title">${escapeHtml(insight.headline)}</h2></div><span class="draft-chip">Editable suggestion</span></div><p>${escapeHtml(insight.summary)}</p><div class="compare-ai__signals"><div><span>Why it leads</span><strong>${escapeHtml(insight.reason)}</strong></div><div><span>Most influential</span><strong>${escapeHtml(insight.weight)}</strong></div><div><span>Stability</span><strong>${escapeHtml(insight.sensitivity)}</strong></div><div><span>User support</span><strong>${escapeHtml(insight.evidence)}</strong></div></div></section>
    <section class="compare-lead reveal"><div><p class="eyebrow">Live ranking</p><h2>Clarity, not false precision.</h2><p>The matrix converts your inputs into a comparable 0–100 view. It does not turn judgment into fact.</p></div>${scoreSummary(decision)}</section>
    <section class="matrix-section reveal">
      <div class="section-heading"><div><p class="eyebrow">Comparison matrix</p><h2>Score each fit from 1 to 5.</h2></div><div class="scale-key"><span>1 · Poor fit</span><span>3 · Mixed</span><span>5 · Strong fit</span></div></div>
      <div class="matrix-scroll"><table class="decision-matrix"><thead><tr><th scope="col">Criterion <small>Weight</small></th>${decision.options.map((option) => `<th scope="col">${escapeHtml(option.name)}</th>`).join("")}</tr></thead><tbody>${decision.criteria.map((criterion) => `<tr><th scope="row"><strong>${escapeHtml(criterion.name)}</strong><span>${criterion.weight} weight</span></th>${decision.options.map((option) => { const rating = decision.ratings[option.id][criterion.id]; return `<td><label class="rating-control"><span class="sr-only">${attr(option.name)} score for ${attr(criterion.name)}</span><output data-rating-value="${attr(option.id)}:${attr(criterion.id)}">${rating}</output><input type="range" min="1" max="5" step="1" value="${rating}" data-rating data-option-id="${attr(option.id)}" data-criterion-id="${attr(criterion.id)}"></label></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
    </section>
    <section class="sensitivity-strip reveal">
      <div class="sensitivity-mark" aria-hidden="true">±</div>
      <div><p class="eyebrow">Sensitivity check</p><h2>${sensitivity.stable ? "The ranking is stable under a practical weight test." : escapeHtml(sensitivity.summary)}</h2><p>${sensitivity.stable ? "No single criterion changed the leader when its weight moved up or down by as much as 20 points." : `If ${sensitivity.switches[0].criterion} moved ${sensitivity.switches[0].delta > 0 ? "up" : "down"} by ${Math.abs(sensitivity.switches[0].delta)} weight points, ${sensitivity.switches[0].newLeader} would lead.`}</p></div>
      <span class="stability-chip ${sensitivity.stable ? "is-stable" : ""}">${sensitivity.stable ? "Stable" : "Sensitive"}</span>
    </section>
    <section class="evidence-section reveal">
      <div class="section-heading"><div><p class="eyebrow">Evidence & reasoning</p><h2>Separate facts from inference.</h2><p>Anna’s score reasons begin as inferences and do not raise preparation. Edit a note after checking it to mark it user-confirmed.</p></div></div>
      <div class="evidence-columns">${decision.options.map((option) => `<article class="paper-shell"><div class="paper-core"><h3>${escapeHtml(option.name)}</h3>${decision.criteria.map((criterion) => { const source = decision.evidenceSources?.[option.id]?.[criterion.id] || "unknown"; const label = source === "user" ? "User-confirmed" : source === "ai" ? decision.draftMeta?.source === "anna" ? "Anna inference" : "Starter inference" : source === "none" ? "No support yet" : "Unclassified note"; return `<label class="field field--evidence"><span class="evidence-label-row"><b>${escapeHtml(criterion.name)}</b><i class="evidence-source evidence-source--${source}">${label}</i></span><textarea data-evidence data-option-id="${attr(option.id)}" data-criterion-id="${attr(criterion.id)}" rows="2" maxlength="800" placeholder="Add an observation, result, quote, or verified constraint">${escapeHtml(decision.evidence[option.id][criterion.id])}</textarea></label>`; }).join("")}</div></article>`).join("")}</div>
      <div class="stage-continue"><p>${scores[0] ? `${escapeHtml(scores[0].name)} currently leads by ${scores[1] ? (scores[0].score - scores[1].score).toFixed(1) : "0"} points.` : "Complete the matrix to see a ranking."}</p><a class="button button--ink button--nested" href="${decisionUrl(decision, "challenge")}"><span>Challenge the result</span><i>${icon("arrow")}</i></a></div>
    </section>
  </div>`, decision);
}

function analysisCard(analysis) {
  const sections = [
    ["Blind spots", analysis.blindSpots],
    ["Questions worth answering", analysis.questions],
    ["Possible futures", analysis.scenarios],
    ["Reversible experiments", analysis.experiments],
  ].filter(([, items]) => items.length);
  return `<article class="analysis-sheet reveal">
    <header><div><span class="analysis-type">${escapeHtml(analysis.type)} · ${analysis.source === "local" ? "Local fallback" : "Anna"}</span><h2>${escapeHtml(analysis.headline)}</h2></div><time>${shortDate(analysis.createdAt)}</time></header>
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
    ${stageHeader(decision, "challenge", "03 · Challenge", "Look for what the\nmatrix cannot see.", "Pressure-test the framing, assumptions, and failure modes before a tidy score becomes an excuse to stop thinking.")}
    <section class="lens-layout reveal">
      <div class="readiness-orbit" style="--readiness:${lens.readiness}"><div><strong>${lens.readiness}</strong><span>preparation</span></div></div>
      <div class="lens-copy"><p class="eyebrow">Decision preparation</p><h2>${escapeHtml(lens.label)}</h2><p>This is a process-completeness signal—not confidence and not a verdict. It counts only user-confirmed evidence, then combines assumption confidence, score separation, and risk planning.</p><small class="lens-formula">45% user evidence · 30% assumptions · 15% separation · 10% risk planning</small></div>
      <dl class="lens-signals"><div><dt>User-confirmed evidence</dt><dd>${lens.evidenceCoverage}%</dd></div><div><dt>Assumption confidence</dt><dd>${lens.assumptionConfidence}%</dd></div><div><dt>Score separation</dt><dd>${lens.scoreSeparation}%</dd></div><div><dt>Risk planning</dt><dd>${lens.riskPreparedness}%</dd></div></dl>
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
      <div class="ai-studio__intro"><p class="eyebrow">Anna thinking studio</p><h2>Invite a useful disagreement.</h2><p>Choose a lens. Anna receives only this decision’s current context and returns a structured advisory note. It cannot alter your scores or commit for you.</p></div>
      <div class="analysis-actions">${[["challenger", "Challenge my thinking", "Find bias, missing options, and weak evidence."], ["premortem", "Run a premortem", "Imagine failure and expose preventable causes."], ["scenarios", "Explore scenarios", "Map best, expected, and difficult futures."], ["advisor", "Synthesize next steps", "Turn uncertainty into reversible experiments."]].map(([type, title, text]) => `<button class="analysis-action" type="button" data-action="run-analysis" data-type="${type}" ${state.aiBusy ? "disabled" : ""}><span>${icon("spark")}</span><strong>${title}</strong><small>${text}</small>${icon("arrow")}</button>`).join("")}</div>
    </section>
    ${latest ? `<section class="latest-analysis"><div class="section-heading"><div><p class="eyebrow">Latest analysis</p><h2>A second perspective.</h2></div>${decision.analyses.length > 1 ? `<span class="analysis-count">${decision.analyses.length} saved analyses</span>` : ""}</div>${analysisCard(latest)}</section>` : `<section class="analysis-empty reveal"><span>${icon("spark")}</span><div><h2>No AI analysis yet.</h2><p>Your deterministic preparation lens is already active. Run an Anna lens when you want a structured second opinion.</p></div></section>`}
    <div class="stage-continue reveal"><p>You still own the decision. Ask the Coach about any tension, or move directly to commitment.</p><div class="button-row"><a class="button button--quiet" href="${decisionUrl(decision, "coach")}">${icon("spark")} Ask the Coach</a><a class="button button--ink button--nested" href="${decisionUrl(decision, "commit")}"><span>Move to commitment</span><i>${icon("arrow")}</i></a></div></div>
  </div>`, decision);
}

function coachTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function renderCoach(decision) {
  const lens = confidenceLens(decision);
  const messages = decision.coach || [];
  const starters = [
    "What assumption should I test first?",
    "Where might I be rationalizing?",
    "What would make this decision reversible?",
    "What important option could be missing?",
  ];
  return shell(`<div class="page page--stage page--coach">
    ${stageHeader(decision, "coach", "04 · Coach", "Think it through\nwith a sharp partner.", "Ask about this decision in plain language. The Coach stays grounded in your room and keeps judgment in your hands.")}
    <section class="coach-layout reveal">
      <aside class="coach-context"><div class="coach-avatar">${icon("spark")}</div><p class="eyebrow">Decision Coach</p><h2>Grounded in this room.</h2><p>I can question the framing, unpack a trade-off, or turn uncertainty into a small next step. I won’t invent research or choose for you.</p><dl><div><dt>Current leader</dt><dd>${escapeHtml(lens.leader?.name || "Not scored")}</dd></div><div><dt>Preparation</dt><dd>${lens.readiness}/100</dd></div><div><dt>Saved context</dt><dd>${decision.options.length} options · ${decision.criteria.length} criteria</dd></div></dl><button class="text-link" type="button" data-action="clear-coach" ${messages.length ? "" : "disabled"}>Clear conversation</button></aside>
      <div class="chat-shell"><div class="chat-core">
        <header class="chat-head"><div><span class="presence-dot"></span><strong>Decision Coach</strong><small>${state.platform.connected ? "Powered by Anna" : "Anna required for replies"}</small></div><a class="button button--quiet" href="${decisionUrl(decision, "challenge")}">Open challenge tools</a></header>
        <div class="chat-log" id="chat-log" aria-live="polite">${messages.length ? messages.map((message) => `<article class="chat-message chat-message--${message.role}"><div class="message-avatar">${message.role === "assistant" ? icon("spark") : "You"}</div><div><header><strong>${message.role === "assistant" ? "Coach" : "You"}</strong>${message.role === "assistant" && message.source === "local" ? "<span>Local fallback</span>" : ""}<time>${coachTime(message.createdAt)}</time></header><div class="message-markdown">${renderSafeMarkdown(message.text)}</div></div></article>`).join("") : `<div class="chat-welcome"><span>${icon("challenge")}</span><h2>Bring me the part that still feels unresolved.</h2><p>The best question is often narrower than the decision itself.</p><div class="starter-grid">${starters.map((question) => `<button type="button" data-action="coach-starter" data-question="${attr(question)}">${escapeHtml(question)}${icon("arrow")}</button>`).join("")}</div></div>`}${state.coachBusy ? `<article class="chat-message chat-message--assistant is-pending"><div class="message-avatar">${icon("spark")}</div><div><header><strong>Coach</strong><span>Reading the room</span></header><div class="typing-dots" aria-label="Coach is thinking"><i></i><i></i><i></i></div></div></article>` : ""}</div>
        <form id="coach-form" class="chat-composer"><label><span class="sr-only">Message the Decision Coach</span><textarea name="question" id="coach-input" rows="1" maxlength="1200" placeholder="Ask about a trade-off, assumption, or next step…" ${state.coachBusy ? "disabled" : ""}>${escapeHtml(state.coachDraft)}</textarea></label><div><span id="coach-count">${state.coachDraft.length}/1200</span><small><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</small><button class="button button--accent button--nested" type="submit" ${state.coachBusy ? "disabled" : ""}><span>Send</span><i>${icon("arrow")}</i></button></div></form>
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
    ${stageHeader(decision, "commit", "04 · Commit", "Choose deliberately.\nLeave a trail.", "Record the choice, confidence, and first action. A clear rationale is insurance against hindsight bias.")}
    <section class="commit-layout reveal">
      <aside class="recommendation-panel"><p class="eyebrow">What the matrix says</p><span class="recommendation-score">${leader?.score ?? "—"}<small>/100</small></span><h2>${escapeHtml(leader?.name || "No leader yet")}</h2><p>${leader ? `Currently leads the weighted comparison${scores[1] ? ` by ${(leader.score - scores[1].score).toFixed(1)} points` : ""}.` : "Complete the comparison matrix first."}</p><div class="principle-note"><strong>Remember</strong><p>A score is a summary of your assumptions. It is not permission to ignore your judgment.</p></div></aside>
      <form id="commit-form" class="paper-shell paper-shell--large"><div class="paper-core">
        <p class="eyebrow">Your commitment</p><h2>${commitment ? "Update the decision record." : suggestion ? "Review Anna's recommendation." : "What will you do?"}</h2>
        ${suggestion ? `<div class="commit-draft-note"><span>${icon("spark")}</span><p><strong>Anna drafted this from your room.</strong> Confirm or edit every field before recording a commitment. It is advisory, not a decision.</p></div>` : ""}
        <label class="field"><span>Chosen option</span><select name="optionId" required><option value="">Select one</option>${decision.options.map((option) => `<option value="${attr(option.id)}" ${draft?.optionId === option.id ? "selected" : ""}>${escapeHtml(option.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Why this option?</span><textarea name="rationale" rows="5" maxlength="1800" required placeholder="Name the evidence, trade-offs, and uncertainty you are accepting.">${escapeHtml(draft?.rationale || "")}</textarea></label>
        <label class="field"><span>First concrete action</span><input name="nextAction" maxlength="500" required value="${attr(draft?.nextAction || "")}" placeholder="The next observable step"></label>
        <div class="form-split"><label class="field"><span>Confidence</span><select name="confidence"><option value="1" ${draft?.confidence === 1 ? "selected" : ""}>1 · Very uncertain</option><option value="2" ${draft?.confidence === 2 ? "selected" : ""}>2 · Cautious</option><option value="3" ${!draft || draft.confidence === 3 ? "selected" : ""}>3 · Balanced</option><option value="4" ${draft?.confidence === 4 ? "selected" : ""}>4 · Confident</option><option value="5" ${draft?.confidence === 5 ? "selected" : ""}>5 · Very confident</option></select></label><label class="field"><span>Review date</span><input type="date" name="reviewDate" required value="${attr(commitment?.reviewDate || defaultReviewDate())}"></label></div>
        <div class="form-submit"><p>You can revise this record until you complete the outcome review.</p><button class="button button--accent button--nested" type="submit"><span>${commitment ? "Update commitment" : "Record my decision"}</span><i>${icon("commit")}</i></button></div>
      </div></form>
    </section>
    ${commitment ? `<section class="commitment-receipt reveal"><span class="receipt-mark">✓</span><div><p class="eyebrow">Committed ${shortDate(commitment.decidedAt)}</p><h2>${escapeHtml(decision.options.find((option) => option.id === commitment.optionId)?.name || "Chosen option")}</h2><p>${escapeHtml(commitment.rationale)}</p></div><a class="button button--quiet" href="${decisionUrl(decision, "report")}">${icon("print")} Open decision brief</a></section>` : ""}
  </div>`, decision);
}

function defaultReviewDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function renderReview(decision) {
  const commitment = decision.commitment;
  const chosen = commitment ? decision.options.find((option) => option.id === commitment.optionId) : null;
  if (!commitment) {
    return shell(`<div class="page page--stage">${stageHeader(decision, "review", "05 · Review", "Learning begins\nafter the choice.", "Review the result without rewriting what you knew at the time.")}<section class="locked-review reveal"><span>05</span><div><h2>Commit before reviewing.</h2><p>The outcome review is intentionally locked until you record a choice, rationale, and review date.</p><a class="button button--ink button--nested" href="${decisionUrl(decision, "commit")}"><span>Go to commitment</span><i>${icon("arrow")}</i></a></div></section></div>`, decision);
  }
  return shell(`<div class="page page--stage">
    ${stageHeader(decision, "review", "05 · Review", "Close the loop.\nKeep the lesson.", "Separate decision quality from outcome luck, then carry the useful lesson into your next choice.")}
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
      <section class="brief-verdict"><span>Recorded choice</span><h2>${escapeHtml(chosen?.name || "Not committed yet")}</h2><strong>${decision.commitment ? `${decision.commitment.confidence}/5 confidence` : `${lens.readiness}/100 preparation`}</strong></section>
      <section><p class="eyebrow">Comparison</p><h2>Weighted result</h2><div class="brief-scores">${scores.map((score, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(score.name)}</strong><i><b style="transform:scaleX(${score.score / 100})"></b></i><em>${score.score}</em></div>`).join("")}</div></section>
      <section class="brief-columns"><div><p class="eyebrow">Assumptions</p><ul>${decision.assumptions.length ? decision.assumptions.map((item) => `<li>${escapeHtml(item.text)} <small>${item.confidence}/5 confidence</small></li>`).join("") : "<li>None recorded.</li>"}</ul></div><div><p class="eyebrow">Risks</p><ul>${decision.risks.length ? decision.risks.map((item) => `<li>${escapeHtml(item.text)} <small>${item.likelihood}×${item.impact} exposure</small></li>`).join("") : "<li>None recorded.</li>"}</ul></div></section>
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
  decision.evidenceSources[option.id] = {};
  for (const criterion of decision.criteria) {
    decision.ratings[option.id][criterion.id] = 3;
    decision.evidence[option.id][criterion.id] = "";
    decision.evidenceSources[option.id][criterion.id] = "none";
  }
  touch(decision);
  render();
}

function removeOption(decision, id) {
  if (decision.options.length <= 2) return;
  decision.options = decision.options.filter((option) => option.id !== id);
  delete decision.ratings[id];
  delete decision.evidence[id];
  delete decision.evidenceSources[id];
  decision.risks = decision.risks.filter((risk) => risk.optionId !== id);
  if (decision.commitment?.optionId === id) {
    decision.commitment = null;
    decision.outcome = null;
    decision.status = "draft";
  }
  if (decision.commitSuggestion?.optionId === id) {
    const nextLeader = calculateScores(decision)[0];
    decision.commitSuggestion = nextLeader ? { ...decision.commitSuggestion, optionId: nextLeader.optionId } : null;
  }
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
    decision.evidenceSources[option.id][criterion.id] = "none";
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
    delete decision.evidenceSources[option.id][id];
  }
  touch(decision);
  render();
}

async function refineDecisionDraft(decision, { automatic = false } = {}) {
  if (state.draftBusy) return;
  const baseline = decision.updatedAt;
  const generatedAt = new Date().toISOString();
  state.draftBusy = true;
  decision.draftMeta = { ...(decision.draftMeta || {}), status: "refining", generatedAt };
  if (activeDecision()?.id === decision.id) render();
  try {
    const prompt = buildDecisionDraftPrompt(decision, new Date());
    let parsed = null;
    let issues = ["no response received"];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const repair = attempt
        ? `\n\nQUALITY REPAIR REQUIRED: ${issues.join("; ")}. Rewrite the complete JSON from the beginning. Ground every option, criterion, score reason, risk, and test in the user's stated decision; never use placeholder language.`
        : "";
      const text = await state.platform.complete({
        messages: [{ role: "user", content: { type: "text", text: `${prompt}${repair}` } }],
        systemPrompt: "You are Decision Room's first-pass decision architect. Think silently, then follow the compact JSON schema exactly. Use the user's specific constraints in every section. Never use placeholder or 'verify how X fits Y' language. Never invent external facts or make the final decision. Return one complete minified JSON object only.",
        maxTokens: 4096,
        temperature: attempt ? 0.1 : 0.2,
      }, { timeoutMs: 40_000, attempts: 1 });
      try {
        parsed = parseStructuredJson(text);
        issues = decisionDraftQualityIssues(parsed, decision);
      } catch {
        parsed = null;
        issues = ["malformed or truncated JSON"];
      }
      if (parsed && issues.length === 0) break;
      parsed = null;
    }
    if (!parsed) throw new Error(`Anna returned a low-quality first draft: ${issues.join("; ")}`);
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
    if (!automatic) toast("Anna could not refine this draft, so the transparent starter analysis remains available.", "default", 7000);
  } finally {
    state.draftBusy = false;
    if (decision.draftMeta?.status === "refining") decision.draftMeta.status = decision.draftMeta.source === "anna" ? "ready" : "fallback";
    if (activeDecision()?.id === decision.id) render();
  }
}

async function runAnalysis(decision, type) {
  if (state.aiBusy) return;
  if (state.draftPromise) {
    showBusy("Finishing the first draft", "Anna is completing the initial room before starting another analysis.");
    await state.draftPromise;
  }
  showBusy(
    type === "premortem" ? "Imagining the failure before it happens" : type === "scenarios" ? "Opening three possible futures" : type === "challenger" ? "Looking for the uncomfortable question" : "Turning uncertainty into next steps",
    "Anna is reading only the evidence and assumptions in this room.",
  );
  try {
    const prompt = buildAnalysisPrompt(decision, type);
    const request = (text) => state.platform.complete({
      messages: [{ role: "user", content: { type: "text", text } }],
      systemPrompt: "/no_think\nYou are Decision Room's rigorous decision advisor. Stay grounded in the supplied decision data, distinguish evidence from assumptions, and prefer conditional advice and reversible experiments over certainty. Return one compact valid JSON object only. Keep the response under 1400 tokens and return exactly five complete premortem items when the mode asks for a premortem. Never return a partial object.",
      maxTokens: 4096,
      temperature: 0.2,
    });
    let parsed;
    let lastText = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastText = await request(attempt === 0 ? prompt : `${prompt}\n\nPrevious response was incomplete or malformed. Rewrite the full object from the beginning. For PREMORTEM mode, include exactly five items, each with a non-empty cause, warning, and mitigation.`);
      try {
        parsed = parseStructuredJson(lastText);
      } catch {
        parsed = null;
      }
      if (isAnalysisPayload(parsed, type)) break;
      parsed = null;
    }
    if (!parsed) throw new Error("Anna returned an incomplete analysis.");
    const analysis = normalizeAnalysis({ ...parsed, id: createId("analysis"), type, source: "anna", createdAt: new Date().toISOString() });
    decision.analyses.push(analysis);
    if (type === "premortem" && analysis.premortem?.length) decision.premortem = analysis.premortem.map((item) => ({ ...item, id: createId("premortem") }));
    if (decision.analyses.length > 8) decision.analyses = decision.analyses.slice(-8);
    touch(decision);
    await saveNow();
    render();
    toast("Anna’s analysis is ready and saved with this decision.", "success");
  } catch (error) {
    const analysis = buildFallbackAnalysis(decision, type);
    decision.analyses.push(analysis);
    if (type === "premortem" && analysis.premortem?.length) decision.premortem = analysis.premortem.map((item) => ({ ...item, id: createId("premortem") }));
    if (decision.analyses.length > 8) decision.analyses = decision.analyses.slice(-8);
    touch(decision);
    await saveNow();
    render();
    toast("Anna’s live response was unavailable, so a transparent local analysis was saved instead.", "default", 7000);
  } finally {
    hideBusy();
  }
}

async function sendCoachMessage(decision, question) {
  const cleanQuestion = String(question || "").trim().slice(0, 1200);
  if (!cleanQuestion || state.coachBusy) return;
  const userMessage = { id: createId("message"), role: "user", text: cleanQuestion, createdAt: new Date().toISOString() };
  decision.coach.push(userMessage);
  if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
  state.coachBusy = true;
  state.coachDraft = "";
  touch(decision);
  render();
  requestAnimationFrame(() => document.getElementById("chat-log")?.lastElementChild?.scrollIntoView({ block: "end", behavior: state.store.preferences.reduceMotion ? "auto" : "smooth" }));
  try {
    if (state.draftPromise) await state.draftPromise;
    const text = await state.platform.complete({
      messages: [{ role: "user", content: { type: "text", text: buildCoachPrompt(decision, cleanQuestion) } }],
      systemPrompt: "You are Decision Room's concise decision coach. Use only the active room context. Distinguish recorded evidence from inference, challenge kindly, prefer reversible next steps, and never make the decision for the user.",
      maxTokens: 2000,
      temperature: 0.35,
    });
    decision.coach.push({ id: createId("message"), role: "assistant", source: "anna", text: formatCoachResponse(text), createdAt: new Date().toISOString() });
    if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
    touch(decision);
    await saveNow();
  } catch (error) {
    decision.coach.push({ id: createId("message"), role: "assistant", source: "local", text: buildFallbackCoachResponse(decision, cleanQuestion), createdAt: new Date().toISOString() });
    if (decision.coach.length > 24) decision.coach = decision.coach.slice(-24);
    touch(decision);
    await saveNow();
    toast("Anna’s live reply was unavailable. The Coach used a transparent local fallback.", "default", 7000);
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const draftRequest = refineDecisionDraft(decision, { automatic: true });
    state.draftPromise = draftRequest;
    void draftRequest.finally(() => {
      if (state.draftPromise === draftRequest) state.draftPromise = null;
    });
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
      decidedAt: decision.commitment?.decidedAt || new Date().toISOString(),
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
      reviewedAt: decision.outcome?.reviewedAt || new Date().toISOString(),
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
    if (option) { option[target.dataset.optionField] = target.value.slice(0, target.dataset.optionField === "notes" ? 1800 : 100); touch(decision); }
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
    decision.evidenceSources[target.dataset.optionId][target.dataset.criterionId] = target.value.trim() ? "user" : "none";
    touch(decision);
  }
  const assumptionField = target.dataset.assumptionField;
  if (assumptionField) {
    const item = decision.assumptions.find((entry) => entry.id === target.dataset.id);
    if (item) { item[assumptionField] = assumptionField === "confidence" ? Number(target.value) : target.value.slice(0, 500); target.parentElement?.querySelector("output")?.replaceChildren(document.createTextNode(`${target.value}/5`)); touch(decision); }
  }
  const riskField = target.dataset.riskField;
  if (riskField) {
    const item = decision.risks.find((entry) => entry.id === target.dataset.id);
    if (item) { item[riskField] = ["likelihood", "impact"].includes(riskField) ? Number(target.value) : target.value.slice(0, 500); touch(decision); }
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
    decision.assumptions.push({ id: createId("assumption"), text: "", confidence: 3, evidence: "" }); touch(decision); render();
    document.querySelector('[data-assumption-field="text"]:last-of-type')?.focus();
  } else if (action === "remove-assumption" && decision) { decision.assumptions = decision.assumptions.filter((item) => item.id !== trigger.dataset.id); touch(decision); render(); }
  else if (action === "add-risk" && decision) {
    decision.risks.push({ id: createId("risk"), optionId: decision.options[0].id, text: "", likelihood: 3, impact: 3, mitigation: "" }); touch(decision); render();
  } else if (action === "remove-risk" && decision) { decision.risks = decision.risks.filter((item) => item.id !== trigger.dataset.id); touch(decision); render(); }
  else if (action === "refine-draft" && decision) await refineDecisionDraft(decision);
  else if (action === "run-analysis" && decision) await runAnalysis(decision, trigger.dataset.type);
  else if (action === "coach-starter" && decision) {
    state.coachDraft = trigger.dataset.question || "";
    render();
    document.getElementById("coach-input")?.focus();
  } else if (action === "clear-coach" && decision) {
    showConfirm({ title: "Clear this conversation?", message: "This removes the saved Coach messages from this decision. Your matrix and analyses stay unchanged.", confirmLabel: "Clear conversation", destructive: true, onConfirm: async () => { decision.coach = []; state.coachDraft = ""; touch(decision); await saveNow(); render(); toast("Coach conversation cleared."); } });
  }
  else if (action === "decision-menu" && decision) openDecisionMenu(decision);
  else if (action === "close-modal") { modalRoot.hidden = true; modalRoot.innerHTML = ""; }
  else if (action === "duplicate-decision" && decision) {
    if (state.store.decisions.length >= MAX_DECISIONS) { toast(`Delete an older room before duplicating.`, "error"); return; }
    const copy = duplicateDecision(decision);
    state.store.decisions.unshift(copy);
    modalRoot.hidden = true; modalRoot.innerHTML = "";
    await saveNow();
    location.hash = decisionUrl(copy, "frame").slice(1);
    toast("A fresh copy is ready.", "success");
  } else if (action === "delete-decision" && decision) {
    modalRoot.hidden = true; modalRoot.innerHTML = "";
    showConfirm({ title: "Delete this decision?", message: "Its matrix, analysis, commitment, and outcome record will be permanently removed.", confirmLabel: "Delete decision", destructive: true, onConfirm: async () => { state.store.decisions = state.store.decisions.filter((item) => item.id !== decision.id); await saveNow(); location.hash = "#/home"; render(); toast("Decision deleted."); } });
  } else if (action === "export-decision" && decision) {
    downloadJson(`decision-room-${decision.id}.json`, { app: "Decision Room AI", version: 1, decision });
  } else if (action === "export-all") {
    downloadJson("decision-room-ai-backup.json", state.store);
  } else if (action === "clear-all") {
    showConfirm({ title: "Clear every decision?", message: "This removes the entire Decision Room library. Export a backup first if you may need it later.", confirmLabel: "Clear all data", destructive: true, onConfirm: async () => { await state.platform.clear(); state.store = normalizeStore({}); location.hash = "#/home"; render(); toast("All Decision Room data was cleared."); } });
  } else if (action === "print") window.print();
});

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.getElementById("workspace")?.focus({ preventScroll: true });
});

let previousScrollY = 0;
window.addEventListener("scroll", () => {
  const nav = document.querySelector(".mobile-stage-nav");
  if (!nav) {
    previousScrollY = window.scrollY;
    return;
  }
  const delta = window.scrollY - previousScrollY;
  if (Math.abs(delta) >= 4) {
    nav.classList.toggle("is-hidden", delta > 0 && window.scrollY > 120);
    previousScrollY = window.scrollY;
  }
}, { passive: true });

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
  app.innerHTML = `<div class="boot-screen">${logoMarkup()}<p>Opening the room…</p></div>`;
  await state.platform.connect();
  try {
    state.store = await state.platform.load();
  } catch (error) {
    state.platform.anna = null;
    state.platform.storageMode = "device";
    state.store = await state.platform.load();
    toast(`Anna Storage was unavailable, so this session is using device storage. ${error?.message || ""}`, "error", 7000);
  }
  if (!location.hash) location.hash = "#/home";
  render();
}

boot();

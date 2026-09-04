# Decision Room AI

Public source: https://github.com/imthegoodboy/decision-room-ai

Decision Room AI is a structured decision-making workspace for Anna. It helps
people start with one plain-language choice, then lets Anna draft the first
decision model: realistic options, a deadline, weighted criteria, initial scores
with reasoning, clarifying questions, assumptions, risks, and a five-cause
premortem. The user reviews that draft, compares trade-offs, challenges the
evidence, commits deliberately, and reviews the real outcome later.

## Product workflow

```text
Frame the decision
  -> Anna drafts options, deadline, criteria, scores, and questions
  -> review the evidence and edit the draft
  -> run AI challenge and scenario analysis
  -> review Anna's conditional recommendation and record a commitment
  -> review the outcome
```

The first draft uses the active room only. Anna's LLM can refine it through the
host `llm.complete` capability, while a deterministic local draft keeps the
first-use path usable when Anna is unavailable. Every generated score and note
is labelled as a hypothesis, remains editable, and never silently changes a
user's decision or commits on their behalf. Personal decisions are stored in
bounded Anna Storage shards and fall back to the current browser only when
previewed outside Anna. Existing single-key workspaces migrate automatically,
while the shard layout prevents a large decision library from exceeding Anna's
per-value storage limit.

Features include six decision templates, an AI-first editable draft, suggested
weights and scores, clarifying questions, evidence notes, sensitivity and
readiness lenses, assumption/risk registers, a five-cause premortem, four AI
analysis modes, a contextual Coach conversation, an editable Commit
recommendation, commitment and outcome reviews, search/filter/history,
duplication, JSON backup/restore, and a printable decision brief. If a hosted
model is unavailable or returns no visible text, the app keeps the workflow
usable with a clearly labelled local fallback derived only from the room's
saved inputs.

## Anna architecture and permissions

Decision Room AI intentionally has no Executa. It is a static UI that uses the
Anna host APIs for `llm.complete`, `storage.get/set/delete/list`, and window
readiness/title updates. The manifest declares `llm.complete`,
`storage.read`, `storage.write`, and `agent.session.auto`, including the nested
`ui.host_api.agent.session.auto` shape required by the Anna permission editor.
No provider API key, external tool, or hidden network service is required.

## Local development

```powershell
npm install
npm run build
npm test
anna-app validate --strict
anna-app dev --port 5187 --slug decision-room-ai --llm-app-slug decision-room-ai --storage aps --llm-account https://anna.partners
```

Run browser acceptance in a second terminal:

```powershell
npm run test:e2e
```

Before an Anna release, run the separately gated live-provider check:

```powershell
npm run test:e2e:live
```

This uses the signed-in Anna account and therefore is intentionally excluded
from the default deterministic test suite.

See `DEPLOY.md` for the release checklist.

Anna app identity: `decision-room-ai`, version `1.1.6`, app id `218`. See
`DEPLOY.md` for the release checklist and Marketplace review state.

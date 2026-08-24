# Decision Room AI

Public source: https://github.com/imthegoodboy/decision-room-ai

Decision Room AI is a structured decision-making workspace for Anna. It helps
people frame a consequential choice, compare options against weighted criteria,
challenge their assumptions with Anna's LLM, commit deliberately, and review the
real outcome later.

## Product workflow

```text
Frame the decision
  -> define options and weighted criteria
  -> score the evidence
  -> run AI challenge and scenario analysis
  -> record a commitment
  -> review the outcome
```

The scoring engine is deterministic and fully editable. Anna's LLM adds a
separate advisory layer; it never silently changes scores or makes the final
choice. Personal decisions are stored in Anna Storage and fall back to the
current browser only when previewed outside Anna.

Release-one features include six decision templates, weighted comparison,
evidence notes, sensitivity and readiness lenses, assumption/risk registers,
four AI analysis modes, a contextual Coach conversation, commitment and outcome
reviews, search/filter/history, duplication, JSON backup/restore, and a printable
decision brief. If a hosted model is unavailable or returns no visible text, the
app keeps the workflow usable with a clearly labelled local fallback derived
only from the room's saved inputs.

## Local development

```powershell
npm install
npm run build
npm test
anna-app validate --strict
anna-app dev --port 5187 --llm-account https://anna.partners
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

Anna app identity: `decision-room-ai`, version `1.0.0`, app id `218`. The build
is installed and fully tested on the owner account and is currently awaiting
Anna's store review before public release.

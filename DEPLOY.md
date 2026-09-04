# Decision Room AI deployment

Official guide: https://forum.anna.partners/t/build-on-anna-101/228

Decision Room AI is intentionally tool-less. The app is a static UI that uses
Anna's host `llm.complete` capability for advisory drafts and Anna Storage for
bounded persistence. The manifest also declares `agent.session.auto`, including
the nested UI host shape required by the Anna permission editor. There is no
provider API key, external service, or bundled Executa to install.

## Release identity

Candidate to push and cut:

```text
app id: 218
slug: decision-room-ai
name: Decision Room AI
candidate version: 1.1.4
previous submitted version: 1.1.1 (version id 606, bundle id 579)
review status before resubmission: pending_review
review candidate before resubmission: 1.1.1
public: no (awaiting Anna approval)
architecture: UI + Anna LLM + Anna Storage; no Executa
source: https://github.com/imthegoodboy/decision-room-ai
```

Keep `app.json`, `package.json`, `package-lock.json`, and this candidate version
aligned. If code or listing content changes after a cut, bump the patch version;
never mutate or cut the same immutable version twice.

## Verification gate

```powershell
$ANNA_HOST = "https://anna.partners"
cd C:\Users\parth\Desktop\anna-decision-room-ai

npm ci
npm run check
anna-app validate --strict
anna-app dev --port 5187 --slug decision-room-ai --llm-app-slug decision-room-ai --storage aps --llm-account $ANNA_HOST
# In another terminal:
npm run test:e2e
npm run test:e2e:live
```

`test:e2e:live` is the real Anna LLM gate. It must render an analysis labelled
`Anna` and a non-fallback Coach reply. Fixture tests remain necessary for
deterministic coverage but are not a substitute for this Host API call.

The default deterministic browser gate also verifies first-use copy and CTA
placement, the AI-first draft, comparison analysis and sensitivity, five
premortem causes, an editable Commit recommendation, exact review dates,
Storage restore after reopen, responsive layout, and accessibility. If the
local bridge times out while starting, warm its cached runtime once and retry:

```powershell
uvx --from anna-app-runtime-local@0.2.0a21 anna-app-bridge --help
```

## Identity and version gate

```powershell
anna-app apps status decision-room-ai --account $ANNA_HOST --json
git status --short
```

The intended new identity is:

```text
slug: decision-room-ai
name: Decision Room AI
version: 1.1.4
architecture: UI + Anna LLM + Anna Storage; no Executa
```

## Push, cut, install, and review

```powershell
git status --short
git add app.json manifest.json package.json package-lock.json README.md DEPLOY.md src bundle tests listing-assets
git commit -m "feat: make Decision Room AI proactive for marketplace review"
git push origin main

anna-app whoami --json
anna-app apps push --account $ANNA_HOST --json
anna-app apps cut 1.1.4 --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps versions decision-room-ai --account $ANNA_HOST --json
anna-app apps submit-review decision-room-ai --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
```

`apps push` uploads the mutable draft. `apps cut` creates the immutable version
used for testing/review. `submit-review` requests Marketplace review; it does
not make the app public. Install the exact cut version from the Developer page,
then repeat the workflow and permission save inside Anna.

The previous production submission completed on 2026-08-30: `apps push` produced
a ready 7-file bundle, `apps cut 1.1.0` created version id `594` with bundle id
`567`, and `apps submit-review` pinned candidate `1.1.0`. `apps sync-meta`
uploaded all six screenshots and the logo. The app remained `pending_review` and
was not released before Anna approval.

Version 1.1.1 introduced the full-width prompt-first
creation flow, compact stage headers, the compact first-draft schema expanded
into the normal editable model, a 4,096-token Anna grant ceiling, serialized
draft/analysis/Coach calls, bounded LLM retries, updated listing captures, and a
live Anna test that passed the automatic draft plus grounded Coach path. Its
CLI cut completed with version id `606`, bundle id `579`, 7 files, and
manifest SHA-256 `5ad483bb1c22d774b17e0226fbd1595a36ad9cf52ed39c37fbee76063635a1f2`.
`apps sync-meta` uploaded six refreshed English screenshots and the logo. The
candidate is pinned for review; it is not public until Anna approves it.

Version 1.1.4 is the next candidate. It fixes Challenge-card clipping and Frame
control overlap across Anna window sizes, safely renders Coach Markdown,
separates user-confirmed facts from Anna inference, and replaces the ambiguous
readiness label with a transparent decision-preparation score. It also retries
generation and rejects generic, incomplete, or incorrectly grounded drafts
before they can enter the user's decision room.

`anna-app apps grants decision-room-ai --account $ANNA_HOST --json` confirms the
installed version, enabled state, complete LLM/storage/agent-session grants,
and no missing permissions.

## Release after approval

```powershell
$ANNA_HOST = "https://anna.partners"
cd C:\Users\parth\Desktop\anna-decision-room-ai

anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps release 1.1.4 --slug decision-room-ai --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps versions decision-room-ai --account $ANNA_HOST --json
```

Expected precondition: status is `approved`. A `pending_review` response means
the reviewer has not completed the external approval yet; do not bypass it or
release early.

## Marketplace assets

The listing declares six English screenshots generated from the native harness:

```text
home-desktop.png
create-desktop.png
ai-draft-desktop.png
ai-compare-desktop.png
ai-premortem-desktop.png
coach-mobile.png
```

Regenerate them with:

```powershell
npx playwright test tests/e2e/visual-qa.spec.js
```

Copy only reviewed captures into `listing-assets/`, then rerun `npm run check`
so every declared path exists before cutting a version.

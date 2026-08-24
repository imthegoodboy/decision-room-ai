# Decision Room AI deployment

Official guide: https://forum.anna.partners/t/build-on-anna-101/228

## Current Anna state

Verified on 2026-08-24 against `https://anna.partners`:

```text
app id: 218
slug: decision-room-ai
version: 1.0.0 (version id 568)
content hash: 22e0a4dc028d19bcee94061234d87ed1e3581a3f69c2e079594968b7d1d6439e
bundle: ready (7 files, 318567 bytes)
owner install: 1.0.0, enabled, update_available=false
permissions: satisfied=true, missing=[]
review state: pending_review
public release: waiting for Anna admin approval
source: https://github.com/imthegoodboy/decision-room-ai
```

The source, logo, and three store screenshots are already uploaded. Anna blocks
`apps release` while the app is `pending_review`; this is an external review
gate, not a build failure. After the state changes to `approved`, publish the
already-tested immutable version with the release command below. Do not create
or cut another version unless code or listing content changes.

## Verification gate

```powershell
$ANNA_HOST = "https://anna.partners"
cd C:\Users\parth\Desktop\anna-decision-room-ai

npm ci
npm run check
anna-app dev --port 5187 --llm-account $ANNA_HOST
# In another terminal:
npm run test:e2e
npm run test:e2e:live
```

`test:e2e:live` is the real Anna LLM gate. It must render an analysis labelled
`Anna` and a non-fallback Coach reply. Fixture tests remain necessary for
deterministic coverage but are not a substitute for this Host API call.

## Identity and version gate

```powershell
anna-app apps status decision-room-ai --account $ANNA_HOST --json
git status --short
```

The intended new identity is:

```text
slug: decision-room-ai
name: Decision Room AI
version: 1.0.0
architecture: UI + Anna LLM + Anna Storage; no Executa
```

## Upload, install, and review

```powershell
anna-app apps publish --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps versions decision-room-ai --account $ANNA_HOST --json
anna-app apps sync-meta --account $ANNA_HOST --dry-run --json
anna-app apps sync-meta --account $ANNA_HOST --json
anna-app apps submit-review decision-room-ai --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
```

Install the exact uploaded version from the Developer page and run the complete
workflow inside Anna. Review submission is not public release. Release only the
approved exact version after Anna review.

The owner install for version `1.0.0` was completed through Anna's authenticated
developer install endpoint. `anna-app apps grants` confirms the installed
version, enabled state, complete LLM/storage grants, and no missing permissions.

## Release after approval

```powershell
$ANNA_HOST = "https://anna.partners"
cd C:\Users\parth\Desktop\anna-decision-room-ai

anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps release 1.0.0 --slug decision-room-ai --account $ANNA_HOST --json
anna-app apps status decision-room-ai --account $ANNA_HOST --json
anna-app apps versions decision-room-ai --account $ANNA_HOST --json
```

Expected precondition: status is `approved`. A `pending_review` response means
the reviewer has not completed the external approval yet; do not bypass it.

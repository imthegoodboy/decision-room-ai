# Decision Room AI deployment

Official guide: https://forum.anna.partners/t/build-on-anna-101/228

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

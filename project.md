# Decision Room AI product contract

Decision Room AI must help a person move from an ambiguous choice to a recorded,
reviewable commitment. It is not a generic chatbot and it does not make decisions
for the user.

Required release-one capabilities:

- quick and deep decision creation modes;
- reusable templates for common decision types;
- two to six editable options;
- weighted, user-editable criteria and a transparent 0–100 score;
- notes/evidence for every option;
- assumption and risk registers;
- Anna-powered challenger, premortem, and scenario analysis;
- a commitment record with confidence, rationale, next action, and review date;
- saved history, search, status filtering, duplication, and deletion;
- outcome review with lessons learned;
- print/export-friendly decision brief;
- responsive, accessible desktop and mobile UI;
- deterministic behavior when Anna's LLM is unavailable.

Provider continuity requirements:

- reject successful Host API responses whose visible text is empty;
- allow enough output budget for reasoning-capable Anna models;
- label every deterministic replacement as `Local fallback`;
- never claim that fallback text came from Anna;
- verify one real structured analysis and one real Coach reply before release.

The first release intentionally has no Executa or external backend. Anna Host API
handles LLM and storage. Collaboration can be added later only with a properly
authorized shared-state service.

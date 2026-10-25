Supersedes part of #432. Closes #484.

Bill form Select triggers and their portal listboxes now take their direction from the locale, so the expense account dropdown (and the vendor, project and item selects) render correctly in Arabic RTL.

Acceptance criteria, evidence and the AC mapping are in `docs/evidence/484/EVIDENCE.md`. Screenshots (ar/en, 375/1280) are in `docs/evidence/484/`.

E2E: `e2e-army/484-bill-select-rtl.e2e.ts` (tag `feat:mz-purchase-bills`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

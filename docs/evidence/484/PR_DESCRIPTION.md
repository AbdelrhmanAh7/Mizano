## Problem and resulting behavior

Bill dropdowns used Radix's default LTR direction on Arabic pages. All four BillForm Select roots now receive the existing locale direction, including their portalled listboxes. English remains LTR. Reuses next-intl and Radix; no new dependency.

## Linked issue and owned scope

Closes #484. Supersedes part of #432.

The current form has no expense-account dropdown; the line-item Item/Account Select is the matching control. Two other parent items contain review boilerplate without actionable findings. Changes stay within BillForm and its verification artifacts.

## ACCEPTANCE CRITERIA

1. AC1: Arabic bill triggers and opened dropdowns use RTL, including empty/manual-entry cases.
2. AC2: English controls retain LTR and manual selection works.
3. AC3: Regression fails on base and passes on head; RTL/LTR screenshots cover 375px and 1280px; authenticated e2e-army passes before merge.

## VERIFICATION REPORT

[AC-to-test/command/exit-code mapping and screenshots](EVIDENCE.md).

- Tested code head: `f8f8a1bb2e6847ce6d6f838ac9824cd005727ede`.
- Base regression: exit 1 (Arabic received LTR); head targeted Jest: exit 0, 7 tests passed.
- Changed covering tests: `bill-form.spec.tsx`, `bill-form.scan.spec.tsx`, `484-bill-select-rtl.e2e.ts`.
- Browser component checks: exit 0, four screenshots with opened dropdowns.
- Web lint: exit 0 with unrelated existing warnings.
- Web type-check: exit 1, same missing workspace declarations/errors on base.
- Authenticated e2e-army: PENDING, local runner exits 2 (`MODEL_UNAVAILABLE`). Full suite/build remain CI gates.
- Sentry: no originating Sentry issue linked or supplied; source is #432.
- Independent reviewer/provider: pending harness review; author is OpenAI Codex/GPT-6, chosen high effort.

## Demo delivery

No migration, API, money, tenant or deployment change. Reversible local UI change. Remaining validation limits and skills used are recorded in the verification report.

# Mizano: vision, mission and product decisions

Decision date: 5 September 2026. Audience: the product owner, accountants and engineering agents.

## Vision

Make dependable accounting accessible to accountants and finance teams serving businesses in Egypt, then Saudi Arabia and the UAE, through Arabic-first workflows and affordable automation.

## Mission

Turn business documents into traceable, validated accounting records with minimal rekeying, clear exceptions and accurate books. Automate intake, extraction, matching and draft preparation; make approval efficient and every posted amount explainable.

**بالعربي:** ميزانو يساعد المحاسب يحوّل الفاتورة إلى بيانات وقيد وتقارير مترابطة بسرعة، بأقل إدخال يدوي، مع الاحتفاظ بأصل المستند وكشف الأخطاء قبل الترحيل.

## Primary users and wedge

- Staff accountants: receive supplier bills, correct extraction exceptions, code expenses and reconcile payments.
- Finance managers: batch approval, period controls, AP visibility and audit evidence.
- Accounting practices: eventual authorized multi-client workspace; no assumption that an accountant has rights over every taxpayer.
- Other departments: submit documents and view permitted statuses. HR, CRM and manufacturing remain existing modules with separate readiness assessment.

Start with an Egypt-based service/trading SMB and EGP purchase bills. Sales invoice/payment/report smoke coverage protects existing core integration. Regional currencies and Arabic/English presentation remain architectural requirements; tax adapters are separate later releases.

## Raspberry Pi live outcome

The current goal is a tiny live deployment on a **Raspberry Pi 5 (8GB, arm64)**, tracked by epic **#45**, with core ledger (AP/AR, reports, Arabic/English), invoice intake and Telegram ingestion: Telegram/web ? stored original ? CPU extraction ? validated draft ? one accountant batch approval ? ledger ? partial payment ? reconciled reports. The ten-day demo target is superseded by the Pi plan (#45).

This is a committed scope and target, not an assertion that the work is already implemented. The release is blocked if accounting or tenant-isolation gates fail. Cut optional polish, vendor layouts or extra charts first; never silently cut the connected journey or change a failed gate to green.

## Product principles

1. **Accountant first.** No claims that accounting expertise is unnecessary. Remove rekeying and repetitive navigation.
2. **CPU first.** No required GPU, Colab tunnel, external AI subscription or 7B/8B inference in the demo path. Offline inference means the server performs extraction; Telegram still transports the incoming files through Telegram.
3. **Evidence before confidence.** Preserve originals, page/region evidence and versions. Unknown amounts remain unknown. An OCR score is not a calibrated probability that an invoice is correct.
4. **One source of accounting truth.** Decimal arithmetic, shared calculations, tenant checks and transactional posting govern every manual, scanned, bulk and automated route.
5. **Low-touch, explicit authority.** Automatically prepare drafts. Batch approval is a single deliberate accounting action, not a series of field confirmations. No implicit tax filing or payment execution.
6. **Country-specific compliance.** ETA, ZATCA and UAE ASP integration have different contracts. Passing OCR tests is not tax certification.
7. **Measure value.** Track ready-draft rate, correction time, reliable posting and actual CPU cost. Do not advertise a 95% automation claim before measurement.

## Scope discipline

Keep the existing Next.js/NestJS/PostgreSQL/Redis stack. Add one isolated CPU extraction worker if required by dependencies. Reuse current reports and UI components. No framework rewrite, generic agent platform, new HR/CRM/manufacturing work, speculative forecasting or supplier portal during the Pi sprint.

After demo acceptance: controlled Egypt pilot, accountant feedback and retention/access review; then ETA eInvoice PreProd, distinct eReceipt if needed, Saudi sandbox and UAE ASP partnership. Roadmap dates after the demo depend on measured capacity and authority onboarding.

# Regional accounting and e-invoicing roadmap

Research checked 5 September 2026. Product/engineering guidance, not a customer-specific tax applicability determination. The ten-day demo imports documents and records accounting; official submission is a later gated integration.

## Distinguish the systems

| Market       | Authority and system                                           | Required product direction                                                                                                                         |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Egypt        | Egyptian Tax Authority (ETA): eInvoice and distinct eReceipt   | Taxpayer-authorized ERP onboarding, country schema/code lists, eInvoice signing, submission/status tracking. eReceipt is a separate POS/B2C scope. |
| Saudi Arabia | ZATCA Fatoora, phased generation/integration                   | UBL2.1 plus KSA rules, certificate lifecycle, standard clearance and simplified reporting, QR/hash/counter requirements.                           |
| UAE          | MoF/FTA eInvoicing through accredited service providers (ASPs) | PINT-AE/Peppol sending and receiving through an ASP, tax reporting/status evidence. Partner with an ASP before considering becoming one.           |

An ordinary PDF, Word file or scanned image is not itself a statutory UAE eInvoice; OCR converts evidence into fields and does not prove authenticity or compliance. [MoF portal](https://mof.gov.ae/en/about-us/initiatives/einvoicing/).

## Egypt: first controlled country pilot

ETA requires taxpayer/ERP registration and authorization. Authenticate with the approved system credentials, isolate each taxpayer and support revocation. For eInvoice, follow canonical JSON/XML serialization, SHA-256 and CAdES-BES signing using the appropriate certificate/eSeal arrangement. Use PreProd before production. [Getting started](https://sdk.invoicing.eta.gov.eg/start/), [system authentication](https://sdk.invoicing.eta.gov.eg/api/01-login-as-taxpayer-system/), [signature creation](https://sdk.invoicing.eta.gov.eg/signature-creation/), [environment FAQ](https://sdk.invoicing.eta.gov.eg/faq/).

A Submit Documents HTTP 202 means validation is still pending. Persist submission/document IDs and reconcile later status; distinguish valid/invalid/cancelled/rejected and retain authority responses. Do not show tax success when merely queued. [Submit Documents](https://sdk.invoicing.eta.gov.eg/einvoicingapi/01-submit-documents/), [API index](https://sdk.invoicing.eta.gov.eg/einvoicingapi/).

eReceipt requires activated POS/B2C configuration and its own receipt/return lifecycle. The published API says signature validation deployment awaits an ETA decision; confirm current enforcement at onboarding instead of claiming a universal requirement. [Submit receipts](https://sdk.invoicing.eta.gov.eg/ereceiptapi/02-submit-receipt/). Structured ETA JSON/XML input should bypass OCR when available. Never disable TLS verification for a production workaround.

## Saudi Arabia: separate clearance and reporting

Phase 1 began 4 December 2021. Phase 2 began 1 January 2023 with taxpayer waves and notification. A customer's applicability/date must be checked against its actual notice. Standard tax invoices need clearance before buyer delivery; simplified invoices are reported within 24 hours of issuance. [Roll-out](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx), [detailed guidelines, May 2023](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf).

Implement UBL2.1/KSA validation, tax/rounding rules, UUID/counter/hash-chain controls and prescribed QR/stamps. Onboard through OTP/CSR, compliance checks/CSID and production CSID lifecycle; test with official SDK and sandbox. Passing a QR test is not Phase 2 certification. [XML standard, May 2023](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf), [security standard](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf), [technical onboarding guide](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf).

## UAE: use the amended timetable

The architecture uses ASP-mediated PINT-AE/Peppol exchange and parallel tax reporting. Sending and receiving both matter; it is not a copy of Saudi clearance. B2C is currently excluded from this mandate. Check an ASP's final accreditation status, not only pre-approval. [MoF portal](https://mof.gov.ae/en/about-us/initiatives/einvoicing/), [guidelines v1.1, June 2026](https://mof.gov.ae/wp-content/uploads/2026/06/UAE-Electronic-Invoicing-Guidelines_V-1.1-01June2026.pdf).

| Cohort                   | ASP appointment | Implementation |
| ------------------------ | --------------- | -------------- |
| Revenue >= AED50 million | 30 October 2026 | 1 January 2027 |
| Revenue < AED50 million  | 31 March 2027   | 1 July 2027    |
| Government entities      | 31 March 2027   | 1 October 2027 |

Pilot/voluntary start: 1 July 2026. **Conflict resolved:** the June guideline still prints 31 July for the first cohort's ASP appointment; binding MD66/2026 amends that deadline to 30 October. Read MD244/2025 with its amendment. [MD244](https://mof.gov.ae/wp-content/uploads/2025/09/Ministerial-Decision-No.-244-of-2025-on-the-Implementation-of-the-Electronic-Invoicing-System.pdf), [MD66 amendment](https://mof.gov.ae/wp-content/uploads/2026/05/Ministerial-Resolution-No.-66-of-2026-Amending-Certain-Provisions-of-Ministerial-Resolution-No.-244-of-2025-Regarding-the-Implementation-of-the-Electronic-Invoicing-System-En-20260514.pdf), [MoF announcement, 10 May 2026](https://mof.gov.ae/en/news/ministry-of-finance-announces-targeted-amendments-to-einvoicing-system-decisions/).

Do not hardcode a universal ten-year retention or UAE-only hosting statement. The guidelines describe retrieval/integrity conditions and different record circumstances; sector/privacy/customer restrictions still need assessment. [Guidelines, storage section](https://mof.gov.ae/wp-content/uploads/2026/06/UAE-Electronic-Invoicing-Guidelines_V-1.1-01June2026.pdf).

## Adapter release gates

Keep accounting domain data separate from each jurisdiction's payload/status machine. Store country, taxpayer identity, schema version, document type, tax category, authority/provider IDs, signed payload hash and status history. Secure signing keys outside source control; no actual invoices or credentials in fixtures. Every adapter requires customer applicability review, current schema validation, authorized sandbox execution, rejection/retry/credit-note tests, archived evidence and controlled production authorization. None of those sandbox/production validations was performed in this research.

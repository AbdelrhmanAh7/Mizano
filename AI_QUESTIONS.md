# AI_QUESTIONS — #115 follow-ups (kept out of this PR to stay small)

1. **Email attachments use of legacy generator.** `EmailService` (`apps/api/src/modules/documents/services/email.service.ts`) calls `PdfService.generatePayslipPdf` (legacy hard-coded SAR, float formatting). Follow-up issue: delegate it to `PayslipPdfService` and remove the legacy generator. The in-app download client (`use-documents.ts`) and payslip page have already switched to `GET /api/payslips/:id/pdf`.
2. **Route method & path.** The initial spec draft mentioned `POST /api/hr/payroll/:id/payslip`; the reviewed and approved contract is `GET /api/payslips/:id/pdf?lang=ar|en` (read-only, idempotent, matching the rest of the PDF endpoints).
3. **Legacy document route deprecation.** `/documents/payslip/:id/pdf` can be deprecated in a follow-up once external consumers migrate to `/payslips/:id/pdf`.

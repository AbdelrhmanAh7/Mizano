# Business apps for clients: a pointer

FlowLine offers clients two ready-made open-source apps as deploy kits: **EspoCRM** (customers and sales) and **WordPress**
(website). The choice, reasons and what is not done are in FlowLine's `docs/plans/business-apps.md` (repo AbdelrhmanAh7/flowline,
decided 1 Nov 2026); the setup guides are in its `deploy/business-apps/`, and the connection guide is its
`docs/integrations/business-apps.md`.

What this means for Mizano:

- **No new Mizano code.** Mizano reaches these apps only through FlowLine, using what already exists: signed events and the
  integration API keys (see FlowLine's `docs/integrations/mizano.md`).
- **Mizano → EspoCRM:** FlowLine's template "Paid Mizano invoice → won deal in EspoCRM" starts from Mizano's `invoice.paid` event,
  finds the customer's open deal by the customer's email, and marks it won after a person approves.
- **EspoCRM → Mizano:** FlowLine's existing template "Deal won → Mizano draft invoice" creates the customer if needed and a
  draft invoice for review; nothing is posted without a person.
- The customer's email on the Mizano customer is the only link between the two systems. If it is empty the FlowLine template
  stops and says no open deal was found. A tiny mapping may be needed later if clients keep customers under different emails; that
  would be a separate decision.
- Nothing runs on the Mizano production server for this; each client's CRM and website run on their own server.

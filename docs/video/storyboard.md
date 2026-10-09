# Mizano real-world video: storyboard

Status: **storyboard and plan; final render at the end of the Mizano pilot (2026-11-02)**, so the film shows the
finished pilot features. Tracking issue: "Real-world video (pilot deliverable)".

This is not a UI tour. It continues the story that the Flowline film starts: **the same Cairo office-supplies
company** (sample data), the same won customer (analytical.io), now in the books. Flowline ends on a labelled
"vision" hand-off; this film picks up from it. Integration points: [integration-story.md](integration-story.md).

## Deliverables

| Cut | Length | Format | Use |
|---|---|---|---|
| Full story | 75-90 s | 1920x1080, 30 fps, H.264 MP4 + WebM, JPEG poster, EN and AR (burned-in text + WebVTT) | README, sales calls, a future landing page |
| Short | 15-20 s | same | social |
| Better together (shared with Flowline) | 30-45 s | same | both products, rendered after this pilot |

Mizano has no landing page yet, so the files are linked from `README.md` until one exists. Silent or royalty-free
music only. Light palette from `docs/DESIGN-SYSTEM.md`: teal `#0D9488` (primary), `#085041` (dark), tint `#E1F5EE`,
gold `#EF9F27` as the accent; Inter and Noto Sans Arabic. Wordmark "Mizano" / "ميزانو".

## Persona

**Hany**, the accountant at the same nine-person office-supplies company in Nasr City, Cairo, and Nour's colleague
(Nour is the Flowline film's head of sales). Quotes live in Word files, invoices in a spreadsheet, supplier bills
arrive as phone photos, and the VAT return is a late-night job at the end of every month.

## Full story (target about 85 s)

| # | Time | Beat | On screen | Real feature (route) |
|---|---|---|---|---|
| 1 | 0-5 | Pick-up | The "Won · analytical.io" card from the end of the Flowline film lands on Hany's desk. Label **"Vision · the Flowline × Mizano link is not built yet"**; today Hany adds the customer himself. | concept only |
| 2 | 5-10 | Persona | Hany's card: accountant, same company, "Quotes in Word, invoices in a spreadsheet". | (story) |
| 3 | 10-19 | Pain | "Every quote is retyped as an invoice. Bills pile up as photos. VAT is a month-end scramble. Nobody knows who still owes money." Cards: quote, invoice, bill photos, a calendar page turning red. | (story) |
| 4 | 19-23 | Turn | "So Hany keeps the books in one place: Mizano." | |
| 5 | 23-33 | Solution 1 | Real UI: new customer analytical.io, then a quote with lines and VAT. | `sales/customers`, `sales/quotes` |
| 6 | 33-42 | Solution 2 | Real UI: the accepted quote converted to an invoice; sent. | `sales/quotes` → `sales/invoices` (convert-to-invoice) |
| 7 | 42-51 | Solution 3 | Real UI: payment received recorded against the invoice; the journal entry appears in the ledger by itself. | `sales/payments`, `accounting/journals`, `accounting/general-ledger` |
| 8 | 51-60 | Solution 4 | Real UI: a supplier bill captured from a photo and posted after review (**only if bill scanning ships in the pilot**, epic #45; otherwise a bill entered by hand). | `purchases/bills/scan`, `purchases/bills` |
| 9 | 60-68 | Solution 5 | Real UI: receivables aging (who owes what), VAT return from the books, profit and loss. | `reports/ar-aging`, `tax/returns`, `reports/profit-loss` |
| 10 | 68-75 | Outcome | "Month end, 5 PM": the same cards now sit in ledger, invoices paid / due, VAT ready. "What changed for Hany": one source of truth; no retyping; VAT from the books; every number traces back to its entry. | (result of 5-9) |
| 11 | 75-80 | Call to action | Mizano wordmark, tagline, "Arabic first · English too", action from the pilot copy. | |
| 12 | 80-85 | Together | Both wordmarks: "Work flows in Flowline. The books close in Mizano." Label "Coming soon". | concept only |

Short (15-20 s): pain hook "Still retyping quotes into invoices?" → real UI quote → invoice → payment (about 10 s)
→ call to action.

## Honesty rules

- Real Mizano UI only, recorded on the seeded "Mizano Demo Company" sample data, Arabic and English routes (`/ar/...`
  is RTL). No real customers, no real tax IDs.
- Not shown as working (not built at the time of writing): ETA/ZATCA e-invoicing, Telegram intake, AI features that
  need Ollama/Colab (turned off in the served build), any Flowline link. Anything shown that is not built is
  abstract cards with a visible "vision / coming soon" label.
- No numeric claims ("saves N hours"); money in the story is sample data, EGP.

## Pipeline plan (scenes as code)

Reuse the Flowline engine (`tools/story-video/` on FlowLine_Web branch `video/story-pipeline`: scene kinds
`kinetic`, `persona`, `footage`, `outcome`, `handoff`, `cta`; shared visual language: lead/invoice cards, chapter
pills, check-mark outcomes, gradient background) as `tools/story-video/` in this repo with Mizano's `brand.ts` and
`story.ts`. Footage capture is new for Mizano (it has no Playwright): a small Playwright script records the scenes
above against the served build (web 127.0.0.1:8442, API :8112, seed `Mizano.sh seed`; credentials from the seed, never
committed) at 1920x1080 in `en` and `ar`. Render locally only (concurrency 2, never 02:45-04:00 Cairo, keep >= 20 %
RAM free), encode H.264 + WebM + posters + WebVTT, and copy the files to `~/agents/app/screens/videos/mizano/`.

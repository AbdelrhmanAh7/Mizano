# Booking a Mizano demo, and what happens after it

Cost: nothing. No calendar tool, no CRM, no third-party form.

## 1. How a person books

| Path                        | Where                                                               | What the person does                                                                                                                                                                         | Needs the owner's details?      |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **A. Request a demo**       | `/ar/demo` and `/en/demo`, linked from the login and register pages | Fills a short form: name, WhatsApp number or email, role (accountant or owner), business type, a good time. The row is stored in our own database (`DemoRequest`); only an admin can read it | No                              |
| **B. Start the free pilot** | `/ar/register`                                                      | Creates an account and an organization; no card                                                                                                                                              | No                              |
| **C. Message the owner**    | Posts and outreach messages                                         | Writes in the chat; the owner agrees a time there and adds a row to the log by hand                                                                                                          | Only the chat they already have |

Posts link to path A when the goal is a call and to path B when the person wants to try first.

## 2. How the owner sees and answers requests

1. Read the new rows (`DemoRequest`, newest first; `status` starts as `NEW`) with the admin query in
   `docs/marketing/demo-booking.md` §7 or the database tool on the pilot host. Never connect to Hetzner production
   for this: the pilot runs on the Raspberry Pi.
2. Reply within one working day, on the channel the person gave, in the language they wrote (`locale` column), with the
   confirmation template in `outreach.md` §5.
3. Set `status` to `CONTACTED`, then `BOOKED` or `CLOSED`. Delete a row when the person asks, or 90 days after the last
   contact when no pilot started.
4. Never add these people to a mailing list.

## 3. The 15-minute demo

Use `docs/sales/demo-script.ar.md` / `.en.md`. The 15 minutes:

| Minutes | What                                                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–3     | Ask how the books are kept today: program, Excel, paper; what happens to a supplier bill; who issues sales invoices legally                                                                                                 |
| 3–8     | Upload one supplier bill (their own, with their permission, or a sample); show the draft with the original beside it and what was uncertain                                                                                 |
| 8–11    | The accountant reviews, corrects one field and approves; show the entry posted and the trial balance still balancing; show the quote → invoice → payment path in one minute                                                 |
| 11–14   | Say plainly: **Mizano does not issue Egyptian e-invoices (ETA) or Saudi ZATCA invoices today.** Ask who issues theirs. Agree the pilot: one month of real bills side by side with the current system. Free during the pilot |
| 14–15   | Ask for the two-week check-in and one honest sentence of feedback; send the register link                                                                                                                                   |

Do not promise Telegram intake, VAT return drafts, accuracy figures, or a price.

## 4. Pilot checklist (after a yes)

Day 0 is the demo. Tick in the learning log.

| #   | When              | Step                                                                                                                                            | Done when                                                                      |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Day 0             | Send the register link and a two-line summary in their language                                                                                 | They have an account and an organization                                       |
| 2   | Day 0–1           | Written, in the chat: who issues sales invoices legally, who is the authorized accountant, and which month is the pilot month                   | Answers in the log (details stay private, never in this repo)                  |
| 3   | Day 1–2           | Set up in Arabic with them: company data, chart of accounts review by the accountant, opening balances, tax rates                               | Accountant confirms the setup                                                  |
| 4   | Day 2–4           | First real supplier bill uploaded, reviewed, approved                                                                                           | One posted entry with its source                                               |
| 5   | Week 1            | Customers, one quote, one invoice, one payment recorded                                                                                         | Receivables and cash agree with the accountant's own sheet                     |
| 6   | Day 7             | Short check-in: what did you use, what stopped you                                                                                              | Reply logged                                                                   |
| 7   | Month end         | Close the month together; compare the trial balance with the old system                                                                         | Differences listed and explained, or fixed                                     |
| 8   | Day 14 and day 30 | Feedback call (10 minutes): keep using it? what is missing? what would you pay, if anything (write the answer as said; do not suggest a number) | Notes logged; decision: continue, pause, stop                                  |
| 9   | Any day           | They want to leave                                                                                                                              | Export what they want, delete the organization on request, confirm in one line |

Support: reply within one working day. Reports go to the issue list with the milestone "First client ready"; never fix
by hand on a live database.

## 5. What we measure (and nothing else)

Demo requests, demos done, pilots started, first posted bill per pilot, month closed with a balanced trial balance,
still using it at day 30. No third-party visitor tracking.

## 6. Public pages: what was changed and what the web owner should still remove

Changed here: titles, descriptions, Open Graph and structured data for `/ar` and `/en`, the sitemap, and the demo page.
Still there and not ours to change in this session: `apps/web/messages/*/auth.json` `login.brandTagline`,
`login.brandFooter` and `login.features` say "AI-powered ERP, zero-touch accounting, 32 AI models, trusted by
businesses". `AGENTS.md` says unknown results stay unknown and AI is optional and off by default, so these lines
should be replaced with the promise in `plan.md` §1 before the pages are shared widely. Listed in the status file for
the owner.

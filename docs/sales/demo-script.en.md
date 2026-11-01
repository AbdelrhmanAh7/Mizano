# Mizano demo script (English)

_1 November 2026 · Every screen and button named here exists in the app today, with its English label in **bold**.
The Arabic script says the same things._

## Before you start (the day before)
No demo account exists on any live Mizano server, and we never create demo accounts on a client's live data.
1. Use a demo organization the owner prepares on a non-production copy of Mizano (for example the seeded
   "Mizano Demo Company"; note that the seed uses USD). Sign in as a user with the **Admin** role.
2. Prepare in it: a few customers and vendors, a chart of accounts (**Accounting → Chart of Accounts → Seed Accounts**), one
   accepted quote, and two draft bills already created from scans (so you can approve two at once).
3. Prepare two supplier bills to scan: one clear PDF and one phone photo. The photo usually leaves a field flagged, which shows
   the review.
4. Laptop for the demo (1440 px), a phone for one closing shot. Switch the language with the language button to the room's
   language.
5. The only price line: **Free during the pilot.** Never quote another price or a number that is not on screen.

## Part A: the 3-minute live demo

| Time | Screen | You do | You say (short) | They see |
|---|---|---|---|---|
| 0:00–0:15 | **Dashboard** | Switch to Arabic with the language button, then back. | "Arabic and English, right to left when it is Arabic." | The dashboard flips direction. |
| 0:15–0:55 | **Purchases → Scan Bill** | Drop the photo, press **Read document**. Show the progress, then the results. | "A supplier sends a photo. Mizano reads it on its own server: no AI account needed. It fills the bill and tells me what it is not sure about." | Upload, the steps **Upload / Processing / Review / Done**, the extracted vendor, totals and lines, a flagged field or **Tax rate needs review**. |
| 0:55–1:15 | Same page | Correct the flagged field, tick **I have reviewed the tax % on these lines** if shown, press **Create Bill**. | "I correct only what it flagged. Nothing is saved until I press Create." | **Bill created successfully!** The bill is a draft. |
| 1:15–1:35 | **Purchases → Bills** | Select the two prepared drafts, approve them together. | "The accountant approves; then it is posted. Two at once, or one by one." | **Approve and post 2 bills?** → **Approve & post 2 bills**. |
| 1:35–1:55 | **Accounting → Journal Entries** | Open the entry of one bill, press **View source document**. | "Every entry comes from a document, and leads back to it. Posted entries are never edited: a mistake gets a linked reversal." | Debit and credit lines, the note that it was posted by a business document, the bill. |
| 1:55–2:25 | **Sales → Quotes**, then the invoice | Open the accepted quote, press **Convert to Invoice**, then **Send Invoice**, then **Record Payment** for part of the amount. | "Quote to invoice in one click. The customer pays half today: the rest stays open." | The invoice, the payment form, the invoice now partly paid. |
| 2:25–2:45 | **Reports → Trial Balance**, then **Profit & Loss** | Switch to English. | "The books balance, and I can read them in either language." | Balanced totals; the P&L. |
| 2:45–3:00 | **Settings → AI** | Show **Connect your AI app**. | "If you already pay for Claude or ChatGPT, connect it with no key. It reads and prepares drafts; it never posts or pays. Free during the pilot." | The connection address, **Read only** / **Read and prepare drafts**, the safety line. If it says it is not turned on for this server, say so: it is switched on per server. |

**If something fails live:** say what you see. Mizano shows a clear message and does not pretend it worked.

**Do not say:** that Mizano issues or submits e-invoices to ETA or ZATCA; that bills arrive by WhatsApp, Telegram or email;
that AI is required; that customers already use it; that reports export from the report page; any price other than
"free during the pilot".

## Part B: the 60-second video storyboard

16:9 for the web and 9:16 for social (prompts in `visual-prompts.md`, same scene numbers). Arabic voice-over first, English
second; on-screen text 2 to 5 words. Record real screens of the demo organization; no invented numbers.

| # | Sec | Screen to record | On-screen text AR / EN | Voice-over AR / EN | Transition |
|---|---|---|---|---|---|
| 1 | 0–6 | A pile of paper bills, then the **Dashboard** in Arabic | «دفاترك في مكان واحد» / "Your books, one place" | «فواتير ورقية، وإكسل، وآخر شهر طويل؟» / "Paper bills, spreadsheets, a long month end?" | Cut |
| 2 | 6–15 | **Scan Bill**: drop a photo, **Read document**, progress | «صوّر الفاتورة» / "Snap the bill" | «ارفع صورة فاتورة المورد، وميزانو يقرؤها.» / "Upload the supplier's bill. Mizano reads it." | Slide |
| 3 | 15–24 | Review: flagged field, correction, **Create Bill** | «راجع ما يحتاج مراجعة» / "Check what's flagged" | «يعلّم ما لم يتأكد منه، وأنت تصحّح.» / "It flags what it isn't sure of. You correct it." | Cut |
| 4 | 24–32 | **Bills**: select two, **Approve & post** | «اعتمد ورحّل» / "Approve and post" | «لا يُرحَّل شيء قبل أن يعتمده المحاسب.» / "Nothing is posted until the accountant approves." | Slide |
| 5 | 32–40 | **Quote → Convert to Invoice → Record Payment** | «من العرض إلى التحصيل» / "Quote to payment" | «حوّل العرض إلى فاتورة، وسجّل الدفعة ولو جزئية.» / "Turn a quote into an invoice, record even part of a payment." | Cut |
| 6 | 40–48 | **Trial Balance** in Arabic, then English | «عربي وإنجليزي» / "Arabic and English" | «تقاريرك متوازنة، باللغتين.» / "Balanced reports, in both languages." | Slide |
| 7 | 48–55 | **Settings → AI → Connect your AI app** | «اشتراكك، بلا مفتاح» / "Your AI, no key" | «اربط Claude أو ChatGPT: يقرأ ويجهّز مسودات، ولا يرحّل أبدًا.» / "Connect Claude or ChatGPT: it reads and drafts, never posts." | Cut |
| 8 | 55–60 | End card with the Mizano logo | «مجاني خلال الفترة التجريبية» / "Free during the pilot" | «ابدأ بفاتورة واحدة.» / "Start with one bill." | End card |

## App screens to capture once a demo organization exists
1440 px and 390 px, Arabic and English: Dashboard, Scan Bill (upload, results, review), Bills with two selected, Journal entry
with **View source document**, invoice with a partial payment, Trial Balance, Profit & Loss, Settings → AI.
Only public pages are captured today (`screenshots/`).

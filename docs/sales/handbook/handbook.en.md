# Jarda user handbook (English)

_1 November 2026 · Free during the pilot · Names in **bold** are the menus and buttons exactly as the app shows them in English.
The Arabic handbook says the same things._

## 1. The idea

Jarda keeps the books of a small business in Arabic and English: what you sell, what you buy, what you are paid and what you
pay, and the reports that show where you stand. It is built for an owner and an accountant working together.

Three rules you can rely on:

1. **A person approves what is posted.** A scanned bill becomes a draft; it reaches the books only when someone approves it.
2. **History is never rewritten.** A posted entry is never edited: a mistake is corrected through its document (void or
   correct it) or by a linked reversal, so you can always see what happened.
3. **AI is optional and never in charge.** Jarda reads bills on its own server without AI. If you connect your own AI, it can
   read and prepare drafts, and nothing more.

What Jarda does **not** do today: it does not issue or submit e-invoices to ETA (Egypt) or ZATCA (Saudi Arabia); it does not
receive bills by WhatsApp, Telegram or email (you upload them); it does not connect to your bank directly (you import the
statement). Inventory, HR, CRM, projects and manufacturing screens exist but are not part of the pilot.

Words you will see: **Organization** (your business in Jarda), **Draft** (saved, not yet in the books), **Post** (write into
the books), **Journal entry** (the debit and credit lines behind every document), **Void** (cancel a document; Jarda posts the
reversal), **Lock date** (nothing before this date can change).

---

## 2. Sign up and sign in

**Who:** the owner. **Before you start:** an email address.

1. Open the Jarda address you were given and choose **Sign up** (on the sign-in page: "Don't have an account? Sign up").
2. Fill **First Name**, **Last Name**, **Organization Name**, **Email**, **Password** and **Confirm Password**, then press
   **Sign Up**.
3. You see **Account created**. Sign in with your email and password.
4. Switch the language at any time with the language button at the top.

**What you should see:** the **Dashboard**, and the menu: **Sales**, **Purchases**, **Accounting**, **Banking**, **Tax**,
**Reports**, **Settings** (and other areas that are outside the pilot).

**If it does not work:** forgot your password? Press **Forgot password?**. If no email arrives, ask the organization owner to
create a reset link for you in **Settings → Team & Roles** (section 9).

**Needs approval:** nothing.

---

## 3. Set up your business

**Who:** the owner or an Admin. **Before you start:** your tax registration number, the month your fiscal year starts, your
bank accounts, and your opening balances (a trial balance signed by your accountant). There is no setup wizard: you set these
in **Settings**, and we do it with you in the first week.

1. **Settings → Organization:** fill **Company Information**, then in **Tax & Currency** choose your **Base Currency** (for
   example EGP) and enter your **Tax Registration Number**. **Do this first:** a new organization starts in US dollars, and the
   base currency cannot change once something is posted.
2. **Settings → Financial Settings:** choose the **Fiscal Year Start Month** and the **Default Payment Terms (days)**.
3. **Settings → Localization:** choose the date and number format, the timezone, and the **Digits in Arabic** (Western 0123 or
   Arabic-Indic ٠١٢٣), used for amounts on Arabic screens and in Arabic PDFs.
4. **Accounting → Chart of Accounts:** press **Seed Accounts** and choose **Services Industry**, **Retail Industry** or
   **Construction Industry**. Add or rename accounts as you need.
5. **Tax → Tax Rates:** check the rates you charge and pay.
6. **Banking → Bank Accounts → New Bank Account** for each bank account (and your cash box if you track it). Leave
   **Opening Balance** at 0: opening balances go in the journal entry of step 7.
7. **Opening balances:** **Accounting → Journal Entries → New Journal Entry**, dated the day before you start, with each
   balance from the signed trial balance. Press **Create Journal** when it shows **Balanced**.

**What you should see:** **Reports → Trial Balance** on your start date matches your signed opening trial balance.

**If it does not work:** if the base currency cannot be changed, something was already posted: tell us before going further.

**Needs approval:** your accountant checks the opening balances.

---

## 4. Sales

**Who:** the owner, the accountant or a sales user (depending on the role).

### 4.1 Customers

**Sales → Customers → New Customer.** Name, contact details and tax number. Names stay as you type them.

### 4.2 Quotes

1. **Sales → Quotes → New Quote**: choose the customer, add the lines (description, quantity, rate, tax), save.
2. **Send Quote** (or **Mark as Sent** if you sent it yourself), and **Accept** when the customer agrees.
3. **Convert to Invoice**: the invoice is created from the quote with the same lines and totals.

### 4.3 Invoices

1. **Sales → Invoices → New Invoice** (or from a quote, above). It is a draft until you send it.
2. Press **Send Invoice**: the invoice is posted to the books (sales, tax, receivables).
3. **Export PDF** or **Print** gives the invoice in Arabic or English.
4. If your e-invoices are issued elsewhere (ETA), open **External e-invoice reference**, enter the **ETA number / UUID** from
   your authorized issuer and press **Save reference**. This is only for matching your records.

### 4.4 Payments received

1. On the invoice press **Record Payment**, enter the amount received (all or part) and the bank or cash account.
2. A partial payment leaves the rest open; it shows in **Reports → AR Aging**.
3. **Sales → Payments** lists every payment received. Voiding a payment reopens what it paid and posts a linked reversal.

### 4.5 Credit notes

**Sales → Credit Notes → New Credit Note** for a return or a discount after the invoice. To set it against an invoice, choose **Apply to Invoice** and pick the invoice
while you create the credit note; it cannot be applied later.

**What you should see:** the invoice status changes as it is sent and paid; the customer's balance updates.

**If it does not work:** a mistake on a sent invoice is fixed with **Void Invoice** (Jarda posts the reversal) or a credit
note, never by editing the posted entry. An invoice that already has payments or credit notes cannot be voided until those
are voided first.

**Needs approval:** sending the invoice is the approval; nothing is sent to a tax authority.

---

## 5. Purchases

**Who:** the accountant, the owner, or a user whose role can create bills.

1. **Purchases → Vendors → New Vendor** (a scanned bill can also create the vendor for you).
2. **Purchases → Bills → New Bill** to type a bill, or **Scan Bill** (a button on the same page) to read it from a file (section 6). Either way it is a
   **draft**.
3. **Approve & post** a bill to write it into the books (expense, VAT and payables). To approve several drafts at once, select
   them in the list and confirm **Approve & post {count} bills**.
4. **Record Payment** on a posted bill: all or part. **Purchases → Payments** lists **Payments Made**; voiding a payment
   reopens every bill it paid and posts a linked reversal.
5. **Purchases → Expenses → New Expense** for spending without a supplier bill. Saving it posts it to the books straight
   away, so check it before you save.
6. **Purchases → Credits → New Vendor Credit** for a supplier refund or credit, then **Apply to Bill**.

**What you should see:** the bill moves from draft to open to paid; **Reports → AP Aging** shows what you still owe.

**If it does not work:** if you do not see **New Bill** or **Scan Bill**, your role cannot create bills: ask an Admin
(section 9).

**Needs approval:** every bill is posted only by **Approve & post**.

---

## 6. Documents: scan a bill

**Who:** a user who can create bills. **Before you start:** the bill as a photo (JPEG, PNG, WebP, HEIC) or a PDF, up to 15 MB.

1. **Purchases → Bills → Scan Bill** (the page is called **Scan Bill**). Drop the file or click to choose it (one file at a time).
2. Press **Read document**. You see the steps **Upload → Processing → Review → Done**. Jarda reads the file on its own server;
   if you connected your own AI account and turned on **Read bills and receipts**, it reads with that instead (section 10).
3. Check what it found: the vendor (matched, or **Create "…" as a new vendor**), the date, the lines and the totals. Fields it
   was not sure of are marked; if you see **Tax rate needs review**, check the tax on each line and tick
   **I have reviewed the tax % on these lines**.
4. If you see **Possible duplicate detected**, check whether this bill was already entered before you continue. If the same file was uploaded before, Jarda shows the existing scan instead.
5. Press **Create Bill**. You see **Bill created successfully!** The bill is a draft: approve it as in section 5.

**What you should see:** the draft bill. Jarda keeps the uploaded file with the scan, but no screen opens it from the bill
yet: keep your own copy too.

**If it does not work:** if a field is empty, the reader did not find it: type it. It never invents a number. Word files are
not accepted: save the bill as PDF first.

**Needs approval:** the scanned bill reaches the books only after **Approve & post**.

---

## 7. Reports

**Who:** anyone whose role can view reports.

Open **Reports** and choose: **Profit & Loss**, **Balance Sheet**, **Cash Flow Statement**, **Trial Balance**,
**General Ledger**, **AR Aging**, **AP Aging**, **Sales by Customer**, **Sales by Item**, **Purchases by Vendor**.
For VAT, open **Tax → VAT Returns**. Choose the dates at the top. Switch the language to read the same report in Arabic or English.

From a journal entry, **View source document** opens the invoice, bill, payment or expense that created it.

**To take data out:** lists (invoices, bills, customers, vendors, expenses, journal entries, items) have **Export All** (CSV or
Excel). **Sales by Customer**, **Sales by Item** and **Purchases by Vendor** have **Export CSV**; the other report pages
(P&L, balance sheet, trial balance, general ledger, aging, cash flow) have no export button yet.

---

## 8. Close the month

**Who:** the accountant, then the owner.

1. **Banking**, then **Bank Transactions**, then **Import Statement**: upload the month's statement (CSV, Excel, OFX or QFX). Lines already
   imported are skipped.
2. **Banking → Reconciliation:** for each bank line, **Match** it with the payment or expense Jarda suggests, or record what
   is missing (for example a bank charge as an expense). **Bank Rules** help with lines that repeat every month.
3. Check that every bill and expense of the month is posted and every payment recorded.
4. Read **Trial Balance** and **Profit & Loss** for the month. Fix mistakes now: void or correct the document, or, for a manual
   journal entry, press **Reverse**.
5. **Settings → Financial Settings → Lock Previous Month.** From now on nothing dated on or before the lock date can be posted, changed or deleted in the books. A mistake there is corrected by a reversal dated after the lock. Invoice and bill drafts can still be prepared, but they are stopped when sent or approved. **Remove Lock** reopens it; only someone allowed to change settings can do it.

**What you should see:** "Locked through {date}" in Financial Settings.

**If it does not work:** if someone needs to post into a locked month, the owner decides whether to remove the lock, and locks
again afterwards.

**Needs approval:** the owner decides on the lock.

---

## 9. Team and roles

**Who:** the owner or an Admin.

1. **Settings → Team & Roles → Add Member:** name, email, a starting **Password** and a **Role**, then **Save**. There is no
   invitation email: give the person their password privately and ask them to change it.
2. Roles: **Admin**, **Manager**, **Accountant**, **SalesRep**, **StoreKeeper** (they are there from sign-up; press **Add standard roles** if one is missing).
   Each role has **View / Create / Edit / Delete / Export** per area. **Add Role** or **Edit Role** to change what a role can do.
3. Check what the accountant must do: for example, to scan and create bills their role needs **Create** on purchases.
4. Forgotten password and no email? Press **Create a password reset link for {name}**, copy the link and send it privately
   (for example on WhatsApp). It works once and expires in 30 minutes.
5. **Delete Member** removes someone's access; it cannot be undone.

**Needs approval:** only an Admin changes members and roles.

---

## 10. Connect your AI (optional)

Jarda works fully without AI. There are two separate ways to use your own.

### 10.1 Your AI app, with no key (Claude, ChatGPT, Codex, Gemini)

1. **Settings → AI → Connect your AI app:** copy the **Jarda address for your AI app**.
2. Follow the steps for your app on the same page. For example in Claude: Settings → Connectors → Add custom connector, paste
   the address, Connect. In ChatGPT this needs a paid plan and Developer mode.
3. Sign in to Jarda when asked and choose **Read only** or **Read and prepare drafts**.
4. **Connected AI apps** lists each app, who connected it and when it was last used; **Disconnect** removes its access at once.

Your AI app never posts, sends, pays or deletes anything. Drafts it prepares wait in Jarda for a person. If the page says
connecting an AI app is not turned on for this server, ask us: it is switched on per server.

### 10.2 Your AI account for features inside Jarda (with a key)

1. **Settings → AI → Use an API key for features inside Jarda:** choose the **Provider** (Claude, OpenAI, Google Gemini,
   OpenRouter), paste the **API key**, press **Check and connect**. The key is checked, stored encrypted and never shown again.
2. **Permission to send data:** read what is sent, tick **I agree to send this data to {provider}**, press **Agree**.
3. **AI features** (each off until you turn it on): **Read bills and receipts**, **Suggest accounts**, **Monthly summary**.
4. **Model and monthly limit:** set the **Monthly limit (USD)** (5 by default). The provider bills you directly.
5. **Disconnect** deletes the key and turns every AI feature off; accounting keeps working.

**Needs approval:** AI suggestions are drafts you review; nothing is posted by AI.

---

## 11. Connect to FlowLine (optional)

FlowLine, our automation product, can react to Jarda events (for example a paid invoice) and act in Jarda with a key limited
to what you allow: create customers and notes, and prepare draft invoices. The **Connect to FlowLine** card on the **Settings**
page gives the connection details to paste into FlowLine. Draft invoices from FlowLine wait for a person in Jarda like any
other draft.

---

## Help

Contact: the support contact named in your signed pilot agreement. When something fails, note what you pressed and what the message
said, and send it to us.

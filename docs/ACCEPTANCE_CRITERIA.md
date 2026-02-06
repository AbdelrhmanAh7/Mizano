# ERP System - Complete Acceptance Criteria Checklist

> **Usage:** Check off each criterion as you verify it works. Use `[x]` for passed, `[ ]` for pending.

---

## Module 1: Accounting & General Ledger

### 1.1 Chart of Accounts
- [ ] AC-1.1.1: User can create account with name, code, type, and optional parent
- [ ] AC-1.1.2: Account codes are unique within organization
- [ ] AC-1.1.3: Tree view displays all accounts in proper hierarchy
- [ ] AC-1.1.4: Cannot delete account that has journal entries
- [ ] AC-1.1.5: Cannot delete account that has child accounts
- [ ] AC-1.1.6: Seed script creates industry-specific default COA on org creation
- [ ] AC-1.1.7: Search/filter works across all accounts
- [ ] AC-1.1.8: Account balance = sum(debits) - sum(credits)

### 1.2 Manual Journal Entries
- [ ] AC-1.2.1: Journal entry BLOCKED if total debits ≠ total credits
- [ ] AC-1.2.2: Journal number auto-increments and never reuses deleted numbers
- [ ] AC-1.2.3: Journal dated before lock date is REJECTED with clear error
- [ ] AC-1.2.4: Each line requires: account, debit OR credit amount, description
- [ ] AC-1.2.5: Draft journals can be edited; Posted journals are locked
- [ ] AC-1.2.6: Journal affects account balances only when Posted
- [ ] AC-1.2.7: Reversal option creates opposite journal with reference

### 1.3 Recurring Journals
- [ ] AC-1.3.1: Cron job creates journals for profiles where nextDate ≤ today
- [ ] AC-1.3.2: After execution, nextDate advances to next occurrence
- [ ] AC-1.3.3: Profiles with endDate in past are marked COMPLETED
- [ ] AC-1.3.4: Paused profiles are skipped by cron job
- [ ] AC-1.3.5: Auto-post=true creates POSTED; false creates DRAFT
- [ ] AC-1.3.6: User can manually trigger execution

### 1.4 Transaction Locking
- [ ] AC-1.4.1: Any transaction dated before lock date is REJECTED
- [ ] AC-1.4.2: Error message states: "Period is locked. Lock date: [date]"
- [ ] AC-1.4.3: Only Admin role can change lock date
- [ ] AC-1.4.4: Lock date change logged in audit trail
- [ ] AC-1.4.5: Reporting still works for locked periods (read-only)

### 1.5 🤖 AI: Recurring Pattern Detection (Dejavu)
- [ ] AC-1.5.1: Weekly cron analyzes last 6 months of transactions
- [ ] AC-1.5.2: Pattern detected when 3+ similar transactions with consistent intervals
- [ ] AC-1.5.3: Amount variance tolerance is ±1%
- [ ] AC-1.5.4: On 4th occurrence, popup suggests creating recurring profile
- [ ] AC-1.5.5: Accept creates RecurringProfile pre-filled with detected values
- [ ] AC-1.5.6: Dismiss prevents future suggestions for same pattern
- [ ] AC-1.5.7: Works for journals, expenses, and bank transactions

---

## Module 2: Fixed Assets

### 2.1 Asset Register
- [ ] AC-2.1.1: Asset stores: name, type, purchase date/price, salvage value, useful life
- [ ] AC-2.1.2: Monthly depreciation = (Purchase - Salvage) / Useful Life / 12
- [ ] AC-2.1.3: Book Value = Purchase Price - Accumulated Depreciation
- [ ] AC-2.1.4: Depreciation schedule generated on asset creation
- [ ] AC-2.1.5: Asset list shows current book value and status

### 2.2 🤖 AI: Auto-Depreciation
- [ ] AC-2.2.1: Cron job runs on 30th of each month
- [ ] AC-2.2.2: Creates journal: Dr Depreciation Expense / Cr Accumulated Depreciation
- [ ] AC-2.2.3: Journal amount matches calculated monthly depreciation
- [ ] AC-2.2.4: Status → FULLY_DEPRECIATED when accumulated = depreciable amount
- [ ] AC-2.2.5: No depreciation for fully depreciated assets
- [ ] AC-2.2.6: Option for auto-post or draft for review

### 2.3 Asset Disposal
- [ ] AC-2.3.1: Disposal records: date, sale amount, method
- [ ] AC-2.3.2: Gain = Sale Amount - Book Value (if positive)
- [ ] AC-2.3.3: Loss = Book Value - Sale Amount (if negative)
- [ ] AC-2.3.4: Journal: Dr Cash + Dr Accum Depr / Cr Asset + Cr/Dr Gain/Loss
- [ ] AC-2.3.5: Asset status → DISPOSED
- [ ] AC-2.3.6: No further depreciation after disposal

---

## Module 3: CRM

### 3.1 Leads Management
- [ ] AC-3.1.1: Lead captures: name, company, email, phone, source, status
- [ ] AC-3.1.2: Source options include all major channels
- [ ] AC-3.1.3: Activity log records: calls, emails, meetings, notes with timestamps
- [ ] AC-3.1.4: Convert Lead button creates Deal linked to lead
- [ ] AC-3.1.5: Convert to Customer button creates Customer record
- [ ] AC-3.1.6: Cannot delete lead linked to a Deal

### 3.2 Deals Pipeline (Kanban)
- [ ] AC-3.2.1: Kanban displays deals in stage columns
- [ ] AC-3.2.2: Drag-and-drop moves deal and logs transition
- [ ] AC-3.2.3: Deal card shows: name, amount, probability, user, days in stage
- [ ] AC-3.2.4: Won deal triggers: Create Customer + option for Quote
- [ ] AC-3.2.5: Lost deal requires reason selection
- [ ] AC-3.2.6: Pipeline metrics: value per stage, conversion rate, avg days

### 3.3 🤖 AI: Lead Scoring
- [ ] AC-3.3.1: Demographic score: company size (15), role (15), contact info (10)
- [ ] AC-3.3.2: Behavioral: emails (10), visits (10), pricing page (10), demo (10)
- [ ] AC-3.3.3: Recency: <1 day (20), <3 days (15), <7 days (10)
- [ ] AC-3.3.4: Score decays 5% per week of inactivity
- [ ] AC-3.3.5: Score >70 appears in "Hot Leads" widget
- [ ] AC-3.3.6: Score badge displayed on lead cards

---

## Module 4: Sales

### 4.1 Customers
- [ ] AC-4.1.1: Customer stores: name, email, phone, addresses, tax ID, terms, currency
- [ ] AC-4.1.2: Cannot delete customer with existing transactions
- [ ] AC-4.1.3: Statement shows all invoices, payments, credits in date order
- [ ] AC-4.1.4: Outstanding = sum(unpaid invoices) - sum(unapplied credits)
- [ ] AC-4.1.5: Price list linked to customer auto-populates prices

### 4.2 Quotes/Estimates
- [ ] AC-4.2.1: Quote auto-numbered as EST-001, EST-002, etc.
- [ ] AC-4.2.2: Line items: item, qty, rate, discount, tax, line total
- [ ] AC-4.2.3: Totals auto-calculate: subtotal, discount, tax, grand total
- [ ] AC-4.2.4: Convert to Invoice copies all data, quote status = INVOICED
- [ ] AC-4.2.5: Cannot convert already-invoiced quote
- [ ] AC-4.2.6: PDF generation includes branding and all details
- [ ] AC-4.2.7: Email sending attaches PDF and status = SENT

### 4.3 Invoices
- [ ] AC-4.3.1: Invoice auto-numbered as INV-001, INV-002, etc.
- [ ] AC-4.3.2: Journal created: Dr AR / Cr Revenue / Cr VAT Payable
- [ ] AC-4.3.3: Balance Due = Grand Total - Payments - Applied Credits
- [ ] AC-4.3.4: Cron marks unpaid invoices past due as OVERDUE
- [ ] AC-4.3.5: Partial payment → status PARTIALLY_PAID
- [ ] AC-4.3.6: Full payment (balance=0) → status PAID
- [ ] AC-4.3.7: Cannot void PAID or PARTIALLY_PAID invoice
- [ ] AC-4.3.8: Void creates reversal journal
- [ ] AC-4.3.9: Invoice with items decreases inventory

### 4.4 Recurring Invoices
- [ ] AC-4.4.1: Profile stores template invoice data
- [ ] AC-4.4.2: Cron creates invoice on nextDate, advances to next occurrence
- [ ] AC-4.4.3: Auto-email option sends to customer immediately
- [ ] AC-4.4.4: All fields properly copied including line items

### 4.5 Credit Notes
- [ ] AC-4.5.1: Credit note references original invoice
- [ ] AC-4.5.2: Journal: Dr Sales Returns + Dr VAT / Cr AR
- [ ] AC-4.5.3: Apply to Invoice reduces balance due
- [ ] AC-4.5.4: Refund creates: Dr AR / Cr Cash
- [ ] AC-4.5.5: Credit amount cannot exceed invoice total

### 4.6 Payments Received
- [ ] AC-4.6.1: Payment records: date, amount, mode, deposit account, reference
- [ ] AC-4.6.2: Allocation splits payment across multiple invoices
- [ ] AC-4.6.3: Each invoice balance due reduced by allocated amount
- [ ] AC-4.6.4: Journal: Dr Bank/Cash / Cr AR
- [ ] AC-4.6.5: Cannot allocate more than invoice balance due
- [ ] AC-4.6.6: Over-payment creates credit balance on customer

---

## Module 5: Purchases

### 5.1 Vendors
- [ ] AC-5.1.1: Vendor stores: name, contacts, tax ID, payment terms, currency
- [ ] AC-5.1.2: Cannot delete vendor with existing transactions
- [ ] AC-5.1.3: Outstanding = sum(unpaid bills) - sum(unapplied credits)
- [ ] AC-5.1.4: Statement shows all bills, payments, credits

### 5.2 Expenses
- [ ] AC-5.2.1: Expense requires: date, expense account, amount, paid through
- [ ] AC-5.2.2: Journal: Dr Expense + Dr VAT Input / Cr Cash/Bank (no AP)
- [ ] AC-5.2.3: Receipt attachment stored and accessible
- [ ] AC-5.2.4: "Make Recurring" creates recurring expense profile
- [ ] AC-5.2.5: AI categorization suggests expense account

### 5.3 Bills
- [ ] AC-5.3.1: Bill uses vendor's reference number
- [ ] AC-5.3.2: Journal: Dr Inventory/Expense + Dr VAT Input / Cr AP
- [ ] AC-5.3.3: Bill with inventory items increases stock
- [ ] AC-5.3.4: Cron marks unpaid bills past due as OVERDUE
- [ ] AC-5.3.5: Duplicate detection alerts if same vendor + bill# exists

### 5.4 Vendor Credits
- [ ] AC-5.4.1: Vendor credit references original bill
- [ ] AC-5.4.2: Journal: Dr AP / Cr Inventory/Expense + Cr VAT Input
- [ ] AC-5.4.3: Apply to Bill reduces balance due
- [ ] AC-5.4.4: Refund records receipt of funds

### 5.5 Payments Made
- [ ] AC-5.5.1: Payment records: date, amount, mode, paid from, reference
- [ ] AC-5.5.2: Allocation splits across multiple bills
- [ ] AC-5.5.3: Journal: Dr AP / Cr Bank/Cash
- [ ] AC-5.5.4: Each bill balance due reduced
- [ ] AC-5.5.5: Bill status → PAID when balance = 0

### 5.6 🤖 AI: OCR Smart Scan
- [ ] AC-5.6.1: Upload → Tesseract extracts text within 5 seconds
- [ ] AC-5.6.2: Extraction finds: invoice#, date, total, subtotal, tax
- [ ] AC-5.6.3: Extracted fields pre-fill bill form
- [ ] AC-5.6.4: Low-confidence fields highlighted for review
- [ ] AC-5.6.5: After 3 invoices from vendor, extraction improves
- [ ] AC-5.6.6: Duplicate warning if vendor + invoice# exists

---

## Module 6: Inventory

### 6.1 Items/Products
- [ ] AC-6.1.1: Item stores: name, SKU, type, unit, prices, accounts
- [ ] AC-6.1.2: SKU unique within organization
- [ ] AC-6.1.3: Goods track stock; Services do not
- [ ] AC-6.1.4: Opening stock supported on creation
- [ ] AC-6.1.5: FIFO: oldest stock used first for COGS

### 6.2 Composite Items / Bundles
- [ ] AC-6.2.1: Bundle = output item + component items with quantities
- [ ] AC-6.2.2: Selling bundle decreases all component stocks
- [ ] AC-6.2.3: Insufficient components blocks sale with error
- [ ] AC-6.2.4: Bundle COGS = sum of component COGS

### 6.3 Stock Movements & Adjustments
- [ ] AC-6.3.1: Every stock change logged: type, qty, date, reference, user
- [ ] AC-6.3.2: Adjustment requires: reason, account
- [ ] AC-6.3.3: Negative adjustment: Dr Shrinkage / Cr Inventory
- [ ] AC-6.3.4: Positive adjustment: Dr Inventory / Cr Other Income
- [ ] AC-6.3.5: Movement history viewable per item

### 6.4 Warehouses
- [ ] AC-6.4.1: All transactions specify warehouse_id
- [ ] AC-6.4.2: Stock tracked per item per warehouse
- [ ] AC-6.4.3: Transfer moves stock (no accounting entry)
- [ ] AC-6.4.4: Total stock = sum of all warehouse quantities

### 6.5 Price Lists
- [ ] AC-6.5.1: Price list: name, adjustment type (%, fixed), value
- [ ] AC-6.5.2: Customer linked to price list
- [ ] AC-6.5.3: Invoice uses price list prices automatically
- [ ] AC-6.5.4: Price can be overridden on invoice line

### 6.6 🤖 AI: Smart Reorder Points
- [ ] AC-6.6.1: Reorder Point = (Avg Daily Sales × Lead Time) + Safety Stock
- [ ] AC-6.6.2: Safety Stock = Z × σ × √Lead Time
- [ ] AC-6.6.3: Service level configurable: 90%/95%/99%
- [ ] AC-6.6.4: Items below reorder point appear in alerts
- [ ] AC-6.6.5: Weekly recalculation for all items
- [ ] AC-6.6.6: Dead stock: items unsold 90+ days flagged

### 6.7 🤖 AI: Demand Forecasting
- [ ] AC-6.7.1: Requires minimum 2 × season length of history
- [ ] AC-6.7.2: Holt-Winters captures level, trend, seasonal
- [ ] AC-6.7.3: Returns forecast + 95% confidence bounds
- [ ] AC-6.7.4: Seasonal pattern detected and projected
- [ ] AC-6.7.5: Special period multipliers adjustable
- [ ] AC-6.7.6: Weekly recalculation

---

## Module 7: Banking

### 7.1 Bank Accounts
- [ ] AC-7.1.1: Bank account: name, number (last 4), currency, type
- [ ] AC-7.1.2: System balance = sum of ERP transactions
- [ ] AC-7.1.3: Bank balance = imported balance from feed
- [ ] AC-7.1.4: Difference highlighted until reconciled

### 7.2 Bank Feed Import
- [ ] AC-7.2.1: Accepts CSV, XLSX, OFX formats
- [ ] AC-7.2.2: Column mapping UI
- [ ] AC-7.2.3: Duplicate detection skips existing transactions
- [ ] AC-7.2.4: Summary shows: imported, skipped, errors

### 7.3 🤖 AI: Smart Reconciliation
- [ ] AC-7.3.1: Direction check: deposits→invoices, withdrawals→bills
- [ ] AC-7.3.2: Exact amount match = 40% score
- [ ] AC-7.3.3: Reference extraction via regex = 30%
- [ ] AC-7.3.4: Fuzzy name match (Levenshtein) = 20%
- [ ] AC-7.3.5: Date proximity (7 days) = 10%
- [ ] AC-7.3.6: Score >0.8=high (green), >0.6=medium (yellow), else low (red)
- [ ] AC-7.3.7: Confirm creates payment and updates invoice/bill status
- [ ] AC-7.3.8: After 3+ manual matches, auto-suggest with high confidence

### 7.4 Bank Rules
- [ ] AC-7.4.1: Rule: pattern + action (categorize/match)
- [ ] AC-7.4.2: Rules applied on import
- [ ] AC-7.4.3: Rule suggestion after 2 identical categorizations

---

## Module 8: HR & Payroll

### 8.1 Employees
- [ ] AC-8.1.1: Employee: ID, name, department, job title, join date, salary
- [ ] AC-8.1.2: Allowances as JSON array
- [ ] AC-8.1.3: Deductions as JSON array
- [ ] AC-8.1.4: Bank details for payment

### 8.2 Attendance & Leave
- [ ] AC-8.2.1: Status: Present, Absent, Leave, Half-Day
- [ ] AC-8.2.2: Check-in/out times recorded
- [ ] AC-8.2.3: Attendance feeds into payroll LOP
- [ ] AC-8.2.4: Half-day = 0.5 absent days

### 8.3 Payroll Processing
- [ ] AC-8.3.1: Gross = Basic + sum(Allowances)
- [ ] AC-8.3.2: LOP = (Gross / 30) × Absent Days
- [ ] AC-8.3.3: Net = Gross - LOP - Taxes - Deductions
- [ ] AC-8.3.4: Payslip generated per employee
- [ ] AC-8.3.5: Journal: Dr Salaries / Cr Payroll Payable + Cr Tax Payable
- [ ] AC-8.3.6: Journal debits = credits
- [ ] AC-8.3.7: Cannot run payroll twice for same month

### 8.4 🤖 AI: Overtime Anomaly
- [ ] AC-8.4.1: Alert when overtime >400% above 6-month average
- [ ] AC-8.4.2: Alert in notification system with severity

---

## Module 9: Manufacturing

### 9.1 Bill of Materials
- [ ] AC-9.1.1: BOM: finished good + raw materials with quantities
- [ ] AC-9.1.2: Operations cost tracked
- [ ] AC-9.1.3: Nested BOMs supported

### 9.2 Work Orders
- [ ] AC-9.2.1: Work order: WO#, BOM, qty to produce, status
- [ ] AC-9.2.2: Material requirements = BOM × production qty
- [ ] AC-9.2.3: Alert if raw material insufficient
- [ ] AC-9.2.4: Status: Draft → In Process → Completed

### 9.3 Production Entry
- [ ] AC-9.3.1: Complete: raw materials decrease
- [ ] AC-9.3.2: Complete: finished goods increase
- [ ] AC-9.3.3: Journal: Dr Finished Goods / Cr Raw Materials + Cr COGM
- [ ] AC-9.3.4: Actual vs theoretical consumption tracked

---

## Module 10: Projects

### 10.1 Projects
- [ ] AC-10.1.1: Project: name, customer, billing method, budget, status, users
- [ ] AC-10.1.2: Project_ID linkable to invoices, expenses, bills
- [ ] AC-10.1.3: Profit = Invoiced - (Expenses + Bills + Labor)
- [ ] AC-10.1.4: Budget alert at 80%

### 10.2 Tasks
- [ ] AC-10.2.1: Task: name, project, description, hourly rate, billable flag

### 10.3 Timesheets
- [ ] AC-10.3.1: Entry: user, project, task, date, duration, billable
- [ ] AC-10.3.2: Timer widget creates entry on stop
- [ ] AC-10.3.3: Status: Unbilled → Invoiced
- [ ] AC-10.3.4: Invoiced timesheets locked

### 10.4 Project Invoicing
- [ ] AC-10.4.1: "Create Invoice" bills unbilled hours
- [ ] AC-10.4.2: Line items show hours × rate per task
- [ ] AC-10.4.3: Expenses optionally included
- [ ] AC-10.4.4: Timesheets marked INVOICED after billing

---

## Module 11: VAT & Tax

### 11.1 Tax Settings
- [ ] AC-11.1.1: Tax rate: name, %, type, linked account
- [ ] AC-11.1.2: Default tax rate settable
- [ ] AC-11.1.3: Tax applied on invoices and bills

### 11.2 VAT Returns
- [ ] AC-11.2.1: Generate return for selected period
- [ ] AC-11.2.2: Output VAT = sum from invoices + credit notes
- [ ] AC-11.2.3: Input VAT = sum from bills + expenses
- [ ] AC-11.2.4: Net = Output - Input
- [ ] AC-11.2.5: File Return locks period transactions
- [ ] AC-11.2.6: Clearing journal created on filing

### 11.3 VAT Payments
- [ ] AC-11.3.1: Payment linked to return
- [ ] AC-11.3.2: Journal: Dr VAT Payable / Cr Bank
- [ ] AC-11.3.3: Return updated with payment reference

### 11.4 🤖 AI: Tax Alerts
- [ ] AC-11.4.1: Deadline alerts: 7, 3, 1 days before
- [ ] AC-11.4.2: Alert if bills missing vendor Tax ID
- [ ] AC-11.4.3: Suggest non-deductible for entertainment

---

## Module 12: Reports & Analytics

### 12.1 Financial Reports
- [ ] AC-12.1.1: P&L: Revenue - Expenses = Net Income with comparison
- [ ] AC-12.1.2: Balance Sheet: Assets = Liabilities + Equity (MUST balance)
- [ ] AC-12.1.3: Cash Flow: Operating + Investing + Financing = Net Cash
- [ ] AC-12.1.4: Trial Balance: Debits = Credits (MUST balance)
- [ ] AC-12.1.5: General Ledger: running balance correct
- [ ] AC-12.1.6: All reports support date range filtering
- [ ] AC-12.1.7: All reports exportable to CSV/Excel

### 12.2 Sales & AR Reports
- [ ] AC-12.2.1: Sales by Customer/Item/Salesperson correct totals
- [ ] AC-12.2.2: AR Aging buckets: 1-15, 16-30, 31-60, 61-90, 90+
- [ ] AC-12.2.3: Aging shows balance due only
- [ ] AC-12.2.4: 90+ days highlighted red

### 12.3 🤖 AI: Financial Narrative
- [ ] AC-12.3.1: Monthly narrative generated automatically
- [ ] AC-12.3.2: Revenue >5% change mentioned with percentage
- [ ] AC-12.3.3: Top expense increases identified
- [ ] AC-12.3.4: Cash flow warning if negative within 30 days
- [ ] AC-12.3.5: AR alert if overdue >30% of revenue

### 12.4 Dashboard
- [ ] AC-12.4.1: Stat cards: Revenue, Expenses, Net Profit, Bank Balance
- [ ] AC-12.4.2: AR vs AP bar chart
- [ ] AC-12.4.3: Cash flow trend line (6 months)
- [ ] AC-12.4.4: Top expenses pie chart
- [ ] AC-12.4.5: AI Alerts widget (top 5)
- [ ] AC-12.4.6: Recent transactions (last 10)
- [ ] AC-12.4.7: Dashboard loads within 3 seconds

---

## Module 13: Admin & Security

### 13.1 Users & Roles
- [ ] AC-13.1.1: Default roles: Admin, Accountant, Sales Rep, Store Keeper, Manager
- [ ] AC-13.1.2: Permissions: View, Create, Edit, Delete, Export per module
- [ ] AC-13.1.3: Permission checks on every API endpoint
- [ ] AC-13.1.4: No permission → 403 Forbidden
- [ ] AC-13.1.5: Admin can create custom roles

### 13.2 Audit Trail
- [ ] AC-13.2.1: Every CREATE/UPDATE/DELETE logged
- [ ] AC-13.2.2: Log: user, timestamp, action, entity, old/new values
- [ ] AC-13.2.3: Audit logs immutable
- [ ] AC-13.2.4: Searchable by user, date, entity

### 13.3 Multi-Tenancy
- [ ] AC-13.3.1: ALL queries include organizationId filter
- [ ] AC-13.3.2: Org A cannot see ANY data from Org B
- [ ] AC-13.3.3: Cross-org access returns 404 (not 403)
- [ ] AC-13.3.4: AI models per organization

---

## 🤖 AI Models Acceptance Criteria

### Model 1: Transaction Auto-Categorization
- [ ] AC-AI-1.1: Trains on user's history (min 20 examples)
- [ ] AC-AI-1.2: Returns: suggestion, confidence (0-1), top 3 alternatives
- [ ] AC-AI-1.3: Confidence <50% = "low", not auto-filled
- [ ] AC-AI-1.4: User corrections stored as training data
- [ ] AC-AI-1.5: Retrain after 50 corrections
- [ ] AC-AI-1.6: Target 85%+ accuracy after 200 examples

### Model 2: Bank Reconciliation Matcher
- [ ] AC-AI-2.1: Direction filter (deposit vs withdrawal)
- [ ] AC-AI-2.2: Scoring: amount (40%), reference (30%), name (20%), date (10%)
- [ ] AC-AI-2.3: Levenshtein >0.7 contributes to name score
- [ ] AC-AI-2.4: Score >0.8=high, >0.6=medium, else low
- [ ] AC-AI-2.5: Confirmed matches stored for learning
- [ ] AC-AI-2.6: After 3 matches, auto-suggest rule

### Model 3: Invoice OCR
- [ ] AC-AI-3.1: OCR within 5 seconds
- [ ] AC-AI-3.2: Extracts: date, total, subtotal, tax, invoice#, vendor
- [ ] AC-AI-3.3: Multiple date formats supported
- [ ] AC-AI-3.4: Low-confidence fields marked
- [ ] AC-AI-3.5: Vendor layout learning after 3 invoices
- [ ] AC-AI-3.6: Duplicate detection

### Model 4: Demand Forecasting
- [ ] AC-AI-4.1: Requires 2 × season length history
- [ ] AC-AI-4.2: Holt-Winters: level + trend + seasonal
- [ ] AC-AI-4.3: Returns forecast + 95% CI bounds
- [ ] AC-AI-4.4: Seasonal patterns projected
- [ ] AC-AI-4.5: Special period multipliers
- [ ] AC-AI-4.6: Weekly recalculation

### Model 5: Cash Flow Prediction
- [ ] AC-AI-5.1: Monte Carlo with current balance, AR, AP, recurring
- [ ] AC-AI-5.2: AR randomized: 70% on-time, 20% late 1-14d, 10% late 15-30d
- [ ] AC-AI-5.3: Returns: optimistic (90%), expected (50%), pessimistic (10%)
- [ ] AC-AI-5.4: Alert date when pessimistic goes negative
- [ ] AC-AI-5.5: Daily recalculation at 2 AM
- [ ] AC-AI-5.6: What-if analysis support

### Model 6: Payment Date Prediction
- [ ] AC-AI-6.1: Requires 3+ paid invoices
- [ ] AC-AI-6.2: Calculates avg days + std dev
- [ ] AC-AI-6.3: Factors: amount, day of week, month end
- [ ] AC-AI-6.4: Confidence: high (std<5), medium (std<15), low
- [ ] AC-AI-6.5: Fallback to payment terms for new customers
- [ ] AC-AI-6.6: Feeds into cash flow prediction

### Model 7: Lead Scoring
- [ ] AC-AI-7.1: Score 0-100: demographic (40) + behavioral (40) + recency (20)
- [ ] AC-AI-7.2: Demographic: company size, role, contact info
- [ ] AC-AI-7.3: Behavioral: emails, visits, pricing page, demo
- [ ] AC-AI-7.4: Decays 5% per week inactive
- [ ] AC-AI-7.5: Score >70 = hot, <30 = cold
- [ ] AC-AI-7.6: ML after 100+ won/lost deals

### Model 8: Anomaly Detection
- [ ] AC-AI-8.1: Requires 10+ historical data points
- [ ] AC-AI-8.2: Z-score >3 = warning, >4 = critical
- [ ] AC-AI-8.3: IQR: flag if < Q1-1.5×IQR or > Q3+1.5×IQR
- [ ] AC-AI-8.4: Context: transactions, overtime, spending
- [ ] AC-AI-8.5: Rolling 90-day baseline, daily update
- [ ] AC-AI-8.6: Alerts in notification system

### Model 9: Smart Reorder Points
- [ ] AC-AI-9.1: Reorder = (Avg Daily × Lead Time) + Safety Stock
- [ ] AC-AI-9.2: Safety Stock = Z × σ × √Lead Time
- [ ] AC-AI-9.3: Service level: 90%/95%/99%
- [ ] AC-AI-9.4: EOQ calculation
- [ ] AC-AI-9.5: Weekly recalculation
- [ ] AC-AI-9.6: Dead stock detection (90+ days)

### Model 10: Financial Narrative
- [ ] AC-AI-10.1: Plain-English from structured data
- [ ] AC-AI-10.2: Revenue >5% = growth/decline mentioned
- [ ] AC-AI-10.3: Top expense increases named
- [ ] AC-AI-10.4: Cash alert if negative <30 days
- [ ] AC-AI-10.5: AR alert if overdue >30% revenue
- [ ] AC-AI-10.6: No LLM required

---

## End-to-End Workflows

### Workflow 1: Quote to Cash
- [ ] WF-1.1: Create customer → quote → send → accept
- [ ] WF-1.2: Convert quote to invoice (items copied, status=INVOICED)
- [ ] WF-1.3: Send invoice (PDF, status=SENT)
- [ ] WF-1.4: Invoice items decrease inventory
- [ ] WF-1.5: Partial payment → PARTIALLY_PAID
- [ ] WF-1.6: Final payment → PAID, balance=0
- [ ] WF-1.7: All journals balance
- [ ] WF-1.8: Customer statement complete
- [ ] WF-1.9: AR aging correct
- [ ] WF-1.10: Dashboard updates

### Workflow 2: Procure to Pay
- [ ] WF-2.1: Create vendor → bill → approve
- [ ] WF-2.2: Bill items increase inventory
- [ ] WF-2.3: Partial payment → balance updated
- [ ] WF-2.4: Final payment → PAID
- [ ] WF-2.5: Expense records immediate cash outflow
- [ ] WF-2.6: All journals balance
- [ ] WF-2.7: AP aging correct

### Workflow 3: Bank Reconciliation
- [ ] WF-3.1: Import CSV → transactions created, duplicates skipped
- [ ] WF-3.2: AI matches with confidence scores
- [ ] WF-3.3: Confirm → payment created, invoice/bill updated
- [ ] WF-3.4: Unmatched → create expense or categorize
- [ ] WF-3.5: System balance = bank balance after reconciliation
- [ ] WF-3.6: Patterns learned

### Workflow 4: Period Close
- [ ] WF-4.1: Depreciation run → asset journals created
- [ ] WF-4.2: Payroll run → payslips + journal
- [ ] WF-4.3: Recurring profiles executed
- [ ] WF-4.4: VAT return generated
- [ ] WF-4.5: VAT filed → period locked
- [ ] WF-4.6: VAT payment → clearing journal
- [ ] WF-4.7: Lock date set → historical protected
- [ ] WF-4.8: Trial balance balances, P&L correct

### Workflow 5: Manufacturing
- [ ] WF-5.1: Create BOM (finished good + materials)
- [ ] WF-5.2: Work order → requirements calculated
- [ ] WF-5.3: Stock check → alert if insufficient
- [ ] WF-5.4: Complete → raw materials ↓, finished goods ↑
- [ ] WF-5.5: COGM journal balances

### Workflow 6: Project Billing
- [ ] WF-6.1: Create project with billing method, budget
- [ ] WF-6.2: Log time (timer or manual)
- [ ] WF-6.3: Record project expense
- [ ] WF-6.4: Invoice from project → hours + expenses
- [ ] WF-6.5: Timesheets INVOICED → locked
- [ ] WF-6.6: Profitability calculated

---

## Non-Functional Requirements

### Performance
- [ ] NFR-P1: Dashboard loads <3 seconds
- [ ] NFR-P2: 1000 records list loads <2 seconds
- [ ] NFR-P3: AI predictions <500ms
- [ ] NFR-P4: Reports <10 seconds for 1 year data
- [ ] NFR-P5: Indexes on organizationId, status, date

### Security
- [ ] NFR-S1: Passwords hashed with bcrypt
- [ ] NFR-S2: JWT 15min, refresh 7 days
- [ ] NFR-S3: All endpoints JWT protected
- [ ] NFR-S4: RBAC enforced
- [ ] NFR-S5: 100% multi-tenant isolation
- [ ] NFR-S6: SQL injection prevented via Prisma
- [ ] NFR-S7: Rate limiting on auth (10/min)
- [ ] NFR-S8: Audit trail on all writes

### Usability
- [ ] NFR-U1: Responsive: 1920px, 768px, 375px
- [ ] NFR-U2: Validation errors per field
- [ ] NFR-U3: Toast notifications
- [ ] NFR-U4: Loading states
- [ ] NFR-U5: Empty states with messages

### Reliability
- [ ] NFR-R1: Decimal type for all money (not float)
- [ ] NFR-R2: DB transactions for multi-table ops
- [ ] NFR-R3: Cron failure alerting
- [ ] NFR-R4: Data backup capability

### AI Quality
- [ ] NFR-AI1: All suggestions include confidence
- [ ] NFR-AI2: All suggestions dismissible (Human-in-Loop)
- [ ] NFR-AI3: Corrections feed into training
- [ ] NFR-AI4: Zero external AI APIs
- [ ] NFR-AI5: AI models per organization

---

## Summary

| Category | Count |
|----------|-------|
| Module 1: Accounting | 28 criteria |
| Module 2: Fixed Assets | 17 criteria |
| Module 3: CRM | 18 criteria |
| Module 4: Sales | 30 criteria |
| Module 5: Purchases | 23 criteria |
| Module 6: Inventory | 28 criteria |
| Module 7: Banking | 18 criteria |
| Module 8: HR & Payroll | 15 criteria |
| Module 9: Manufacturing | 11 criteria |
| Module 10: Projects | 12 criteria |
| Module 11: VAT & Tax | 13 criteria |
| Module 12: Reports | 17 criteria |
| Module 13: Admin | 12 criteria |
| AI Models | 60 criteria |
| Workflows | 37 criteria |
| Non-Functional | 22 criteria |
| **TOTAL** | **~330 criteria** |

---

*Last Updated: $(date +%Y-%m-%d)*
*Version: 1.0*

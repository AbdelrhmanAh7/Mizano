# Acceptance Criteria — Mizano ERP

Comprehensive acceptance criteria organized by module. Each criterion includes:

- **Criterion**: Testable requirement statement
- **Why**: Business justification
- **Verify**: How to test (manual or automated)
- **Edge Cases**: What to watch for

---

## 1. Authentication & Authorization

### 1.1 User Registration

#### AC-001: New user registration

- **Criterion**: The system shall allow new users to register with email, password, name, and organization name
- **Why**: Self-service onboarding reduces support overhead and accelerates user acquisition
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/register with valid data returns 201
- **Edge Cases**: Duplicate email, SQL injection in fields, unicode names, very long passwords

#### AC-002: Duplicate email rejection

- **Criterion**: The system shall reject registration with an already-registered email (400 or 409)
- **Why**: Email uniqueness prevents account conflicts and ensures reliable password recovery
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/register with duplicate email
- **Edge Cases**: Case sensitivity (Test@email.com vs test@email.com), whitespace trimming

#### AC-003: Email validation

- **Criterion**: The system shall reject registration with an invalid email format
- **Why**: Valid email is required for notifications, password recovery, and invoice delivery
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/register with "not-an-email"
- **Edge Cases**: Missing @, missing domain, double dots, international domains

#### AC-004: Password hashing

- **Criterion**: The system shall hash passwords using bcrypt before storage (never store plaintext)
- **Why**: Compromised database must not expose user passwords
- **Verify**: Unit test on auth service — verify stored password !== input password
- **Edge Cases**: Empty passwords, passwords with special characters, max length

### 1.2 Login & Session

#### AC-005: Successful login

- **Criterion**: The system shall return JWT access + refresh tokens for valid credentials
- **Why**: Stateless JWT auth enables horizontal scaling and mobile app support
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/login returns access_token and refresh_token
- **Edge Cases**: Login after password change, concurrent logins from multiple devices

#### AC-006: Invalid credentials rejection

- **Criterion**: The system shall return 401 for incorrect email or password
- **Why**: Prevent unauthorized access; generic error message prevents email enumeration
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/login with wrong password
- **Edge Cases**: Timing attacks (should take same time for invalid email vs wrong password)

#### AC-007: Non-existent user login

- **Criterion**: The system shall return 401 for login attempts with unregistered emails
- **Why**: Same response as wrong password prevents enumeration of valid accounts
- **Verify**: E2E `auth.e2e-spec.ts` — POST /auth/login with unregistered email
- **Edge Cases**: SQL injection in email field, very long email strings

#### AC-008: Protected route enforcement

- **Criterion**: The system shall return 401 for requests without a valid JWT token
- **Why**: All business data must be protected from anonymous access
- **Verify**: E2E `auth.e2e-spec.ts` — GET /accounts without Authorization header
- **Edge Cases**: Expired token, malformed token, token with invalid signature

#### AC-009: Invalid token rejection

- **Criterion**: The system shall return 401 for requests with an invalid or expired JWT
- **Why**: Compromised or expired tokens must not grant access
- **Verify**: E2E `auth.e2e-spec.ts` — Request with "Bearer invalid-token"
- **Edge Cases**: Token from different environment, token after secret rotation

#### AC-010: Token refresh

- **Criterion**: The system shall issue new access tokens via refresh token endpoint
- **Why**: Short-lived access tokens with refresh reduces exposure window if token is stolen
- **Verify**: POST /auth/refresh with valid refresh_token returns new access_token
- **Edge Cases**: Reuse of revoked refresh token, concurrent refresh requests

### 1.3 Guards & Security

#### AC-011: Public route decorator

- **Criterion**: Routes decorated with @Public() shall bypass JWT authentication
- **Why**: Login, register, and health check endpoints must be accessible without auth
- **Verify**: Unit `jwt-auth.guard.spec.ts` — isPublic=true allows access
- **Edge Cases**: Public decorator on routes that should be protected

#### AC-012: JWT guard delegation

- **Criterion**: Non-public routes shall delegate to Passport JWT strategy
- **Why**: Centralized auth logic via Passport prevents inconsistent authentication
- **Verify**: Unit `jwt-auth.guard.spec.ts` — non-public routes call super.canActivate
- **Edge Cases**: Missing Authorization header vs malformed header

#### AC-013: handleRequest validation

- **Criterion**: JwtAuthGuard.handleRequest shall throw UnauthorizedException when user is null
- **Why**: Ensures consistent error response for all invalid token scenarios
- **Verify**: Unit `jwt-auth.guard.spec.ts` — null user throws "Invalid or expired token"
- **Edge Cases**: User exists but is deactivated, user's org is deleted

---

## 2. Multi-Tenancy

### 2.1 Organization Guard

#### AC-014: Organization ID enforcement

- **Criterion**: OrganizationGuard shall inject user's organizationId into all database queries
- **Why**: Core security mechanism preventing data leaks between organizations
- **Verify**: Unit `organization.guard.spec.ts` — orgId from user matches request context
- **Edge Cases**: User with no organizationId, null user object

#### AC-015: Cross-organization access prevention

- **Criterion**: Requests with mismatching organizationId in params/query/body shall return 403
- **Why**: Prevents users from accessing other organizations' data via URL manipulation
- **Verify**: Unit `organization.guard.spec.ts` — ForbiddenException on mismatch
- **Edge Cases**: URL-encoded orgId, numeric vs string orgId, orgId in nested body objects

#### AC-016: Data isolation verification

- **Criterion**: Two organizations querying the same endpoint shall receive completely separate datasets
- **Why**: Regulatory compliance (GDPR, SOC 2) requires complete data isolation
- **Verify**: E2E `multi-tenancy.e2e-spec.ts` — Org1 and Org2 invoice lists have zero overlap
- **Edge Cases**: Shared reference data (currency rates), cross-org reports for parent companies

#### AC-017: Unauthenticated request blocking

- **Criterion**: Requests without authentication to protected endpoints shall return 401
- **Why**: Defense in depth — organization guard should never run without prior auth check
- **Verify**: E2E `multi-tenancy.e2e-spec.ts` — GET /invoices without token returns 401
- **Edge Cases**: Expired token, token from deleted organization

### 2.2 RBAC Permissions

#### AC-018: Permission decorator enforcement

- **Criterion**: Routes with @Permissions() decorator shall verify user has required permissions
- **Why**: Accountants should not access HR data; clerks should not delete journals
- **Verify**: Unit `permissions.guard.spec.ts` — user without permission gets 403
- **Edge Cases**: User role deleted mid-session, permission added after token issued

#### AC-019: Admin bypass

- **Criterion**: Users with Admin role shall bypass all permission checks
- **Why**: System administrators need unrestricted access for troubleshooting and setup
- **Verify**: Unit `permissions.guard.spec.ts` — Admin role allows any action
- **Edge Cases**: Admin role with explicitly denied permissions, multiple roles

#### AC-020: No permissions required

- **Criterion**: Routes without @Permissions() decorator shall allow any authenticated user
- **Why**: Dashboard, profile, and notification endpoints should not require specific permissions
- **Verify**: Unit `permissions.guard.spec.ts` — no decorator allows access
- **Edge Cases**: Empty permissions array vs no decorator

---

## 3. Accounting

### 3.1 Chart of Accounts

#### AC-021: Account CRUD

- **Criterion**: The system shall support create, read, update operations on accounts
- **Why**: Chart of accounts is the foundation of all financial reporting
- **Verify**: E2E `accounting.e2e-spec.ts` — GET /accounts returns list, POST creates account
- **Edge Cases**: Duplicate account codes, account with existing transactions (prevent type change)

#### AC-022: Account type classification

- **Criterion**: Each account shall be classified as ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE
- **Why**: Account types determine balance sheet vs income statement placement and normal balance direction
- **Verify**: POST /accounts with type field, validate enum constraint
- **Edge Cases**: Changing type of account with posted transactions, sub-accounts inheriting type

#### AC-023: Account hierarchy (parent-child)

- **Criterion**: Accounts shall support tree structure with parent account references
- **Why**: Enables grouped reporting (e.g., all bank accounts under "Cash & Equivalents")
- **Verify**: POST /accounts with parentId, GET /accounts returns tree structure
- **Edge Cases**: Circular references, deep nesting (>10 levels), parent in different type

#### AC-024: Account code uniqueness

- **Criterion**: Account codes shall be unique within an organization
- **Why**: Account codes are used in imports, reports, and journal entries as identifiers
- **Verify**: POST /accounts with duplicate code returns 400/409
- **Edge Cases**: Codes with leading zeros, case sensitivity

#### AC-025: Prevent deletion of accounts with balances

- **Criterion**: Accounts with posted journal entries shall not be deletable
- **Why**: Deleting an account with balance would destroy the audit trail and unbalance the ledger
- **Verify**: DELETE /accounts/:id with balance returns 400
- **Edge Cases**: Account with zero-balance (debits cancelled by credits), soft-deleted journals

### 3.2 Journal Entries

#### AC-026: Double-entry balance validation

- **Criterion**: Total debits MUST equal total credits in every journal entry, else reject with 400
- **Why**: Fundamental accounting principle — an unbalanced journal corrupts every downstream report
- **Verify**: E2E `accounting.e2e-spec.ts` — unbalanced journal returns 400; Unit test on journals service
- **Edge Cases**: Rounding (0.001 difference), multi-currency journals, many-line entries (100+ lines)

#### AC-027: Auto-numbering (JRN-XXX)

- **Criterion**: Journal entries shall be auto-assigned sequential numbers in JRN-XXX format
- **Why**: Sequential numbering enables audit trail continuity and gap detection
- **Verify**: POST /journals creates entry, verify number format matches JRN-\d+
- **Edge Cases**: Concurrent creation (race condition), number after deletion, fiscal year reset

#### AC-028: Journal soft delete

- **Criterion**: Deleting a journal entry shall set deletedAt rather than removing the record
- **Why**: Financial records must be preserved for audit trail; reversals preferred over deletions
- **Verify**: DELETE /journals/:id, then verify record still exists with deletedAt set
- **Edge Cases**: Re-deleting already deleted journal, querying includes/excludes deleted

#### AC-029: Lock date enforcement

- **Criterion**: Journal entries with dates before the lock date shall be rejected
- **Why**: Prevents modifications to closed periods, ensuring published financial statements remain accurate
- **Verify**: POST /journals with date before lock date returns 400
- **Edge Cases**: Lock date = journal date (boundary), changing lock date after entries exist

#### AC-030: Journal entry lines

- **Criterion**: Each journal entry shall have at least 2 lines (one debit, one credit)
- **Why**: A single-sided entry violates double-entry accounting
- **Verify**: POST /journals with 1 line returns 400
- **Edge Cases**: Two debit lines with no credit, lines with zero amounts

#### AC-031: Decimal precision for money

- **Criterion**: All monetary amounts shall use Decimal(19,4) — never JavaScript float
- **Why**: Float arithmetic causes rounding errors (e.g., 0.1 + 0.2 !== 0.3), critical for financial accuracy
- **Verify**: Unit `decimal.helpers.ts` — expectDecimalEqual for all money operations
- **Edge Cases**: Very large amounts (trillions), very small amounts (0.0001), negative amounts

### 3.3 Recurring Journal Profiles

#### AC-032: Recurring profile creation

- **Criterion**: Users shall create journal profiles that auto-generate entries on a schedule
- **Why**: Monthly rent, depreciation, and accruals should not require manual re-entry
- **Verify**: POST /recurring-profiles with frequency, verify auto-generation
- **Edge Cases**: Profile spanning fiscal year boundary, inactive profile

#### AC-033: Recurring frequency support

- **Criterion**: The system shall support DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY frequencies
- **Why**: Different business events recur at different intervals
- **Verify**: Create profiles with each frequency, verify next occurrence dates
- **Edge Cases**: Monthly on 31st (February), leap year yearly

---

## 4. Sales

### 4.1 Customers

#### AC-034: Customer CRUD

- **Criterion**: The system shall support full CRUD operations on customers
- **Why**: Customer records are linked to invoices, payments, and CRM features
- **Verify**: E2E `sales.e2e-spec.ts` — POST /customers creates, GET /customers lists
- **Edge Cases**: Customer with outstanding invoices (prevent hard delete), duplicate email

#### AC-035: Customer credit limit

- **Criterion**: The system shall enforce customer credit limits when creating invoices
- **Why**: Prevents extending credit beyond approved limits, reducing bad debt risk
- **Verify**: Create invoice exceeding customer's credit limit, expect warning or rejection
- **Edge Cases**: Multiple pending invoices summing over limit, credit limit of zero

#### AC-036: Outstanding balance tracking

- **Criterion**: The system shall maintain real-time outstanding balance per customer
- **Why**: Enables AR aging reports and credit decisions without recalculating from invoices
- **Verify**: Create invoice, verify customer balance increases; record payment, verify decrease
- **Edge Cases**: Credit notes, voided invoices, partial payments

### 4.2 Quotes/Estimates

#### AC-037: Quote creation and numbering

- **Criterion**: The system shall create quotes with auto-generated EST-XXX numbers
- **Why**: Formal quotation process with tracking numbers supports sales pipeline management
- **Verify**: E2E `sales.e2e-spec.ts` — GET /quotes returns list
- **Edge Cases**: Quote with zero-amount line items, very long description fields

#### AC-038: Quote to invoice conversion

- **Criterion**: Accepted quotes shall be convertible to invoices in one action
- **Why**: Eliminates re-entry errors and accelerates order-to-cash cycle
- **Verify**: POST /quotes/:id/convert-to-invoice returns new invoice
- **Edge Cases**: Already-converted quote (prevent double conversion), quote with discontinued items

### 4.3 Invoices

#### AC-039: Invoice lifecycle

- **Criterion**: Invoices shall follow states: DRAFT → SENT → PARTIALLY_PAID → PAID → OVERDUE → VOID
- **Why**: State machine prevents invalid transitions (e.g., paying a voided invoice)
- **Verify**: E2E `sales.e2e-spec.ts` — verify status transitions
- **Edge Cases**: DRAFT → VOID (skip SENT), OVERDUE → PAID (after late payment)

#### AC-040: Invoice auto-numbering (INV-XXX)

- **Criterion**: Invoices shall be auto-assigned sequential numbers in INV-XXX format
- **Why**: Sequential numbering is required by tax authorities in many jurisdictions
- **Verify**: POST /invoices, verify number format
- **Edge Cases**: Concurrent creation, number reset per fiscal year

#### AC-041: Invoice validation

- **Criterion**: The system shall reject invoices with missing required fields (customer, date, lines)
- **Why**: Incomplete invoices cannot be sent to customers or posted to the ledger
- **Verify**: E2E `sales.e2e-spec.ts` — POST /invoices with empty body returns 400
- **Edge Cases**: Invoice with all-zero line items, negative amounts

#### AC-042: Invoice payment allocation

- **Criterion**: Payments shall be allocatable to specific invoices, updating their status
- **Why**: Accurate AR tracking requires knowing which invoices are paid vs outstanding
- **Verify**: Record payment against invoice, verify status changes to PAID/PARTIALLY_PAID
- **Edge Cases**: Over-payment (creates credit), payment split across multiple invoices

#### AC-043: Invoice journal creation

- **Criterion**: Posting an invoice shall auto-create a balanced journal entry (debit AR, credit Revenue)
- **Why**: Automatic journal posting ensures the ledger is always in sync with the sub-ledger
- **Verify**: Post invoice, verify journal exists with correct debits and credits
- **Edge Cases**: Multi-line invoice with different revenue accounts, tax lines

#### AC-044: Credit notes

- **Criterion**: Credit notes shall reverse invoice amounts and update customer balance
- **Why**: Returns, discounts, and billing corrections require formal reversal documents
- **Verify**: POST /credit-notes against invoice, verify balance reduction
- **Edge Cases**: Credit note exceeding original invoice amount, partial credit note

### 4.4 Payments Received

#### AC-045: Payment recording

- **Criterion**: The system shall record customer payments with allocation to invoices
- **Why**: Cash application is core to AR management and cash flow visibility
- **Verify**: POST /payments-received with invoice allocations
- **Edge Cases**: Payment in different currency, payment without invoice allocation (on-account)

#### AC-046: Over-payment handling

- **Criterion**: Payments exceeding invoice total shall create a customer credit balance
- **Why**: Over-payments happen frequently and must be tracked for future invoice application
- **Verify**: Pay more than invoice amount, verify credit balance on customer
- **Edge Cases**: Applying credit to next invoice, refunding credit balance

---

## 5. Purchases

### 5.1 Vendors

#### AC-047: Vendor CRUD

- **Criterion**: The system shall support full CRUD operations on vendors
- **Why**: Vendor records link to bills, expenses, and purchase orders
- **Verify**: E2E `purchases.e2e-spec.ts` — POST /vendors creates, GET /vendors lists
- **Edge Cases**: Vendor with outstanding bills (prevent delete), duplicate tax ID

#### AC-048: Vendor payable balance

- **Criterion**: The system shall track outstanding payable balance per vendor
- **Why**: AP aging and cash flow forecasting depend on accurate vendor balances
- **Verify**: Create bill, verify vendor balance increases; pay bill, verify decrease
- **Edge Cases**: Vendor credits, voided bills, partial payments

### 5.2 Bills

#### AC-049: Bill creation and numbering (BILL-XXX)

- **Criterion**: Bills shall be created with auto-generated BILL-XXX numbers
- **Why**: Internal numbering enables tracking independent of vendor's invoice numbers
- **Verify**: E2E `purchases.e2e-spec.ts` — GET /bills returns list
- **Edge Cases**: Bill with reference to vendor's invoice number, duplicate vendor invoice

#### AC-050: Bill validation

- **Criterion**: The system shall reject bills with missing required fields
- **Why**: Incomplete bills cannot be posted or paid
- **Verify**: E2E `purchases.e2e-spec.ts` — POST /bills with empty body returns 400/422
- **Edge Cases**: Bill with future date, bill with zero total

#### AC-051: AP journal creation

- **Criterion**: Posting a bill shall auto-create a journal entry (debit Expense/Asset, credit AP)
- **Why**: Ensures ledger stays synchronized with the AP sub-ledger automatically
- **Verify**: Post bill, verify balanced journal entry created
- **Edge Cases**: Bill with inventory items (debit Inventory, not Expense), multi-line bill

#### AC-052: Duplicate bill detection

- **Criterion**: The system shall warn when creating a bill that matches an existing vendor/amount/date
- **Why**: Duplicate payments are a major source of financial loss, especially from emailed invoices
- **Verify**: Create two bills with same vendor+amount+date, verify warning or rejection
- **Edge Cases**: Same amount different vendor, same vendor different amounts, near-duplicate dates

### 5.3 Expenses

#### AC-053: Expense creation

- **Criterion**: The system shall support recording expenses with category, amount, and date
- **Why**: Not all costs come from vendor bills — petty cash, subscriptions, and reimbursements
- **Verify**: E2E `purchases.e2e-spec.ts` — GET /expenses returns list
- **Edge Cases**: Expense without receipt, expense in foreign currency

#### AC-054: Receipt upload

- **Criterion**: Expenses shall support file attachments for receipt images
- **Why**: Receipt retention is required for tax compliance and audit readiness
- **Verify**: POST /expenses with file attachment
- **Edge Cases**: Large files (>10MB), unsupported formats, corrupt images

### 5.4 Vendor Credits & Payments

#### AC-055: Vendor credit recording

- **Criterion**: The system shall record vendor credits that reduce AP balance
- **Why**: Returns, overcharges, and pricing adjustments create vendor credits
- **Verify**: POST /vendor-credits, verify vendor balance decreases
- **Edge Cases**: Credit exceeding outstanding balance, applying credit to future bill

#### AC-056: Payment made recording

- **Criterion**: The system shall record payments to vendors with allocation to bills
- **Why**: Tracking which bills are paid is essential for cash management and vendor relationships
- **Verify**: POST /payments-made with bill allocations
- **Edge Cases**: Partial payment, payment in different currency

---

## 6. Inventory

### 6.1 Items

#### AC-057: Item CRUD

- **Criterion**: The system shall support create, read, update operations on items
- **Why**: Items are the core of inventory, appearing in invoices, bills, and manufacturing
- **Verify**: E2E `inventory.e2e-spec.ts` — POST /items creates, GET /items lists
- **Edge Cases**: Item with open purchase orders, item used in BOM

#### AC-058: SKU uniqueness

- **Criterion**: The system shall reject items with duplicate SKU within an organization
- **Why**: SKU is the primary lookup key for warehouse scanning, imports, and API integrations
- **Verify**: E2E `inventory.e2e-spec.ts` — duplicate SKU returns 400/409
- **Edge Cases**: Case sensitivity (ABC-123 vs abc-123), SKU with special characters

#### AC-059: Item type classification

- **Criterion**: Items shall be classified as GOODS (trackable inventory) or SERVICE (no stock)
- **Why**: Services don't track stock quantities; goods require warehouse management
- **Verify**: POST /items with type=GOODS vs type=SERVICE, verify stock tracking behavior
- **Edge Cases**: Changing type after stock movements exist

#### AC-060: Selling and cost price

- **Criterion**: Items shall maintain selling price and cost price as Decimal fields
- **Why**: Profit margin calculations and inventory valuation depend on accurate pricing
- **Verify**: POST /items with sellingPrice and costPrice, verify Decimal storage
- **Edge Cases**: Zero price (free items), very high prices, price changes over time

### 6.2 Warehouses

#### AC-061: Multi-warehouse support

- **Criterion**: The system shall support multiple warehouses per organization
- **Why**: Businesses with multiple locations need per-warehouse stock visibility
- **Verify**: E2E `inventory.e2e-spec.ts` — GET /warehouses returns list
- **Edge Cases**: Transfer between warehouses, warehouse with zero stock

#### AC-062: Warehouse stock tracking

- **Criterion**: Stock quantities shall be tracked per item per warehouse
- **Why**: Enables accurate fulfillment from nearest warehouse and prevents overselling
- **Verify**: Create stock movement, verify warehouse quantity updates
- **Edge Cases**: Negative stock (backorder), stock at multiple warehouses

### 6.3 Stock Movements

#### AC-063: Stock movement recording

- **Criterion**: Every inventory change shall create a stock movement record (receipt, issue, transfer, adjustment)
- **Why**: Complete movement history enables stock audit and discrepancy investigation
- **Verify**: Post bill with inventory item, verify stock movement created
- **Edge Cases**: Movement reversal, batch movements, movements spanning midnight

#### AC-064: Transfer between warehouses

- **Criterion**: Stock transfers shall decrease source and increase destination warehouse quantities
- **Why**: Inter-warehouse transfers are common but must not create or destroy inventory
- **Verify**: POST /stock-movements with type=TRANSFER, verify both warehouses update
- **Edge Cases**: Transfer more than available stock, transfer to same warehouse

### 6.4 Inventory Adjustments

#### AC-065: Quantity adjustment

- **Criterion**: Manual adjustments shall update stock quantities with a required reason
- **Why**: Physical count discrepancies, damage, and shrinkage require adjustment capability
- **Verify**: POST /inventory-adjustments, verify stock quantity changes
- **Edge Cases**: Adjustment to zero, negative adjustment exceeding current stock

#### AC-066: Value adjustment

- **Criterion**: Inventory value adjustments shall create corresponding journal entries
- **Why**: Write-downs, obsolescence, and NRV adjustments must flow to the ledger
- **Verify**: Post value adjustment, verify journal entry with Inventory and Loss accounts
- **Edge Cases**: Adjustment amount exceeding current inventory value

### 6.5 Price Lists

#### AC-067: Price list management

- **Criterion**: The system shall support multiple price lists (wholesale, retail, VIP)
- **Why**: Different customer segments receive different pricing
- **Verify**: POST /price-lists with items and prices
- **Edge Cases**: Item not in any price list (fallback to default), overlapping date ranges

---

## 7. Banking

### 7.1 Bank Accounts

#### AC-068: Bank account CRUD

- **Criterion**: The system shall support CRUD operations on bank accounts
- **Why**: Bank accounts connect to reconciliation, payment processing, and cash flow reports
- **Verify**: E2E `banking.e2e-spec.ts` — POST /bank-accounts creates, GET lists
- **Edge Cases**: Account with transactions (prevent delete), multiple accounts same bank

#### AC-069: Account type support

- **Criterion**: Bank accounts shall support types: CHECKING, SAVINGS, CREDIT_CARD, LOAN
- **Why**: Different account types have different reconciliation and reporting behaviors
- **Verify**: POST /bank-accounts with each type
- **Edge Cases**: Credit card with positive balance, loan fully repaid

### 7.2 Bank Transactions

#### AC-070: Transaction import

- **Criterion**: The system shall import bank transactions from CSV/OFX files
- **Why**: Manual entry of hundreds of bank transactions is impractical and error-prone
- **Verify**: E2E `banking.e2e-spec.ts` — GET /bank-transactions returns list
- **Edge Cases**: Duplicate transactions across imports, encoding issues, date format variations

#### AC-071: Transaction categorization

- **Criterion**: Imported transactions shall be categorizable to chart of accounts categories
- **Why**: Uncategorized transactions cannot flow to the P&L or balance sheet
- **Verify**: PUT /bank-transactions/:id with accountId
- **Edge Cases**: Split categorization (one transaction to multiple accounts), recategorization

### 7.3 Bank Rules

#### AC-072: Auto-categorization rules

- **Criterion**: Bank rules shall automatically categorize matching transactions
- **Why**: Recurring transactions (rent, payroll, subscriptions) should not require manual categorization
- **Verify**: Create rule matching "NETFLIX", import matching transaction, verify auto-categorized
- **Edge Cases**: Multiple matching rules (priority order), rule matching false positives

### 7.4 Reconciliation

#### AC-073: Bank reconciliation matching

- **Criterion**: The system shall match bank transactions to accounting records using amount, date, and description
- **Why**: Reconciliation verifies that bank and book balances agree, catching errors and fraud
- **Verify**: E2E `banking.e2e-spec.ts` — reconciliation endpoint
- **Edge Cases**: Multiple potential matches (same amount/date), partial matches, cleared vs uncleared

#### AC-074: Score-based matching

- **Criterion**: Match suggestions shall include confidence scores based on multiple criteria
- **Why**: Automated matching reduces manual reconciliation time while transparency builds trust
- **Verify**: Unit test on reconciliation matcher — verify score calculation
- **Edge Cases**: Zero confidence matches, 100% matches, threshold tuning

---

## 8. HR

### 8.1 Employees

#### AC-075: Employee CRUD

- **Criterion**: The system shall support CRUD operations on employees
- **Why**: Employee records are the foundation for payroll, attendance, and HR analytics
- **Verify**: POST /employees creates, GET /employees lists
- **Edge Cases**: Employee with active payroll (prevent delete), employee transfer between departments

#### AC-076: Department and designation tracking

- **Criterion**: Employees shall be assigned to departments and designations
- **Why**: Organizational structure drives reporting lines, permissions, and payroll rules
- **Verify**: POST /employees with department and designation fields
- **Edge Cases**: Department closure with active employees, bulk transfers

#### AC-077: Employee status management

- **Criterion**: Employees shall have status (ACTIVE, ON_LEAVE, TERMINATED) — no deletedAt field
- **Why**: Historical payroll records reference employees; deletion would break payslip history
- **Verify**: PUT /employees/:id with status change, verify filter by status works
- **Edge Cases**: Rehiring a terminated employee, status during payroll run

### 8.2 Attendance

#### AC-078: Clock in/out

- **Criterion**: The system shall record employee clock-in and clock-out times
- **Why**: Time tracking drives overtime calculation, absence detection, and compliance
- **Verify**: POST /attendance/clock-in, POST /attendance/clock-out
- **Edge Cases**: Clock out without clock in, double clock in, clock in spanning midnight

#### AC-079: Overtime calculation

- **Criterion**: Hours exceeding standard work hours shall be flagged as overtime
- **Why**: Overtime has different pay rates and affects payroll calculations
- **Verify**: Record 10 hours when standard is 8, verify 2 hours overtime
- **Edge Cases**: Public holidays, weekend work, different overtime rates by tier

### 8.3 Payroll

#### AC-080: Payroll run creation

- **Criterion**: The system shall support creating payroll runs for a pay period
- **Why**: Batch processing ensures all employees are paid for the same period consistently
- **Verify**: POST /payroll-runs with period dates
- **Edge Cases**: Overlapping periods, mid-month hire, terminated employee in period

#### AC-081: Gross/net calculation

- **Criterion**: Payroll shall calculate gross pay, deductions, and net pay per employee
- **Why**: Incorrect payroll is a compliance violation and destroys employee trust
- **Verify**: Unit test on payroll service — verify gross - deductions = net
- **Edge Cases**: Negative net pay (deductions > gross), zero hours, LOP deduction

#### AC-082: Loss of pay (LOP) deduction

- **Criterion**: Unauthorized absences shall be deducted from salary based on daily rate
- **Why**: Fair pay policy — employees should not receive full salary for unworked days
- **Verify**: Unit test — employee with 2 LOP days has proportional deduction
- **Edge Cases**: All days LOP (zero pay), LOP on partial month, LOP with overtime

#### AC-083: Payroll journal creation

- **Criterion**: Approved payroll shall auto-create journal entries (debit Salary Expense, credit Salary Payable)
- **Why**: Payroll is a major expense; automatic journal posting prevents reconciliation gaps
- **Verify**: Approve payroll run, verify balanced journal created
- **Edge Cases**: Multi-department payroll (split journal by department), benefits, tax withholding

### 8.4 Payslips

#### AC-084: Payslip generation

- **Criterion**: The system shall generate individual payslips for each employee in a payroll run
- **Why**: Employees need documentation of their pay breakdown for personal records and tax filing
- **Verify**: GET /payslips/:id returns payslip data
- **Edge Cases**: Payslip corrections, supplementary runs, deductions exceeding gross

### 8.5 Leave Management

#### AC-085: Leave balance tracking

- **Criterion**: The system shall track leave balances per employee per leave type
- **Why**: Prevents employees from taking more leave than entitled, supports HR planning
- **Verify**: Request leave, verify balance decreases; cancel leave, verify balance restores
- **Edge Cases**: Negative balance (advance leave), year-end carry-over, pro-rated for new hires

---

## 9. Manufacturing

### 9.1 Bills of Materials (BOMs)

#### AC-086: BOM creation

- **Criterion**: The system shall support creating BOMs with component items and quantities
- **Why**: Manufacturing requires knowing what raw materials are needed for each finished product
- **Verify**: POST /boms with finished item and components
- **Edge Cases**: BOM with sub-assemblies (multi-level), circular reference prevention

#### AC-087: Multi-level BOM support

- **Criterion**: BOMs shall support nested assemblies (BOM within BOM)
- **Why**: Complex products have sub-assemblies that themselves require components
- **Verify**: Create BOM with component that has its own BOM, verify explosion works
- **Edge Cases**: Deep nesting (>5 levels), shared components across BOMs

### 9.2 Work Orders

#### AC-088: Work order lifecycle

- **Criterion**: Work orders shall follow states: PLANNED → IN_PROGRESS → COMPLETED → CANCELLED
- **Why**: Production tracking ensures materials are consumed and products are received into inventory
- **Verify**: Create work order, advance through states, verify stock movements
- **Edge Cases**: Partial completion, work order cancellation after material issue

#### AC-089: Material consumption

- **Criterion**: Starting a work order shall reserve/consume BOM component stock
- **Why**: Prevents double-allocation of limited raw materials across concurrent work orders
- **Verify**: Start work order, verify component stock decreases
- **Edge Cases**: Insufficient stock for all components, waste/scrap exceeding BOM quantity

---

## 10. Projects

### 10.1 Projects

#### AC-090: Project CRUD

- **Criterion**: The system shall support CRUD operations on projects with budget tracking
- **Why**: Project-based businesses need to track profitability per engagement
- **Verify**: POST /projects, GET /projects
- **Edge Cases**: Project spanning multiple fiscal years, project with no tasks

#### AC-091: Budget tracking

- **Criterion**: The system shall track actual costs against project budget
- **Why**: Budget overruns are a major business risk; early warning enables corrective action
- **Verify**: Add expenses to project, verify budget utilization percentage
- **Edge Cases**: Budget of zero, costs exceeding budget (alert), multi-currency projects

### 10.2 Tasks

#### AC-092: Task management

- **Criterion**: Projects shall contain tasks with assignees, status, and due dates
- **Why**: Work breakdown structure enables resource planning and progress tracking
- **Verify**: POST /projects/:id/tasks, GET tasks
- **Edge Cases**: Task with no assignee, overdue tasks, task dependencies

### 10.3 Timesheets

#### AC-093: Timesheet entry recording

- **Criterion**: Users shall log time against project tasks as billable or non-billable
- **Why**: Billable hours drive invoice generation; non-billable tracking reveals inefficiencies
- **Verify**: POST /timesheet-entries with project, task, hours, billable flag
- **Edge Cases**: Future date entries, negative hours, overlapping time entries

#### AC-094: Billable hours invoicing

- **Criterion**: Billable timesheet hours shall be convertible to invoice line items
- **Why**: Time-based billing is the primary revenue model for service businesses
- **Verify**: Convert billable entries to invoice, verify amounts match
- **Edge Cases**: Different hourly rates per employee, already-invoiced entries

---

## 11. Tax

### 11.1 Tax Rates

#### AC-095: Tax rate management

- **Criterion**: The system shall support configuring tax rates (inclusive/exclusive)
- **Why**: Different products and jurisdictions have different tax rates and calculation methods
- **Verify**: POST /tax-rates with rate and type (inclusive/exclusive)
- **Edge Cases**: Tax-exempt items (0%), compound taxes, rates changing mid-period

#### AC-096: Tax calculation on transactions

- **Criterion**: Invoices and bills shall calculate tax amounts based on configured rates
- **Why**: Incorrect tax calculation leads to compliance penalties and customer disputes
- **Verify**: Create invoice with taxable items, verify tax amounts
- **Edge Cases**: Rounding (per-line vs total), inclusive tax back-calculation, mixed tax rates

### 11.2 VAT Returns

#### AC-097: VAT return calculation

- **Criterion**: The system shall generate VAT returns from posted transactions for a period
- **Why**: Automated VAT reporting reduces accountant hours and compliance risk
- **Verify**: POST /vat-returns/generate for a period
- **Edge Cases**: Period with no transactions, adjustments after filing, credit notes reducing VAT

#### AC-098: VAT payment recording

- **Criterion**: VAT payments shall be recorded and linked to their return
- **Why**: Tracking VAT payments prevents duplicate filings and supports cash flow planning
- **Verify**: POST /vat-payments linked to return
- **Edge Cases**: Partial payment, overpayment (refund due), late payment penalties

---

## 12. CRM

### 12.1 Leads

#### AC-099: Lead capture

- **Criterion**: The system shall support creating leads with contact info and source
- **Why**: Lead tracking is the entry point of the sales pipeline
- **Verify**: POST /leads with name, email, source
- **Edge Cases**: Lead from existing customer, lead with minimal info

#### AC-100: Lead scoring

- **Criterion**: Leads shall have AI-calculated scores based on engagement and attributes
- **Why**: Score-based prioritization ensures sales team focuses on highest-potential leads
- **Verify**: Create lead, verify score calculated (0-100 range)
- **Edge Cases**: Lead with no activity (cold), score decay over time, manual score override

### 12.2 Deals

#### AC-101: Deal pipeline management

- **Criterion**: Deals shall progress through configurable pipeline stages (prospect → qualified → proposal → won/lost)
- **Why**: Pipeline visibility enables sales forecasting and management oversight
- **Verify**: POST /deals, PUT /deals/:id to advance stage
- **Edge Cases**: Regression to earlier stage, deal reopening after loss

#### AC-102: Deal conversion to invoice

- **Criterion**: Won deals shall be convertible to invoices
- **Why**: Seamless handoff from sales to finance reduces revenue leakage
- **Verify**: Convert won deal to invoice, verify customer and amount carry over
- **Edge Cases**: Deal with multiple products, deal in foreign currency

---

## 13. Reports

### 13.1 Financial Reports

#### AC-103: Profit & Loss statement

- **Criterion**: P&L report shall show revenue minus expenses for a given period
- **Why**: P&L is the primary measure of business profitability, required for tax filing
- **Verify**: GET /reports/profit-loss with date range, verify totals match journal entries
- **Edge Cases**: Period with no transactions, multi-currency consolidation, accrual vs cash basis

#### AC-104: Balance Sheet

- **Criterion**: Balance Sheet shall show Assets = Liabilities + Equity at a point in time
- **Why**: Balance sheet must always balance; any discrepancy indicates a system error
- **Verify**: GET /reports/balance-sheet, verify A = L + E
- **Edge Cases**: Opening balances, year-end closing entries, retained earnings calculation

#### AC-105: Trial Balance

- **Criterion**: Trial Balance shall list all accounts with debit and credit totals that balance
- **Why**: Trial balance is the primary tool for detecting posting errors before closing
- **Verify**: GET /reports/trial-balance, verify total debits = total credits
- **Edge Cases**: Accounts with zero balance (show/hide option), adjusted vs unadjusted

#### AC-106: AR Aging report

- **Criterion**: AR Aging shall group outstanding invoices by age buckets (current, 30, 60, 90+ days)
- **Why**: AR aging drives collection efforts and bad debt provisioning
- **Verify**: GET /reports/ar-aging with invoices at various dates
- **Edge Cases**: Partial payments affecting bucket, credit notes, disputed invoices

#### AC-107: AP Aging report

- **Criterion**: AP Aging shall group outstanding bills by age buckets
- **Why**: AP aging drives payment planning and vendor relationship management
- **Verify**: GET /reports/ap-aging with bills at various dates
- **Edge Cases**: Vendor credits, scheduled payments, early payment discounts

#### AC-108: Cash Flow report

- **Criterion**: Cash Flow report shall show operating, investing, and financing activities
- **Why**: Cash flow reveals liquidity position independent of accrual accounting
- **Verify**: GET /reports/cash-flow for period
- **Edge Cases**: Non-cash transactions (depreciation), opening cash balance

---

## 14. AI Features

### 14.1 Core Infrastructure

#### AC-109: Model registry

- **Criterion**: The system shall maintain a registry of all AI models with version, accuracy, and status
- **Why**: Model lifecycle management enables rollback, A/B testing, and compliance audit
- **Verify**: GET /ai/models returns registry with 32 models
- **Edge Cases**: Model with zero training data, model rollback, concurrent training

#### AC-110: AI feedback collection

- **Criterion**: Users shall be able to accept or reject AI suggestions, feeding back to training
- **Why**: Human-in-the-loop learning improves model accuracy over time
- **Verify**: E2E `ai.e2e-spec.ts` — POST /ai/feedback with ACCEPTED/REJECTED
- **Edge Cases**: Feedback on expired prediction, bulk feedback, feedback without prediction ID

#### AC-111: AI training data management

- **Criterion**: Accepted suggestions shall be stored as training data for model retraining
- **Why**: Continuous learning from user corrections is the core AI improvement loop
- **Verify**: Accept suggestion, verify AiTrainingData record created
- **Edge Cases**: Training data from deleted entities, data quality validation

#### AC-112: Retraining scheduler

- **Criterion**: Models shall automatically retrain when sufficient new feedback accumulates
- **Why**: Periodic retraining keeps models current with changing business patterns
- **Verify**: Scheduler `ai-retraining` runs, verify model accuracy updates
- **Edge Cases**: Insufficient data for retraining, retraining during peak hours

#### AC-113: All AI suggestions dismissible

- **Criterion**: Every AI suggestion MUST have a dismiss/reject option — never force AI decisions
- **Why**: Human-in-the-Loop is a core principle; users must retain full control
- **Verify**: Every AI endpoint returns suggestions with accept/reject action
- **Edge Cases**: Dismissed suggestion reappearing, batch dismissal

#### AC-114: Confidence score display

- **Criterion**: All AI predictions shall include a confidence score (0-1) shown to users
- **Why**: Transparency builds trust; users can prioritize review of low-confidence suggestions
- **Verify**: AI endpoints return confidence field, frontend displays it
- **Edge Cases**: 0% confidence (should still show), 100% confidence, score calibration

### 14.2 Transaction Categorization

#### AC-115: Auto-categorization of transactions

- **Criterion**: The system shall suggest account categories for uncategorized bank transactions
- **Why**: Manual categorization of hundreds of transactions is the biggest pain point for accountants
- **Verify**: Import uncategorized transaction, verify suggestion appears
- **Edge Cases**: Ambiguous transactions, new vendor not in training data, multi-category transactions

#### AC-116: Category learning from corrections

- **Criterion**: When a user overrides a category suggestion, the system shall learn the correction
- **Why**: User corrections are the highest-quality training signal for the categorizer
- **Verify**: Override suggestion, verify next similar transaction gets correct suggestion
- **Edge Cases**: Conflicting corrections from different users, category renamed after learning

### 14.3 Anomaly Detection

#### AC-117: Transaction anomaly detection

- **Criterion**: The system shall flag transactions that deviate significantly from historical patterns
- **Why**: Anomalies may indicate fraud, errors, or unusual business events requiring review
- **Verify**: E2E `ai.e2e-spec.ts` — GET /ai/anomalies returns list
- **Edge Cases**: First-ever transaction (no history), seasonal patterns, legitimate large transactions

#### AC-118: Z-score and IQR methods

- **Criterion**: Anomaly detection shall use both Z-score and IQR statistical methods
- **Why**: Multiple methods reduce false positives; Z-score for normal distributions, IQR for skewed data
- **Verify**: Unit `statistics.util.spec.ts` — zScore, isOutlierIQR, getIQRBounds
- **Edge Cases**: Dataset with all identical values (std=0), very small datasets (<5 items)

#### AC-119: Isolation Forest scoring

- **Criterion**: The system shall use Isolation Forest for multi-dimensional anomaly scoring
- **Why**: Isolation Forest excels at detecting anomalies in high-dimensional data without assumptions
- **Verify**: Unit `isolation-forest.util.spec.ts` — anomalies score higher than normal points
- **Edge Cases**: Empty dataset, single data point, all points identical

### 14.4 Cash Flow Prediction

#### AC-120: Monte Carlo simulation

- **Criterion**: Cash flow predictions shall use Monte Carlo simulation with P10/P50/P90 percentiles
- **Why**: Probabilistic forecasting captures uncertainty better than single-point estimates
- **Verify**: E2E `ai.e2e-spec.ts` — GET /ai/cash-flow-prediction
- **Edge Cases**: No historical data, all receivables overdue, seasonal businesses

#### AC-121: Monte Carlo result structure

- **Criterion**: Monte Carlo results shall include P10 (pessimistic), P50 (median), P90 (optimistic) scenarios
- **Why**: Range-based forecasting enables scenario planning for different risk tolerances
- **Verify**: Unit `monte-carlo.util.spec.ts` — P10 ≤ P50 ≤ P90
- **Edge Cases**: All scenarios identical (zero variance), negative cash balance detection

#### AC-122: What-if scenario analysis

- **Criterion**: Users shall apply what-if scenarios (delay customer, new expense) to cash flow forecasts
- **Why**: Business planning requires modeling hypothetical changes before committing
- **Verify**: Unit `monte-carlo.util.spec.ts` — applyWhatIfScenario modifies forecast
- **Edge Cases**: Scenario with impossible parameters, combined scenarios, undo scenario

#### AC-123: Critical date identification

- **Criterion**: The system shall identify dates where cash balance may go negative
- **Why**: Cash crises can be avoided with advance warning and preparation
- **Verify**: Unit `monte-carlo.util.spec.ts` — identifyCriticalDates
- **Edge Cases**: No critical dates (healthy cash flow), multiple critical periods

### 14.5 Demand Forecasting

#### AC-124: Holt-Winters forecasting

- **Criterion**: The system shall use Holt-Winters exponential smoothing for demand forecasting
- **Why**: Holt-Winters captures trend and seasonality, ideal for retail and inventory planning
- **Verify**: E2E `ai.e2e-spec.ts` — GET /ai/demand-forecasting
- **Edge Cases**: Insufficient historical data (<2 seasons), no seasonality, strong trend

#### AC-125: Seasonal decomposition

- **Criterion**: Holt-Winters shall detect and decompose seasonal patterns in demand data
- **Why**: Seasonal businesses need separate trend and seasonal components for accurate planning
- **Verify**: Unit `holt-winters.util.spec.ts` — detectSeasonalityStrength, holtWinters seasonal
- **Edge Cases**: Multiple seasonality periods, weak seasonality, changing seasonality

#### AC-126: Confidence intervals

- **Criterion**: Demand forecasts shall include expanding confidence intervals over time
- **Why**: Forecast uncertainty grows with horizon; wider bands communicate increasing uncertainty
- **Verify**: Unit `holt-winters.util.spec.ts` — forecastWithConfidenceIntervals
- **Edge Cases**: Very short horizon (1 period), very long horizon, negative lower bound

#### AC-127: Minimum data requirement

- **Criterion**: Holt-Winters shall require at least 2x season length of historical data
- **Why**: Less data produces unreliable seasonal factors, leading to misleading forecasts
- **Verify**: Unit `holt-winters.util.spec.ts` — insufficient data throws error
- **Edge Cases**: Exactly 2x data points (boundary), missing data points (gaps)

### 14.6 Lead Scoring

#### AC-128: Hybrid lead scoring (70% rule + 30% ML)

- **Criterion**: Lead scores shall blend 70% rule-based and 30% ML model when available
- **Why**: Rules provide interpretable baseline; ML captures subtle patterns humans miss
- **Verify**: Create lead, verify score reflects both components
- **Edge Cases**: No ML model available (100% rules), conflicting rule vs ML scores

#### AC-129: Score decay

- **Criterion**: Lead scores shall decay over time when there's no engagement
- **Why**: A lead that hasn't responded in 90 days is not the same quality as a fresh inquiry
- **Verify**: Create lead, wait (or simulate time), verify score decreases
- **Edge Cases**: Decay to zero, re-engagement after decay (score should increase)

### 14.7 OCR & Document Intake

#### AC-130: PDF text extraction

- **Criterion**: The system shall extract text from native PDFs without OCR, falling back to Tesseract for scanned PDFs
- **Why**: Native extraction is faster and more accurate; OCR handles scanned/photographed documents
- **Verify**: Unit `pdf-extractor.util.spec.ts` — native vs scanned detection
- **Edge Cases**: Mixed PDF (some pages scanned, some native), encrypted PDF, corrupted PDF

#### AC-131: Document classification

- **Criterion**: Uploaded documents shall be classified by type (invoice, receipt, statement, contract)
- **Why**: Automatic routing to correct workflow (AP for invoices, expenses for receipts)
- **Verify**: Upload sample documents, verify correct classification
- **Edge Cases**: Ambiguous documents, multi-page documents with mixed content

#### AC-132: Entity extraction

- **Criterion**: The system shall extract vendor name, date, amount, and line items from documents
- **Why**: Auto-populating bill fields from scanned invoices eliminates manual data entry
- **Verify**: Upload vendor invoice, verify extracted fields
- **Edge Cases**: Handwritten amounts, non-standard layouts, multiple currencies on one document

#### AC-133: Vendor matching

- **Criterion**: Extracted vendor names shall be matched to existing vendor records
- **Why**: Automatic vendor linkage prevents duplicate vendor creation and ensures correct AP posting
- **Verify**: Upload invoice from known vendor, verify auto-match
- **Edge Cases**: New vendor (no match), similar vendor names, vendor name in different language

#### AC-134: Duplicate document detection

- **Criterion**: The system shall detect and warn about duplicate document uploads
- **Why**: Processing the same invoice twice leads to duplicate payments
- **Verify**: Upload same document twice, verify duplicate warning
- **Edge Cases**: Same content in different file formats, slightly modified duplicate

### 14.8 Reconciliation Matching

#### AC-135: Multi-criteria matching

- **Criterion**: Reconciliation matcher shall score matches using amount, date, and description similarity
- **Why**: Multi-criteria matching produces better results than single-field matching
- **Verify**: Unit test on reconciliation matcher — verify weighted score
- **Edge Cases**: Perfect amount/date but wrong description, bank aggregated transactions

#### AC-136: Text similarity scoring

- **Criterion**: The system shall use Levenshtein, Jaccard, and n-gram similarity for text matching
- **Why**: Different similarity measures catch different types of matches (typos, abbreviations, reordering)
- **Verify**: Unit `text-similarity.util.spec.ts` — all similarity functions
- **Edge Cases**: Empty strings, very long strings, completely different strings, unicode text

### 14.9 Smart Scheduling

#### AC-137: Smart scheduling optimization

- **Criterion**: The system shall suggest optimal scheduling for recurring tasks
- **Why**: AI-optimized scheduling reduces resource conflicts and improves throughput
- **Verify**: GET /ai/smart-scheduling with constraints
- **Edge Cases**: Over-constrained schedule, no resources available, conflicting priorities

### 14.10 NLP & Chat

#### AC-138: Sentiment analysis

- **Criterion**: The system shall analyze sentiment of customer communications
- **Why**: Detecting negative sentiment enables proactive customer retention
- **Verify**: POST /ai/sentiment with text, verify score and label
- **Edge Cases**: Sarcasm, mixed sentiment, non-English text, empty text

#### AC-139: NLP chat interface

- **Criterion**: Users shall query financial data using natural language (e.g., "What's our revenue this quarter?")
- **Why**: Natural language access democratizes data — no SQL or report builder knowledge needed
- **Verify**: POST /ai/chat with natural language query
- **Edge Cases**: Ambiguous queries, queries about other org data, unsupported query types

### 14.11 Fraud Detection

#### AC-140: Fraud alert generation

- **Criterion**: The system shall generate fraud alerts for suspicious transaction patterns
- **Why**: Early fraud detection minimizes financial loss and reputation damage
- **Verify**: Create suspicious pattern (duplicate payment, unusual amount), verify alert
- **Edge Cases**: False positives from legitimate large transactions, coordinated small-amount fraud

#### AC-141: Fraud pattern recognition

- **Criterion**: The system shall detect patterns: duplicate payments, round-tripping, ghost vendors
- **Why**: Known fraud schemes have identifiable patterns that can be automatically detected
- **Verify**: Simulate each fraud pattern, verify detection
- **Edge Cases**: Sophisticated fraud varying amounts slightly, new fraud patterns

### 14.12 Predictive Analytics

#### AC-142: Customer churn prediction

- **Criterion**: The system shall predict customer churn risk based on engagement and purchase patterns
- **Why**: Retaining existing customers is 5-7x cheaper than acquiring new ones
- **Verify**: GET /ai/churn-prediction for customers
- **Edge Cases**: New customers (insufficient data), seasonal customers, enterprise vs SMB patterns

#### AC-143: Revenue forecasting

- **Criterion**: The system shall forecast revenue for upcoming periods based on historical trends
- **Why**: Revenue forecasting drives budgeting, hiring, and investment decisions
- **Verify**: GET /ai/revenue-forecast
- **Edge Cases**: New business (< 12 months), revenue cliff (lost major customer), seasonal revenue

#### AC-144: Budget optimization

- **Criterion**: The system shall suggest budget allocations based on historical spending patterns
- **Why**: Data-driven budgeting reduces waste and improves resource allocation
- **Verify**: GET /ai/budget-optimization
- **Edge Cases**: No historical data, budget cuts required, new cost categories

#### AC-145: Dynamic pricing suggestions

- **Criterion**: The system shall suggest pricing adjustments based on demand and competition
- **Why**: Optimal pricing maximizes revenue without losing market share
- **Verify**: GET /ai/dynamic-pricing for items
- **Edge Cases**: Items with no sales history, price-sensitive items, minimum margin constraints

### 14.13 Vendor Risk Assessment

#### AC-146: Vendor risk scoring

- **Criterion**: The system shall assess vendor risk based on delivery, quality, and payment patterns
- **Why**: Proactive vendor risk management prevents supply chain disruptions
- **Verify**: GET /ai/vendor-risk for vendors
- **Edge Cases**: New vendors (no history), single-source vendors, international vendors

### 14.14 HR AI Features

#### AC-147: Payroll anomaly detection

- **Criterion**: The system shall detect anomalies in payroll data (unusual overtime, salary changes)
- **Why**: Payroll fraud is a significant risk; automated detection catches patterns humans miss
- **Verify**: Create unusual payroll entry, verify anomaly flagged
- **Edge Cases**: Legitimate bonus, seasonal overtime, new hire at different salary grade

#### AC-148: Employee attrition prediction

- **Criterion**: The system shall predict employee attrition risk
- **Why**: Early warning enables retention efforts, reducing recruitment and training costs
- **Verify**: GET /ai/attrition-prediction for employees
- **Edge Cases**: Recently hired employees, employees with long tenure, departing managers

#### AC-149: Workforce planning

- **Criterion**: The system shall suggest workforce planning based on growth and attrition trends
- **Why**: Strategic hiring aligned with business growth prevents both over-staffing and understaffing
- **Verify**: GET /ai/workforce-planning
- **Edge Cases**: Rapid growth, hiring freeze, department restructuring

### 14.15 Date Pattern Detection

#### AC-150: Recurring frequency detection

- **Criterion**: The system shall detect recurring frequencies (daily, weekly, monthly, quarterly, yearly) from transaction dates
- **Why**: Automatic detection of recurring transactions enables smart categorization and forecasting
- **Verify**: Unit `date-pattern.util.spec.ts` — detectFrequency for various patterns
- **Edge Cases**: Irregular intervals, holiday shifts, bi-weekly patterns

#### AC-151: Arabic and English date support

- **Criterion**: Date detection shall support both English and Arabic month names
- **Why**: Mizano serves Arabic-speaking markets; descriptions may contain Arabic date references
- **Verify**: Unit `date-pattern.util.spec.ts` — detectDateInDescription with Arabic months
- **Edge Cases**: Mixed language descriptions, transliterated names, Hijri dates

#### AC-152: Duplicate transaction detection

- **Criterion**: The system shall flag potential duplicate transactions (same entity, amount, date window)
- **Why**: Import overlaps and manual entry errors create duplicates that inflate financial reports
- **Verify**: Unit `date-pattern.util.spec.ts` — isPotentialDuplicate
- **Edge Cases**: Legitimately identical recurring payments, cross-account duplicates

### 14.16 Logistic Regression

#### AC-153: Binary classification training

- **Criterion**: The system shall train logistic regression models for binary classification tasks
- **Why**: Logistic regression provides interpretable probabilities for lead scoring and risk assessment
- **Verify**: Unit `logistic-regression.util.spec.ts` — train with separable data
- **Edge Cases**: Empty training data, imbalanced classes, single-feature models

#### AC-154: Probability prediction

- **Criterion**: Trained models shall output probabilities between 0 and 1, not just class labels
- **Why**: Probability outputs enable threshold tuning and confidence-based workflows
- **Verify**: Unit `logistic-regression.util.spec.ts` — predictProbability range
- **Edge Cases**: Boundary probabilities (near 0 or 1), extrapolation beyond training range

#### AC-155: Model serialization

- **Criterion**: Trained models shall be serializable for database storage and restoration
- **Why**: Models must survive server restarts without retraining from scratch
- **Verify**: Unit `logistic-regression.util.spec.ts` — serialize then deserialize
- **Edge Cases**: Corrupted JSON, schema version changes, very large models

---

## 15. Document Management

### 15.1 Document Storage

#### AC-156: File upload

- **Criterion**: The system shall support uploading documents (PDF, images) linked to entities
- **Why**: Digital document storage eliminates paper filing and enables remote access
- **Verify**: POST /documents/upload with file
- **Edge Cases**: Very large files, unsupported formats, virus-infected files

#### AC-157: Document-entity linking

- **Criterion**: Documents shall be linkable to invoices, bills, expenses, and other entities
- **Why**: Finding the original document for an invoice should be one click, not a filing cabinet search
- **Verify**: Upload document with entityType and entityId
- **Edge Cases**: Linking to deleted entity, one document to multiple entities

---

## 16. Notifications

### 16.1 In-App Notifications

#### AC-158: Notification generation

- **Criterion**: The system shall generate in-app notifications for important events
- **Why**: Users need to be informed of overdue invoices, low stock, and anomaly alerts
- **Verify**: Trigger event (invoice overdue), verify notification created
- **Edge Cases**: Notification flood (100+ at once), notification for deleted entity

#### AC-159: Notification read/unread

- **Criterion**: Users shall be able to mark notifications as read/unread
- **Why**: Read tracking prevents users from missing important updates
- **Verify**: PATCH /notifications/:id with read status
- **Edge Cases**: Bulk mark as read, unread count accuracy

### 16.2 Email Notifications

#### AC-160: Email template rendering

- **Criterion**: The system shall send templated emails for invoices, reminders, and alerts
- **Why**: Professional email communication is essential for customer interactions
- **Verify**: Trigger email event, verify email sent with correct template
- **Edge Cases**: Invalid email address, email service down, large attachment

---

## 17. Currency

### 17.1 Multi-Currency Support

#### AC-161: Multi-currency transactions

- **Criterion**: Invoices and bills shall support currencies other than the base currency
- **Why**: International business requires transacting in customer/vendor preferred currencies
- **Verify**: Create invoice in EUR when base is USD, verify conversion
- **Edge Cases**: Currency not in system, extreme exchange rates, same-currency conversion

#### AC-162: Exchange rate management

- **Criterion**: The system shall store and apply exchange rates for currency conversions
- **Why**: Accurate conversion is required for consolidated financial reporting
- **Verify**: POST /exchange-rates, apply to transaction
- **Edge Cases**: Rate for future date, missing rate (fallback), bid/ask spread

#### AC-163: Realized/unrealized gains/losses

- **Criterion**: Currency fluctuations shall generate gain/loss journal entries
- **Why**: FX gains/losses affect profitability and are required by accounting standards (IAS 21)
- **Verify**: Pay foreign invoice at different rate, verify gain/loss entry
- **Edge Cases**: Multiple partial payments at different rates, year-end revaluation

---

## 18. Audit Trail

### 18.1 Audit Logging

#### AC-164: Automatic audit log creation

- **Criterion**: Every create, update, and delete operation shall create an audit log entry
- **Why**: Audit trail is required for SOC 2 compliance and internal control framework
- **Verify**: Create/update entity, verify AuditLog record with entityType, entityId, action, changes
- **Edge Cases**: Bulk operations, changes field for complex nested objects

#### AC-165: Audit log immutability

- **Criterion**: Audit log entries shall be immutable (no update or delete)
- **Why**: Tamperable audit logs provide no assurance; immutability is a control requirement
- **Verify**: Attempt to UPDATE/DELETE audit log, verify rejection
- **Edge Cases**: Database admin access, log rotation/archival

#### AC-166: Change tracking

- **Criterion**: Audit logs shall record before and after values for all changed fields
- **Why**: Investigators need to see what changed, not just that something changed
- **Verify**: Update invoice status, verify audit log contains oldValue and newValue
- **Edge Cases**: Sensitive fields (passwords should be masked), very large changes

---

## 19. Import/Export

### 19.1 Data Import

#### AC-167: CSV import

- **Criterion**: The system shall support CSV import for customers, vendors, items, and transactions
- **Why**: Migration from other systems and bulk data entry require import capability
- **Verify**: POST /import with CSV file
- **Edge Cases**: Malformed CSV, duplicate records, encoding issues (UTF-8 BOM)

#### AC-168: Import validation

- **Criterion**: Imports shall validate data before committing, showing a preview with errors
- **Why**: Bad imports can corrupt data; preview prevents committing invalid records
- **Verify**: Import CSV with errors, verify validation report
- **Edge Cases**: Partial failures (some rows valid, some not), very large files (>10K rows)

### 19.2 Data Export

#### AC-169: Report export

- **Criterion**: All reports shall be exportable as CSV and PDF
- **Why**: External stakeholders (auditors, banks, investors) need reports in standard formats
- **Verify**: GET /reports/profit-loss?format=csv, verify download
- **Edge Cases**: Very large reports, special characters in data, locale-specific formatting

---

## 20. Statistics Utilities

### 20.1 Basic Statistics

#### AC-170: Mean calculation

- **Criterion**: The mean function shall return arithmetic average of a number array
- **Why**: Mean is used across all AI features as the baseline central tendency measure
- **Verify**: Unit `statistics.util.spec.ts` — mean of [1,2,3,4,5] = 3
- **Edge Cases**: Empty array, single element, negative numbers, very large numbers

#### AC-171: Standard deviation

- **Criterion**: Standard deviation shall use sample standard deviation (n-1 denominator)
- **Why**: Sample std dev is the unbiased estimator for business data (which is always a sample)
- **Verify**: Unit `statistics.util.spec.ts` — known std dev values
- **Edge Cases**: All identical values (std=0), two values, population vs sample distinction

#### AC-172: Z-score calculation

- **Criterion**: Z-score shall express how many standard deviations a value is from the mean
- **Why**: Z-scores power anomaly detection — values beyond ±3 are flagged
- **Verify**: Unit `statistics.util.spec.ts` — zScore with known inputs
- **Edge Cases**: Std dev = 0 (division by zero), z-score of the mean (should be 0)

#### AC-173: Percentile calculation

- **Criterion**: Percentile function shall return the value below which a given percentage falls
- **Why**: P10/P50/P90 in Monte Carlo, salary percentiles in HR analytics
- **Verify**: Unit `statistics.util.spec.ts` — percentile with known data
- **Edge Cases**: 0th percentile, 100th percentile, single-element array

#### AC-174: Interquartile Range (IQR)

- **Criterion**: IQR shall return Q3-Q1 and identify outliers beyond 1.5\*IQR
- **Why**: IQR-based outlier detection is robust to non-normal distributions (unlike Z-score)
- **Verify**: Unit `statistics.util.spec.ts` — isOutlierIQR, getIQRBounds
- **Edge Cases**: All values identical (IQR=0), skewed distributions, small datasets

#### AC-175: Linear regression

- **Criterion**: Linear regression shall return slope, intercept, and R² for trend analysis
- **Why**: Trend lines for revenue growth, cost trends, and forecast extrapolation
- **Verify**: Unit `statistics.util.spec.ts` — linearRegression, predictLinear
- **Edge Cases**: Horizontal line (slope=0), vertical data (undefined slope), perfect fit (R²=1)

#### AC-176: Moving averages

- **Criterion**: SMA and EMA shall smooth time series data for trend identification
- **Why**: Moving averages reduce noise in volatile data for clearer trend signals
- **Verify**: Unit `statistics.util.spec.ts` — simpleMovingAverage, exponentialMovingAverage
- **Edge Cases**: Window larger than data, window of 1, empty data

### 20.2 Text Similarity

#### AC-177: Levenshtein distance

- **Criterion**: Levenshtein distance shall count minimum edits between two strings
- **Why**: Edit distance drives fuzzy matching for vendor names and transaction descriptions
- **Verify**: Unit `text-similarity.util.spec.ts` — known edit distances
- **Edge Cases**: Empty strings, identical strings (distance 0), case sensitivity

#### AC-178: Jaccard similarity

- **Criterion**: Jaccard similarity shall measure word overlap between descriptions
- **Why**: Word overlap captures semantic similarity even when word order differs
- **Verify**: Unit `text-similarity.util.spec.ts` — jaccardSimilarity
- **Edge Cases**: Empty token sets, identical descriptions (similarity 1), no overlap (0)

#### AC-179: N-gram similarity

- **Criterion**: N-gram similarity shall compare character sequences for partial matching
- **Why**: N-grams catch similarities that word-level methods miss (abbreviations, typos)
- **Verify**: Unit `text-similarity.util.spec.ts` — nGramSimilarity
- **Edge Cases**: Very short strings (< n), identical strings, completely different strings

#### AC-180: Best match finder

- **Criterion**: findBestMatch shall return the highest-scoring match from a list of candidates
- **Why**: Vendor matching and reconciliation need to pick the best candidate efficiently
- **Verify**: Unit `text-similarity.util.spec.ts` — findBestMatch
- **Edge Cases**: No matches above threshold, multiple tied scores, empty candidate list

### 20.3 Isolation Forest

#### AC-181: Forest construction

- **Criterion**: buildIsolationForest shall create the specified number of trees with random sampling
- **Why**: Multiple trees with random sampling reduces individual tree bias for robust anomaly detection
- **Verify**: Unit `isolation-forest.util.spec.ts` — tree count matches parameter
- **Edge Cases**: Empty data, single data point, more trees than data points

#### AC-182: Anomaly scoring

- **Criterion**: Isolation Forest anomaly scores shall be between 0 (normal) and 1 (anomalous)
- **Why**: Normalized scores enable consistent threshold setting across datasets
- **Verify**: Unit `isolation-forest.util.spec.ts` — score range validation
- **Edge Cases**: All identical points (score ~0.5), extreme outlier, empty forest

#### AC-183: Anomaly detection

- **Criterion**: isolationForestDetect shall flag points above the threshold as anomalies
- **Why**: Binary anomaly/normal classification is needed for alert generation
- **Verify**: Unit `isolation-forest.util.spec.ts` — clear anomalies detected
- **Edge Cases**: Threshold = 0 (everything anomalous), threshold = 1 (nothing anomalous)

---

## 21. Frontend

### 21.1 General UI

#### AC-184: Loading state handling

- **Criterion**: Every page shall display a loading skeleton while data is being fetched
- **Why**: Loading skeletons prevent layout shift and indicate system responsiveness
- **Verify**: Throttle network, verify skeleton appears on each page
- **Edge Cases**: Very fast response (flash prevention), infinite loading (error fallback)

#### AC-185: Error state handling

- **Criterion**: Every page shall display a meaningful error message when data fetch fails
- **Why**: Users need to understand what went wrong and what to do next
- **Verify**: Simulate API error (500), verify error UI with retry option
- **Edge Cases**: Network offline, 401 (redirect to login), 403 (permission denied)

#### AC-186: Empty state handling

- **Criterion**: Every list page shall display an empty state with a call-to-action when no data exists
- **Why**: Empty states guide new users to create their first record, reducing confusion
- **Verify**: New org with no invoices, verify "Create your first invoice" CTA
- **Edge Cases**: Filtered list with no results vs truly empty, search with no matches

#### AC-187: Mobile responsiveness

- **Criterion**: All pages shall be usable on mobile devices (375px width minimum)
- **Why**: Business owners and managers need to check financials on their phones
- **Verify**: Test at 375px viewport width, verify no horizontal scroll, touch targets ≥ 44px
- **Edge Cases**: Large tables (horizontal scroll needed), modals on small screens

### 21.2 Navigation

#### AC-188: Dashboard layout

- **Criterion**: Dashboard shall display key financial metrics (revenue, expenses, profit, cash balance)
- **Why**: At-a-glance financial health is the first thing users check daily
- **Verify**: Navigate to dashboard, verify metric cards and charts
- **Edge Cases**: New org (all zeros), very large numbers (formatting), negative profit

#### AC-189: Module navigation

- **Criterion**: Sidebar navigation shall organize modules into logical groups (sales, purchases, etc.)
- **Why**: Intuitive navigation reduces training time and improves user satisfaction
- **Verify**: Click through all sidebar items, verify correct page loads
- **Edge Cases**: Permission-restricted items (hide or grey out), collapsed sidebar state

### 21.3 Forms

#### AC-190: Form validation

- **Criterion**: All forms shall validate using Zod schemas before submission
- **Why**: Client-side validation provides instant feedback, reducing server round-trips
- **Verify**: Submit form with invalid data, verify field-level error messages
- **Edge Cases**: Submit button state (disabled during submission), validation on blur vs submit

#### AC-191: React Hook Form integration

- **Criterion**: Forms shall use react-hook-form with zodResolver for consistent behavior
- **Why**: react-hook-form minimizes re-renders and provides excellent DX for complex forms
- **Verify**: Complex forms (invoice with line items), verify performance and UX
- **Edge Cases**: Dynamic form fields (add/remove lines), form with >50 fields

### 21.4 Data Fetching

#### AC-192: TanStack Query usage

- **Criterion**: All server state shall be managed via TanStack Query hooks
- **Why**: TanStack Query provides caching, background refresh, and optimistic updates
- **Verify**: Navigate away and back, verify data loaded from cache
- **Edge Cases**: Stale data invalidation, concurrent queries, query error recovery

#### AC-193: Optimistic updates

- **Criterion**: Mutations shall optimistically update the UI before server confirmation
- **Why**: Optimistic updates make the app feel instant, improving perceived performance
- **Verify**: Create record, verify appears immediately before API response
- **Edge Cases**: API failure after optimistic update (rollback), concurrent mutations

### 21.5 Bill Scanning Page

#### AC-194: Multi-step scan wizard

- **Criterion**: Bill scanning shall follow steps: Upload → Review extracted data → Create Bill
- **Why**: Guided workflow ensures users verify AI-extracted data before it enters the ledger
- **Verify**: Navigate to /purchases/bills/scan, complete full wizard flow
- **Edge Cases**: Cancel mid-flow, upload failure, all fields extracted incorrectly

#### AC-195: Extracted data editing

- **Criterion**: Users shall be able to edit AI-extracted fields before creating the bill
- **Why**: AI extraction is not 100% accurate; human verification is essential for financial data
- **Verify**: Upload document, modify extracted vendor name, create bill with correction
- **Edge Cases**: Clear all fields and re-enter manually, extracted amount with wrong decimal

---

## 22. Performance & Scalability

#### AC-196: Query performance

- **Criterion**: List endpoints shall respond within 500ms for up to 10,000 records
- **Why**: Slow queries degrade user experience and indicate missing indexes
- **Verify**: Load test with 10K records, measure p95 response time
- **Edge Cases**: Complex joins (invoices with lines + customer + payments), full-text search

#### AC-197: Pagination support

- **Criterion**: All list endpoints shall support pagination with page, limit, total, and totalPages
- **Why**: Loading all records in one query is unsustainable as data grows
- **Verify**: GET /invoices?page=2&limit=25, verify meta.totalPages
- **Edge Cases**: Page beyond total (empty result), limit=0, limit=10000

#### AC-198: Database indexing

- **Criterion**: All frequently queried fields shall have appropriate indexes
- **Why**: Indexes are critical for multi-tenant query performance
- **Verify**: Review Prisma schema for indexes on [organizationId, status], [organizationId, createdAt]
- **Edge Cases**: Composite indexes vs single-column, index on deletedAt for soft delete queries

---

## 23. Security

#### AC-199: SQL injection prevention

- **Criterion**: All database queries shall use parameterized queries (Prisma ORM handles this)
- **Why**: SQL injection is OWASP #1 and can lead to complete data breach
- **Verify**: Attempt SQL injection in query params, verify no execution
- **Edge Cases**: Dynamic filters, raw queries (Prisma.$queryRaw)

#### AC-200: XSS prevention

- **Criterion**: All user input shall be sanitized before rendering in the browser
- **Why**: XSS can steal sessions and execute arbitrary code in user's browser
- **Verify**: Submit script tags in text fields, verify they're escaped in output
- **Edge Cases**: Rich text fields, SVG uploads, JSON fields rendered as HTML

#### AC-201: CORS configuration

- **Criterion**: CORS shall only allow requests from the configured frontend origin
- **Why**: Prevents malicious websites from making authenticated requests to the API
- **Verify**: Request from unauthorized origin, verify rejection
- **Edge Cases**: Subdomain variations, development vs production origins

#### AC-202: Rate limiting

- **Criterion**: The system shall rate-limit authentication endpoints (login, register)
- **Why**: Brute force protection for login and DoS prevention for registration
- **Verify**: Send 100 login requests rapidly, verify throttling after threshold
- **Edge Cases**: Distributed attacks, legitimate high-traffic scenarios

#### AC-203: Sensitive data protection

- **Criterion**: Passwords, tokens, and API keys shall never appear in API responses or logs
- **Why**: Credential exposure in logs is a common breach vector
- **Verify**: Review all auth-related responses, verify password/secret fields excluded
- **Edge Cases**: Error responses including stack traces, debug logs in production

---

## 24. Infrastructure

#### AC-204: Docker Compose setup

- **Criterion**: docker-compose up shall start PostgreSQL and Redis with correct credentials
- **Why**: One-command infrastructure setup enables rapid developer onboarding
- **Verify**: Run docker-compose up -d, verify services healthy
- **Edge Cases**: Port conflicts, existing containers, Docker not installed

#### AC-205: Database migrations

- **Criterion**: Prisma migrations shall be forward-only and version-controlled
- **Why**: Reproducible database changes ensure all environments stay in sync
- **Verify**: Run pnpm db:migrate on fresh database
- **Edge Cases**: Migration conflicts, data migrations, rollback strategy

#### AC-206: Environment configuration

- **Criterion**: All secrets and configuration shall be loaded from environment variables
- **Why**: Secrets in code get committed; environment variables support per-deployment configuration
- **Verify**: Verify `.env.local` has all required variables, no hardcoded secrets in source
- **Edge Cases**: Missing required variable (fail fast with clear error), default values for optional

#### AC-207: Health check endpoint

- **Criterion**: GET /health shall return 200 when the application is running and database is accessible
- **Why**: Load balancers and monitoring tools need a health check endpoint
- **Verify**: GET /health returns 200
- **Edge Cases**: Database down (should return 503), Redis down (degraded but not dead)

---

## Summary

| Module                         | Criteria Count | Range               |
| ------------------------------ | -------------- | ------------------- |
| Authentication & Authorization | 13             | AC-001 — AC-013     |
| Multi-Tenancy                  | 7              | AC-014 — AC-020     |
| Accounting                     | 13             | AC-021 — AC-033     |
| Sales                          | 13             | AC-034 — AC-046     |
| Purchases                      | 10             | AC-047 — AC-056     |
| Inventory                      | 11             | AC-057 — AC-067     |
| Banking                        | 7              | AC-068 — AC-074     |
| HR                             | 11             | AC-075 — AC-085     |
| Manufacturing                  | 4              | AC-086 — AC-089     |
| Projects                       | 5              | AC-090 — AC-094     |
| Tax                            | 4              | AC-095 — AC-098     |
| CRM                            | 4              | AC-099 — AC-102     |
| Reports                        | 6              | AC-103 — AC-108     |
| AI Features                    | 47             | AC-109 — AC-155     |
| Document Management            | 2              | AC-156 — AC-157     |
| Notifications                  | 3              | AC-158 — AC-160     |
| Currency                       | 3              | AC-161 — AC-163     |
| Audit Trail                    | 3              | AC-164 — AC-166     |
| Import/Export                  | 3              | AC-167 — AC-169     |
| Statistics Utilities           | 14             | AC-170 — AC-183     |
| Frontend                       | 12             | AC-184 — AC-195     |
| Performance & Scalability      | 3              | AC-196 — AC-198     |
| Security                       | 5              | AC-199 — AC-203     |
| Infrastructure                 | 4              | AC-204 — AC-207     |
| **Total**                      | **207**        | **AC-001 — AC-207** |

---

_Generated for the Mizano ERP project — each criterion is testable, business-justified, and includes verification steps and edge case considerations._

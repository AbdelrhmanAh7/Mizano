-- Enable pg_trgm extension for fuzzy/trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable: SearchHistory
CREATE TABLE "search_histories" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultType" TEXT,
    "resultId" TEXT,
    "resultTitle" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "search_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint on (organizationId, userId, query) for upsert behavior
CREATE UNIQUE INDEX "search_histories_organizationId_userId_query_key" ON "search_histories" (
    "organizationId",
    "userId",
    "query"
);

-- CreateIndex: For fetching user search history ordered by clickedAt
CREATE INDEX "search_histories_organizationId_userId_clickedAt_idx" ON "search_histories" (
    "organizationId",
    "userId",
    "clickedAt"
);

-- AddForeignKey
ALTER TABLE "search_histories"
ADD CONSTRAINT "search_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_histories"
ADD CONSTRAINT "search_histories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- GIN trigram indexes for fuzzy search
-- These use pg_trgm's gin_trgm_ops for efficient similarity queries
-- ============================================

-- Customers
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_email_trgm" ON "customers" USING gin ("email" gin_trgm_ops);

-- Vendors
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_vendor_name_trgm" ON "vendors" USING gin ("name" gin_trgm_ops);

-- Invoices
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_invoice_number_trgm" ON "invoices" USING gin ("invoiceNumber" gin_trgm_ops);

-- Bills
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_bill_number_trgm" ON "bills" USING gin ("billNumber" gin_trgm_ops);

-- Items
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_item_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_item_sku_trgm" ON "items" USING gin ("sku" gin_trgm_ops);

-- Employees
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_employee_name_trgm" ON "employees" USING gin ("name" gin_trgm_ops);

-- Projects
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_name_trgm" ON "projects" USING gin ("name" gin_trgm_ops);

-- Leads
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_lead_name_trgm" ON "leads" USING gin ("leadName" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_lead_company_trgm" ON "leads" USING gin ("companyName" gin_trgm_ops);

-- Deals
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_deal_name_trgm" ON "deals" USING gin ("dealName" gin_trgm_ops);

-- Quotes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_quote_number_trgm" ON "quotes" USING gin ("quoteNumber" gin_trgm_ops);

-- Expenses
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_expense_description_trgm" ON "expenses" USING gin ("description" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_expense_reference_trgm" ON "expenses" USING gin ("reference" gin_trgm_ops);

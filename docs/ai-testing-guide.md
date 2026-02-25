# Mizano AI - Testing Guide

## Quick Start

### 1. Start Infrastructure

```bash
docker-compose up -d          # PostgreSQL + Redis
```

### 2. Setup Database & Seed Training Data

```bash
pnpm db:generate              # Generate Prisma client
pnpm db:push                  # Push schema to database
pnpm db:seed                  # Seed demo data + AI training data (~500+ records)
```

### 3. Start the API

```bash
pnpm dev                      # web: 5001, api: 6001
```

---

## Login Credentials

| Email                  | Password    | Role                |
| ---------------------- | ----------- | ------------------- |
| **admin@mizano.com**   | password123 | Admin (full access) |
| manager@mizano.com     | password123 | Admin               |
| accountant@mizano.com  | password123 | Admin               |
| sales@mizano.com       | password123 | Admin               |
| storekeeper@mizano.com | password123 | Admin               |

### Login Request

```bash
curl -X POST http://localhost:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@mizano.com", "password": "password123"}'
```

**Response:**

```json
{
  "user": {
    "id": "...",
    "email": "admin@mizano.com",
    "name": "Admin User",
    "organizationId": "seed-org-001"
  },
  "organization": { "id": "seed-org-001", "name": "Mizano Demo Company" },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

Save the `accessToken` for all subsequent requests:

```bash
export TOKEN="eyJ...your-access-token..."
```

---

## Seeded Demo Data Summary

After running `pnpm db:seed`, you get:

| Entity                      | Count   | Details                                                                                   |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Organization                | 1       | Mizano Demo Company                                                                       |
| Users                       | 5       | admin, manager, accountant, sales, storekeeper                                            |
| Accounts                    | 17      | 1000-1200 (Assets), 2000 (Liability), 3000 (Equity), 4000 (Revenue), 5000-6700 (Expenses) |
| Customers                   | 3       | TechCorp Egypt, Global Solutions, Retail Plus                                             |
| Vendors                     | 10      | Supplier Alpha/Beta + 8 expense vendors (Office Depot, utility companies, etc.)           |
| Items                       | 3       | Laptop Pro 15", Desktop Monitor, USB Cable                                                |
| Warehouses                  | 2       | Main Warehouse, North Center                                                              |
| Invoices                    | 47      | 2 draft + 45 paid (for payment prediction training)                                       |
| Bills                       | 2       | Draft bills                                                                               |
| **AI Training Data**        | **132** | Transaction categorization (11 categories x 12 examples)                                  |
| **Reconciliation Patterns** | **41**  | Bank description matching                                                                 |
| **Leads**                   | **60**  | 30 WON + 30 LOST (for lead scoring ML)                                                    |
| **Expenses**                | **53**  | Historical expenses with outliers (for anomaly detection)                                 |
| **Inventory Movements**     | **216** | 3 items x 24 months with seasonal patterns                                                |
| **Payment History**         | **45**  | Paid invoices with varied timing (for payment prediction)                                 |
| **Recurring Expenses**      | **24**  | 4 vendors x 6 months (for pattern detection)                                              |

---

## Testing AI Features

### A. Transaction Categorization (Ready to Use)

The categorizer is trained from seed data with 132 examples across 11 expense categories.

**Train the model (run once after seeding):**

```bash
curl -X POST http://localhost:6001/api/ai/categorization/train \
  -H "Authorization: Bearer $TOKEN"
```

**Predict category for a transaction:**

```bash
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Uber ride to airport",
    "amount": 45.00,
    "vendor": "Uber"
  }'
```

**Test different descriptions:**

```bash
# Should categorize as Office Supplies (6000)
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "printer paper and toner cartridges", "amount": 89.99}'

# Should categorize as Utilities (6100)
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "monthly electricity bill", "amount": 250.00}'

# Should categorize as Marketing (6400)
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Google Ads campaign", "amount": 500.00}'

# Should categorize as Travel (6300)
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Hotel booking for conference", "amount": 320.00}'
```

**Correct a prediction (feeds back into training):**

```bash
curl -X POST http://localhost:6001/api/ai/categorization/learn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Monthly SaaS subscription",
    "amount": 99.00,
    "accountCode": "6000"
  }'
```

**Get model stats:**

```bash
curl http://localhost:6001/api/ai/categorization/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

### B. Lead Scoring

**Score all leads (batch):**

```bash
curl -X POST http://localhost:6001/api/ai/lead-scoring/score-all \
  -H "Authorization: Bearer $TOKEN"
```

**Train ML model (uses 60 seeded leads):**

```bash
curl -X POST http://localhost:6001/api/ai/lead-scoring/train \
  -H "Authorization: Bearer $TOKEN"
```

**Get hot leads (score > 70):**

```bash
curl http://localhost:6001/api/ai/lead-scoring/hot \
  -H "Authorization: Bearer $TOKEN"
```

**Get cold leads (score < 30):**

```bash
curl http://localhost:6001/api/ai/lead-scoring/cold \
  -H "Authorization: Bearer $TOKEN"
```

**Get ML model status:**

```bash
curl http://localhost:6001/api/ai/lead-scoring/ml-status \
  -H "Authorization: Bearer $TOKEN"
```

**Get score distribution:**

```bash
curl http://localhost:6001/api/ai/lead-scoring/distribution \
  -H "Authorization: Bearer $TOKEN"
```

---

### C. Anomaly Detection

**Run anomaly scan (uses seeded expenses with outliers):**

```bash
curl -X POST http://localhost:6001/api/ai/anomalies/scan \
  -H "Authorization: Bearer $TOKEN"
```

**Get detected anomalies:**

```bash
curl http://localhost:6001/api/ai/anomalies \
  -H "Authorization: Bearer $TOKEN"
```

**Get anomaly stats:**

```bash
curl http://localhost:6001/api/ai/anomalies/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Check a specific transaction:**

```bash
curl -X POST http://localhost:6001/api/ai/anomalies/check/transaction \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "ACCOUNT_ID_HERE",
    "amount": 15000,
    "description": "Suspicious large payment"
  }'
```

---

### D. Payment Prediction

**Predict payment for all outstanding invoices:**

```bash
curl http://localhost:6001/api/ai/payment-prediction/outstanding \
  -H "Authorization: Bearer $TOKEN"
```

**Get customer payment profile:**

```bash
# Use customer IDs: cust-001, cust-002, cust-003
curl http://localhost:6001/api/ai/payment-prediction/customer/cust-001/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Get collection priority ranking:**

```bash
curl http://localhost:6001/api/ai/payment-prediction/collection-priority \
  -H "Authorization: Bearer $TOKEN"
```

---

### E. Cash Flow Prediction

**Get cash flow forecast (Monte Carlo simulation):**

```bash
curl http://localhost:6001/api/ai/cash-flow/forecast \
  -H "Authorization: Bearer $TOKEN"
```

**Get quick summary:**

```bash
curl http://localhost:6001/api/ai/cash-flow/quick \
  -H "Authorization: Bearer $TOKEN"
```

**Get scenarios (optimistic/expected/pessimistic):**

```bash
curl http://localhost:6001/api/ai/cash-flow/scenarios \
  -H "Authorization: Bearer $TOKEN"
```

**Run what-if analysis:**

```bash
curl -X POST http://localhost:6001/api/ai/cash-flow/what-if \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "new_contract",
    "amount": 50000,
    "startDate": "2026-03-01"
  }'
```

---

### F. Demand Forecasting

**Get forecast for an item:**

```bash
# Item IDs: item-001 (Laptop), item-002 (Monitor), item-003 (USB Cable)
curl http://localhost:6001/api/ai/demand-forecast/item/item-001 \
  -H "Authorization: Bearer $TOKEN"
```

**Get seasonality pattern:**

```bash
curl http://localhost:6001/api/ai/demand-forecast/item/item-001/seasonality \
  -H "Authorization: Bearer $TOKEN"
```

**Get forecast dashboard:**

```bash
curl http://localhost:6001/api/ai/demand-forecast/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

**Recalculate all forecasts:**

```bash
curl -X POST http://localhost:6001/api/ai/demand-forecast/recalculate \
  -H "Authorization: Bearer $TOKEN"
```

---

### G. Pattern Detection

**Run pattern analysis (finds recurring expenses):**

```bash
curl -X POST http://localhost:6001/api/ai/patterns/analyze \
  -H "Authorization: Bearer $TOKEN"
```

**Get detected patterns:**

```bash
curl http://localhost:6001/api/ai/patterns \
  -H "Authorization: Bearer $TOKEN"
```

**Get pattern suggestions (for auto-creating recurring profiles):**

```bash
curl http://localhost:6001/api/ai/patterns/suggestions \
  -H "Authorization: Bearer $TOKEN"
```

---

### H. Reorder Points & Inventory Intelligence

**Get items needing reorder:**

```bash
curl http://localhost:6001/api/ai/reorder/alerts \
  -H "Authorization: Bearer $TOKEN"
```

**Recalculate reorder points:**

```bash
curl -X POST http://localhost:6001/api/ai/reorder/recalculate \
  -H "Authorization: Bearer $TOKEN"
```

**Get dead stock:**

```bash
curl http://localhost:6001/api/ai/reorder/dead-stock \
  -H "Authorization: Bearer $TOKEN"
```

**ABC analysis:**

```bash
curl http://localhost:6001/api/ai/reorder/abc-analysis \
  -H "Authorization: Bearer $TOKEN"
```

---

### I. AI Feedback Loop (Core Training Pipeline)

**Submit feedback (correction trains the model):**

```bash
curl -X POST http://localhost:6001/api/ai/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "CATEGORIZATION",
    "aiSuggestion": {"accountCode": "6000", "confidence": 0.75},
    "userAction": "CORRECTED",
    "userAnswer": "6200",
    "inputData": {"description": "Team lunch at restaurant", "amount": 150}
  }'
```

**Get feedback stats:**

```bash
curl "http://localhost:6001/api/ai/feedback/stats?feature=CATEGORIZATION" \
  -H "Authorization: Bearer $TOKEN"
```

**Get model status:**

```bash
curl http://localhost:6001/api/ai/feedback/models/CATEGORIZATION/status \
  -H "Authorization: Bearer $TOKEN"
```

**Manually trigger retraining:**

```bash
curl -X POST http://localhost:6001/api/ai/feedback/models/CATEGORIZATION/retrain \
  -H "Authorization: Bearer $TOKEN"
```

---

### J. More AI Features

**Financial Narrative (NLP reports):**

```bash
curl http://localhost:6001/api/ai/narrative/monthly \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/narrative/weekly \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/narrative/cash-flow \
  -H "Authorization: Bearer $TOKEN"
```

**Churn Prediction:**

```bash
curl http://localhost:6001/api/ai/churn/customer/cust-001 \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/churn/high-risk \
  -H "Authorization: Bearer $TOKEN"
```

**Customer Lifetime Value:**

```bash
curl http://localhost:6001/api/ai/clv/customer/cust-001 \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/clv/segments \
  -H "Authorization: Bearer $TOKEN"
```

**Fraud Detection:**

```bash
curl -X POST http://localhost:6001/api/ai/fraud/scan \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/fraud/alerts \
  -H "Authorization: Bearer $TOKEN"
```

**Compliance Monitoring:**

```bash
curl http://localhost:6001/api/ai/compliance/report \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/compliance/score \
  -H "Authorization: Bearer $TOKEN"
```

**Chatbot:**

```bash
curl -X POST http://localhost:6001/api/ai/chatbot/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my top 5 expenses this month?"}'
```

**Sentiment Analysis:**

```bash
curl -X POST http://localhost:6001/api/ai/sentiment/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Great service, very happy with the delivery speed!"}'
```

**Cross-Sell Recommendations:**

```bash
curl http://localhost:6001/api/ai/cross-sell/customer/cust-001 \
  -H "Authorization: Bearer $TOKEN"
```

**Dynamic Pricing:**

```bash
curl http://localhost:6001/api/ai/pricing/item/item-001/suggest \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/pricing/item/item-001/elasticity \
  -H "Authorization: Bearer $TOKEN"
```

**Document Classification:**

```bash
curl -X POST http://localhost:6001/api/ai/documents/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Invoice #1234 for consulting services rendered in January 2026. Total amount due: $5,000.00"}'
```

**AI Dashboard Insights:**

```bash
curl http://localhost:6001/api/ai/insights \
  -H "Authorization: Bearer $TOKEN"
```

**AI Alerts:**

```bash
curl http://localhost:6001/api/ai/alerts \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/alerts/summary \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/alerts/critical \
  -H "Authorization: Bearer $TOKEN"
```

---

## Recommended Testing Flow

Follow this order to see the full AI pipeline in action:

### Step 1: Seed & Train

```bash
pnpm db:seed                                                    # Seeds 500+ AI records
curl -X POST http://localhost:6001/api/ai/categorization/train \ # Train categorizer
  -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:6001/api/ai/lead-scoring/train \   # Train lead scoring
  -H "Authorization: Bearer $TOKEN"
```

### Step 2: Test Predictions

```bash
# Categorize a transaction
curl -X POST http://localhost:6001/api/ai/categorization/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Office chair from IKEA", "amount": 299}'

# Get lead scores
curl http://localhost:6001/api/ai/lead-scoring/hot \
  -H "Authorization: Bearer $TOKEN"
```

### Step 3: Test Feedback Loop

```bash
# Submit a correction
curl -X POST http://localhost:6001/api/ai/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "CATEGORIZATION",
    "aiSuggestion": {"accountCode": "6000"},
    "userAction": "CORRECTED",
    "userAnswer": "6600",
    "inputData": {"description": "Office chair from IKEA", "amount": 299}
  }'

# Check feedback stats
curl "http://localhost:6001/api/ai/feedback/stats?feature=CATEGORIZATION" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4: Run Batch Operations

```bash
# Anomaly scan
curl -X POST http://localhost:6001/api/ai/anomalies/scan \
  -H "Authorization: Bearer $TOKEN"

# Pattern analysis
curl -X POST http://localhost:6001/api/ai/patterns/analyze \
  -H "Authorization: Bearer $TOKEN"

# Demand forecasting
curl -X POST http://localhost:6001/api/ai/demand-forecast/recalculate \
  -H "Authorization: Bearer $TOKEN"

# Reorder analysis
curl -X POST http://localhost:6001/api/ai/reorder/recalculate \
  -H "Authorization: Bearer $TOKEN"
```

### Step 5: Check Reports & Narratives

```bash
curl http://localhost:6001/api/ai/narrative/monthly \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/cash-flow/forecast \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/insights \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:6001/api/ai/alerts/summary \
  -H "Authorization: Bearer $TOKEN"
```

---

## Entity IDs Reference

Use these IDs in API calls:

| Entity       | ID             | Name                |
| ------------ | -------------- | ------------------- |
| Organization | `seed-org-001` | Mizano Demo Company |
| Customer     | `cust-001`     | TechCorp Egypt      |
| Customer     | `cust-002`     | Global Solutions    |
| Customer     | `cust-003`     | Retail Plus         |
| Vendor       | `vend-001`     | Supplier Alpha      |
| Vendor       | `vend-002`     | Supplier Beta       |
| Item         | `item-001`     | Laptop Pro 15"      |
| Item         | `item-002`     | Desktop Monitor     |
| Item         | `item-003`     | USB Cable           |
| Warehouse    | `wh-001`       | Main Warehouse      |
| Warehouse    | `wh-002`       | North Center        |
| Bank Account | `bank-001`     | Business Checking   |
| Bank Account | `bank-002`     | Petty Cash          |

---

## All 38 AI Endpoints (Summary)

| #   | Route Prefix                 | Feature                    | Key Endpoints                         |
| --- | ---------------------------- | -------------------------- | ------------------------------------- |
| 1   | `/api/ai/categorization`     | Transaction Categorization | predict, learn, train, stats          |
| 2   | `/api/ai/lead-scoring`       | Lead Scoring               | score, train, hot, cold, distribution |
| 3   | `/api/ai/anomalies`          | Anomaly Detection          | scan, list, stats, check              |
| 4   | `/api/ai/payment-prediction` | Payment Prediction         | outstanding, profile, priority        |
| 5   | `/api/ai/cash-flow`          | Cash Flow Forecast         | forecast, scenarios, what-if          |
| 6   | `/api/ai/demand-forecast`    | Demand Forecasting         | item forecast, seasonality, dashboard |
| 7   | `/api/ai/patterns`           | Pattern Detection          | analyze, suggestions, accept          |
| 8   | `/api/ai/reorder`            | Reorder Points             | alerts, recalculate, ABC analysis     |
| 9   | `/api/ai/reconciliation`     | Bank Reconciliation        | match, confirm, rules                 |
| 10  | `/api/ai/narrative`          | Financial Narratives       | monthly, weekly, cash-flow, queries   |
| 11  | `/api/ai/feedback`           | Feedback Loop              | submit, stats, trends, retrain        |
| 12  | `/api/ai/alerts`             | AI Alerts                  | list, summary, critical               |
| 13  | `/api/ai/churn`              | Churn Prediction           | predict, high-risk, train             |
| 14  | `/api/ai/clv`                | Customer Lifetime Value    | calculate, segments, distribution     |
| 15  | `/api/ai/cross-sell`         | Cross-Sell/Upsell          | recommendations, related items        |
| 16  | `/api/ai/pricing`            | Dynamic Pricing            | suggest, elasticity, insights         |
| 17  | `/api/ai/fraud`              | Fraud Detection            | scan, alerts, resolve                 |
| 18  | `/api/ai/compliance`         | Compliance Monitoring      | report, score, check                  |
| 19  | `/api/ai/audit-risk`         | Audit Risk Scoring         | score, high-risk, batch               |
| 20  | `/api/ai/pipeline`           | Sales Pipeline Forecast    | forecast, weighted, conversion        |
| 21  | `/api/ai/documents`          | Document Classification    | classify, train                       |
| 22  | `/api/ai/document-intake`    | Document Intake (OCR)      | process, confirm                      |
| 23  | `/api/ai/ocr`                | OCR Extraction             | extract, learn, check-duplicate       |
| 24  | `/api/ai/sentiment`          | Sentiment Analysis         | analyze, customer, vendor             |
| 25  | `/api/ai/entities`           | Entity Extraction          | extract, extract-and-match            |
| 26  | `/api/ai/contracts`          | Contract Analysis          | analyze, dates, obligations, risk     |
| 27  | `/api/ai/chatbot`            | AI Chatbot                 | message, history                      |
| 28  | `/api/ai/knowledge`          | Knowledge Assistant        | search, suggestions                   |
| 29  | `/api/ai/voice`              | Voice Commands             | parse, execute                        |
| 30  | `/api/ai/attrition`          | Employee Attrition         | predict, flight-risk, train           |
| 31  | `/api/ai/compensation`       | Compensation Benchmark     | benchmark, departments, outliers      |
| 32  | `/api/ai/skills`             | Skills Gap Analysis        | employee gap, department gap          |
| 33  | `/api/ai/workforce`          | Workforce Scheduling       | suggest, staffing-needs               |
| 34  | `/api/ai/quality`            | Quality Prediction         | predict, trends, train                |
| 35  | `/api/ai/maintenance`        | Predictive Maintenance     | predict, schedule, health             |
| 36  | `/api/ai/resources`          | Resource Optimization      | trends, forecast, efficiency          |
| 37  | `/api/ai/routes`             | Route Optimization         | optimize, estimate                    |
| 38  | `/api/ai`                    | General AI                 | insights, forecasts, categorize       |

**Total: 206+ endpoints across 38 controllers**

# Mizano AI Features Documentation

> **All AI runs 100% locally with zero external API calls.**
>
> Libraries used: `natural`, `tesseract.js`, `pdf-parse`, `brain.js`, `ml-logistic-regression`, `ml-matrix`, `simple-statistics`, `compromise`, `sentiment`

---

## Table of Contents

1. [Core Financial AI (10 models)](#1-core-financial-ai)
2. [Sales & CRM AI (6 models)](#2-sales--crm-ai)
3. [Security & Compliance (3 models)](#3-security--compliance)
4. [NLP & Conversational (7 models)](#4-nlp--conversational)
5. [HR & Operations (8 models)](#5-hr--operations)
6. [Supporting Infrastructure](#6-supporting-infrastructure)
7. [Schedulers](#7-schedulers)
8. [Utility Modules](#8-utility-modules)
9. [AiFeature Enum](#9-aifeature-enum)

---

## 1. Core Financial AI

### 1.1 Transaction Auto-Categorization

| Field                    | Details                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service**              | `TransactionCategorizerService`                                                                                                                                    |
| **AiFeature**            | `CATEGORIZATION`                                                                                                                                                   |
| **Purpose**              | Automatically categorize bank transactions into chart of accounts using NLP-based text classification. Learns from user corrections to improve accuracy over time. |
| **Algorithm/Library**    | Naive Bayes classifier from the `natural` library. Tokenizes and stems transaction descriptions, then classifies against known account categories.                 |
| **Input Data**           | Transaction description (string), amount (Decimal), vendor/payee name (string).                                                                                    |
| **Output Format**        | `{ suggestedAccount: string, confidence: number, alternatives: [{ account: string, confidence: number }] }` -- top suggestion plus up to 3 ranked alternatives.    |
| **Confidence Scoring**   | 0-1 scale. Derived from the Naive Bayes posterior probability. Higher values indicate stronger class separation for the given input.                               |
| **Training Data Source** | Historical categorized transactions from the organization (source: `USER`). User corrections stored as `CORRECTION` source in `AiTrainingData`.                    |
| **Retraining Trigger**   | 50 corrections accumulated since last training. Checked every 6 hours by `AiRetrainingScheduler`.                                                                  |

---

### 1.2 Bank Reconciliation Matcher

| Field                    | Details                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| **Service**              | `ReconciliationMatcherService`                                                                                                                                                                                                                              |
| **AiFeature**            | `RECONCILIATION`                                                                                                                                                                                                                                            |
| **Purpose**              | Match imported bank transactions against internal accounting records (invoices, bills, journal entries) using multi-factor scoring.                                                                                                                         |
| **Algorithm/Library**    | Custom multi-factor scoring algorithm. Uses `text-similarity.util.ts` for Levenshtein distance and `extractDocumentNumbers` for reference extraction via regex.                                                                                             |
| **Input Data**           | Bank transaction (description, amount, date, reference) paired against candidate internal records (invoices, bills, payments).                                                                                                                              |
| **Output Format**        | `{ matches: [{ recordId: string, recordType: string, score: number, confidence: 'high'                                                                                                                                                                      | 'medium' | 'low', factors: { amount: number, reference: number, name: number, date: number } }] }` |
| **Confidence Scoring**   | Composite score 0-1 built from four weighted factors: amount match (40%), reference extraction via regex (30%), fuzzy name match via Levenshtein distance (20%), date proximity within 7 days (10%). Score >0.8 = high confidence, >0.6 = medium, else low. |
| **Training Data Source** | Confirmed reconciliation matches stored as training data. User corrections when a suggested match is wrong.                                                                                                                                                 |
| **Retraining Trigger**   | 30 corrections since last training.                                                                                                                                                                                                                         |

---

### 1.3 Invoice OCR

| Field                    | Details                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service**              | `OcrService`                                                                                                                                                                                                                   |
| **AiFeature**            | `OCR_LAYOUT`                                                                                                                                                                                                                   |
| **Purpose**              | Extract structured data from uploaded invoice/bill images and PDF files. Learns vendor-specific field positions to improve accuracy over time.                                                                                 |
| **Algorithm/Library**    | `tesseract.js` for scanned images (OCR), `pdf-parse` (via `pdf-extractor.util.ts`) for native PDF text extraction. Falls back to tesseract.js when pdf-parse detects a scanned/image-only PDF (heuristic: <50 chars per page). |
| **Input Data**           | Image buffer (PNG, JPEG, TIFF) or PDF buffer.                                                                                                                                                                                  |
| **Output Format**        | `{ date: string, total: Decimal, subtotal: Decimal, taxAmount: Decimal, invoiceNumber: string, vendorName: string, lineItems: [...], confidence: number }`                                                                     |
| **Confidence Scoring**   | 0-1 scale. Based on OCR character confidence from tesseract and field extraction success rate. Higher for native PDFs than scanned images.                                                                                     |
| **Training Data Source** | `VendorOcrLayout` model stores learned field positions per vendor. Updated when users correct extracted values.                                                                                                                |
| **Retraining Trigger**   | 20 corrections. Improves significantly after 3+ invoices from the same vendor (layout learning).                                                                                                                               |

---

### 1.4 Demand Forecasting

| Field                    | Details                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| **Service**              | `DemandForecastingService`                                                                                                                                                                                                                                                                                                                  |
| **AiFeature**            | `DEMAND_FORECAST`                                                                                                                                                                                                                                                                                                                           |
| **Purpose**              | Forecast future demand for inventory items using time series analysis. Supports seasonal patterns, trend detection, and confidence intervals.                                                                                                                                                                                               |
| **Algorithm/Library**    | Holt-Winters Triple Exponential Smoothing (via `holt-winters.util.ts`). Three components: level (alpha=0.3), trend (beta=0.1), seasonal (gamma=0.3). Supports both multiplicative and additive seasonality. Falls back to Double Exponential Smoothing (Holt's method) with 6+ data points, or Simple Exponential Smoothing with less data. |
| **Input Data**           | Historical sales/movement data per item aggregated to monthly buckets. Minimum: 2x season length (default season=12 months, so 24 months of history for full Holt-Winters).                                                                                                                                                                 |
| **Output Format**        | `{ forecasts: [{ period: number, predicted: number, lowerBound: number, upperBound: number, seasonalIndex: number }], mape: number, trend: { direction: 'up'                                                                                                                                                                                | 'down' | 'flat', magnitude: number, confidence: number }, seasonalityStrength: number }` |
| **Confidence Scoring**   | 95% confidence interval (CI) bounds using residual standard deviation. CI expands with forecast horizon: `z * sigma * sqrt(1 + h * 0.1)`. MAPE (Mean Absolute Percentage Error) provides overall model accuracy.                                                                                                                            |
| **Training Data Source** | `ItemDemandForecast` records. Historical inventory movements and sales order line items.                                                                                                                                                                                                                                                    |
| **Retraining Trigger**   | 100 corrections. Automatically recalculated weekly (Sunday 1 AM) by `AiRetrainingScheduler`.                                                                                                                                                                                                                                                |

---

### 1.5 Cash Flow Prediction

| Field                    | Details                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| **Service**              | `CashFlowPredictionService`                                                                                                                                                                                                                     |
| **AiFeature**            | `CASH_FLOW`                                                                                                                                                                                                                                     |
| **Purpose**              | Probabilistic cash flow forecasting using Monte Carlo simulation. Provides P10/P50/P90 daily balance projections and identifies critical dates where cash may run low.                                                                          |
| **Algorithm/Library**    | Monte Carlo simulation (via `monte-carlo.util.ts`). Default 1000 runs per forecast.                                                                                                                                                             |
| **Input Data**           | Current cash balance, accounts receivable events, accounts payable events, recurring transactions, payroll obligations.                                                                                                                         |
| **Output Format**        | `{ percentiles: { p10: number[], p50: number[], p90: number[] }, minBalance: number, minBalanceDate: Date, daysUntilNegative: number                                                                                                            | null, criticalDates: [{ date: Date, reason: string, impact: number, type: 'warning' | 'critical' }] }` |
| **Confidence Scoring**   | Three percentile bands: P10 (pessimistic, 10th percentile), P50 (median/expected), P90 (optimistic, 90th percentile). AR payment timing is randomized per simulation run: 70% on predicted date, 20% delayed 1-14 days, 10% delayed 15-30 days. |
| **Training Data Source** | Live AR/AP balances, recurring profiles, payroll schedule, payment prediction data from `PaymentPredictionService`. `CashFlowForecast` records.                                                                                                 |
| **Retraining Trigger**   | 50 corrections. Daily recalculation at 3 AM by `AiRetrainingScheduler`. Supports what-if scenarios (delay customer, early payment, new expense, revenue change).                                                                                |

---

### 1.6 Payment Date Prediction

| Field                    | Details                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `PaymentPredictionService`                                                                                                                               |
| **AiFeature**            | `PAYMENT_PREDICTION`                                                                                                                                     |
| **Purpose**              | Predict when customers will pay their outstanding invoices based on historical payment behavior analysis. Feeds directly into cash flow prediction.      |
| **Algorithm/Library**    | Statistical analysis of historical payment patterns per customer. Uses `statistics.util.ts` for mean, standard deviation, and linear regression.         |
| **Input Data**           | Historical paid invoices per customer (requires 3+ paid invoices). Factors: average days to pay, standard deviation, invoice amount, day of week issued. |
| **Output Format**        | `{ predictedDate: Date, confidence: number, averageDays: number, stdDevDays: number, onTimeRate: number }`                                               |
| **Confidence Scoring**   | 0-1 scale. Based on sample size and payment consistency (lower std deviation = higher confidence). Requires minimum 3 paid invoices per customer.        |
| **Training Data Source** | Historical invoice payment records. `CustomerAiProfile` for per-customer payment patterns.                                                               |
| **Retraining Trigger**   | 30 corrections. Weekly recalculation (Sunday 2 AM) by `AiRetrainingScheduler`.                                                                           |

---

### 1.7 Anomaly Detection

| Field                    | Details                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------------------- |
| **Service**              | `AnomalyDetectionService`                                                                                                                                                                                                                                                                                                                                                                 |
| **AiFeature**            | `ANOMALY`                                                                                                                                                                                                                                                                                                                                                                                 |
| **Purpose**              | Detect unusual transactions that deviate significantly from historical patterns. Flags potential errors, fraud, or noteworthy events for human review.                                                                                                                                                                                                                                    |
| **Algorithm/Library**    | Dual statistical approach plus Isolation Forest: (1) Z-score method -- values >3 sigma = warning, >4 sigma = critical. (2) IQR method -- values below Q1-1.5*IQR or above Q3+1.5*IQR are flagged. (3) Isolation Forest (via `isolation-forest.util.ts`) for multi-dimensional anomalies -- custom implementation based on Liu, Ting & Zhou (2008), 100 trees, subsample size min(256, N). |
| **Input Data**           | Transaction amounts per account over a rolling 90-day baseline window. Multi-dimensional features for Isolation Forest: amount, day of week, time of day, vendor frequency.                                                                                                                                                                                                               |
| **Output Format**        | `{ anomalies: [{ transactionId: string, score: number, severity: 'warning'                                                                                                                                                                                                                                                                                                                | 'critical', method: 'zscore' | 'iqr' | 'isolation_forest', zScore: number, expectedRange: { min: number, max: number } }] }` |
| **Confidence Scoring**   | Z-score value itself serves as confidence (higher = more anomalous). Isolation Forest score 0-1 (closer to 1 = more anomalous, threshold 0.6).                                                                                                                                                                                                                                            |
| **Training Data Source** | Rolling 90-day window of transactions per account. `AiAnomaly` records for tracking resolved/unresolved anomalies.                                                                                                                                                                                                                                                                        |
| **Retraining Trigger**   | 50 corrections. Daily scan at 2 AM by `AiRetrainingScheduler`.                                                                                                                                                                                                                                                                                                                            |

---

### 1.8 Pattern Detection (Dejavu)

| Field                    | Details                                                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | --------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `PatternDetectionService`                                                                                                                                                                                                                                                                                             |
| **AiFeature**            | `PATTERN_DETECTION`                                                                                                                                                                                                                                                                                                   |
| **Purpose**              | Detect recurring transaction patterns from historical data. Identifies regular expenses and income (rent, subscriptions, salaries) and suggests creating RecurringProfile entries for automated processing.                                                                                                           |
| **Algorithm/Library**    | Custom "Dejavu" algorithm using `date-pattern.util.ts`. Frequency analysis via time delta calculation between occurrences. Description clustering using normalized text patterns. Entity name normalization handles corporate suffix variations (Inc, Corp, LLC, Ltd, etc.). Supports English and Arabic month names. |
| **Input Data**           | 6-month transaction history. Groups transactions by: normalized vendor/payee name, amount cluster (within +/-1% variance), and description pattern.                                                                                                                                                                   |
| **Output Format**        | `{ patterns: [{ entityName: string, amount: number, frequency: 'DAILY'                                                                                                                                                                                                                                                | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY', confidence: number, occurrences: number, nextExpected: Date }], suggestions: [{ type: 'recurring_profile', pattern: {...} }], duplicates: [{ transaction1: {...}, transaction2: {...} }] }` |
| **Confidence Scoring**   | 0-1 scale based on coefficient of variation (CV) of time deltas: CV<0.1 = 0.95 (very consistent), CV<0.2 = 0.85, CV<0.3 = 0.70, CV<0.5 = 0.50. Boosted by number of occurrences (+5% per additional occurrence).                                                                                                      |
| **Training Data Source** | `TransactionPattern` and `PatternSuggestion` records. Patterns marked STALE after 90 days without new occurrences.                                                                                                                                                                                                    |
| **Retraining Trigger**   | 30 corrections. Weekly analysis (Sunday 3 AM) by `AiRetrainingScheduler`.                                                                                                                                                                                                                                             |

---

### 1.9 Smart Reorder Points

| Field                    | Details                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------- |
| **Service**              | `ReorderPointsService`                                                                                                                                                                                                                                                                                                    |
| **AiFeature**            | `REORDER`                                                                                                                                                                                                                                                                                                                 |
| **Purpose**              | Calculate optimal reorder points and safety stock levels for inventory items. Uses statistical demand analysis with ABC classification for service level differentiation.                                                                                                                                                 |
| **Algorithm/Library**    | Classical inventory management formulas: Reorder Point = (Average Daily Sales x Lead Time) + Safety Stock. Safety Stock = Z x sigma x sqrt(Lead Time), where Z is the z-value for the target service level. EOQ (Economic Order Quantity) = sqrt(2DS/H). Uses `statistics.util.ts` for z-value lookup with interpolation. |
| **Input Data**           | Historical sales velocity per item, lead time, holding cost, ordering cost. ABC classification based on revenue contribution (A=80%, B=15%, C=5%).                                                                                                                                                                        |
| **Output Format**        | `{ reorderPoint: number, safetyStock: number, eoq: number, avgDailySales: number, serviceLevelPercent: number, abcCategory: 'A'                                                                                                                                                                                           | 'B' | 'C', isDeadStock: boolean }` |
| **Confidence Scoring**   | Service level targets: A items = 99%, B items = 95%, C items = 90%. Dead stock detection: items with zero sales for 90+ days.                                                                                                                                                                                             |
| **Training Data Source** | `ItemReorderAnalysis` records. Inventory movement history and sales order data.                                                                                                                                                                                                                                           |
| **Retraining Trigger**   | 50 corrections. Weekly update (Sunday midnight) by `AiRetrainingScheduler`. Monthly ABC reclassification on the 1st at 2 AM.                                                                                                                                                                                              |

---

### 1.10 Financial Narrative

| Field                    | Details                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------- |
| **Service**              | `FinancialNarrativeService`                                                                                                                                                                                     |
| **AiFeature**            | N/A (template-based, no ML model)                                                                                                                                                                               |
| **Purpose**              | Generate plain English narrative summaries from structured financial data. Translates numbers into actionable business insights without requiring an LLM.                                                       |
| **Algorithm/Library**    | Template-based text generation. No machine learning -- uses conditional logic and parameterized sentence templates. Detects significant changes and constructs narrative sections.                              |
| **Input Data**           | Monthly financial aggregates: revenue, expenses, cash flow, AR/AP balances, P&L summary.                                                                                                                        |
| **Output Format**        | `{ summary: string, sections: [{ title: string, content: string, type: 'positive'                                                                                                                               | 'negative' | 'neutral' }] }` |
| **Confidence Scoring**   | N/A -- deterministic template output.                                                                                                                                                                           |
| **Training Data Source** | N/A -- no training required. Uses live financial data.                                                                                                                                                          |
| **Retraining Trigger**   | N/A. Monthly generation on the 1st at 6 AM by `AiRetrainingScheduler`. Detects: revenue changes >5%, top expense increases, cash flow warnings, AR overdue alerts. Stored as `AIInsight` with type `NARRATIVE`. |

---

## 2. Sales & CRM AI

### 2.1 Lead Scoring

| Field                    | Details                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ | --------- |
| **Service**              | `LeadScoringService`                                                                                                                                                                                                           |
| **AiFeature**            | `LEAD_SCORING`                                                                                                                                                                                                                 |
| **Purpose**              | Score leads 0-100 to prioritize sales efforts. Blends rule-based scoring with ML when sufficient historical data is available.                                                                                                 |
| **Algorithm/Library**    | Blended: 70% rule-based + 30% ML (logistic regression via `logistic-regression.util.ts` using `ml-logistic-regression` + `ml-matrix`). ML model activates after 100+ closed deals (won/lost) with z-score normalized features. |
| **Input Data**           | Demographic factors (company size, industry, location), behavioral factors (website visits, email opens, meeting attendance), recency of last interaction.                                                                     |
| **Output Format**        | `{ score: number, breakdown: { demographic: number, behavioral: number, recency: number }, mlProbability: number                                                                                                               | null, tier: 'hot' | 'warm' | 'cold' }` |
| **Confidence Scoring**   | Score 0-100: demographic (max 40) + behavioral (max 40) + recency (max 20). Score decays 5% per week of inactivity. >70 = hot, 30-70 = warm, <30 = cold. ML accuracy reported when model is available.                         |
| **Training Data Source** | `LeadScore` records. Historical won/lost deals with their lead attributes. ML training requires 50+ outcomes (100+ deals recommended for 80/20 train/test split).                                                              |
| **Retraining Trigger**   | 20 corrections. Weekly score update (Sunday midnight). Monthly ML model training on the 1st (if 50+ outcomes in last 30 days).                                                                                                 |

---

### 2.2 Churn Prediction

| Field                    | Details                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| **Service**              | `ChurnPredictionService`                                                                                                                                                                    |
| **AiFeature**            | `CHURN_PREDICTION`                                                                                                                                                                          |
| **Purpose**              | Predict which customers are likely to stop purchasing, enabling proactive retention efforts.                                                                                                |
| **Algorithm/Library**    | `brain.js` neural network. Installed with `--ignore-scripts` (native `gl` dependency fails on macOS with Node 24).                                                                          |
| **Input Data**           | RFM features: purchase frequency, recency (days since last purchase), monetary value (total spend). Additional signals: support ticket count, payment delay history, order trend direction. |
| **Output Format**        | `{ churnProbability: number, riskLevel: 'high'                                                                                                                                              | 'medium' | 'low', factors: [{ name: string, impact: number }] }` |
| **Confidence Scoring**   | Churn probability 0-1 from neural network output. Risk levels: >0.7 = high, 0.3-0.7 = medium, <0.3 = low.                                                                                   |
| **Training Data Source** | `CustomerAiProfile` records. Historical customer activity patterns. Customers inactive for 6+ months serve as positive churn examples.                                                      |
| **Retraining Trigger**   | Scheduled weekly (Sunday 4 AM) by `AiSalesCrmScheduler`.                                                                                                                                    |

---

### 2.3 CLV Analysis

| Field                    | Details                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `ClvAnalysisService`                                                                                                                                                                                      |
| **AiFeature**            | `CLV_ANALYSIS`                                                                                                                                                                                            |
| **Purpose**              | Calculate Customer Lifetime Value combining historical revenue with predicted future value based on purchase patterns and churn risk.                                                                     |
| **Algorithm/Library**    | Statistical CLV model. Historical CLV = sum of past revenue. Predicted CLV = (average order value x purchase frequency x predicted remaining lifetime). Remaining lifetime adjusted by churn probability. |
| **Input Data**           | Customer transaction history: order count, total revenue, average order value, customer tenure, churn probability from `ChurnPredictionService`.                                                          |
| **Output Format**        | `{ historicalCLV: number, predictedCLV: number, totalCLV: number, avgOrderValue: number, purchaseFrequency: number, predictedLifetimeMonths: number }`                                                    |
| **Confidence Scoring**   | Based on data completeness: more historical transactions = higher confidence. Predictions are less reliable for newer customers.                                                                          |
| **Training Data Source** | `CustomerAiProfile` records. Invoice and payment history.                                                                                                                                                 |
| **Retraining Trigger**   | Monthly recalculation on the 1st at 3 AM by `AiSalesCrmScheduler`.                                                                                                                                        |

---

### 2.4 Cross-Sell Recommendations

| Field                    | Details                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `CrossSellService`                                                                                                                                                                           |
| **AiFeature**            | `CROSS_SELL`                                                                                                                                                                                 |
| **Purpose**              | Recommend additional products to customers based on item co-occurrence analysis (market basket analysis).                                                                                    |
| **Algorithm/Library**    | Item co-occurrence matrix. Calculates the frequency of item pairs purchased together across all transactions. Ranks recommendations by co-occurrence strength and customer purchase history. |
| **Input Data**           | Historical invoice/order line items grouped by transaction. Customer's current purchase history.                                                                                             |
| **Output Format**        | `{ recommendations: [{ itemId: string, itemName: string, coOccurrenceScore: number, reason: string }] }`                                                                                     |
| **Confidence Scoring**   | Co-occurrence score based on frequency of joint purchases relative to individual purchase frequency (lift metric).                                                                           |
| **Training Data Source** | Invoice and sales order line items. Co-occurrence matrix stored in memory, rebuilt periodically.                                                                                             |
| **Retraining Trigger**   | Weekly co-occurrence matrix rebuild (Saturday 2 AM) by `AiSalesCrmScheduler`.                                                                                                                |

---

### 2.5 Dynamic Pricing

| Field                    | Details                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `DynamicPricingService`                                                                                                                                                                                                                                    |
| **AiFeature**            | `DYNAMIC_PRICING`                                                                                                                                                                                                                                          |
| **Purpose**              | Optimize item pricing based on demand elasticity, inventory levels, and seasonality signals.                                                                                                                                                               |
| **Algorithm/Library**    | Rule-based pricing engine with statistical inputs. Considers: demand elasticity (price sensitivity from historical data), current inventory levels (high stock = lower price suggestion), seasonality adjustments, and competitor proximity if configured. |
| **Input Data**           | Item price history, sales volume at different price points, current inventory level, demand forecast from `DemandForecastingService`.                                                                                                                      |
| **Output Format**        | `{ suggestedPrice: number, currentPrice: number, priceChange: number, reason: string, factors: { demandElasticity: number, inventoryPressure: number, seasonality: number } }`                                                                             |
| **Confidence Scoring**   | Based on volume of historical price-quantity data points. More data = more reliable elasticity estimates.                                                                                                                                                  |
| **Training Data Source** | Historical price changes and corresponding sales volume changes.                                                                                                                                                                                           |
| **Retraining Trigger**   | Monthly pricing analysis on the 1st at 4 AM by `AiSalesCrmScheduler`.                                                                                                                                                                                      |

---

### 2.6 Pipeline Forecast

| Field                    | Details                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `PipelineForecastService`                                                                                                                                                                                 |
| **AiFeature**            | `PIPELINE_FORECAST`                                                                                                                                                                                       |
| **Purpose**              | Forecast expected revenue from the sales pipeline using stage-weighted probabilities and Monte Carlo range estimates.                                                                                     |
| **Algorithm/Library**    | Weighted pipeline: total = sum(deal amount x stage probability). Monte Carlo simulation for range estimates (best/worst/expected scenarios).                                                              |
| **Input Data**           | Active deals with: amount, current stage, stage probability, expected close date. Historical stage conversion rates.                                                                                      |
| **Output Format**        | `{ totalWeighted: number, activeDeals: number, byStage: [{ stage: string, count: number, value: number, weightedValue: number }], range: { optimistic: number, expected: number, pessimistic: number } }` |
| **Confidence Scoring**   | Stage probabilities calibrated from historical conversion rates. Range estimates provide confidence band.                                                                                                 |
| **Training Data Source** | Historical deal outcomes (won/lost) with stage transition data.                                                                                                                                           |
| **Retraining Trigger**   | Weekly forecast (Monday 6 AM) by `AiSalesCrmScheduler`.                                                                                                                                                   |

---

## 3. Security & Compliance

### 3.1 Fraud Detection

| Field                    | Details                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `FraudDetectionService`                                                                                                                                                                                                                                                                                             |
| **AiFeature**            | `FRAUD_DETECTION`                                                                                                                                                                                                                                                                                                   |
| **Purpose**              | Detect potentially fraudulent transactions using multi-signal analysis. Creates `FraudAlert` records with severity levels for review.                                                                                                                                                                               |
| **Algorithm/Library**    | Multi-signal rule engine: velocity checks (unusual number of transactions in short period), amount anomalies (statistical outliers), time-of-day patterns (transactions outside normal business hours), duplicate detection (same amount/vendor within window). Uses statistical methods from `statistics.util.ts`. |
| **Input Data**           | Transaction stream: amount, timestamp, vendor, user who created it, account. Historical baseline per organization.                                                                                                                                                                                                  |
| **Output Format**        | `{ alerts: [{ type: string, severity: 'low'                                                                                                                                                                                                                                                                         | 'medium' | 'high' | 'critical', description: string, transactionId: string, score: number }], scanned: number, alertsCreated: number }` |
| **Confidence Scoring**   | Risk score 0-1 combining multiple signal strengths. Higher scores indicate more fraud signals triggered simultaneously.                                                                                                                                                                                             |
| **Training Data Source** | `FraudAlert` records with resolution outcomes. Historical transaction patterns per organization.                                                                                                                                                                                                                    |
| **Retraining Trigger**   | Daily fraud scan at 1 AM by `AiSecurityScheduler`. Resolved fraud alerts cleaned up after 6 months.                                                                                                                                                                                                                 |

---

### 3.2 Compliance Monitoring

| Field                    | Details                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `ComplianceMonitoringService`                                                                                                                                                                                                                   |
| **AiFeature**            | `COMPLIANCE_MONITORING`                                                                                                                                                                                                                         |
| **Purpose**              | Automated compliance checks against configurable business rules. Monitors for regulatory and internal policy violations.                                                                                                                        |
| **Algorithm/Library**    | Rule-based compliance engine. Checks implemented: missing tax IDs on bills over threshold, entertainment expense deductibility limits, period compliance (posting to closed periods), segregation of duties (same user creating and approving). |
| **Input Data**           | Recent transactions, bills, expenses, journal entries. Organization compliance configuration.                                                                                                                                                   |
| **Output Format**        | `{ score: number, violations: [{ type: string, severity: string, description: string, entityType: string, entityId: string, recommendation: string }] }`                                                                                        |
| **Confidence Scoring**   | Overall compliance score 0-100%. Each violation has a severity level.                                                                                                                                                                           |
| **Training Data Source** | Historical compliance check results. Organization-specific rule configurations.                                                                                                                                                                 |
| **Retraining Trigger**   | Daily compliance check at 5 AM by `AiSecurityScheduler`.                                                                                                                                                                                        |

---

### 3.3 Audit Risk

| Field                    | Details                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| **Service**              | `AuditRiskService`                                                                                                                                                                                                           |
| **AiFeature**            | `AUDIT_RISK`                                                                                                                                                                                                                 |
| **Purpose**              | Score entities (journals, invoices, bills, expenses) for audit risk based on statistical analysis of their characteristics.                                                                                                  |
| **Algorithm/Library**    | Multi-factor risk scoring. Factors: transaction volume anomalies, amount volatility (coefficient of variation), correction/edit frequency, manual override count, round number frequency, weekend/holiday posting frequency. |
| **Input Data**           | Entity metadata: creation/edit timestamps, amount, number of corrections, approval overrides, posting dates.                                                                                                                 |
| **Output Format**        | `{ entityId: string, entityType: string, riskScore: number, riskLevel: 'low'                                                                                                                                                 | 'medium' | 'high', factors: [{ name: string, score: number, weight: number }] }` |
| **Confidence Scoring**   | Risk score 0-100. Weighted sum of individual risk factors. High risk > 70, medium 40-70, low < 40.                                                                                                                           |
| **Training Data Source** | `AuditLog` entries (entityType + entityId). Historical edit and override patterns.                                                                                                                                           |
| **Retraining Trigger**   | Weekly batch scoring (Sunday 6 AM) by `AiSecurityScheduler` for entity types: journal, invoice, bill, expense.                                                                                                               |

---

## 4. NLP & Conversational

### 4.1 Chatbot

| Field                    | Details                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `ChatbotService`                                                                                                                                                                                                                                                                |
| **AiFeature**            | `CHATBOT`                                                                                                                                                                                                                                                                       |
| **Purpose**              | Natural language interface for common accounting queries and actions. Users can ask questions in plain English and receive structured responses.                                                                                                                                |
| **Algorithm/Library**    | `compromise` for NLP parsing and intent detection. `natural` for text classification (intent classifier). Handles: balance queries ("What's my cash balance?"), invoice lookup ("Show invoice INV-001"), expense creation ("Log $50 for office supplies"), and report requests. |
| **Input Data**           | User message (natural language string), current context (active page, selected entity).                                                                                                                                                                                         |
| **Output Format**        | `{ response: string, intent: string, entities: Record<string, any>, actions: [{ type: string, params: any }], confidence: number }`                                                                                                                                             |
| **Confidence Scoring**   | Intent classification confidence from `natural` Bayesian classifier. Low confidence triggers "Did you mean...?" clarification responses.                                                                                                                                        |
| **Training Data Source** | Built-in intent patterns + organization-specific trained patterns from user feedback.                                                                                                                                                                                           |
| **Retraining Trigger**   | Checked every 6 hours by `AiNlpChatScheduler`.                                                                                                                                                                                                                                  |

---

### 4.2 Document Classification

| Field                    | Details                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `DocumentClassificationService`                                                                                                                                                   |
| **AiFeature**            | `DOCUMENT_CLASSIFICATION`                                                                                                                                                         |
| **Purpose**              | Automatically classify uploaded documents into categories: invoice, bill, receipt, bank statement, contract, or other.                                                            |
| **Algorithm/Library**    | Text classification using `natural` library (Naive Bayes). Extracts text from documents (via OCR or pdf-parse), then classifies based on keyword patterns and document structure. |
| **Input Data**           | Extracted text from uploaded document. File metadata (name, size, MIME type).                                                                                                     |
| **Output Format**        | `{ classification: string, confidence: number, alternatives: [{ type: string, confidence: number }] }`                                                                            |
| **Confidence Scoring**   | 0-1 from Naive Bayes posterior probability.                                                                                                                                       |
| **Training Data Source** | User-confirmed document classifications stored as training data.                                                                                                                  |
| **Retraining Trigger**   | Checked every 6 hours by `AiNlpChatScheduler`. Model version and accuracy tracked.                                                                                                |

---

### 4.3 Sentiment Analysis

| Field                    | Details                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| **Service**              | `SentimentAnalysisService`                                                                                                  |
| **AiFeature**            | `SENTIMENT_ANALYSIS`                                                                                                        |
| **Purpose**              | Analyze sentiment in customer communications (emails, notes, support tickets) to track satisfaction trends over time.       |
| **Algorithm/Library**    | `sentiment` library (AFINN-based lexicon). Provides positive/negative/neutral scoring with comparative score normalization. |
| **Input Data**           | Text content from customer communications: emails, CRM notes, support tickets.                                              |
| **Output Format**        | `{ score: number, comparative: number, sentiment: 'positive'                                                                | 'negative' | 'neutral', tokens: string[], positive: string[], negative: string[] }` |
| **Confidence Scoring**   | Comparative score (normalized per token). Magnitude of score indicates strength of sentiment.                               |
| **Training Data Source** | No training required -- lexicon-based. Customer communication history for trend tracking.                                   |
| **Retraining Trigger**   | N/A -- lexicon-based approach does not require retraining.                                                                  |

---

### 4.4 Entity Extraction

| Field                    | Details                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service**              | `EntityExtractionService`                                                                                                                                                                                                                                                                              |
| **AiFeature**            | `ENTITY_EXTRACTION`                                                                                                                                                                                                                                                                                    |
| **Purpose**              | Extract structured entities (amounts, dates, vendor names, invoice numbers) from unstructured text such as emails, scanned documents, or notes.                                                                                                                                                        |
| **Algorithm/Library**    | `compromise` for NLP entity recognition. Custom regex patterns for financial entities: amounts (currency patterns), dates (multiple formats), document numbers (INV-XXX, BILL-XXX, PO-XXX). Uses `text-similarity.util.ts` for document number extraction and `date-pattern.util.ts` for date parsing. |
| **Input Data**           | Unstructured text (string).                                                                                                                                                                                                                                                                            |
| **Output Format**        | `{ amounts: [{ value: number, currency: string, context: string }], dates: [{ date: Date, format: string, context: string }], vendors: [{ name: string, confidence: number }], documentNumbers: [{ number: string, type: string }] }`                                                                  |
| **Confidence Scoring**   | Per-entity confidence based on regex match strength and context. Vendor names matched against known vendor list with fuzzy matching score.                                                                                                                                                             |
| **Training Data Source** | Organization vendor list for name matching. User corrections on extracted entities.                                                                                                                                                                                                                    |
| **Retraining Trigger**   | N/A for regex patterns. Vendor matching improves as vendor database grows.                                                                                                                                                                                                                             |

---

### 4.5 Contract Analysis

| Field                    | Details                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `ContractAnalysisService`                                                                                                                                                        |
| **AiFeature**            | `CONTRACT_ANALYSIS`                                                                                                                                                              |
| **Purpose**              | Extract key terms from uploaded contracts: parties involved, effective dates, amounts, renewal terms, termination clauses.                                                       |
| **Algorithm/Library**    | `compromise` for NLP parsing. Custom regex patterns for contract-specific entities: party names, dates, monetary amounts, duration terms, renewal clauses.                       |
| **Input Data**           | Contract text (extracted from PDF via `pdf-extractor.util.ts` or OCR).                                                                                                           |
| **Output Format**        | `{ parties: string[], effectiveDate: Date, expiryDate: Date, totalValue: number, renewalTerms: string, terminationClause: string, keyTerms: [{ term: string, value: string }] }` |
| **Confidence Scoring**   | Per-field extraction confidence based on pattern match quality and context.                                                                                                      |
| **Training Data Source** | User corrections on extracted contract terms.                                                                                                                                    |
| **Retraining Trigger**   | N/A -- primarily rule/pattern-based extraction.                                                                                                                                  |

---

### 4.6 Knowledge Assistant

| Field                    | Details                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `KnowledgeAssistantService`                                                                                                              |
| **AiFeature**            | `KNOWLEDGE_ASSISTANT`                                                                                                                    |
| **Purpose**              | Provide contextual help and guidance based on the user's current page and task within the application.                                   |
| **Algorithm/Library**    | TF-IDF based document indexing and retrieval using `natural`. Indexes help content and matches against user queries and current context. |
| **Input Data**           | User query (string), current page/module context, user role.                                                                             |
| **Output Format**        | `{ answer: string, relatedTopics: [{ title: string, url: string }], confidence: number }`                                                |
| **Confidence Scoring**   | TF-IDF similarity score between query and indexed knowledge base documents.                                                              |
| **Training Data Source** | Application help content, accounting glossary, feature documentation.                                                                    |
| **Retraining Trigger**   | Weekly knowledge index rebuild (Saturday 3 AM) by `AiNlpChatScheduler`.                                                                  |

---

### 4.7 Voice Command

| Field                    | Details                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service**              | `VoiceCommandService`                                                                                                                                                          |
| **AiFeature**            | `VOICE_COMMAND`                                                                                                                                                                |
| **Purpose**              | Process voice input for common accounting actions. **Placeholder implementation** -- requires native speech-to-text capability which is not available as a local-only library. |
| **Algorithm/Library**    | Placeholder. STT (Speech-to-Text) requires either a native binary or external API. Once text is extracted, intent processing uses the same pipeline as `ChatbotService`.       |
| **Input Data**           | Audio buffer (WAV/WebM).                                                                                                                                                       |
| **Output Format**        | `{ transcript: string, intent: string, confidence: number, actions: [...] }`                                                                                                   |
| **Confidence Scoring**   | N/A -- not yet implemented.                                                                                                                                                    |
| **Training Data Source** | N/A.                                                                                                                                                                           |
| **Retraining Trigger**   | N/A. This is the 33rd model slot (32/33 implemented).                                                                                                                          |

---

## 5. HR & Operations

### 5.1 Employee Attrition

| Field                    | Details                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| **Service**              | `EmployeeAttritionService`                                                                                                                                                                                                                                                      |
| **AiFeature**            | `EMPLOYEE_ATTRITION`                                                                                                                                                                                                                                                            |
| **Purpose**              | Predict employee attrition risk to enable proactive retention strategies.                                                                                                                                                                                                       |
| **Algorithm/Library**    | Weighted factor scoring with statistical analysis. Factors: tenure (short tenure = higher risk), salary competitiveness (below market median = higher risk), performance rating, overtime hours (excessive = higher risk), time since last promotion, department turnover rate. |
| **Input Data**           | Employee profile: tenure, salary, department, performance scores, overtime history, promotion history. Note: `Employee` model has no `deletedAt` field -- uses `isActive` or `status: 'ACTIVE'` instead.                                                                        |
| **Output Format**        | `{ attritionRisk: number, riskLevel: 'high'                                                                                                                                                                                                                                     | 'medium' | 'low', factors: [{ name: string, impact: number, description: string }], recommendations: string[] }` |
| **Confidence Scoring**   | Risk score 0-1. Based on completeness of available data points and historical accuracy of predictions.                                                                                                                                                                          |
| **Training Data Source** | `EmployeeAiProfile` records. Historical employee departure data.                                                                                                                                                                                                                |
| **Retraining Trigger**   | Monthly prediction on the 1st at 5 AM by `AiHrOpsScheduler`.                                                                                                                                                                                                                    |

---

### 5.2 Compensation Benchmark

| Field                    | Details                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `CompensationBenchmarkService`                                                                                                                                        |
| **AiFeature**            | `COMPENSATION_BENCHMARK`                                                                                                                                              |
| **Purpose**              | Compare employee compensation against internal benchmarks. Identifies underpaid/overpaid positions relative to role, experience, department, and location.            |
| **Algorithm/Library**    | Statistical analysis using `statistics.util.ts`. Calculates percentiles (P25, P50, P75) per role/department/location combination. Uses z-scores to identify outliers. |
| **Input Data**           | Employee salary data grouped by: role/title, department, experience level, location.                                                                                  |
| **Output Format**        | `{ departments: [{ name: string, headcount: number, avgSalary: number, median: number, p25: number, p75: number, underpaid: number, overpaid: number }] }`            |
| **Confidence Scoring**   | Based on sample size per grouping. Groups with fewer than 3 employees have lower confidence.                                                                          |
| **Training Data Source** | Internal salary data. No external benchmarking data (all local).                                                                                                      |
| **Retraining Trigger**   | Monthly benchmark on the 1st at 4 AM by `AiHrOpsScheduler`.                                                                                                           |

---

### 5.3 Skills Gap

| Field                    | Details                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| **Service**              | `SkillsGapService`                                                                                                                                                                                                   |
| **AiFeature**            | `SKILLS_GAP`                                                                                                                                                                                                         |
| **Purpose**              | Identify skill deficiencies by comparing role requirements against employee skill profiles. Recommends training priorities.                                                                                          |
| **Algorithm/Library**    | Set comparison and gap analysis. Compares required skills per role against employee's documented skills. Prioritizes gaps by: criticality of skill, number of affected employees, availability of internal training. |
| **Input Data**           | Role skill requirements, employee skill profiles, training history.                                                                                                                                                  |
| **Output Format**        | `{ gaps: [{ skill: string, requiredLevel: number, currentLevel: number, gap: number, affectedEmployees: number, priority: 'high'                                                                                     | 'medium' | 'low' }], recommendations: [{ type: string, skill: string, description: string }] }` |
| **Confidence Scoring**   | Based on completeness of skill profile data.                                                                                                                                                                         |
| **Training Data Source** | Employee skill assessments and role definitions.                                                                                                                                                                     |
| **Retraining Trigger**   | On-demand analysis. No scheduled retraining.                                                                                                                                                                         |

---

### 5.4 Workforce Scheduling

| Field                    | Details                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `WorkforceSchedulingService`                                                                                                                                                                                                          |
| **AiFeature**            | `WORKFORCE_SCHEDULING`                                                                                                                                                                                                                |
| **Purpose**              | Optimize shift assignments and workforce allocation based on demand forecasts, employee availability, skills, and labor law constraints.                                                                                              |
| **Algorithm/Library**    | Constraint-based scheduling with greedy optimization. Considers: demand forecast per time slot, employee availability and preferences, required skills per shift, overtime limits and labor law compliance, fairness in distribution. |
| **Input Data**           | Demand forecast, employee availability, skill matrix, labor law constraints (max hours, rest periods), existing schedule.                                                                                                             |
| **Output Format**        | `{ schedule: [{ employeeId: string, shifts: [{ date: Date, startTime: string, endTime: string }] }], coverageScore: number, fairnessScore: number, violations: string[] }`                                                            |
| **Confidence Scoring**   | Coverage score (% of demand met) and fairness score (distribution evenness).                                                                                                                                                          |
| **Training Data Source** | Historical scheduling data and employee preferences.                                                                                                                                                                                  |
| **Retraining Trigger**   | On-demand optimization. No scheduled retraining.                                                                                                                                                                                      |

---

### 5.5 Quality Prediction

| Field                    | Details                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `QualityPredictionService`                                                                                                                                              |
| **AiFeature**            | `QUALITY_PREDICTION`                                                                                                                                                    |
| **Purpose**              | Predict manufacturing quality issues based on input parameters: material quality, machine settings, and operator experience.                                            |
| **Algorithm/Library**    | Statistical trend analysis. Monitors quality metrics over time using `statistics.util.ts`. Identifies degradation patterns using moving averages and linear regression. |
| **Input Data**           | Quality inspection results: pass/fail rates, defect types, input material batch, machine parameters, operator ID.                                                       |
| **Output Format**        | `{ trends: [{ month: Date, passRate: number, defectRate: number, topDefects: string[] }], predictions: [{ riskFactor: string, probability: number }] }`                 |
| **Confidence Scoring**   | Based on volume of historical quality data and trend consistency (R-squared from regression).                                                                           |
| **Training Data Source** | Quality inspection records and work order outcomes.                                                                                                                     |
| **Retraining Trigger**   | Weekly quality trend analysis (Monday 5 AM) by `AiHrOpsScheduler`.                                                                                                      |

---

### 5.6 Predictive Maintenance

| Field                    | Details                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| **Service**              | `PredictiveMaintenanceService`                                                                                                                                                                                                       |
| **AiFeature**            | `PREDICTIVE_MAINTENANCE`                                                                                                                                                                                                             |
| **Purpose**              | Predict when assets and equipment will need maintenance based on usage patterns, age, and condition indicators. Generates `AssetMaintenancePrediction` records.                                                                      |
| **Algorithm/Library**    | Time-based degradation modeling with statistical analysis. Health score decay based on: operating hours since last maintenance, age relative to expected lifespan, historical failure rate for asset type, environmental conditions. |
| **Input Data**           | Asset metadata: purchase date, expected lifespan, maintenance history, operating hours, sensor data (if available).                                                                                                                  |
| **Output Format**        | `{ assets: [{ assetId: string, healthScore: number, failureRisk: number, optimalMaintenanceDate: Date, status: 'critical'                                                                                                            | 'warning' | 'healthy', recommendation: string }], processed: number, critical: number, warning: number, healthy: number }` |
| **Confidence Scoring**   | Health score 0-100. Failure risk 0-1. Based on completeness of maintenance history and number of similar assets for comparison.                                                                                                      |
| **Training Data Source** | Asset maintenance history, failure records, operating logs.                                                                                                                                                                          |
| **Retraining Trigger**   | Monthly prediction on the 1st at 6 AM by `AiHrOpsScheduler`.                                                                                                                                                                         |

---

### 5.7 Resource Optimization

| Field                    | Details                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `ResourceOptimizationService`                                                                                                                                                                                   |
| **AiFeature**            | `RESOURCE_OPTIMIZATION`                                                                                                                                                                                         |
| **Purpose**              | Optimize allocation of employees and resources across projects and tasks based on skills, availability, and priority.                                                                                           |
| **Algorithm/Library**    | Constraint-based optimization. Matches resource skills to task requirements, considers availability and current workload, optimizes for: utilization rate, skill match, deadline compliance, cost minimization. |
| **Input Data**           | Active projects/tasks with requirements, employee skills and availability, resource costs, project priorities and deadlines.                                                                                    |
| **Output Format**        | `{ opportunities: [{ type: string, description: string, potentialSaving: number, currentUtilization: number, suggestedUtilization: number }] }`                                                                 |
| **Confidence Scoring**   | Based on data completeness and constraint satisfaction rate.                                                                                                                                                    |
| **Training Data Source** | Historical project resource allocation and outcomes. Timesheet data.                                                                                                                                            |
| **Retraining Trigger**   | Monthly optimization on the 1st at 7 AM by `AiHrOpsScheduler`.                                                                                                                                                  |

---

### 5.8 Route Optimization

| Field                    | Details                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**              | `RouteOptimizationService`                                                                                                                                                                          |
| **AiFeature**            | `ROUTE_OPTIMIZATION`                                                                                                                                                                                |
| **Purpose**              | Optimize delivery and service routes for field operations. Minimizes travel time and distance while respecting time windows and capacity constraints.                                               |
| **Algorithm/Library**    | Nearest-neighbor heuristic with 2-opt improvement. Considers: geographic coordinates, time windows, vehicle capacity, priority levels.                                                              |
| **Input Data**           | Delivery/service points with locations, time windows, priority, and load requirements. Vehicle fleet details.                                                                                       |
| **Output Format**        | `{ routes: [{ vehicleId: string, stops: [{ locationId: string, arrivalTime: Date, departureTime: Date }], totalDistance: number, totalTime: number }], totalDistance: number, efficiency: number }` |
| **Confidence Scoring**   | Route efficiency metric (optimized distance vs. naive distance).                                                                                                                                    |
| **Training Data Source** | Historical delivery data and actual travel times.                                                                                                                                                   |
| **Retraining Trigger**   | On-demand optimization. No scheduled retraining.                                                                                                                                                    |

---

## 6. Supporting Infrastructure

### 6.1 ModelRegistryService

**File:** `services/model-registry.service.ts`

Manages versioned storage, activation, and lifecycle of all trained AI models.

| Capability             | Description                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Save Model**         | Stores a new model version with accuracy metrics. Automatically deactivates the previous active model (sets to `RETIRED`). Uses Prisma transactions for atomicity. |
| **Load Active Model**  | Retrieves the currently active model for a given `(organizationId, feature)` pair. Returns null if no trained model exists yet.                                    |
| **Load by Version**    | Retrieves a specific historical model version using the composite unique key `(organizationId, feature, version)`.                                                 |
| **Version History**    | Returns the last N versions of a model with accuracy, sample count, and training timestamps.                                                                       |
| **Activate Version**   | Allows rolling back to a previous model version. Deactivates current active model and activates the specified version in a transaction.                            |
| **Training Status**    | Tracks model lifecycle states: `TRAINING` (in progress), `ACTIVE` (serving predictions), `RETIRED` (superseded).                                                   |
| **Retire Old Models**  | Retains the last N versions (default 3) per feature and retires older ones.                                                                                        |
| **Model Status Query** | Returns `{ hasActiveModel, activeVersion, isTraining, trainingVersion, lastTrainedAt }` for a feature.                                                             |

---

### 6.2 AiTrainingService

**File:** `services/ai-training.service.ts`

Orchestrates training data collection, management, and preparation for model retraining.

| Capability             | Description                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add Training Data**  | Records a single training example with `(inputData, label, source)`. Sources: `USER` (confirmed by user), `SEED` (initial data), `CORRECTION` (user corrected an AI suggestion). |
| **Get Training Data**  | Retrieves paginated training data with optional filters: source type, date range.                                                                                                |
| **Count Corrections**  | Counts corrections accumulated since the last model training. Used to determine if retraining threshold is met.                                                                  |
| **Train/Test Split**   | Implements Fisher-Yates shuffle for random 80/20 train/test split for cross-validation.                                                                                          |
| **Input Hashing**      | SHA-256 hash of normalized input data for prediction caching (first 16 hex chars).                                                                                               |
| **Bulk Seeding**       | Batch insert training data with `skipDuplicates` for initial setup.                                                                                                              |
| **Data Retention**     | Deletes old `SEED` data past retention period. Preserves `USER` and `CORRECTION` data.                                                                                           |
| **Statistics**         | Reports: total records, by-source breakdown, unique label count, date range.                                                                                                     |
| **Label Distribution** | Group-by aggregation showing count per label. Useful for detecting class imbalance.                                                                                              |

---

### 6.3 AiFeedbackService

**File:** `services/ai-feedback.service.ts`

Manages the Human-in-the-Loop feedback cycle. All AI suggestions are dismissible and correctible.

| Capability               | Description                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Process Feedback**     | Handles three user actions: `ACCEPTED` (AI was correct), `REJECTED` (AI was wrong, no correction provided), `CORRECTED` (AI was wrong, user provided correct answer). Corrections are automatically stored as training data. |
| **Retraining Threshold** | Per-feature configurable thresholds. When correction count exceeds threshold, emits `ai.retraining.needed` event via `EventEmitter2`.                                                                                        |
| **Feedback Statistics**  | Tracks acceptance/rejection/correction rates per feature with date filtering.                                                                                                                                                |
| **Feedback Trends**      | Daily aggregated feedback counts over configurable period (default 30 days).                                                                                                                                                 |
| **Prediction Storage**   | Stores predictions with input hash for caching. Reuses cached predictions within 1 hour.                                                                                                                                     |
| **Prediction Caching**   | SHA-256 hash of normalized input. Configurable max age (default 60 minutes).                                                                                                                                                 |
| **Data Retention**       | Deletes old predictions past retention period.                                                                                                                                                                               |

**Retraining Thresholds by Feature:**

| Feature              | Corrections Needed            |
| -------------------- | ----------------------------- |
| `CATEGORIZATION`     | 50                            |
| `RECONCILIATION`     | 30                            |
| `OCR_LAYOUT`         | 20                            |
| `DEMAND_FORECAST`    | 100                           |
| `LEAD_SCORING`       | 20                            |
| `ANOMALY`            | 50                            |
| `REORDER`            | 50                            |
| `PAYMENT_PREDICTION` | 30                            |
| `CASH_FLOW`          | 50                            |
| `PATTERN_DETECTION`  | 30                            |
| All others           | 0 (disabled / not applicable) |

---

## 7. Schedulers

Five cron-based schedulers run background AI tasks across all organizations.

### 7.1 AiRetrainingScheduler

**File:** `schedulers/ai-retraining.scheduler.ts`

The primary scheduler covering core financial AI models.

| Schedule                            | Task                         | Description                                                                                                                             |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `0 2 * * *` (Daily 2 AM)            | Daily Anomaly Scan           | Scans all organizations for transaction anomalies.                                                                                      |
| `0 0 * * 0` (Sunday midnight)       | Weekly Reorder Update        | Recalculates reorder points and safety stock for all items.                                                                             |
| `0 */6 * * *` (Every 6 hours)       | Retraining Threshold Check   | Checks if correction thresholds are met for: CATEGORIZATION, RECONCILIATION, LEAD_SCORING, DEMAND_FORECAST, PATTERN_DETECTION, REORDER. |
| `0 0 1 * *` (1st of month midnight) | Monthly Lead Scoring         | Trains ML model if 50+ outcomes, else rescores leads.                                                                                   |
| `0 1 * * 0` (Sunday 1 AM)           | Weekly Demand Forecast       | Holt-Winters forecasting for all inventory items.                                                                                       |
| `0 3 * * *` (Daily 3 AM)            | Daily Cash Flow Prediction   | Monte Carlo simulation recalculation.                                                                                                   |
| `0 0 * * 0` (Sunday midnight)       | Weekly Lead Score Update     | Rescores all leads and applies 5%/week decay.                                                                                           |
| `0 */6 * * *` (Every 6 hours)       | Categorization Retraining    | Retrains Naive Bayes classifier when 50+ corrections accumulated.                                                                       |
| `0 2 * * 0` (Sunday 2 AM)           | Weekly Payment Prediction    | Recalculates payment predictions for outstanding invoices.                                                                              |
| `0 6 1 * *` (1st of month 6 AM)     | Monthly Narrative Generation | Generates monthly financial narrative stored as AIInsight.                                                                              |
| `0 3 * * 0` (Sunday 3 AM)           | Weekly Pattern Detection     | Dejavu algorithm: detects recurring patterns and suggests RecurringProfiles.                                                            |
| `30 * * * *` (Hourly at :30)        | Hourly Alert Aggregation     | Collects alerts from all AI services into unified notifications.                                                                        |
| `0 4 * * *` (Daily 4 AM)            | Daily Alert Cleanup          | Removes expired alerts and old dismissed alerts.                                                                                        |
| `0 5 * * 0` (Sunday 5 AM)           | Weekly Stale Pattern Check   | Marks patterns as STALE if no occurrences in 90+ days.                                                                                  |
| `0 4 * * 6` (Saturday 4 AM)         | Weekly AI Data Cleanup       | Deletes: predictions >90 days, retired models >6 months, resolved anomalies >1 year.                                                    |
| `0 2 1 * *` (1st of month 2 AM)     | Monthly ABC Analysis         | Reclassifies items A/B/C and adjusts service levels.                                                                                    |

---

### 7.2 AiSalesCrmScheduler

**File:** `schedulers/ai-sales-crm.scheduler.ts`

Covers Sales and CRM AI models.

| Schedule                        | Task                      | Description                                                            |
| ------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `0 4 * * 0` (Sunday 4 AM)       | Weekly Churn Prediction   | Predicts churn for all customers. Reports high/medium/low risk counts. |
| `0 3 1 * *` (1st of month 3 AM) | Monthly CLV Calculation   | Calculates Customer Lifetime Value for all customers.                  |
| `0 2 * * 6` (Saturday 2 AM)     | Weekly Cross-Sell Rebuild | Rebuilds item co-occurrence matrix from transaction history.           |
| `0 4 1 * *` (1st of month 4 AM) | Monthly Pricing Analysis  | Analyzes pricing opportunities for all items.                          |
| `0 6 * * 1` (Monday 6 AM)       | Weekly Pipeline Forecast  | Forecasts weighted pipeline value with Monte Carlo ranges.             |

---

### 7.3 AiSecurityScheduler

**File:** `schedulers/ai-security.scheduler.ts`

Covers Security and Compliance AI models.

| Schedule                    | Task                       | Description                                                          |
| --------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `0 1 * * *` (Daily 1 AM)    | Daily Fraud Scan           | Scans all organizations for fraudulent transactions.                 |
| `0 5 * * *` (Daily 5 AM)    | Daily Compliance Check     | Runs compliance rule checks and reports violations.                  |
| `0 6 * * 0` (Sunday 6 AM)   | Weekly Audit Risk Scoring  | Batch scores journals, invoices, bills, and expenses for audit risk. |
| `0 3 * * 6` (Saturday 3 AM) | Weekly Fraud Alert Cleanup | Deletes resolved fraud alerts older than 6 months.                   |

---

### 7.4 AiHrOpsScheduler

**File:** `schedulers/ai-hr-ops.scheduler.ts`

Covers HR and Operations AI models.

| Schedule                        | Task                           | Description                                                                         |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `0 5 1 * *` (1st of month 5 AM) | Monthly Attrition Prediction   | Predicts attrition risk for all employees. Reports high/medium/low counts.          |
| `0 4 1 * *` (1st of month 4 AM) | Monthly Compensation Benchmark | Analyzes compensation by department.                                                |
| `0 5 * * 1` (Monday 5 AM)       | Weekly Quality Prediction      | Analyzes quality trends.                                                            |
| `0 6 1 * *` (1st of month 6 AM) | Monthly Predictive Maintenance | Predicts maintenance needs for all assets. Reports critical/warning/healthy counts. |
| `0 7 1 * *` (1st of month 7 AM) | Monthly Resource Optimization  | Identifies resource optimization opportunities.                                     |

---

### 7.5 AiNlpChatScheduler

**File:** `schedulers/ai-nlp-chat.scheduler.ts`

Covers NLP and Conversational AI models.

| Schedule                              | Task                               | Description                                                           |
| ------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `30 */6 * * *` (Every 6 hours at :30) | Document Classification Retraining | Checks correction threshold and retrains classifier if needed.        |
| `15 */6 * * *` (Every 6 hours at :15) | Chatbot Retraining                 | Checks correction threshold and retrains intent classifier if needed. |
| `0 3 * * 6` (Saturday 3 AM)           | Weekly Knowledge Index Rebuild     | Rebuilds TF-IDF search index for knowledge assistant.                 |

---

## 8. Utility Modules

### 8.1 holt-winters.util.ts

**File:** `utils/holt-winters.util.ts`

Time series forecasting with exponential smoothing.

| Export                                                          | Description                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holtWinters(data, horizonPeriods, params)`                     | Triple Exponential Smoothing with level, trend, and seasonal components. Returns fitted values, forecasts, residuals, and MAPE. Requires 2x season length of data. Default params: alpha=0.3, beta=0.1, gamma=0.3, seasonLength=12, type='multiplicative'. |
| `simpleExponentialSmoothing(data, alpha, horizon)`              | Fallback for minimal data. Level-only smoothing, flat forecasts.                                                                                                                                                                                           |
| `doubleExponentialSmoothing(data, alpha, beta, horizon)`        | Holt's method. Level + trend, no seasonality. Requires 2+ data points.                                                                                                                                                                                     |
| `forecastWithConfidenceIntervals(data, horizon, params, level)` | Wrapper that auto-selects algorithm based on data length and returns ForecastPoint[] with lower/upper bounds. 95% CI by default.                                                                                                                           |
| `detectSeasonalityStrength(data, seasonLength)`                 | Returns 0-1 measure of how seasonal the data is (ratio of seasonal variance to total variance).                                                                                                                                                            |
| `detectTrend(data)`                                             | Linear regression-based trend detection. Returns direction (up/down/flat), magnitude (% change per period), and R-squared confidence.                                                                                                                      |
| `aggregateToMonthly(dailyData)`                                 | Converts daily data to monthly buckets.                                                                                                                                                                                                                    |
| `applyHolidayMultipliers(forecasts, startDate, holidays)`       | Applies Ramadan/holiday seasonal multipliers to forecasts.                                                                                                                                                                                                 |

---

### 8.2 monte-carlo.util.ts

**File:** `utils/monte-carlo.util.ts`

Probabilistic simulation for cash flow forecasting.

| Export                                                | Description                                                                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runCashFlowMonteCarlo(params)`                       | Main simulation engine. Runs N simulations (default 1000) of daily cash flow, randomizing AR collection timing per run. Returns P10/P50/P90 percentiles per day, minimum balance, and days until negative. |
| `generateDailyForecasts(result, startDate)`           | Converts Monte Carlo results into daily forecast objects with negative/low-cash risk flags.                                                                                                                |
| `calculatePeriodTotals(events, start, end)`           | Sums expected inflows/outflows by source for a date range.                                                                                                                                                 |
| `applyWhatIfScenario(events, scenario)`               | Modifies events for what-if analysis: delay customer, early payment, new expense, or revenue change (%).                                                                                                   |
| `identifyCriticalDates(forecasts, events, threshold)` | Identifies dates with significant cash drops, negative balance risk, or safety threshold breaches. Returns up to 10 critical dates with explanations.                                                      |

---

### 8.3 statistics.util.ts

**File:** `utils/statistics.util.ts`

Core statistical functions used across all AI services.

| Export                                     | Description                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `mean(values)`                             | Arithmetic mean.                                                                |
| `standardDeviation(values)`                | Sample standard deviation (Bessel's correction, n-1).                           |
| `populationStandardDeviation(values)`      | Population standard deviation (n).                                              |
| `zScore(value, values)`                    | Z-score for a value against a dataset.                                          |
| `zScoreWithStats(value, avg, stdDev)`      | Z-score with pre-computed statistics.                                           |
| `variance(values)`                         | Sample variance.                                                                |
| `percentile(values, p)`                    | Percentile calculation with linear interpolation.                               |
| `median(values)`                           | 50th percentile.                                                                |
| `interquartileRange(values)`               | Returns Q1, Q2, Q3, IQR, and 1.5\*IQR bounds.                                   |
| `isOutlierIQR(value, values, multiplier)`  | Checks if value is an outlier (default 1.5x IQR, 3x for extreme).               |
| `getIQRBounds(values, multiplier)`         | Returns lower/upper IQR bounds.                                                 |
| `getZValueForServiceLevel(level)`          | Z-value lookup with interpolation for safety stock calculations (0.5 to 0.999). |
| `simpleMovingAverage(values, period)`      | SMA calculation.                                                                |
| `exponentialMovingAverage(values, period)` | EMA with k = 2/(period+1).                                                      |
| `coefficientOfVariation(values)`           | CV = stdDev/mean.                                                               |
| `linearRegression(x, y)`                   | Returns slope, intercept, and R-squared.                                        |
| `predictLinear(x, y, futureX)`             | Predicts future value using linear regression.                                  |

---

### 8.4 text-similarity.util.ts

**File:** `utils/text-similarity.util.ts`

Text comparison and matching utilities for reconciliation and OCR.

| Export                                         | Description                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `levenshteinDistance(str1, str2)`              | Dynamic programming Levenshtein edit distance.                              |
| `levenshteinSimilarity(str1, str2)`            | Normalized similarity ratio 0-1 (1 = identical).                            |
| `normalizeText(text)`                          | Lowercase, remove special chars (preserves Arabic), normalize whitespace.   |
| `tokenize(text)`                               | Split normalized text into word tokens.                                     |
| `jaccardSimilarity(tokens1, tokens2)`          | Set-based Jaccard similarity coefficient.                                   |
| `containsReference(text, reference)`           | Case-insensitive substring check.                                           |
| `extractNumbers(text)`                         | Regex extraction of numeric values from text.                               |
| `extractDocumentNumbers(text)`                 | Extracts INV-XXX, BILL-XXX, REF-XXX, PO-XXX patterns.                       |
| `documentNumberSimilarity(num1, num2)`         | Compares document numbers with normalization (handles INV-001 vs INV001).   |
| `findBestMatch(target, candidates, threshold)` | Finds best Levenshtein match above threshold (default 0.6).                 |
| `nGramSimilarity(str1, str2, n)`               | Bigram-based Jaccard similarity (default n=2).                              |
| `wordOverlapRatio(str1, str2)`                 | Fraction of shared words relative to smaller set.                           |
| `generateDescriptionHash(description)`         | 32-bit hash for fast pattern grouping.                                      |
| `extractPattern(description)`                  | Replaces dates/numbers with {DATE}/{NUM} placeholders for pattern learning. |
| `patternMatches(pattern, description)`         | Checks if description matches a learned pattern (>85% similarity).          |

---

### 8.5 date-pattern.util.ts

**File:** `utils/date-pattern.util.ts`

Date detection and frequency analysis for the Dejavu pattern detection algorithm.

| Export                                             | Description                                                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectDateInDescription(description)`             | NLP-based date detection in transaction descriptions. Supports: month names (English + Arabic), quarter patterns (Q1-Q4), date formats (ISO, M/D/Y, M/D), year-only. Returns extracted date, pattern template, confidence, and date type. |
| `normalizeEntityName(name)`                        | Removes corporate suffixes (Inc, Corp, LLC, Ltd, GmbH, etc.) and normalizes for clustering. Supports Arabic characters.                                                                                                                   |
| `detectFrequency(dates)`                           | Analyzes time deltas between sorted dates to determine: DAILY (0-2d), WEEKLY (6-8d), BIWEEKLY (13-15d), MONTHLY (28-31d), QUARTERLY (88-92d), YEARLY (360-370d). Returns frequency, interval, stdDev, confidence, and pattern type.       |
| `isAmountMatch(amount1, amount2, variance)`        | Checks if two amounts are within variance threshold (default 1%).                                                                                                                                                                         |
| `getAmountCluster(amount, variance)`               | Groups amounts into cluster buckets for pattern detection.                                                                                                                                                                                |
| `calculateNextOccurrence(lastDate, frequency)`     | Calculates next expected date for a given frequency.                                                                                                                                                                                      |
| `daysBetween(date1, date2)`                        | Absolute day count between two dates.                                                                                                                                                                                                     |
| `isPotentialDuplicate(tx1, tx2, window, variance)` | Checks if two transactions are potential duplicates: same normalized entity name + same amount (within 1%) + within date window (default 3 days).                                                                                         |
| `generatePatternHash(pattern)`                     | 8-char hex hash for pattern grouping.                                                                                                                                                                                                     |
| `FREQUENCY_PATTERNS`                               | Constant defining day ranges for each frequency type.                                                                                                                                                                                     |

---

### 8.6 isolation-forest.util.ts

**File:** `utils/isolation-forest.util.ts`

Custom implementation of the Isolation Forest anomaly detection algorithm (Liu, Ting & Zhou, 2008). Zero external dependencies.

| Export                                             | Description                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildIsolationForest(data, numTrees, sampleSize)` | Builds a forest of isolation trees from multi-dimensional data. Default: 100 trees, subsample min(256, N). Max tree depth = ceil(log2(sampleSize)). |
| `isolationForestScore(point, forest)`              | Anomaly score 0-1. Score = 2^(-avgPathLength / c(n)). Close to 1 = anomaly, close to 0.5 = normal, close to 0 = very normal (dense region).         |
| `isolationForestDetect(point, forest, threshold)`  | Boolean anomaly detection. Default threshold 0.6.                                                                                                   |
| `buildIsolationForest1D(values, numTrees)`         | Convenience wrapper for single-dimensional data.                                                                                                    |
| `isolationForestScore1D(value, forest)`            | Score a single value against a 1D forest.                                                                                                           |

**Algorithm details:**

- Random feature selection and random split value at each node
- Fisher-Yates partial shuffle for subsampling without replacement
- Average path length normalization using harmonic number approximation: c(n) = 2\*H(n-1) - 2(n-1)/n
- Anomalies are isolated in fewer splits (shorter path length)

---

### 8.7 logistic-regression.util.ts

**File:** `utils/logistic-regression.util.ts`

Wrapper around `ml-logistic-regression` for binary classification tasks (primarily lead scoring).

| Export                                                    | Description                                                                                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trainLogisticRegression(features, labels, names, split)` | Trains a model with z-score normalization, Fisher-Yates shuffled train/test split (default 80/20). Returns accuracy, precision, recall, F1 score. Config: 1000 steps, learning rate 0.01. |
| `predictProbability(model, features)`                     | Returns sigmoid probability 0.01-0.99 for the positive class. Applies stored normalization parameters.                                                                                    |
| `predictClass(model, features)`                           | Binary prediction (threshold 0.5).                                                                                                                                                        |
| `getModelAccuracy(model, features, labels)`               | Calculates accuracy on a test dataset.                                                                                                                                                    |
| `serializeModel(model)`                                   | Converts model to JSON string for database storage (including normalization parameters).                                                                                                  |
| `deserializeModel(json)`                                  | Reconstructs model from stored JSON.                                                                                                                                                      |

---

### 8.8 pdf-extractor.util.ts

**File:** `utils/pdf-extractor.util.ts`

PDF text extraction using `pdf-parse` (local, no external API).

| Export                       | Description                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractTextFromPdf(buffer)` | Extracts text from a PDF buffer. Returns `{ text, pageCount, isNativeText }`. The `isNativeText` flag uses a heuristic (>50 chars per page) to distinguish native text PDFs from scanned image PDFs. When `isNativeText` is false, the caller should fall back to OCR via tesseract.js. |

---

## 9. AiFeature Enum

The `AiFeature` enum in Prisma defines all 33 AI model identifiers used for model registry, training data, feedback, and predictions:

```
CATEGORIZATION          -- Transaction Auto-Categorization
RECONCILIATION          -- Bank Reconciliation Matcher
OCR_LAYOUT              -- Invoice OCR Layout Learning
DEMAND_FORECAST         -- Demand Forecasting (Holt-Winters)
LEAD_SCORING            -- Lead Scoring (Rule + ML)
ANOMALY                 -- Anomaly Detection
REORDER                 -- Smart Reorder Points
PAYMENT_PREDICTION      -- Payment Date Prediction
CASH_FLOW               -- Cash Flow Prediction (Monte Carlo)
PATTERN_DETECTION       -- Pattern Detection (Dejavu)
CHURN_PREDICTION        -- Customer Churn Prediction
CLV_ANALYSIS            -- Customer Lifetime Value
CROSS_SELL              -- Cross-Sell Recommendations
DYNAMIC_PRICING         -- Dynamic Pricing
PIPELINE_FORECAST       -- Pipeline Forecast
FRAUD_DETECTION         -- Fraud Detection
COMPLIANCE_MONITORING   -- Compliance Monitoring
AUDIT_RISK              -- Audit Risk Scoring
DOCUMENT_CLASSIFICATION -- Document Classification
SENTIMENT_ANALYSIS      -- Sentiment Analysis
ENTITY_EXTRACTION       -- Entity Extraction
CONTRACT_ANALYSIS       -- Contract Analysis
EMPLOYEE_ATTRITION      -- Employee Attrition Prediction
COMPENSATION_BENCHMARK  -- Compensation Benchmarking
SKILLS_GAP              -- Skills Gap Analysis
QUALITY_PREDICTION      -- Quality Prediction
PREDICTIVE_MAINTENANCE  -- Predictive Maintenance
WORKFORCE_SCHEDULING    -- Workforce Scheduling
ROUTE_OPTIMIZATION      -- Route Optimization
RESOURCE_OPTIMIZATION   -- Resource Optimization
CHATBOT                 -- Conversational Chatbot
KNOWLEDGE_ASSISTANT     -- Knowledge Assistant
VOICE_COMMAND           -- Voice Command (placeholder)
```

---

## Database Models (AI-Specific)

| Prisma Model            | Purpose                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiModel`               | Versioned model storage. Fields: organizationId, feature (AiFeature), version, modelData (JSON), accuracy (Decimal), sampleCount, status (TRAINING/ACTIVE/RETIRED), trainedAt. Unique on (organizationId, feature, version). |
| `AiTrainingData`        | Training examples. Fields: organizationId, feature, inputData (JSON), label, source (USER/SEED/CORRECTION).                                                                                                                  |
| `AiFeedback`            | User feedback on AI suggestions. Fields: organizationId, feature, predictionId, aiSuggestion (JSON), userAction (ACCEPTED/REJECTED/CORRECTED), userAnswer, inputData (JSON).                                                 |
| `AiPrediction`          | Cached predictions. Fields: organizationId, feature, inputHash, prediction (JSON), confidence, modelVersion.                                                                                                                 |
| `AiAnomaly`             | Detected anomalies. Fields: organizationId, transactionId, score, severity, method, isResolved, resolvedAt.                                                                                                                  |
| `AIInsight`             | Generated insights and narratives. Fields: organizationId, type, severity, priority, title, description, data (JSON).                                                                                                        |
| `TransactionPattern`    | Detected recurring patterns. Fields: organizationId, entityName, amount, frequency, status (DETECTED/CONFIRMED/STALE), lastOccurrence.                                                                                       |
| `PatternSuggestion`     | Suggested actions from pattern detection.                                                                                                                                                                                    |
| `ReconciliationPattern` | Learned reconciliation matching patterns.                                                                                                                                                                                    |
| `VendorOcrLayout`       | Vendor-specific OCR field position learning.                                                                                                                                                                                 |
| `ItemDemandForecast`    | Demand forecast results per item.                                                                                                                                                                                            |
| `CashFlowForecast`      | Cash flow prediction results.                                                                                                                                                                                                |
| `ItemReorderAnalysis`   | Reorder point calculation results per item.                                                                                                                                                                                  |
| `LeadScore`             | Lead scoring results and history.                                                                                                                                                                                            |
| `CustomerAiProfile`     | Per-customer AI attributes (payment patterns, churn risk, CLV).                                                                                                                                                              |
| `EmployeeAiProfile`     | Per-employee AI attributes (attrition risk, skill profile).                                                                                                                                                                  |
| `FraudAlert`            | Fraud detection alerts. Fields: organizationId, severity, isResolved, resolvedAt.                                                                                                                                            |

---

## Design Principles

1. **100% Local**: All AI processing runs on the application server. No data leaves the organization's infrastructure. No external API calls for any AI feature.

2. **Human-in-the-Loop**: Every AI suggestion is dismissible. Users can accept, reject, or correct any prediction. Corrections feed back into training data for continuous improvement.

3. **Multi-Tenant Isolation**: All AI models, training data, predictions, and feedback are scoped to `organizationId`. No data leaks between organizations.

4. **Graceful Degradation**: Models fall back to simpler algorithms when data is insufficient (e.g., Holt-Winters to Double Exponential Smoothing to Simple Exponential Smoothing). Features work with minimal data and improve over time.

5. **Versioned Models**: All trained models are versioned with accuracy metrics. Rollback to previous versions is supported. Old models are retired, not deleted (kept for 6 months).

6. **Continuous Learning**: The feedback loop (prediction -> user action -> training data -> retraining -> improved prediction) runs automatically via schedulers. Retraining thresholds are configurable per feature.

7. **Audit Trail**: All AI predictions, feedback, and model training events are logged and queryable.

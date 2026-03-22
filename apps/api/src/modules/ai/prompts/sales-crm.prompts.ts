import { wrapJsonPrompt, buildSystemPrompt } from './base.prompts';

// ─── Churn Prediction ───────────────────────────────────────────────

export interface ChurnRfmFeatures {
  recency_days: number;
  frequency: number;
  monetary_value: number;
  avg_order_value?: number;
  days_since_last_purchase?: number;
}

export interface ChurnCustomerHistory {
  customer_id: string;
  customer_name?: string;
  total_orders: number;
  total_revenue: number;
  first_purchase_date?: string;
  last_purchase_date?: string;
  payment_delays?: number[];
  support_tickets?: number;
  returned_orders?: number;
}

export interface ChurnPredictionResponse {
  churn_risk: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: { factor: string; impact: number; description: string }[];
  recommendation: string;
}

export function buildChurnPredictionPrompt(
  rfmFeatures: ChurnRfmFeatures,
  customerHistory: ChurnCustomerHistory,
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'churn prediction analyst',
    'Analyze customer behavior using RFM (Recency, Frequency, Monetary) features and historical data to predict churn probability. ' +
      'Consider payment patterns, order frequency trends, and engagement signals. ' +
      'Provide actionable retention recommendations tailored to the risk level.',
  );

  const user = wrapJsonPrompt(
    `Analyze the following customer data and predict churn risk.

## RFM Features
${JSON.stringify(rfmFeatures, null, 2)}

## Customer History
${JSON.stringify(customerHistory, null, 2)}

Evaluate the customer's likelihood to churn based on:
- Recency: How recently they made a purchase (higher recency_days = higher risk)
- Frequency: How often they purchase (declining frequency = higher risk)
- Monetary: Total spend and average order value trends
- Payment behavior: Late payments or declining payment reliability
- Support interactions: High support ticket volume may indicate dissatisfaction
- Returns: High return rates may signal product/service issues

Provide a churn_risk score from 0.0 (no risk) to 1.0 (certain churn).
Classify risk_level as LOW (0-0.25), MEDIUM (0.25-0.5), HIGH (0.5-0.75), or CRITICAL (0.75-1.0).
List the key contributing factors with their impact weight and description.
Give a specific, actionable recommendation for retention.`,
    `{
  "churn_risk": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH | CRITICAL",
  "factors": [
    { "factor": "string", "impact": 0.0, "description": "string" }
  ],
  "recommendation": "string"
}`,
  );

  return { system, user };
}

// ─── Lead Scoring ───────────────────────────────────────────────────

export interface LeadData {
  lead_id: string;
  company_name?: string;
  contact_name?: string;
  industry?: string;
  company_size?: string;
  source?: string;
  created_at?: string;
  budget_range?: string;
  job_title?: string;
  region?: string;
}

export interface LeadInteraction {
  type: string;
  date: string;
  description?: string;
  outcome?: string;
  duration_minutes?: number;
}

export interface LeadScoringResponse {
  score: number;
  tier: 'HOT' | 'WARM' | 'COOL' | 'COLD';
  conversion_probability: number;
  factors: { factor: string; weight: number; value: string }[];
}

export function buildLeadScoringPrompt(
  leadData: LeadData,
  interactions: LeadInteraction[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'lead scoring specialist',
    'Score sales leads based on demographic fit, behavioral engagement, and interaction history. ' +
      'Use BANT criteria (Budget, Authority, Need, Timeline) where data is available. ' +
      'Tier leads to help sales teams prioritize outreach effectively.',
  );

  const user = wrapJsonPrompt(
    `Score the following sales lead based on their profile and interaction history.

## Lead Profile
${JSON.stringify(leadData, null, 2)}

## Interactions (${interactions.length} total)
${JSON.stringify(interactions, null, 2)}

Evaluate the lead on:
- Demographic fit: Industry, company size, region, job title alignment
- Engagement level: Frequency and recency of interactions
- Intent signals: Meeting requests, demo attendance, proposal requests
- Source quality: Referral vs cold outreach vs inbound
- Budget indicators: Stated budget range or spending signals
- Authority: Decision-maker vs influencer vs researcher

Provide a score from 0 to 100.
Classify tier as HOT (80-100), WARM (50-79), COOL (25-49), or COLD (0-24).
Estimate conversion_probability from 0.0 to 1.0.
List key scoring factors with their weight and observed value.`,
    `{
  "score": 0,
  "tier": "HOT | WARM | COOL | COLD",
  "conversion_probability": 0.0,
  "factors": [
    { "factor": "string", "weight": 0.0, "value": "string" }
  ]
}`,
  );

  return { system, user };
}

// ─── Customer Lifetime Value ────────────────────────────────────────

export interface ClvCustomerData {
  customer_id: string;
  customer_name?: string;
  segment?: string;
  acquisition_date?: string;
  acquisition_channel?: string;
  industry?: string;
  region?: string;
}

export interface ClvTransaction {
  date: string;
  amount: number;
  type?: string;
  items_count?: number;
  category?: string;
}

export interface ClvResponse {
  clv_estimate: number;
  segments: string;
  growth_potential: 'HIGH' | 'MEDIUM' | 'LOW';
  factors: string[];
}

export function buildClvPrompt(
  customerData: ClvCustomerData,
  transactions: ClvTransaction[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'customer lifetime value analyst',
    'Estimate customer lifetime value (CLV) based on transaction history, purchasing patterns, and customer profile. ' +
      'Consider retention probability, average purchase frequency, and revenue growth trends. ' +
      'Segment the customer and assess future growth potential.',
  );

  const user = wrapJsonPrompt(
    `Estimate the lifetime value of the following customer.

## Customer Profile
${JSON.stringify(customerData, null, 2)}

## Transaction History (${transactions.length} transactions)
${JSON.stringify(transactions, null, 2)}

Analyze:
- Purchase frequency and regularity
- Average transaction value and trends (increasing/decreasing)
- Customer tenure and retention signals
- Product/category diversity (cross-buying behavior)
- Seasonal patterns in purchasing
- Acquisition channel quality

Provide:
- clv_estimate: Projected lifetime value in the customer's currency
- segments: Customer segment label (e.g., "High-Value Loyal", "At-Risk Premium", "Growing Mid-Tier")
- growth_potential: HIGH (expanding relationship), MEDIUM (stable), LOW (declining/saturated)
- factors: List of key drivers influencing the CLV estimate`,
    `{
  "clv_estimate": 0,
  "segments": "string",
  "growth_potential": "HIGH | MEDIUM | LOW",
  "factors": ["string"]
}`,
  );

  return { system, user };
}

// ─── Cross-Sell Recommendations ─────────────────────────────────────

export interface CustomerPurchase {
  item_id: string;
  item_name: string;
  category?: string;
  quantity: number;
  amount: number;
  date: string;
}

export interface CatalogItem {
  item_id: string;
  item_name: string;
  category?: string;
  price: number;
  description?: string;
}

export interface CrossSellResponse {
  recommendations: {
    item_id: string;
    item_name: string;
    confidence: number;
    reason: string;
  }[];
  confidence: number;
}

export function buildCrossSellPrompt(
  customerPurchases: CustomerPurchase[],
  catalog: CatalogItem[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'cross-sell recommendation engine',
    'Analyze customer purchase history against the product catalog to identify cross-sell and upsell opportunities. ' +
      'Consider complementary products, category affinity, price sensitivity, and purchasing patterns. ' +
      'Rank recommendations by confidence and provide clear reasoning.',
  );

  const user = wrapJsonPrompt(
    `Identify cross-sell opportunities for this customer.

## Customer Purchase History (${customerPurchases.length} purchases)
${JSON.stringify(customerPurchases, null, 2)}

## Available Catalog Items
${JSON.stringify(catalog, null, 2)}

Recommend items the customer has NOT purchased but is likely to buy based on:
- Complementary products: Items commonly bought together with their purchases
- Category affinity: Related categories to what they already buy
- Price range alignment: Items within their typical spending range
- Purchase timing: Seasonal or cyclical patterns suggesting upcoming needs
- Upsell potential: Premium versions of items they currently buy

Do NOT recommend items the customer has already purchased.
Provide up to 5 recommendations sorted by confidence (highest first).
Each recommendation must include item_id, item_name, confidence (0.0-1.0), and a specific reason.
Overall confidence reflects how reliable the recommendations are given available data.`,
    `{
  "recommendations": [
    { "item_id": "string", "item_name": "string", "confidence": 0.0, "reason": "string" }
  ],
  "confidence": 0.0
}`,
  );

  return { system, user };
}

// ─── Dynamic Pricing ────────────────────────────────────────────────

export interface PricingItem {
  item_id: string;
  item_name: string;
  current_price: number;
  cost: number;
  category?: string;
  sales_velocity?: number;
  inventory_level?: number;
}

export interface MarketContext {
  competitor_prices?: number[];
  market_trend?: 'GROWING' | 'STABLE' | 'DECLINING';
  seasonality?: string;
  region?: string;
}

export interface DemandSignals {
  recent_sales_count?: number;
  trend_direction?: 'UP' | 'FLAT' | 'DOWN';
  stock_days_remaining?: number;
  backorder_count?: number;
  page_views?: number;
}

export interface DynamicPricingResponse {
  suggested_price: number;
  reasoning: string;
  elasticity: number;
  confidence: number;
}

export function buildDynamicPricingPrompt(
  item: PricingItem,
  market: MarketContext,
  demand: DemandSignals,
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'dynamic pricing strategist',
    'Analyze item cost structure, market conditions, and demand signals to suggest optimal pricing. ' +
      'Balance margin optimization with competitive positioning and inventory management. ' +
      'Consider price elasticity and provide confidence-weighted recommendations.',
  );

  const user = wrapJsonPrompt(
    `Determine the optimal price for the following item.

## Item Details
${JSON.stringify(item, null, 2)}

## Market Context
${JSON.stringify(market, null, 2)}

## Demand Signals
${JSON.stringify(demand, null, 2)}

Analyze:
- Cost-plus margin: Ensure the suggested price exceeds cost
- Competitor positioning: Price relative to competitor_prices if available
- Demand elasticity: How sensitive is demand to price changes
- Inventory pressure: Low stock may support higher prices; excess stock may need discounting
- Market trend: Growing markets may tolerate premium pricing
- Seasonality: Adjust for seasonal demand patterns
- Sales velocity: Current sales rate and momentum

Provide:
- suggested_price: The recommended price point (must be >= cost)
- reasoning: Clear explanation of the pricing rationale
- elasticity: Estimated price elasticity coefficient (-3.0 to 0.0, where -1.0 is unit elastic)
- confidence: How confident you are in this recommendation (0.0-1.0)`,
    `{
  "suggested_price": 0,
  "reasoning": "string",
  "elasticity": 0.0,
  "confidence": 0.0
}`,
  );

  return { system, user };
}

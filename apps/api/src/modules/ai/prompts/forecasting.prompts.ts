import { wrapJsonPrompt, buildSystemPrompt } from './base.prompts';

// ─── Forecast Interpretation ────────────────────────────────────────

export interface ForecastData {
  metric: string;
  period: string;
  forecast_values: { date: string; value: number; lower_bound?: number; upper_bound?: number }[];
  model_used?: string;
  confidence_interval?: number;
  trend?: 'UP' | 'FLAT' | 'DOWN';
}

export interface HistoricalData {
  values: { date: string; value: number }[];
  period_start?: string;
  period_end?: string;
  currency?: string;
}

export interface ForecastInterpretationResponse {
  narrative: string;
  alerts: string[];
  recommendations: string[];
}

export function buildForecastInterpretationPrompt(
  forecastData: ForecastData,
  historicalData: HistoricalData,
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'financial forecast analyst',
    'Interpret statistical forecasting results and translate them into clear, actionable business narratives. ' +
      'Compare forecasts against historical trends to identify significant shifts, potential risks, and opportunities. ' +
      'Generate alerts for concerning trends and provide strategic recommendations. ' +
      'Support bilingual output (Arabic/English) for MENA-region businesses.',
  );

  const user = wrapJsonPrompt(
    `Interpret the following forecast and provide a business narrative.

## Forecast Results
- Metric: ${forecastData.metric}
- Period: ${forecastData.period}
${forecastData.model_used ? `- Model: ${forecastData.model_used}` : ''}
${forecastData.confidence_interval ? `- Confidence Interval: ${forecastData.confidence_interval}%` : ''}
${forecastData.trend ? `- Trend Direction: ${forecastData.trend}` : ''}

### Forecasted Values
${JSON.stringify(forecastData.forecast_values, null, 2)}

## Historical Context
${historicalData.currency ? `- Currency: ${historicalData.currency}` : ''}
${historicalData.period_start ? `- Historical Period: ${historicalData.period_start} to ${historicalData.period_end}` : ''}

### Historical Values
${JSON.stringify(historicalData.values, null, 2)}

Provide:
- narrative: A clear, executive-friendly summary of what the forecast means for the business. Include key numbers, percentage changes, and trend descriptions. Write in a professional tone suitable for management reporting.
- alerts: Specific warnings about concerning patterns (e.g., declining revenue, widening confidence intervals, seasonal risks). Only include genuine concerns — do not pad with generic alerts.
- recommendations: Actionable business steps based on the forecast (e.g., adjust budgets, accelerate collections, build inventory). Be specific and tied to the data.`,
    `{
  "narrative": "string",
  "alerts": ["string"],
  "recommendations": ["string"]
}`,
  );

  return { system, user };
}

// ─── Cash Flow Explanation ──────────────────────────────────────────

export interface CashFlowPrediction {
  period: string;
  predicted_inflows: number;
  predicted_outflows: number;
  net_cash_flow: number;
  ending_balance: number;
  currency?: string;
  breakdown?: {
    category: string;
    amount: number;
    direction: 'IN' | 'OUT';
  }[];
}

export interface CashFlowScenario {
  name: string;
  description?: string;
  adjustments: { category: string; change_percent: number }[];
  resulting_balance: number;
}

export interface CashFlowExplanationResponse {
  summary: string;
  risks: { description: string; probability: number; impact: number }[];
  mitigation_actions: string[];
}

export function buildCashFlowExplanationPrompt(
  prediction: CashFlowPrediction,
  scenarios: CashFlowScenario[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'cash flow management advisor',
    'Analyze cash flow predictions and scenario analyses to provide clear explanations of liquidity position. ' +
      'Identify risks to cash position and recommend mitigation strategies. ' +
      'Consider working capital optimization, payment timing, and seasonal patterns. ' +
      'Support bilingual explanations for MENA-region businesses.',
  );

  const user = wrapJsonPrompt(
    `Explain the following cash flow prediction and scenario analysis.

## Cash Flow Prediction
- Period: ${prediction.period}
${prediction.currency ? `- Currency: ${prediction.currency}` : ''}
- Predicted Inflows: ${prediction.predicted_inflows}
- Predicted Outflows: ${prediction.predicted_outflows}
- Net Cash Flow: ${prediction.net_cash_flow}
- Ending Balance: ${prediction.ending_balance}

${prediction.breakdown ? `### Breakdown by Category\n${JSON.stringify(prediction.breakdown, null, 2)}` : ''}

## Scenario Analysis (${scenarios.length} scenarios)
${JSON.stringify(scenarios, null, 2)}

Provide:
- summary: A concise explanation of the cash position, highlighting whether the business has adequate liquidity, key drivers of inflows/outflows, and how the scenarios compare. Use specific numbers and percentages.
- risks: Concrete risks to the cash position. Each risk should have a probability (0.0-1.0) and impact score (0.0-1.0 where 1.0 means severe cash shortage). Only list genuine risks supported by the data.
- mitigation_actions: Specific, actionable steps to protect cash position (e.g., "Negotiate 60-day terms with top 3 vendors to defer $X in outflows", "Accelerate collection on invoices older than 30 days totaling $Y").`,
    `{
  "summary": "string",
  "risks": [
    { "description": "string", "probability": 0.0, "impact": 0.0 }
  ],
  "mitigation_actions": ["string"]
}`,
  );

  return { system, user };
}

// ─── Payment Prediction ─────────────────────────────────────────────

export interface PaymentInvoiceData {
  invoice_id: string;
  invoice_number?: string;
  customer_id: string;
  customer_name?: string;
  amount: number;
  currency?: string;
  issue_date: string;
  due_date: string;
  days_outstanding: number;
  payment_terms?: string;
  line_items_count?: number;
}

export interface PaymentCustomerHistory {
  avg_days_to_pay: number;
  median_days_to_pay?: number;
  on_time_payment_rate: number;
  total_invoices: number;
  total_paid: number;
  total_outstanding: number;
  recent_payments?: {
    invoice_amount: number;
    days_to_pay: number;
    date: string;
  }[];
  credit_score?: number;
  payment_method_preference?: string;
}

export interface PaymentPredictionResponse {
  expected_date: string;
  probability: number;
  collection_priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export function buildPaymentPredictionPrompt(
  invoiceData: PaymentInvoiceData,
  customerHistory: PaymentCustomerHistory,
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'accounts receivable prediction specialist',
    'Predict when outstanding invoices will be paid based on customer payment history and invoice characteristics. ' +
      'Assess collection priority to help AR teams focus their efforts on high-risk receivables. ' +
      'Consider payment terms, historical behavior patterns, and seasonal effects. ' +
      'Dates should be in ISO 8601 format (YYYY-MM-DD).',
  );

  const user = wrapJsonPrompt(
    `Predict when the following invoice will be paid.

## Invoice Details
- Invoice ID: ${invoiceData.invoice_id}
${invoiceData.invoice_number ? `- Number: ${invoiceData.invoice_number}` : ''}
- Customer: ${invoiceData.customer_name || invoiceData.customer_id}
- Amount: ${invoiceData.amount}${invoiceData.currency ? ` ${invoiceData.currency}` : ''}
- Issue Date: ${invoiceData.issue_date}
- Due Date: ${invoiceData.due_date}
- Days Outstanding: ${invoiceData.days_outstanding}
${invoiceData.payment_terms ? `- Payment Terms: ${invoiceData.payment_terms}` : ''}

## Customer Payment History
- Average Days to Pay: ${customerHistory.avg_days_to_pay}
${customerHistory.median_days_to_pay !== undefined ? `- Median Days to Pay: ${customerHistory.median_days_to_pay}` : ''}
- On-Time Payment Rate: ${(customerHistory.on_time_payment_rate * 100).toFixed(1)}%
- Total Invoices: ${customerHistory.total_invoices}
- Total Outstanding: ${customerHistory.total_outstanding}
${customerHistory.credit_score !== undefined ? `- Credit Score: ${customerHistory.credit_score}` : ''}

${customerHistory.recent_payments ? `### Recent Payments\n${JSON.stringify(customerHistory.recent_payments, null, 2)}` : ''}

Predict:
- expected_date: The most likely payment date in YYYY-MM-DD format. Base this on the customer's average payment behavior applied to this invoice's issue date, adjusted for any trends.
- probability: Confidence that payment will occur within 7 days of the expected_date (0.0-1.0).
- collection_priority: HIGH if the invoice is at risk of significant delay (customer has poor payment history, invoice is already past due, or amount is large relative to their history). MEDIUM for moderate risk. LOW for customers with strong payment records and invoices not yet due.`,
    `{
  "expected_date": "YYYY-MM-DD",
  "probability": 0.0,
  "collection_priority": "HIGH | MEDIUM | LOW"
}`,
  );

  return { system, user };
}

// ─── Pipeline Narrative ─────────────────────────────────────────────

export interface PipelineData {
  total_value: number;
  total_deals: number;
  currency?: string;
  period?: string;
  weighted_value?: number;
  avg_deal_size?: number;
  avg_cycle_days?: number;
  win_rate?: number;
}

export interface PipelineStage {
  name: string;
  deals_count: number;
  total_value: number;
  avg_days_in_stage?: number;
  conversion_rate?: number;
  deals?: {
    deal_name: string;
    value: number;
    days_in_stage: number;
    probability?: number;
    owner?: string;
  }[];
}

export interface PipelineNarrativeResponse {
  forecast: number;
  insights: string[];
  risk_deals: { deal_name: string; risk: string; recommendation: string }[];
}

export function buildPipelineNarrativePrompt(
  pipelineData: PipelineData,
  stages: PipelineStage[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'sales pipeline analyst',
    'Analyze sales pipeline data to generate revenue forecasts, actionable insights, and risk assessments for individual deals. ' +
      'Consider stage conversion rates, deal velocity, aging, and historical win rates. ' +
      'Identify stalled deals and recommend specific actions to advance them. ' +
      'Support bilingual reporting for MENA-region sales teams.',
  );

  const user = wrapJsonPrompt(
    `Analyze the following sales pipeline and provide a narrative.

## Pipeline Overview
- Total Deals: ${pipelineData.total_deals}
- Total Value: ${pipelineData.total_value}${pipelineData.currency ? ` ${pipelineData.currency}` : ''}
${pipelineData.weighted_value !== undefined ? `- Weighted Value: ${pipelineData.weighted_value}` : ''}
${pipelineData.avg_deal_size !== undefined ? `- Avg Deal Size: ${pipelineData.avg_deal_size}` : ''}
${pipelineData.avg_cycle_days !== undefined ? `- Avg Sales Cycle: ${pipelineData.avg_cycle_days} days` : ''}
${pipelineData.win_rate !== undefined ? `- Historical Win Rate: ${(pipelineData.win_rate * 100).toFixed(1)}%` : ''}
${pipelineData.period ? `- Period: ${pipelineData.period}` : ''}

## Pipeline Stages (${stages.length} stages)
${JSON.stringify(stages, null, 2)}

Provide:
- forecast: Weighted revenue forecast based on stage probabilities, conversion rates, and deal-level signals. This should be a realistic number, not just a weighted sum — adjust for stalled deals and aging.
- insights: Key observations about pipeline health (e.g., stage bottlenecks, velocity trends, concentration risks, conversion rate anomalies). Be specific with numbers.
- risk_deals: Deals that are at risk of being lost or significantly delayed. For each, explain the specific risk and recommend a concrete action. Focus on deals with high value or long stage duration.`,
    `{
  "forecast": 0,
  "insights": ["string"],
  "risk_deals": [
    { "deal_name": "string", "risk": "string", "recommendation": "string" }
  ]
}`,
  );

  return { system, user };
}

// ─── Financial Narrative ────────────────────────────────────────────

export interface FinancialData {
  period: string;
  currency?: string;
  revenue?: number;
  expenses?: number;
  net_income?: number;
  gross_margin?: number;
  operating_margin?: number;
  cash_balance?: number;
  accounts_receivable?: number;
  accounts_payable?: number;
  revenue_growth?: number;
  expense_growth?: number;
  department_breakdown?: { department: string; revenue?: number; expenses?: number }[];
  top_customers?: { name: string; revenue: number }[];
  top_expenses?: { category: string; amount: number }[];
  prior_period?: {
    revenue?: number;
    expenses?: number;
    net_income?: number;
    cash_balance?: number;
  };
}

export interface FinancialNarrativeResponse {
  executive_summary: string;
  sections: { title: string; content: string; metrics: Record<string, unknown> }[];
  kpis: { label: string; value: string; trend: string }[];
  alerts: { type: string; message: string; severity: string }[];
}

export function buildFinancialNarrativePrompt(financialData: FinancialData): {
  system: string;
  user: string;
} {
  const system = buildSystemPrompt(
    'CFO-level financial narrative generator',
    'Generate comprehensive financial narratives from structured financial data. ' +
      'Write in a professional tone suitable for board reporting and executive review. ' +
      'Highlight key performance indicators, trends, risks, and opportunities. ' +
      'Compare against prior periods where available. ' +
      'Support bilingual output (Arabic/English) for MENA-region businesses. ' +
      'All monetary values should be formatted clearly with the appropriate currency.',
  );

  const user = wrapJsonPrompt(
    `Generate a comprehensive financial narrative from the following data.

## Financial Data
- Period: ${financialData.period}
${financialData.currency ? `- Currency: ${financialData.currency}` : ''}

### Key Financials
${financialData.revenue !== undefined ? `- Revenue: ${financialData.revenue}` : ''}
${financialData.expenses !== undefined ? `- Expenses: ${financialData.expenses}` : ''}
${financialData.net_income !== undefined ? `- Net Income: ${financialData.net_income}` : ''}
${financialData.gross_margin !== undefined ? `- Gross Margin: ${(financialData.gross_margin * 100).toFixed(1)}%` : ''}
${financialData.operating_margin !== undefined ? `- Operating Margin: ${(financialData.operating_margin * 100).toFixed(1)}%` : ''}
${financialData.cash_balance !== undefined ? `- Cash Balance: ${financialData.cash_balance}` : ''}
${financialData.accounts_receivable !== undefined ? `- Accounts Receivable: ${financialData.accounts_receivable}` : ''}
${financialData.accounts_payable !== undefined ? `- Accounts Payable: ${financialData.accounts_payable}` : ''}
${financialData.revenue_growth !== undefined ? `- Revenue Growth: ${(financialData.revenue_growth * 100).toFixed(1)}%` : ''}
${financialData.expense_growth !== undefined ? `- Expense Growth: ${(financialData.expense_growth * 100).toFixed(1)}%` : ''}

${financialData.prior_period ? `### Prior Period Comparison\n${JSON.stringify(financialData.prior_period, null, 2)}` : ''}

${financialData.department_breakdown ? `### Department Breakdown\n${JSON.stringify(financialData.department_breakdown, null, 2)}` : ''}

${financialData.top_customers ? `### Top Customers\n${JSON.stringify(financialData.top_customers, null, 2)}` : ''}

${financialData.top_expenses ? `### Top Expense Categories\n${JSON.stringify(financialData.top_expenses, null, 2)}` : ''}

Generate:
- executive_summary: A 2-4 sentence overview suitable for the opening of a board report. Lead with the most important insight (positive or negative). Include key numbers.
- sections: 3-5 analytical sections (e.g., "Revenue Analysis", "Cost Management", "Cash Position", "Outlook"). Each section has a title, narrative content, and relevant metrics as key-value pairs.
- kpis: The 5-8 most important KPIs with their current value (formatted as string with units), and trend description (e.g., "Up 12% from prior period", "Stable", "Declining for 3 consecutive months").
- alerts: Warnings or notable items requiring attention. Type should be one of: "warning", "critical", "info", "positive". Severity should be "low", "medium", or "high". Only include genuine alerts — do not pad with generic items.`,
    `{
  "executive_summary": "string",
  "sections": [
    { "title": "string", "content": "string", "metrics": {} }
  ],
  "kpis": [
    { "label": "string", "value": "string", "trend": "string" }
  ],
  "alerts": [
    { "type": "warning | critical | info | positive", "message": "string", "severity": "low | medium | high" }
  ]
}`,
  );

  return { system, user };
}

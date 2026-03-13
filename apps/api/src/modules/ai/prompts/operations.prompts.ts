/**
 * Operations prompt builders for Ollama-powered AI services.
 *
 * Covers: anomaly explanation, pattern detection, bank reconciliation,
 * and inventory reorder-point calculation.
 */

import { buildSystemPrompt, wrapJsonPrompt } from './base.prompts';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const OPERATIONS_SYSTEM_PROMPT = buildSystemPrompt(
  'financial operations, transaction analysis, bank reconciliation, and inventory management',
);

// ---------------------------------------------------------------------------
// 1. Anomaly Explanation
// ---------------------------------------------------------------------------

const ANOMALY_SCHEMA = `{
  "explanation": "string",
  "severity_rationale": "string",
  "recommended_action": "string"
}`;

export function buildAnomalyExplanationPrompt(
  anomaly: Record<string, unknown>,
  history: Record<string, unknown>,
): string {
  const context = [
    'DETECTED ANOMALY:',
    JSON.stringify(anomaly, null, 2),
    '',
    'HISTORICAL CONTEXT:',
    JSON.stringify(history, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Explain the detected financial anomaly in plain language, justify its severity relative to historical norms, ' +
      'and recommend a concrete corrective or investigative action. ' +
      'Support Arabic (عربي) and English data.',
    context,
    ANOMALY_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 2. Pattern Detection
// ---------------------------------------------------------------------------

const PATTERN_SCHEMA = `{
  "patterns": [
    { "description": "string", "frequency": "string", "amount_range": "string" }
  ],
  "significance": ["string"]
}`;

export function buildPatternDetectionPrompt(transactions: Record<string, unknown>): string {
  const context = ['TRANSACTIONS:', JSON.stringify(transactions, null, 2)].join('\n');

  return wrapJsonPrompt(
    'Analyse the given transactions and identify recurring patterns such as periodic payments, ' +
      'seasonal spikes, or unusual groupings. For each pattern, describe it, state its frequency, ' +
      'and provide the typical amount range. Also list the business significance of each pattern. ' +
      'Support Arabic (عربي) and English transaction descriptions.',
    context,
    PATTERN_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 3. Bank Reconciliation
// ---------------------------------------------------------------------------

const RECONCILIATION_SCHEMA = `{
  "matches": [
    { "bank_id": "string", "book_id": "string", "confidence": 0.0, "reason": "string" }
  ],
  "unmatched_explanation": ["string"]
}`;

export function buildReconciliationPrompt(
  bankTx: Record<string, unknown>,
  bookTx: Record<string, unknown>,
): string {
  const context = [
    'BANK TRANSACTIONS:',
    JSON.stringify(bankTx, null, 2),
    '',
    'BOOK TRANSACTIONS:',
    JSON.stringify(bookTx, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Match bank statement transactions to book (ledger) transactions. For each match, return the bank and book ' +
      'transaction IDs, a confidence score (0-1), and the matching reason (e.g. amount + date, reference number). ' +
      'For any unmatched transactions, provide a brief explanation of why no match was found. ' +
      'Support Arabic (عربي) and English transaction descriptions.',
    context,
    RECONCILIATION_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 4. Inventory Reorder Point
// ---------------------------------------------------------------------------

const REORDER_SCHEMA = `{
  "reorder_point": 0,
  "safety_stock": 0,
  "reasoning": "string"
}`;

export function buildReorderPrompt(
  item: Record<string, unknown>,
  sales: Record<string, unknown>,
  stock: Record<string, unknown>,
): string {
  const context = [
    'ITEM DETAILS:',
    JSON.stringify(item, null, 2),
    '',
    'SALES HISTORY:',
    JSON.stringify(sales, null, 2),
    '',
    'CURRENT STOCK LEVELS:',
    JSON.stringify(stock, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Calculate the optimal reorder point and safety stock for this inventory item based on sales velocity, ' +
      'lead time, and current stock levels. Return integer quantities and a brief reasoning that explains ' +
      'the calculation approach (e.g. average daily demand x lead time + safety stock). ' +
      'Support Arabic (عربي) and English data.',
    context,
    REORDER_SCHEMA,
  );
}

import { wrapJsonPrompt, buildSystemPrompt } from './base.prompts';

// ─── Fraud Analysis ─────────────────────────────────────────────────

export interface FraudTransaction {
  transaction_id: string;
  type: string;
  amount: number;
  currency?: string;
  date: string;
  counterparty?: string;
  account_id?: string;
  payment_method?: string;
  description?: string;
  location?: string;
}

export interface TransactionHistory {
  avg_transaction_amount: number;
  max_transaction_amount: number;
  typical_counterparties?: string[];
  typical_payment_methods?: string[];
  transaction_frequency_per_month?: number;
  recent_transactions?: {
    date: string;
    amount: number;
    type: string;
    counterparty?: string;
  }[];
}

export interface FraudAnalysisResponse {
  fraud_score: number;
  signals: { signal: string; severity: number; description: string }[];
  is_anomaly: boolean;
}

export function buildFraudAnalysisPrompt(
  transaction: FraudTransaction,
  history: TransactionHistory,
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'financial fraud detection analyst',
    'Analyze individual transactions against historical patterns to detect potential fraud or anomalies. ' +
      'Evaluate amount deviations, counterparty risk, timing patterns, and payment method consistency. ' +
      'Flag suspicious signals with severity ratings. Err on the side of caution — false positives are preferable to missed fraud. ' +
      'All analysis is advisory; human review is always required before action.',
  );

  const user = wrapJsonPrompt(
    `Analyze the following transaction for potential fraud or anomalous behavior.

## Transaction Under Review
${JSON.stringify(transaction, null, 2)}

## Historical Baseline
${JSON.stringify(history, null, 2)}

Evaluate for fraud signals including:
- Amount anomaly: Is the amount significantly higher than the average or maximum historical amounts?
- Counterparty risk: Is this a new/unknown counterparty not in the typical list?
- Payment method deviation: Is an unusual payment method being used?
- Timing anomaly: Does the transaction occur at an unusual time or frequency?
- Velocity check: Multiple transactions in a short window
- Round amount: Suspiciously round amounts can indicate fabrication
- Description red flags: Vague or unusual transaction descriptions
- Duplicate patterns: Similar amounts to recent transactions suggesting duplication

Provide:
- fraud_score: Risk score from 0.0 (clean) to 1.0 (highly suspicious)
- signals: List of detected fraud signals, each with severity (0.0-1.0) and description
- is_anomaly: true if the transaction deviates significantly from established patterns

Important: This is advisory analysis only. Never state definitively that a transaction IS fraud — describe it as suspicious or anomalous and recommend human review.`,
    `{
  "fraud_score": 0.0,
  "signals": [
    { "signal": "string", "severity": 0.0, "description": "string" }
  ],
  "is_anomaly": false
}`,
  );

  return { system, user };
}

// ─── Compliance Check ───────────────────────────────────────────────

export interface ComplianceEntity {
  entity_type: string;
  entity_id: string;
  name?: string;
  data: Record<string, unknown>;
  jurisdiction?: string;
  entity_date?: string;
}

export interface ComplianceRule {
  rule_id: string;
  name: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category?: string;
  applicable_jurisdictions?: string[];
}

export interface ComplianceCheckResponse {
  compliance_score: number;
  violations: { rule: string; severity: string; description: string }[];
  recommendations: string[];
}

export function buildComplianceCheckPrompt(
  entity: ComplianceEntity,
  rules: ComplianceRule[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'regulatory compliance analyst',
    'Evaluate business entities (transactions, invoices, reports, configurations) against a set of compliance rules. ' +
      'Check for violations across tax regulations, financial reporting standards, data governance, and internal policies. ' +
      'Consider jurisdiction-specific requirements. Provide actionable remediation recommendations. ' +
      'Support both Arabic and English compliance frameworks (e.g., Saudi VAT, Egyptian tax regulations).',
  );

  const user = wrapJsonPrompt(
    `Check the following entity for compliance violations.

## Entity Under Review
- Type: ${entity.entity_type}
- ID: ${entity.entity_id}
${entity.name ? `- Name: ${entity.name}` : ''}
${entity.jurisdiction ? `- Jurisdiction: ${entity.jurisdiction}` : ''}
${entity.entity_date ? `- Date: ${entity.entity_date}` : ''}

### Entity Data
${JSON.stringify(entity.data, null, 2)}

## Compliance Rules to Check (${rules.length} rules)
${JSON.stringify(rules, null, 2)}

For each rule:
1. Determine if the entity violates the rule based on the available data
2. If jurisdiction is specified, only apply rules relevant to that jurisdiction
3. Consider both explicit violations and potential risks

Provide:
- compliance_score: Overall score from 0.0 (fully non-compliant) to 1.0 (fully compliant)
- violations: List of detected violations with the rule name, severity level, and specific description of the violation
- recommendations: Actionable steps to resolve violations and improve compliance posture

If data is insufficient to evaluate a rule, note this in recommendations rather than flagging a violation.`,
    `{
  "compliance_score": 0.0,
  "violations": [
    { "rule": "string", "severity": "LOW | MEDIUM | HIGH | CRITICAL", "description": "string" }
  ],
  "recommendations": ["string"]
}`,
  );

  return { system, user };
}

// ─── Audit Risk Assessment ──────────────────────────────────────────

export interface AuditEntity {
  entity_type: string;
  entity_id: string;
  name?: string;
  department?: string;
  data: Record<string, unknown>;
  period?: string;
}

export interface AuditPattern {
  pattern_name: string;
  description: string;
  occurrences: number;
  sample_data?: Record<string, unknown>[];
  first_seen?: string;
  last_seen?: string;
}

export interface AuditRiskResponse {
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: { factor: string; impact: number; description: string }[];
}

export function buildAuditRiskPrompt(
  entity: AuditEntity,
  patterns: AuditPattern[],
): { system: string; user: string } {
  const system = buildSystemPrompt(
    'internal audit risk assessor',
    'Assess audit risk for business entities by analyzing behavioral patterns, anomalies, and control weaknesses. ' +
      'Identify material risk factors that warrant deeper investigation. ' +
      'Consider segregation of duties, approval workflows, documentation completeness, and pattern consistency. ' +
      'Risk assessment is advisory — all findings require human auditor review and validation.',
  );

  const user = wrapJsonPrompt(
    `Assess the audit risk for the following entity based on observed patterns.

## Entity Under Audit
- Type: ${entity.entity_type}
- ID: ${entity.entity_id}
${entity.name ? `- Name: ${entity.name}` : ''}
${entity.department ? `- Department: ${entity.department}` : ''}
${entity.period ? `- Period: ${entity.period}` : ''}

### Entity Data
${JSON.stringify(entity.data, null, 2)}

## Observed Patterns (${patterns.length} patterns)
${JSON.stringify(patterns, null, 2)}

Evaluate the following risk dimensions:
- Control effectiveness: Are approval workflows and segregation of duties maintained?
- Pattern anomalies: Do observed patterns deviate from expected business norms?
- Frequency analysis: Are there unusual spikes or gaps in activity?
- Documentation gaps: Is supporting documentation complete and consistent?
- Threshold breaches: Are there transactions near approval thresholds (potential structuring)?
- Temporal patterns: Unusual timing such as end-of-period clustering or after-hours activity
- Counterparty concentration: Over-reliance on specific vendors or customers
- Override frequency: Excessive use of manual overrides or exceptions

Provide:
- risk_score: From 0.0 (minimal risk) to 1.0 (critical risk requiring immediate attention)
- risk_level: LOW (0-0.25), MEDIUM (0.25-0.5), HIGH (0.5-0.75), CRITICAL (0.75-1.0)
- factors: Key risk factors with impact weight (0.0-1.0) and detailed description

All findings are advisory and require human auditor validation.`,
    `{
  "risk_score": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH | CRITICAL",
  "factors": [
    { "factor": "string", "impact": 0.0, "description": "string" }
  ]
}`,
  );

  return { system, user };
}

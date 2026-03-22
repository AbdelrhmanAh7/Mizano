/**
 * HR & Workforce prompt builders for Ollama-powered AI services.
 *
 * Covers: attrition risk, compensation benchmarking, skills gap analysis,
 * workforce scheduling, quality prediction, predictive maintenance,
 * resource allocation, and route optimisation.
 */

import { buildSystemPrompt, wrapJsonPrompt } from './base.prompts';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const HR_SYSTEM_PROMPT = buildSystemPrompt(
  'Human Resources, workforce management, and operational planning',
);

// ---------------------------------------------------------------------------
// 1. Attrition / Employee-Turnover Risk
// ---------------------------------------------------------------------------

const ATTRITION_SCHEMA = `{
  "risk_score": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH | CRITICAL",
  "factors": [
    { "factor": "string", "impact": 0.0, "description": "string" }
  ],
  "recommendation": "string"
}`;

export function buildAttritionPrompt(
  employee: Record<string, unknown>,
  patterns: Record<string, unknown>,
): string {
  const context = [
    'EMPLOYEE DATA:',
    JSON.stringify(employee, null, 2),
    '',
    'HISTORICAL ATTRITION PATTERNS:',
    JSON.stringify(patterns, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Assess the attrition risk for this employee based on their profile and historical turnover patterns. ' +
      'Return a risk score (0-1), risk level, contributing factors with impact weights (0-1), and an actionable recommendation. ' +
      'Support Arabic (عربي) and English employee data.',
    context,
    ATTRITION_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 2. Compensation Benchmarking
// ---------------------------------------------------------------------------

const COMPENSATION_SCHEMA = `{
  "assessment": "UNDERPAID | FAIR | OVERPAID",
  "gap_percent": 0.0,
  "recommendations": ["string"]
}`;

export function buildCompensationPrompt(
  employee: Record<string, unknown>,
  benchmarks: Record<string, unknown>,
): string {
  const context = [
    'EMPLOYEE COMPENSATION DATA:',
    JSON.stringify(employee, null, 2),
    '',
    'MARKET BENCHMARKS:',
    JSON.stringify(benchmarks, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    "Compare this employee's compensation against market benchmarks. " +
      'Return an assessment (UNDERPAID / FAIR / OVERPAID), the percentage gap from the market median, ' +
      'and concrete recommendations to align compensation. ' +
      'Support Arabic (عربي) and English data.',
    context,
    COMPENSATION_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 3. Skills Gap Analysis
// ---------------------------------------------------------------------------

const SKILLS_GAP_SCHEMA = `{
  "gaps": [
    { "skill": "string", "current_level": 0, "required_level": 0 }
  ],
  "match_score": 0.0,
  "training_recommendations": ["string"]
}`;

export function buildSkillsGapPrompt(
  employee: Record<string, unknown>,
  roleRequirements: Record<string, unknown>,
): string {
  const context = [
    'EMPLOYEE SKILLS PROFILE:',
    JSON.stringify(employee, null, 2),
    '',
    'ROLE REQUIREMENTS:',
    JSON.stringify(roleRequirements, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    "Analyse the gap between this employee's current skills and the role requirements. " +
      'Return each skill gap with current vs required level (1-10 scale), an overall match score (0-1), ' +
      'and prioritised training recommendations. ' +
      'Support Arabic (عربي) and English skill names.',
    context,
    SKILLS_GAP_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 4. Workforce Scheduling
// ---------------------------------------------------------------------------

const SCHEDULING_SCHEMA = `{
  "suggestions": [
    { "day": "string", "action": "string", "reason": "string" }
  ],
  "overtime_analysis": [
    { "employee": "string", "hours": 0, "recommendation": "string" }
  ]
}`;

export function buildSchedulingPrompt(
  attendance: Record<string, unknown>,
  staffing: Record<string, unknown>,
): string {
  const context = [
    'ATTENDANCE DATA:',
    JSON.stringify(attendance, null, 2),
    '',
    'STAFFING REQUIREMENTS:',
    JSON.stringify(staffing, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Optimise the workforce schedule based on attendance history and staffing needs. ' +
      'Return day-level scheduling suggestions with reasons, and an overtime analysis per employee ' +
      'with hours worked and recommendations to reduce excess overtime. ' +
      'Support Arabic (عربي) and English data.',
    context,
    SCHEDULING_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 5. Quality Prediction
// ---------------------------------------------------------------------------

const QUALITY_SCHEMA = `{
  "prediction": 0.0,
  "factors": [
    { "factor": "string", "impact": 0.0 }
  ],
  "improvements": ["string"]
}`;

export function buildQualityPrompt(
  metrics: Record<string, unknown>,
  history: Record<string, unknown>,
): string {
  const context = [
    'CURRENT QUALITY METRICS:',
    JSON.stringify(metrics, null, 2),
    '',
    'HISTORICAL QUALITY DATA:',
    JSON.stringify(history, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Predict the quality score (0-100) for the upcoming period based on current metrics and historical trends. ' +
      'Return the predicted score, contributing factors with impact weights (-1 to 1, negative = degrades quality), ' +
      'and actionable improvement suggestions. ' +
      'Support Arabic (عربي) and English data.',
    context,
    QUALITY_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 6. Predictive Maintenance
// ---------------------------------------------------------------------------

const MAINTENANCE_SCHEMA = `{
  "prediction": {
    "failure_probability": 0.0,
    "estimated_date": "YYYY-MM-DD or null"
  },
  "urgency": "LOW | MEDIUM | HIGH | CRITICAL",
  "schedule": ["string"]
}`;

export function buildMaintenancePrompt(
  equipment: Record<string, unknown>,
  history: Record<string, unknown>,
): string {
  const context = [
    'EQUIPMENT DATA:',
    JSON.stringify(equipment, null, 2),
    '',
    'MAINTENANCE HISTORY:',
    JSON.stringify(history, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Predict the likelihood and timing of equipment failure based on current status and maintenance history. ' +
      'Return failure probability (0-1), estimated failure date (ISO 8601 or null), urgency level, ' +
      'and a recommended maintenance schedule. ' +
      'Support Arabic (عربي) and English data.',
    context,
    MAINTENANCE_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 7. Resource Allocation
// ---------------------------------------------------------------------------

const RESOURCE_SCHEMA = `{
  "allocation": [
    { "resource": "string", "utilization": 0.0, "recommendation": "string" }
  ],
  "utilization_score": 0.0,
  "recommendations": ["string"]
}`;

export function buildResourcePrompt(
  resources: Record<string, unknown>,
  demand: Record<string, unknown>,
): string {
  const context = [
    'AVAILABLE RESOURCES:',
    JSON.stringify(resources, null, 2),
    '',
    'DEMAND FORECAST:',
    JSON.stringify(demand, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Optimise resource allocation by matching available resources to forecasted demand. ' +
      'Return per-resource utilization (0-1) with recommendations, an overall utilization score (0-1), ' +
      'and strategic recommendations to improve efficiency. ' +
      'Support Arabic (عربي) and English data.',
    context,
    RESOURCE_SCHEMA,
  );
}

// ---------------------------------------------------------------------------
// 8. Route Optimisation
// ---------------------------------------------------------------------------

const ROUTE_SCHEMA = `{
  "optimized_route": ["string"],
  "savings": {
    "distance_percent": 0.0,
    "time_percent": 0.0
  },
  "reasoning": "string"
}`;

export function buildRoutePrompt(
  locations: Record<string, unknown>,
  constraints: Record<string, unknown>,
): string {
  const context = [
    'LOCATIONS:',
    JSON.stringify(locations, null, 2),
    '',
    'CONSTRAINTS:',
    JSON.stringify(constraints, null, 2),
  ].join('\n');

  return wrapJsonPrompt(
    'Determine the optimal delivery/visit route for the given locations under the specified constraints. ' +
      'Return the ordered list of location identifiers, estimated savings in distance and time as percentages, ' +
      'and a brief reasoning for the chosen route. ' +
      'Support Arabic (عربي) and English location names.',
    context,
    ROUTE_SCHEMA,
  );
}

/**
 * Shared prompt utilities used across all Ollama-powered AI services.
 */

/** Common rules appended to every prompt. */
export const COMMON_RULES = [
  'Return ONLY valid JSON. No markdown, no explanations, no code fences.',
  'Support both Arabic (عربي) and English text.',
  'Use null for any field you cannot determine — never guess.',
  'All monetary values must be numbers with up to 4 decimal places.',
  'Dates must use ISO 8601 format (YYYY-MM-DD).',
].join('\n');

/**
 * Wrap a task-specific prompt body into a standard JSON-output envelope.
 *
 * Overloads:
 *  - (task, context, jsonSchema) — separate task description, input data, and schema
 *  - (body, jsonSchema)          — combined task+context body with schema
 */
export function wrapJsonPrompt(body: string, jsonSchema: string): string;
export function wrapJsonPrompt(task: string, context: string, jsonSchema: string): string;
export function wrapJsonPrompt(
  taskOrBody: string,
  contextOrSchema: string,
  jsonSchema?: string,
): string {
  if (jsonSchema === undefined) {
    // 2-arg form: body + schema
    return [
      taskOrBody,
      '',
      'RULES:',
      COMMON_RULES,
      '',
      'EXPECTED JSON OUTPUT SCHEMA:',
      contextOrSchema,
      '',
      'Respond with ONLY the JSON object, nothing else.',
    ].join('\n');
  }
  // 3-arg form: task + context + schema
  return [
    `TASK: ${taskOrBody}`,
    '',
    'RULES:',
    COMMON_RULES,
    '',
    'INPUT:',
    contextOrSchema,
    '',
    'EXPECTED JSON OUTPUT SCHEMA:',
    jsonSchema,
    '',
    'Respond with ONLY the JSON object, nothing else.',
  ].join('\n');
}

/**
 * Build a system prompt for a specific domain.
 *
 * @param domain  – short domain label (e.g. "financial forecast analyst")
 * @param details – optional extended description of capabilities and constraints
 */
export function buildSystemPrompt(domain: string, details?: string): string {
  const base = `You are an AI assistant specializing in ${domain} for a business ERP system. You analyze data and return structured JSON responses. You support both Arabic and English. Be precise and factual. Never fabricate data.`;
  return details ? `${base}\n\n${details}` : base;
}

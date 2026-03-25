/**
 * Shared prompt utilities used across all Ollama-powered AI services.
 *
 * Optimized for small models (3B–7B): shorter rules, concise format.
 */

/** Common rules appended to every prompt. */
export const COMMON_RULES = [
  'Return ONLY valid JSON. No markdown, no explanations, no code fences.',
  'Support both Arabic and English text.',
  'Use null for unknown fields. Never guess.',
  'Numbers: up to 4 decimal places. Dates: YYYY-MM-DD.',
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
      'Respond with ONLY valid JSON.',
      taskOrBody,
      '',
      'RULES:',
      COMMON_RULES,
      '',
      'Return a JSON object matching this schema:',
      contextOrSchema,
    ].join('\n');
  }
  // 3-arg form: task + context + schema
  return [
    '/no_think',
    `TASK: ${taskOrBody}`,
    '',
    'RULES:',
    COMMON_RULES,
    '',
    'INPUT:',
    contextOrSchema,
    '',
    'Return a JSON object matching this schema:',
    jsonSchema,
  ].join('\n');
}

/**
 * Build a system prompt for a specific domain.
 *
 * @param domain  – short domain label (e.g. "financial forecast analyst")
 * @param details – optional extended description of capabilities and constraints
 */
export function buildSystemPrompt(domain: string, details?: string): string {
  const base = `You are an AI assistant for ${domain} in a business ERP. Return structured JSON. Support Arabic and English. Be precise. Never fabricate data.`;
  return details ? `${base}\n\n${details}` : base;
}

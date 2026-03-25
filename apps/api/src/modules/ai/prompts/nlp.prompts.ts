/**
 * Prompt builders for the 7 NLP services powered by Ollama.
 *
 * Optimized for small models (3B–7B) on CPU:
 *  - Concrete few-shot examples instead of abstract schemas
 *  - Shorter prompts (fewer tokens = faster inference)
 *  - /no_think directive via wrapJsonPrompt
 */

import { wrapJsonPrompt, buildSystemPrompt } from './base.prompts';

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

const CHATBOT_INTENTS = [
  'invoice_status',
  'payment_reminder',
  'account_balance',
  'create_invoice',
  'report_request',
  'help',
  'greeting',
  'unknown',
] as const;

const DOCUMENT_CATEGORIES = [
  'INVOICE',
  'RECEIPT',
  'PURCHASE_ORDER',
  'CONTRACT',
  'TAX_DOCUMENT',
  'BANK_STATEMENT',
  'PAYSLIP',
  'OTHER',
] as const;

const VOICE_ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE'] as const;

/* ------------------------------------------------------------------ */
/*  1. Chatbot / Conversational Assistant                             */
/* ------------------------------------------------------------------ */

export interface ChatbotHistory {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrgContext {
  name?: string;
  currency?: string;
  locale?: string;
  [key: string]: unknown;
}

export function buildChatbotPrompt(
  message: string,
  history: ChatbotHistory[],
  orgContext: OrgContext,
): string {
  const systemPrompt = buildSystemPrompt('conversational business assistance');

  const conversationBlock = history.length
    ? history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
    : '(no prior conversation)';

  const context = [
    systemPrompt,
    '',
    'ORG:',
    JSON.stringify(orgContext),
    '',
    'HISTORY:',
    conversationBlock,
    '',
    'USER:',
    message,
  ].join('\n');

  const task = [
    'Detect intent, extract entities, respond helpfully.',
    `Intents: ${CHATBOT_INTENTS.join(', ')}.`,
    'Respond in the same language the user used.',
  ].join(' ');

  const schema = JSON.stringify(
    {
      intent:
        'invoice_status|payment_reminder|account_balance|create_invoice|report_request|help|greeting|unknown',
      entities: {
        customer_name: 'string|null',
        invoice_number: 'string|null',
        amount: 'number|null',
        date: 'YYYY-MM-DD|null',
        currency: 'string|null',
      },
      response: 'natural language answer',
      suggestions: ['follow-up suggestion'],
      confidence: 0.85,
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  2. Named Entity Recognition (NER)                                 */
/* ------------------------------------------------------------------ */

export function buildEntityExtractionPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('named entity recognition');

  const task = 'Extract all named entities from the text. Support Arabic and English.';

  const example = JSON.stringify(
    {
      people: ['Ahmed Al-Rashid', 'محمد علي'],
      organizations: ['Acme Corp', 'شركة الأمل'],
      dates: ['2024-03-15'],
      places: ['Riyadh', 'Dubai'],
      money: [{ amount: 1500.0, currency: 'SAR' }],
      emails: ['info@acme.com'],
      phones: ['+966501234567'],
    },
    null,
    2,
  );

  const context = [systemPrompt, '', 'Example output:', example, '', 'TEXT:', text].join('\n');

  const schema = JSON.stringify(
    {
      people: ['person names'],
      organizations: ['company names'],
      dates: ['YYYY-MM-DD'],
      places: ['locations'],
      money: [{ amount: 0, currency: 'USD' }],
      emails: ['email addresses'],
      phones: ['phone numbers'],
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  3. Sentiment Analysis                                             */
/* ------------------------------------------------------------------ */

export function buildSentimentPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('sentiment analysis');

  const task = [
    'Analyze sentiment. Score from -1 (negative) to 1 (positive).',
    'Comparative = score / word count. List positive and negative words.',
  ].join(' ');

  const context = [systemPrompt, '', 'TEXT:', text].join('\n');

  const schema = JSON.stringify(
    {
      score: 0.6,
      comparative: 0.05,
      sentiment: 'positive|negative|neutral',
      positive_words: ['good', 'excellent'],
      negative_words: ['late'],
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  4. Document Classification                                        */
/* ------------------------------------------------------------------ */

export function buildDocumentClassificationPrompt(text: string, filename?: string): string {
  const systemPrompt = buildSystemPrompt('document classification');

  const task = `Classify the document into exactly one category: ${DOCUMENT_CATEGORIES.join(', ')}. Return the category with confidence and per-category scores (must sum to 1).`;

  const example = JSON.stringify(
    {
      category: 'INVOICE',
      confidence: 0.92,
      scores: {
        INVOICE: 0.92,
        RECEIPT: 0.03,
        PURCHASE_ORDER: 0.02,
        CONTRACT: 0.01,
        TAX_DOCUMENT: 0.01,
        BANK_STATEMENT: 0.0,
        PAYSLIP: 0.0,
        OTHER: 0.01,
      },
    },
    null,
    2,
  );

  const contextParts = [systemPrompt, '', 'Example output:', example, ''];
  if (filename) {
    contextParts.push(`FILENAME: ${filename}`, '');
  }
  contextParts.push('DOCUMENT TEXT:', text);

  const schema = JSON.stringify(
    {
      category: DOCUMENT_CATEGORIES.join('|'),
      confidence: 0.85,
      scores: Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c, 0.0])),
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, contextParts.join('\n'), schema);
}

/* ------------------------------------------------------------------ */
/*  5. Contract / Legal Document Analysis                             */
/* ------------------------------------------------------------------ */

export function buildContractAnalysisPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('contract and legal document analysis');

  const task = [
    'Analyze the contract. Extract parties, dates, key clauses with risk levels, and risks with severity.',
    'Provide a 2-4 sentence summary in the document language.',
  ].join(' ');

  const context = [systemPrompt, '', 'CONTRACT TEXT:', text].join('\n');

  const schema = JSON.stringify(
    {
      parties: [{ name: 'Company A', role: 'seller' }],
      dates: [{ label: 'effective_date', value: '2024-01-01' }],
      clauses: [{ type: 'payment_terms', text: 'Net 30 days', risk_level: 'low' }],
      risks: [
        { description: 'No liability cap', severity: 'high', recommendation: 'Add cap clause' },
      ],
      summary: '2-4 sentence summary',
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  6. Knowledge / Business Assistant                                 */
/* ------------------------------------------------------------------ */

export function buildKnowledgeAssistantPrompt(query: string, context: string): string {
  const systemPrompt = buildSystemPrompt('business knowledge advisory');

  const task = [
    'Answer the query using ONLY the provided context.',
    'If insufficient info, say so and set confidence below 0.3.',
    'Respond in the same language as the query.',
  ].join(' ');

  const combinedContext = [systemPrompt, '', 'CONTEXT:', context, '', 'QUERY:', query].join('\n');

  const schema = JSON.stringify(
    {
      answer: 'comprehensive answer',
      sources: ['reference to context section used'],
      confidence: 0.85,
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, combinedContext, schema);
}

/* ------------------------------------------------------------------ */
/*  7. Voice Command Parser                                           */
/* ------------------------------------------------------------------ */

export function buildVoiceCommandPrompt(transcript: string): string {
  const systemPrompt = buildSystemPrompt('voice command parsing for ERP');

  const task = [
    `Parse the voice command into a structured action: ${VOICE_ACTIONS.join(', ')}.`,
    'Identify target entity and extract parameters.',
    'Map Arabic commands to English action/entity names.',
  ].join(' ');

  const example = JSON.stringify(
    {
      action: 'CREATE',
      entity: 'invoice',
      parameters: { customer_name: 'Acme Corp', amount: 5000, currency: 'SAR' },
      confidence: 0.9,
    },
    null,
    2,
  );

  const context = [
    systemPrompt,
    '',
    'Example output:',
    example,
    '',
    'TRANSCRIPT:',
    transcript,
  ].join('\n');

  const schema = JSON.stringify(
    {
      action: 'CREATE|READ|UPDATE|DELETE',
      entity: 'target entity (lowercase)',
      parameters: {},
      confidence: 0.85,
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

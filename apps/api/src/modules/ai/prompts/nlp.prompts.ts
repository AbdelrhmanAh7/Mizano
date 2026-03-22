/**
 * Prompt builders for the 7 NLP services powered by Ollama.
 *
 * Each function returns a fully-formed prompt string that instructs the LLM
 * to return structured JSON.  All prompts support Arabic and English input
 * via the shared COMMON_RULES in base.prompts.ts.
 */

import { wrapJsonPrompt, buildSystemPrompt } from './base.prompts';

/* ------------------------------------------------------------------ */
/*  Shared JSON-schema snippets (kept close to the consumers)         */
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

/**
 * Build a prompt for the conversational chatbot.
 *
 * The model is asked to detect the user's intent, extract relevant entities,
 * generate a natural-language response, and suggest follow-up actions.
 */
export function buildChatbotPrompt(
  message: string,
  history: ChatbotHistory[],
  orgContext: OrgContext,
): string {
  const systemPrompt = buildSystemPrompt('conversational business assistance and accounting');

  const conversationBlock = history.length
    ? history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
    : '(no prior conversation)';

  const context = [
    systemPrompt,
    '',
    'ORGANIZATION CONTEXT:',
    JSON.stringify(orgContext, null, 2),
    '',
    'CONVERSATION HISTORY:',
    conversationBlock,
    '',
    'CURRENT USER MESSAGE:',
    message,
  ].join('\n');

  const task = [
    'Analyze the user message within the conversation context.',
    'Detect the user intent, extract entities, generate a helpful response, and suggest follow-up actions.',
    `Allowed intents: ${CHATBOT_INTENTS.join(', ')}.`,
    'The response field must be in the same language the user used (Arabic or English).',
    'Provide 1-3 short suggestion strings the user can click to continue the conversation.',
  ].join(' ');

  const schema = JSON.stringify(
    {
      intent: 'one of: ' + CHATBOT_INTENTS.join(' | '),
      entities: {
        customer_name: 'string | null',
        invoice_number: 'string | null',
        amount: 'number | null',
        date: 'string (ISO 8601) | null',
        currency: 'string | null',
        report_type: 'string | null',
      },
      response: 'string — natural-language answer',
      suggestions: ['string — follow-up suggestion'],
      confidence: 'number 0-1',
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  2. Named Entity Recognition (NER)                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for extracting named entities from arbitrary text.
 */
export function buildEntityExtractionPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('named entity recognition (NER)');

  const task = [
    'Extract all named entities from the input text.',
    'Identify people, organizations, dates, places, monetary amounts, emails, and phone numbers.',
    'Return every occurrence — do not deduplicate.',
    'For monetary amounts, always separate the numeric value and the currency code.',
    'Handle both Arabic and English text seamlessly.',
  ].join(' ');

  const context = [systemPrompt, '', 'TEXT TO ANALYZE:', text].join('\n');

  const schema = JSON.stringify(
    {
      people: ['string — person names'],
      organizations: ['string — company / org names'],
      dates: ['string — ISO 8601 dates'],
      places: ['string — locations / addresses'],
      money: [{ amount: 'number', currency: 'string (ISO 4217 code)' }],
      emails: ['string — email addresses'],
      phones: ['string — phone numbers'],
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  3. Sentiment Analysis                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for sentiment analysis of the given text.
 */
export function buildSentimentPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('sentiment analysis');

  const task = [
    'Perform sentiment analysis on the input text.',
    'Return an overall sentiment score from -1 (most negative) to 1 (most positive), rounded to 2 decimal places.',
    'The comparative score is the sentiment score normalized by word count (score / total words), rounded to 4 decimal places.',
    'Classify the overall sentiment as "positive", "negative", or "neutral".',
    'List individual positive and negative words/phrases found in the text.',
    'Handle both Arabic and English text. Translate sentiment-bearing Arabic words when listing them.',
  ].join(' ');

  const context = [systemPrompt, '', 'TEXT TO ANALYZE:', text].join('\n');

  const schema = JSON.stringify(
    {
      score: 'number — overall sentiment from -1 to 1',
      comparative: 'number — score / total words',
      sentiment: '"positive" | "negative" | "neutral"',
      positive_words: ['string'],
      negative_words: ['string'],
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  4. Document Classification                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for classifying a document into one of the predefined categories.
 */
export function buildDocumentClassificationPrompt(text: string, filename?: string): string {
  const systemPrompt = buildSystemPrompt('document classification');

  const task = [
    'Classify the document into exactly one of the following categories:',
    DOCUMENT_CATEGORIES.join(', ') + '.',
    'Analyze the text content and, if provided, the filename for classification clues.',
    'Return the single best category, a confidence score (0-1), and a scores object mapping every category to its probability (all scores must sum to 1).',
    'Handle both Arabic and English documents.',
  ].join(' ');

  const contextParts = [systemPrompt, ''];
  if (filename) {
    contextParts.push(`FILENAME: ${filename}`, '');
  }
  contextParts.push('DOCUMENT TEXT:', text);

  const schema = JSON.stringify(
    {
      category: 'one of: ' + DOCUMENT_CATEGORIES.join(' | '),
      confidence: 'number 0-1',
      scores: Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c, 'number 0-1'])),
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, contextParts.join('\n'), schema);
}

/* ------------------------------------------------------------------ */
/*  5. Contract / Legal Document Analysis                             */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for analyzing a contract or legal document.
 */
export function buildContractAnalysisPrompt(text: string): string {
  const systemPrompt = buildSystemPrompt('contract and legal document analysis');

  const task = [
    'Analyze the contract / legal document and extract structured information.',
    'Identify all parties involved and their roles (e.g., buyer, seller, landlord, tenant).',
    'Extract all significant dates with descriptive labels (e.g., "effective_date", "expiry_date", "renewal_date").',
    'Identify key clauses and classify their type (e.g., "termination", "liability", "confidentiality", "payment_terms", "indemnification", "governing_law").',
    'Assess each clause\'s risk level as "low", "medium", or "high".',
    'List potential risks with a severity of "low", "medium", "high", or "critical" and a recommended action.',
    'Provide a concise summary of the contract (2-4 sentences) in the same language as the document.',
    'Handle both Arabic and English contracts.',
  ].join(' ');

  const context = [systemPrompt, '', 'CONTRACT TEXT:', text].join('\n');

  const schema = JSON.stringify(
    {
      parties: [{ name: 'string', role: 'string' }],
      dates: [{ label: 'string', value: 'string (ISO 8601)' }],
      clauses: [
        {
          type: 'string — clause category',
          text: 'string — key excerpt from clause',
          risk_level: '"low" | "medium" | "high"',
        },
      ],
      risks: [
        {
          description: 'string',
          severity: '"low" | "medium" | "high" | "critical"',
          recommendation: 'string',
        },
      ],
      summary: 'string — 2-4 sentence summary',
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

/* ------------------------------------------------------------------ */
/*  6. Knowledge / Business Assistant                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for answering a user query using provided business context.
 */
export function buildKnowledgeAssistantPrompt(query: string, context: string): string {
  const systemPrompt = buildSystemPrompt('business knowledge and accounting advisory');

  const task = [
    'Answer the user query based ONLY on the provided business context.',
    'If the context does not contain enough information, say so clearly and set confidence below 0.3.',
    'Never fabricate information. Cite which parts of the context support your answer.',
    'Return a list of source references (brief descriptions of the context sections used).',
    'Respond in the same language the user used for their query (Arabic or English).',
  ].join(' ');

  const combinedContext = [
    systemPrompt,
    '',
    'BUSINESS CONTEXT:',
    context,
    '',
    'USER QUERY:',
    query,
  ].join('\n');

  const schema = JSON.stringify(
    {
      answer: 'string — comprehensive answer to the query',
      sources: ['string — brief reference to context section used'],
      confidence: 'number 0-1',
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, combinedContext, schema);
}

/* ------------------------------------------------------------------ */
/*  7. Voice Command Parser                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a prompt for parsing a voice-command transcript into a structured action.
 */
export function buildVoiceCommandPrompt(transcript: string): string {
  const systemPrompt = buildSystemPrompt('voice command parsing for business ERP operations');

  const task = [
    'Parse the voice command transcript into a structured action.',
    `Determine the CRUD action: ${VOICE_ACTIONS.join(', ')}.`,
    'Identify the target entity (e.g., "invoice", "customer", "payment", "report", "bill", "expense").',
    'Extract all relevant parameters such as customer name, amount, date, invoice number, item descriptions, etc.',
    'If the transcript is ambiguous, pick the most likely interpretation and reflect uncertainty in the confidence score.',
    'Handle both Arabic and English voice transcripts. Arabic commands should be mapped to the same English action/entity names.',
  ].join(' ');

  const context = [systemPrompt, '', 'VOICE TRANSCRIPT:', transcript].join('\n');

  const schema = JSON.stringify(
    {
      action: 'one of: ' + VOICE_ACTIONS.join(' | '),
      entity: 'string — target business entity (lowercase)',
      parameters: {
        '(dynamic keys)': 'Values extracted from transcript — strings, numbers, or nested objects',
      },
      confidence: 'number 0-1',
    },
    null,
    2,
  );

  return wrapJsonPrompt(task, context, schema);
}

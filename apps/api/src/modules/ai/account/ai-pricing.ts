import Decimal from 'decimal.js';
import { AiPart, AiProviderId } from '../providers/ai-provider';

/**
 * USD per 1M tokens [input, output], matched by model family so newer versions of a family are
 * priced like it. First match wins. Unknown models use a deliberately high price so the monthly
 * limit fails safe; a price the provider published (OpenRouter) wins over this table.
 */
const PRICES: Array<[RegExp, string, string]> = [
  [/gpt-5(?:\.\d+)?-nano/, '0.05', '0.4'],
  [/gpt-5(?:\.\d+)?-mini/, '0.25', '2'],
  [/gpt-[56](?:\.\d+)?-pro/, '15', '120'],
  [/gpt-5/, '1.25', '10'],
  [/gpt-4o-mini/, '0.15', '0.6'],
  [/gpt-4\.1-nano/, '0.1', '0.4'],
  [/gpt-4\.1-mini/, '0.4', '1.6'],
  [/gpt-4\.1/, '2', '8'],
  [/gpt-4o/, '2.5', '10'],
  [/\bo\d-mini/, '1.1', '4.4'],
  [/haiku/, '1', '5'],
  [/sonnet/, '3', '15'],
  [/opus/, '15', '75'],
  [/gemini.*flash-lite/, '0.1', '0.4'],
  [/gemini.*flash/, '0.5', '3'],
  [/gemini.*pro/, '2', '12'],
];
const FALLBACK: [string, string] = ['15', '75'];

/** Tokens a part costs before the provider tells us: text by length, images and pages flat. */
const IMAGE_TOKENS = 1600;
const PDF_TOKENS = 6000;
const CHARS_PER_TOKEN = 2.5; // Arabic tokenizes worse than English: stay on the high side

export function estimateInputTokens(system: string, parts: AiPart[]): number {
  let tokens = Math.ceil(system.length / CHARS_PER_TOKEN) + 50;
  for (const part of parts) {
    if (part.type === 'text') tokens += Math.ceil(part.text.length / CHARS_PER_TOKEN);
    else tokens += part.type === 'image' ? IMAGE_TOKENS : PDF_TOKENS;
  }
  return tokens;
}

export type StoredPrice = [Decimal.Value, Decimal.Value] | null;

export function pricePerMtok(
  provider: AiProviderId,
  model: string,
  stored: StoredPrice,
): [Decimal, Decimal] {
  if (provider === 'ollama' || model.endsWith(':free')) return [new Decimal(0), new Decimal(0)];
  if (stored) return [new Decimal(stored[0]), new Decimal(stored[1])];
  const id = model.toLowerCase();
  const hit = PRICES.find(([re]) => re.test(id));
  return hit
    ? [new Decimal(hit[1]), new Decimal(hit[2])]
    : [new Decimal(FALLBACK[0]), new Decimal(FALLBACK[1])];
}

/** USD for a call, 6 decimals. */
export function costUsd(
  provider: AiProviderId,
  model: string,
  stored: StoredPrice,
  inputTokens: number,
  outputTokens: number,
): Decimal {
  const [input, output] = pricePerMtok(provider, model, stored);
  return input
    .times(inputTokens)
    .plus(output.times(outputTokens))
    .dividedBy(1_000_000)
    .toDecimalPlaces(6, Decimal.ROUND_UP);
}

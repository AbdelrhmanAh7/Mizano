import {
  AiCompletion,
  AiCredential,
  AiModelInfo,
  AiProviderAdapter,
  AiProviderError,
  AiRequest,
  FetchLike,
} from './ai-provider';
import { asArray, asCount, asRecord, asString, requestJson } from './provider-http';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EXCLUDE =
  /(embedding|image|tts|live|audio|aqa|robotics|computer-use|gemma|learnlm|imagen|veo)/;
/** The model id becomes a path segment: letters, digits, dots and dashes only. */
const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,95}$/i;

/** Google Gemini `generateContent` with the organization's own key. */
export class GeminiProvider implements AiProviderAdapter {
  readonly id = 'gemini' as const;
  readonly acceptsImages = true;
  readonly acceptsPdf = true;

  constructor(private readonly fetchFn: FetchLike) {}

  async listModels(credential: AiCredential, signal: AbortSignal): Promise<AiModelInfo[]> {
    const body = await requestJson(
      this.fetchFn,
      `${BASE}/models?pageSize=1000`,
      { method: 'GET', headers: { 'x-goog-api-key': credential.apiKey ?? '' } },
      signal,
    );
    return asArray(asRecord(body).models)
      .filter((m) => Array.isArray(m.supportedGenerationMethods))
      .filter((m) => (m.supportedGenerationMethods as unknown[]).includes('generateContent'))
      .map((m) => {
        const id = (asString(m.name) ?? '').replace(/^models\//, '');
        return { id, name: asString(m.displayName) ?? id };
      })
      .filter((m) => m.id.startsWith('gemini') && !EXCLUDE.test(m.id) && MODEL_ID.test(m.id));
  }

  async complete(
    credential: AiCredential,
    model: string,
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<AiCompletion> {
    if (!MODEL_ID.test(model)) throw new AiProviderError('model_unavailable');
    const parts = request.parts.map((part) =>
      part.type === 'text'
        ? { text: part.text }
        : {
            inline_data: {
              mime_type: part.type === 'image' ? part.mimeType : 'application/pdf',
              data: part.data.toString('base64'),
            },
          },
    );
    const body = asRecord(
      await requestJson(
        this.fetchFn,
        `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': credential.apiKey ?? '' },
          body: {
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              maxOutputTokens: request.maxOutputTokens,
              ...(request.json ? { responseMimeType: 'application/json' } : {}),
            },
          },
        },
        signal,
      ),
    );
    const usage = asRecord(body.usageMetadata);
    const candidates = asCount(usage.candidatesTokenCount);
    const thoughts = asCount(usage.thoughtsTokenCount) ?? 0;
    return {
      text: asArray(asRecord(asArray(body.candidates)[0]?.content).parts)
        .map((p) => asString(p.text) ?? '')
        .join(''),
      inputTokens: asCount(usage.promptTokenCount),
      // Thinking tokens are billed as output.
      outputTokens: candidates === null ? null : candidates + thoughts,
      reportedCostUsd: null,
    };
  }
}

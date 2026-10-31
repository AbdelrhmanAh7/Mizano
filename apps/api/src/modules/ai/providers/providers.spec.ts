import { AiProviderError, AiRequest, FetchLike } from './ai-provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider, ollamaBaseUrl } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { classifyFailure, requestJson } from './provider-http';

/** A fake fetch that records every request and answers from a queue; no network. */
function fakeFetch(...answers: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : {} });
    const next = answers.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fn, calls };
}

const signal = new AbortController().signal;
const png = Buffer.from('png-bytes');
const pdf = Buffer.from('%PDF-1.7');
const request: AiRequest = {
  system: 'Read the bill. JSON only.',
  parts: [
    { type: 'text', text: 'Read the attached document.' },
    { type: 'image', mimeType: 'image/png', data: png },
  ],
  maxOutputTokens: 900,
  json: true,
};

describe('AI provider adapters (fake fetch)', () => {
  it('anthropic: Messages API on its fixed host, key header, base64 image, usage parsed', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage: { input_tokens: 12, output_tokens: 3 },
      },
    });
    const out = await new AnthropicProvider(fn).complete(
      { apiKey: 'sk-ant-k' },
      'claude-haiku-4-5',
      request,
      signal,
    );

    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].init.redirect).toBe('manual');
    expect(calls[0].init.headers).toMatchObject({
      'x-api-key': 'sk-ant-k',
      'anthropic-version': '2023-06-01',
    });
    expect(calls[0].body).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 900,
      system: request.system,
    });
    expect(calls[0].body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read the attached document.' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') },
          },
        ],
      },
    ]);
    expect(out).toEqual({
      text: '{"ok":true}',
      inputTokens: 12,
      outputTokens: 3,
      reportedCostUsd: null,
    });
  });

  it('anthropic: a PDF becomes a document block', async () => {
    const { fn, calls } = fakeFetch({ body: { content: [] } });
    await new AnthropicProvider(fn).complete(
      { apiKey: 'k' },
      'claude-haiku-4-5',
      { ...request, parts: [{ type: 'pdf', data: pdf }] },
      signal,
    );
    expect((calls[0].body.messages as Array<{ content: unknown[] }>)[0].content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
    });
  });

  it('openai: chat completions with bearer key, JSON mode and a data-URL image', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 40, completion_tokens: 5 },
      },
    });
    const out = await new OpenAiCompatibleProvider('openai', fn).complete(
      { apiKey: 'sk-o' },
      'gpt-5-mini',
      request,
      signal,
    );

    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0].init.headers).toMatchObject({ authorization: 'Bearer sk-o' });
    expect(calls[0].body).toMatchObject({
      model: 'gpt-5-mini',
      max_completion_tokens: 900,
      response_format: { type: 'json_object' },
    });
    const messages = calls[0].body.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({ role: 'system', content: request.system });
    expect((messages[1].content as unknown[])[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
    });
    expect(out.inputTokens).toBe(40);
  });

  it('openrouter: proves the key before the public model list, prices per 1M tokens, reported cost', async () => {
    const { fn, calls } = fakeFetch(
      { body: { data: { label: 'k' } } },
      {
        body: {
          data: [
            {
              id: 'google/gemini-2.5-flash',
              name: 'Flash',
              pricing: { prompt: '0.0000003', completion: '0.0000025' },
            },
          ],
        },
      },
      {
        body: {
          choices: [{ message: { content: '{}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.00042 },
        },
      },
    );
    const provider = new OpenAiCompatibleProvider('openrouter', fn);
    const models = await provider.listModels({ apiKey: 'sk-or-k' }, signal);
    const out = await provider.complete(
      { apiKey: 'sk-or-k' },
      'google/gemini-2.5-flash',
      request,
      signal,
    );

    expect(calls.map((c) => c.url)).toEqual([
      'https://openrouter.ai/api/v1/key',
      'https://openrouter.ai/api/v1/models',
      'https://openrouter.ai/api/v1/chat/completions',
    ]);
    expect(calls[0].init.headers).toMatchObject({ authorization: 'Bearer sk-or-k' });
    expect(calls[1].init.headers).toEqual({});
    expect(models).toEqual([
      { id: 'google/gemini-2.5-flash', name: 'Flash', pricePerMtok: ['0.3', '2.5'] },
    ]);
    expect(calls[2].body).toMatchObject({ max_tokens: 900, usage: { include: true } });
    expect(out.reportedCostUsd).toBe('0.00042');
  });

  it('gemini: generateContent on the fixed host, inline data, thinking tokens billed as output', async () => {
    const { fn, calls } = fakeFetch({
      body: {
        candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
      },
    });
    const out = await new GeminiProvider(fn).complete(
      { apiKey: 'AIza-k' },
      'gemini-2.5-flash',
      request,
      signal,
    );

    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(calls[0].init.headers).toMatchObject({ 'x-goog-api-key': 'AIza-k' });
    expect(calls[0].body).toMatchObject({
      systemInstruction: { parts: [{ text: request.system }] },
      generationConfig: { maxOutputTokens: 900, responseMimeType: 'application/json' },
    });
    expect((calls[0].body.contents as Array<{ parts: unknown[] }>)[0].parts[1]).toEqual({
      inline_data: { mime_type: 'image/png', data: png.toString('base64') },
    });
    expect(out).toMatchObject({ text: '{"a":1}', inputTokens: 30, outputTokens: 15 });
  });

  it('gemini: a model id that is not a plain path segment is refused without a request', async () => {
    const { fn, calls } = fakeFetch();
    await expect(
      new GeminiProvider(fn).complete({ apiKey: 'k' }, '../../evil', request, signal),
    ).rejects.toBeInstanceOf(AiProviderError);
    expect(calls).toHaveLength(0);
  });

  it('ollama: only an operator URL without credentials, query or fragment; images, JSON format', async () => {
    expect(ollamaBaseUrl('http://pi.local:11434/')).toBe('http://pi.local:11434');
    expect(ollamaBaseUrl('http://user:pw@pi.local:11434')).toBeNull();
    expect(ollamaBaseUrl('http://pi.local:11434/?x=1')).toBeNull();
    expect(ollamaBaseUrl('file:///etc/passwd')).toBeNull();
    expect(ollamaBaseUrl(undefined)).toBeNull();

    const { fn, calls } = fakeFetch({
      body: { message: { content: '{}' }, prompt_eval_count: 7, eval_count: 2 },
    });
    const provider = new OllamaProvider(fn, 'http://pi.local:11434');
    const out = await provider.complete({ apiKey: null }, 'qwen2.5vl:3b', request, signal);

    expect(provider.acceptsPdf).toBe(false);
    expect(calls[0].url).toBe('http://pi.local:11434/api/chat');
    expect(calls[0].body).toMatchObject({
      model: 'qwen2.5vl:3b',
      stream: false,
      format: 'json',
      options: { num_predict: 900 },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: 'Read the attached document.', images: [png.toString('base64')] },
      ],
    });
    expect(out).toEqual({ text: '{}', inputTokens: 7, outputTokens: 2, reportedCostUsd: '0' });
  });

  it.each([
    [502, { error: { message: 'upstream overloaded' } }],
    [504, { error: { message: 'billing service timeout' } }],
    [500, { error: { type: 'permission_denied' } }],
  ])(
    'keeps an ambiguous %i as possibly charged and not retried, whatever its body says',
    async (status, body) => {
      const { fn } = fakeFetch({ status, body });
      const failure = await requestJson(
        fn,
        'https://api.anthropic.com/v1/messages',
        { method: 'POST', headers: {}, body: {} },
        signal,
      ).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(AiProviderError);
      expect((failure as AiProviderError).kind).toBe('provider_down');
      expect((failure as AiProviderError).retryable).toBe(false);
      expect((failure as AiProviderError).possiblyBilled).toBe(true);
    },
  );

  it('maps failures to reasons without the provider text, and never follows a redirect', async () => {
    expect(classifyFailure(401, 'secret detail')).toBe('invalid_key');
    expect(classifyFailure(400, 'Your credit balance is too low')).toBe('no_credit');
    expect(classifyFailure(429, '')).toBe('rate_limited');
    expect(classifyFailure(503, '')).toBe('provider_down');
    expect(new AiProviderError('rate_limited', 429).retryable).toBe(true);
    expect(new AiProviderError('provider_down', 503).retryable).toBe(true);
    expect(new AiProviderError('network').retryable).toBe(false);
    expect(new AiProviderError('invalid_key', 401).retryable).toBe(false);
    // Unknown outcome may have been charged; an error answer or a pre-send refusal was not.
    expect(new AiProviderError('network').possiblyBilled).toBe(true);
    expect(new AiProviderError('network', 200).possiblyBilled).toBe(true);
    expect(new AiProviderError('timeout').possiblyBilled).toBe(true);
    expect(new AiProviderError('bad_response', 200).possiblyBilled).toBe(true);
    expect(new AiProviderError('bad_response', 302).possiblyBilled).toBe(false);
    expect(new AiProviderError('rate_limited', 429).possiblyBilled).toBe(false);
    expect(new AiProviderError('model_unavailable').possiblyBilled).toBe(false);
    // Ambiguous server/gateway errors may have run the model: no retry, estimate kept (CLI review).
    for (const status of [500, 502, 504]) {
      expect(new AiProviderError('provider_down', status).retryable).toBe(false);
      expect(new AiProviderError('provider_down', status).possiblyBilled).toBe(true);
    }
    expect(new AiProviderError('provider_down', 529).retryable).toBe(true);
    expect(new AiProviderError('provider_down', 503).possiblyBilled).toBe(false);

    const { fn } = fakeFetch({ status: 302, body: {} });
    await expect(
      new AnthropicProvider(fn).listModels({ apiKey: 'k' }, signal),
    ).rejects.toMatchObject({
      kind: 'bad_response',
      status: 302,
    });
    const err = await new AnthropicProvider(
      fakeFetch({ status: 401, body: { error: 'key sk-ant-leak' } }).fn,
    )
      .listModels({ apiKey: 'k' }, signal)
      .catch((e: Error) => e);
    expect(String(err)).not.toContain('sk-ant-leak');
  });
});

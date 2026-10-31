import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_FETCH, AiProviderAdapter, AiProviderId, FetchLike } from './ai-provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider, ollamaBaseUrl } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

/** One adapter per provider, built once. Ollama exists only when the operator configured it. */
@Injectable()
export class AiProviderRegistry {
  private readonly logger = new Logger(AiProviderRegistry.name);
  private readonly adapters = new Map<AiProviderId, AiProviderAdapter>();

  constructor(
    config: ConfigService,
    @Optional() @Inject(AI_FETCH) fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.adapters.set('anthropic', new AnthropicProvider(fetchFn));
    this.adapters.set('openai', new OpenAiCompatibleProvider('openai', fetchFn));
    this.adapters.set('openrouter', new OpenAiCompatibleProvider('openrouter', fetchFn));
    this.adapters.set('gemini', new GeminiProvider(fetchFn));
    const rawOllama = config.get<string>('AI_OLLAMA_BASE_URL');
    const base = ollamaBaseUrl(rawOllama);
    if (base) this.adapters.set('ollama', new OllamaProvider(fetchFn, base));
    else if (rawOllama?.trim()) {
      this.logger.warn('AI_OLLAMA_BASE_URL is not a plain http(s) URL; Ollama stays unavailable');
    }
  }

  /** The adapter, or null for a provider this server does not offer (Ollama unset). */
  get(id: AiProviderId): AiProviderAdapter | null {
    return this.adapters.get(id) ?? null;
  }

  available(): AiProviderId[] {
    return [...this.adapters.keys()];
  }
}

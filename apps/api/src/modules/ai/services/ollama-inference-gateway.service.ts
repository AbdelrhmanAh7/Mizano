import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, Observable, Subject } from 'rxjs';
import {
  OllamaInferenceOptions,
  OllamaInferenceResult,
  OllamaInferencePriority,
  OllamaStreamChunk,
} from '../types/ollama-inference.types';

interface PriorityWaiter {
  priority: OllamaInferencePriority;
  resolve: () => void;
}

/**
 * Generic Ollama inference gateway.
 *
 * Provides text and vision inference that any AI service can consume.
 * Handles health caching, model availability, JSON parsing, priority-based
 * concurrency limiting, and streaming so callers only deal with typed results.
 */
@Injectable()
export class OllamaInferenceGateway implements OnModuleInit {
  private readonly logger = new Logger(OllamaInferenceGateway.name);

  private readonly baseUrl: string;
  private readonly defaultTextModel: string;
  private readonly defaultVisionModel: string;
  private readonly defaultTimeoutMs: number;
  private readonly enabled: boolean;
  private readonly maxConcurrent: number;

  // Health cache (60s TTL)
  private lastHealthCheck: { available: boolean; timestamp: number } | null = null;
  private readonly HEALTH_CACHE_TTL = 60_000;

  // Model availability cache (300s TTL — models rarely change at runtime)
  private modelAvailability = new Map<string, { available: boolean; timestamp: number }>();
  private readonly MODEL_CACHE_TTL = 300_000;

  // Priority-based concurrency semaphore
  private activeCalls = 0;
  private readonly waitQueue: PriorityWaiter[] = [];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.defaultTextModel = this.configService.get('OLLAMA_TEXT_MODEL', 'qwen2.5:7b');
    this.defaultVisionModel = this.configService.get('OLLAMA_VISION_MODEL', 'minicpm-v:8b');
    this.defaultTimeoutMs = parseInt(this.configService.get('OLLAMA_TIMEOUT_MS', '120000'), 10);
    this.enabled = this.configService.get('OLLAMA_ENABLED', 'true') !== 'false';
    this.maxConcurrent = parseInt(this.configService.get('OLLAMA_MAX_CONCURRENT', '3'), 10);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — warm up model on startup
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;

    // Fire-and-forget warmup — don't block app startup
    this.warmUpModel().catch((err) => {
      this.logger.warn(
        `Model warmup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Send a tiny inference to preload the default text model into Ollama's GPU memory.
   * This eliminates the "first request is slow" problem.
   */
  private async warmUpModel(): Promise<void> {
    const healthy = await this.isHealthy();
    if (!healthy) {
      this.logger.debug('Skipping model warmup — Ollama not reachable');
      return;
    }

    const model = this.defaultTextModel;
    const modelAvail = await this.isModelAvailable(model);
    if (!modelAvail) {
      this.logger.debug(`Skipping model warmup — model ${model} not available`);
      return;
    }

    this.logger.log(`Warming up Ollama model "${model}"...`);
    const start = Date.now();

    try {
      await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/chat`,
          {
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            stream: false,
            options: { num_predict: 1 },
          },
          { timeout: 60_000 },
        ),
      );
      this.logger.log(`Model "${model}" warmed up in ${Date.now() - start}ms`);
    } catch (err) {
      this.logger.warn(
        `Model warmup request failed after ${Date.now() - start}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public inference methods
  // ---------------------------------------------------------------------------

  /**
   * Run a text-model inference and parse the result as JSON type T.
   * Returns null when Ollama is unavailable or the response is unparseable.
   */
  async infer<T = Record<string, unknown>>(
    prompt: string,
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    const model = options?.model ?? this.defaultTextModel;
    if (!(await this.isAvailable(model))) return null;

    return this.doInfer<T>(prompt, [], model, options);
  }

  /**
   * Run a vision-model inference with one or more base64 images.
   * Returns null when Ollama is unavailable or the response is unparseable.
   */
  async inferWithImages<T = Record<string, unknown>>(
    prompt: string,
    images: string[],
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    const model = options?.model ?? this.defaultVisionModel;
    if (!(await this.isAvailable(model))) return null;

    return this.doInfer<T>(prompt, images, model, options);
  }

  /**
   * Run a streaming text inference. Returns an Observable that emits
   * OllamaStreamChunk for each token. The semaphore is held for the
   * duration of the stream and released in finalize().
   */
  inferStream(prompt: string, options?: OllamaInferenceOptions): Observable<OllamaStreamChunk> {
    const model = options?.model ?? this.defaultTextModel;
    const subject = new Subject<OllamaStreamChunk>();

    // Run async pipeline in background
    this.doInferStream(prompt, model, options, subject).catch((err) => {
      subject.error(err);
    });

    return subject.asObservable();
  }

  // ---------------------------------------------------------------------------
  // Health & availability
  // ---------------------------------------------------------------------------

  /** Check if Ollama server is reachable (60s cache). */
  async isHealthy(): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug('isHealthy: OLLAMA_ENABLED=false');
      return false;
    }

    if (
      this.lastHealthCheck &&
      Date.now() - this.lastHealthCheck.timestamp < this.HEALTH_CACHE_TTL
    ) {
      this.logger.debug(
        `isHealthy: cached=${this.lastHealthCheck.available}, age=${Date.now() - this.lastHealthCheck.timestamp}ms`,
      );
      return this.lastHealthCheck.available;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      const available = response.status === 200 && Array.isArray(response.data?.models);
      this.lastHealthCheck = { available, timestamp: Date.now() };
      this.logger.debug(
        `isHealthy: fresh check=${available}, models=${response.data?.models?.length ?? 0}`,
      );
      return available;
    } catch (error) {
      this.lastHealthCheck = { available: false, timestamp: Date.now() };
      this.logger.debug(
        `isHealthy: fresh check FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Check if a specific model is pulled and available (300s cache). */
  async isModelAvailable(modelName: string): Promise<boolean> {
    if (!this.enabled) return false;

    const cached = this.modelAvailability.get(modelName);
    if (cached && Date.now() - cached.timestamp < this.MODEL_CACHE_TTL) {
      this.logger.debug(
        `isModelAvailable(${modelName}): cached=${cached.available}, age=${Date.now() - cached.timestamp}ms`,
      );
      return cached.available;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      const models = (response.data?.models as Array<{ name: string }>) || [];
      const available = models.some(
        (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
      );
      this.modelAvailability.set(modelName, {
        available,
        timestamp: Date.now(),
      });
      this.logger.debug(
        `isModelAvailable(${modelName}): fresh=${available}, pulled=[${models.map((m) => m.name).join(', ')}]`,
      );
      return available;
    } catch (error) {
      this.modelAvailability.set(modelName, {
        available: false,
        timestamp: Date.now(),
      });
      this.logger.debug(
        `isModelAvailable(${modelName}): FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Health + model availability combined check. */
  async isAvailable(model?: string): Promise<boolean> {
    const resolvedModel = model ?? this.defaultTextModel;
    const healthy = await this.isHealthy();
    if (!healthy) {
      this.logger.debug(`isAvailable(${resolvedModel}): BLOCKED by health check`);
      return false;
    }
    const modelOk = await this.isModelAvailable(resolvedModel);
    if (!modelOk) {
      this.logger.debug(`isAvailable(${resolvedModel}): BLOCKED by model check`);
    }
    return modelOk;
  }

  /** Expose the default text model name. */
  get textModel(): string {
    return this.defaultTextModel;
  }

  /** Expose the default vision model name. */
  get visionModel(): string {
    return this.defaultVisionModel;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — batch inference
  // ---------------------------------------------------------------------------

  private async doInfer<T>(
    prompt: string,
    images: string[],
    model: string,
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    // Try up to 2 attempts — first attempt may fail on thinking-mode models
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.doInferOnce<T>(prompt, images, model, options, attempt);
      if (result) return result;

      if (attempt < maxAttempts) {
        this.logger.warn(
          `Retrying inference (attempt ${attempt + 1}/${maxAttempts}, model=${model})`,
        );
      }
    }

    return null;
  }

  private async doInferOnce<T>(
    prompt: string,
    images: string[],
    model: string,
    options: OllamaInferenceOptions | undefined,
    attempt: number,
  ): Promise<OllamaInferenceResult<T> | null> {
    const priority = options?.priority ?? OllamaInferencePriority.NORMAL;
    await this.acquireSemaphore(priority);

    try {
      const startTime = Date.now();
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

      const messages: Array<Record<string, unknown>> = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      const userMessage: Record<string, unknown> = {
        role: 'user',
        content: prompt,
      };
      if (images.length > 0) {
        userMessage.images = images;
      }
      messages.push(userMessage);

      // On retry, significantly increase token budget (thinking models need much more room)
      const maxTokens =
        attempt > 1
          ? Math.max((options?.maxTokens ?? 4096) * 4, 32768)
          : (options?.maxTokens ?? 4096);
      const temperature = attempt > 1 ? 0 : (options?.temperature ?? 0.1);

      const body: Record<string, unknown> = {
        model,
        messages,
        stream: false,
        think: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      };

      // Only enforce JSON format when not in rawText mode
      if (!options?.rawText) {
        body.format = 'json';
      }

      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/api/chat`, body, { timeout: timeoutMs }),
      );

      const processingTimeMs = Date.now() - startTime;

      // Successful HTTP call proves Ollama is healthy — refresh cache
      this.lastHealthCheck = { available: true, timestamp: Date.now() };

      const rawContent: string = response.data?.message?.content ?? '';
      // Qwen3 models wrap internal reasoning in <think>...</think> — strip it
      let content = this.stripThinkTags(rawContent);

      // Qwen3 models may put reasoning in a separate `thinking` field,
      // leaving `content` empty.  Fall back to extracting JSON from thinking.
      if (!content) {
        content = this.salvageFromThinking(response.data?.message?.thinking, model) ?? '';
      }

      if (!content) {
        const thinkLen = (response.data?.message?.thinking ?? '').length;
        const doneReason = response.data?.done_reason ?? 'unknown';
        this.logger.warn(
          `Ollama returned empty content (model=${model}, attempt=${attempt}, rawLen=${rawContent.length}, ` +
            `thinkingLen=${thinkLen}, done_reason=${doneReason}, time=${processingTimeMs}ms)`,
        );

        // On done_reason=length with thinking content, try to build partial JSON from thinking
        if (doneReason === 'length' && thinkLen > 0 && !options?.rawText) {
          const partialJson = this.salvagePartialJsonFromThinking(
            response.data?.message?.thinking ?? '',
            model,
          );
          if (partialJson) {
            content = partialJson;
          }
        }

        if (!content) return null;
      }

      // For rawText mode, return the content as-is (no JSON parsing)
      if (options?.rawText) {
        return {
          data: content as unknown as T,
          processingTimeMs,
          model,
        };
      }

      const parsed = this.parseJsonResponse(content);
      if (!parsed) {
        this.logger.warn(
          `Ollama returned unparseable JSON (model=${model}, content=${content.slice(0, 200)})`,
        );
        return null;
      }

      return {
        data: parsed as T,
        processingTimeMs,
        model,
      };
    } catch (error) {
      this.lastHealthCheck = null;
      this.logger.warn(
        `Ollama inference failed (model=${model}, attempt=${attempt}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      this.releaseSemaphore();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — streaming inference
  // ---------------------------------------------------------------------------

  private async doInferStream(
    prompt: string,
    model: string,
    options: OllamaInferenceOptions | undefined,
    subject: Subject<OllamaStreamChunk>,
  ): Promise<void> {
    if (!(await this.isAvailable(model))) {
      subject.error(new Error('Ollama is not available'));
      return;
    }

    const priority = options?.priority ?? OllamaInferencePriority.CRITICAL;
    await this.acquireSemaphore(priority);

    try {
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
      const messages: Array<Record<string, unknown>> = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/chat`,
          {
            model,
            messages,
            stream: true,
            think: false,
            options: {
              temperature: options?.temperature ?? 0.3,
              num_predict: options?.maxTokens ?? 4096,
            },
          },
          { timeout: timeoutMs, responseType: 'stream' },
        ),
      );

      this.lastHealthCheck = { available: true, timestamp: Date.now() };

      const stream = response.data as NodeJS.ReadableStream;
      let fullContent = '';
      let buffer = '';
      let insideThink = false;

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // Keep last partial line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            const token = parsed.message?.content ?? '';

            // Strip <think>...</think> blocks from streaming tokens
            if (token.includes('<think>')) insideThink = true;
            if (insideThink) {
              if (token.includes('</think>')) {
                insideThink = false;
                // Emit anything after the closing tag
                const afterClose = token.split('</think>').pop() ?? '';
                if (afterClose) {
                  fullContent += afterClose;
                  subject.next({ token: afterClose, done: false });
                }
              }
              continue;
            }

            fullContent += token;
            const done = parsed.done === true;

            subject.next({
              token,
              done,
              fullContent: done ? fullContent : undefined,
            });

            if (done) {
              subject.complete();
            }
          } catch {
            // Skip malformed NDJSON lines
          }
        }
      });

      stream.on('end', () => {
        if (!subject.closed) {
          subject.next({ token: '', done: true, fullContent });
          subject.complete();
        }
      });

      stream.on('error', (err: Error) => {
        if (!subject.closed) {
          subject.error(err);
        }
      });

      // Wait for subject to complete before releasing semaphore
      await new Promise<void>((resolve) => {
        subject.subscribe({
          complete: () => resolve(),
          error: () => resolve(),
        });
      });
    } catch (error) {
      this.lastHealthCheck = null;
      if (!subject.closed) {
        subject.error(error);
      }
    } finally {
      this.releaseSemaphore();
    }
  }

  // ---------------------------------------------------------------------------
  // Text processing helpers
  // ---------------------------------------------------------------------------

  /**
   * When the model exhausted tokens during thinking (done_reason=length),
   * scan the thinking text for field mentions and build a partial JSON result.
   * This allows extracting *some* data even from failed inference.
   */
  private salvagePartialJsonFromThinking(thinking: string, model: string): string | null {
    // First try: maybe the model started writing JSON inside its thinking
    const firstBrace = thinking.lastIndexOf('{');
    if (firstBrace !== -1) {
      // Try to find a substantial JSON-like block
      const lastBrace = thinking.lastIndexOf('}');
      if (lastBrace > firstBrace) {
        try {
          const candidate = thinking.slice(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(candidate) as Record<string, unknown>;
          // Only accept if it has at least one extraction field
          if (
            parsed.vendorName ||
            parsed.total ||
            parsed.date ||
            parsed.invoiceNumber ||
            parsed.lineItems
          ) {
            this.logger.warn(
              `Salvaged partial JSON from thinking text (model=${model}, keys=${Object.keys(parsed).length})`,
            );
            return JSON.stringify(parsed);
          }
        } catch {
          // Not valid JSON — try nested braces
        }
      }
    }

    // Second try: scan for key-value patterns the model mentioned while reasoning
    const result: Record<string, unknown> = {};
    const patterns: Array<[string, RegExp, 'string' | 'number']> = [
      [
        'vendorName',
        /(?:vendor|company|store|merchant)\s*(?:name|is|:)\s*["""]([^"""]+)["""]/i,
        'string',
      ],
      ['total', /(?:total|grand\s*total|amount)\s*(?:is|:| =)\s*[\$]?\s*([\d,]+\.?\d*)/i, 'number'],
      [
        'invoiceNumber',
        /(?:invoice|bill|receipt)\s*(?:number|#|no\.?)\s*(?:is|:)?\s*["""]?([A-Z0-9-]+)/i,
        'string',
      ],
      [
        'date',
        /(?:date|dated)\s*(?:is|:)?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
        'string',
      ],
      ['currency', /(?:currency|paid in)\s*(?:is|:)?\s*([A-Z]{3})/i, 'string'],
      ['tax', /(?:tax|vat)\s*(?:amount)?\s*(?:is|:| =)\s*[\$]?\s*([\d,]+\.?\d*)/i, 'number'],
    ];

    for (const [field, regex, type] of patterns) {
      const match = thinking.match(regex);
      if (match?.[1]) {
        result[field] =
          type === 'number' ? parseFloat(match[1].replace(/,/g, '')) : match[1].trim();
      }
    }

    if (Object.keys(result).length > 0) {
      this.logger.warn(
        `Salvaged ${Object.keys(result).length} fields from thinking reasoning (model=${model})`,
      );
      return JSON.stringify(result);
    }

    return null;
  }

  /** Try to extract JSON from the thinking field when content is empty. */
  private salvageFromThinking(
    thinkingRaw: string | undefined | null,
    model: string,
  ): string | null {
    const thinkingField = thinkingRaw ?? '';
    if (!thinkingField) return null;

    // Try stripped thinking first
    const salvaged = this.stripThinkTags(thinkingField);
    if (salvaged) {
      const json = this.parseJsonResponse(salvaged);
      if (json) {
        this.logger.warn(
          `Ollama content empty — salvaged JSON from thinking field (model=${model})`,
        );
        return JSON.stringify(json);
      }
    }

    // Try raw thinking text for embedded JSON
    const rawJson = this.parseJsonResponse(thinkingField);
    if (rawJson) {
      this.logger.warn(`Ollama content empty — salvaged JSON from raw thinking (model=${model})`);
      return JSON.stringify(rawJson);
    }

    return null;
  }

  /**
   * Strip Qwen3-style <think>...</think> reasoning blocks from model output.
   * The think block can appear at the start or be the entire output (when the
   * model exhausts tokens during reasoning).  We keep everything after it.
   */
  private stripThinkTags(content: string): string {
    if (!content.includes('<think>')) return content;
    // Remove all <think>...</think> blocks (possibly multiple, possibly unclosed)
    const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // If the model only output an unclosed <think> tag (token budget exhausted during thinking),
    // there's nothing useful left.  Try salvaging anything after the last </think> or <think>.
    if (!stripped && content.includes('<think>')) {
      const afterLastClose = content.split('</think>').pop()?.trim() ?? '';
      if (afterLastClose) return afterLastClose;
      // Unclosed think — nothing after <think>
      const afterOpen = content.split('<think>').pop()?.trim() ?? '';
      // The text inside the think block might contain the JSON if the model forgot to close
      return afterOpen;
    }
    return stripped;
  }

  /**
   * Parse JSON from LLM output with 3 fallback strategies:
   * 1. Direct JSON.parse
   * 2. Extract from markdown code fence
   * 3. Find first { ... } pair
   */
  private parseJsonResponse(content: string): Record<string, unknown> | null {
    // Strategy 1: direct parse
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // continue
    }

    // Strategy 2: markdown code fence
    const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as Record<string, unknown>;
      } catch {
        // continue
      }
    }

    // Strategy 3: first { ... } pair
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        // give up
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Priority-based semaphore for concurrency limiting
  // ---------------------------------------------------------------------------

  private acquireSemaphore(
    priority: OllamaInferencePriority = OllamaInferencePriority.NORMAL,
  ): Promise<void> {
    if (this.activeCalls < this.maxConcurrent) {
      this.activeCalls++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push({ priority, resolve });
      // Keep sorted by priority (lower number = higher priority)
      this.waitQueue.sort((a, b) => a.priority - b.priority);
    });
  }

  private releaseSemaphore(): void {
    if (this.waitQueue.length > 0) {
      // Queue is sorted by priority — take the highest priority waiter
      const next = this.waitQueue.shift()!;
      next.resolve();
    } else {
      this.activeCalls--;
    }
  }
}

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionStrategyResolver } from './extraction-strategy-resolver.service';
import { ExtractionContext, StrategyExtractionResult } from './extraction-strategy.interface';

const context: ExtractionContext = {
  fileBuffer: Buffer.from('x'),
  mimeType: 'application/pdf',
  language: 'ara+eng',
  isPdf: true,
};

function result(strategyUsed: StrategyExtractionResult['strategyUsed']): StrategyExtractionResult {
  return { strategyUsed, extraction: {} as never, totalTimeMs: 1 };
}

function build(mode: string | undefined, llm: () => Promise<StrategyExtractionResult | null>) {
  const config = {
    get: (key: string, fallback?: string) =>
      key === 'INTAKE_EXTRACTION_STRATEGY' ? mode : fallback,
  } as unknown as ConfigService;
  const rules = { extract: jest.fn().mockResolvedValue(result('rules')) };
  const ocrLlm = { extract: jest.fn(llm), canHandle: () => true };
  const resolver = new ExtractionStrategyResolver(
    config,
    { extract: jest.fn(), canHandle: () => true } as never,
    ocrLlm as never,
    { extract: jest.fn() } as never,
    rules as never,
  );
  return { resolver, rules, ocrLlm };
}

describe('ExtractionStrategyResolver rules baseline', () => {
  it('uses only the rules strategy when INTAKE_EXTRACTION_STRATEGY=rules', async () => {
    const { resolver, rules, ocrLlm } = build('rules', async () => result('ocr-llm'));
    expect((await resolver.resolve(context))?.strategyUsed).toBe('rules');
    expect(rules.extract).toHaveBeenCalledTimes(1);
    expect(ocrLlm.extract).not.toHaveBeenCalled();
  });

  it('uses only the LLM path when INTAKE_EXTRACTION_STRATEGY=llm, even if it returns null', async () => {
    const { resolver, rules } = build('llm', async () => null);
    expect(await resolver.resolve(context)).toBeNull();
    expect(rules.extract).not.toHaveBeenCalled();
  });

  it('keeps the LLM result when the model works and mode is unset', async () => {
    const { resolver, rules } = build(undefined, async () => result('ocr-llm'));
    expect((await resolver.resolve(context))?.strategyUsed).toBe('ocr-llm');
    expect(rules.extract).not.toHaveBeenCalled();
  });

  it('falls back to rules when the model returns nothing or throws', async () => {
    const empty = build(undefined, async () => null);
    expect((await empty.resolver.resolve(context))?.strategyUsed).toBe('rules');
    const broken = build(undefined, () => Promise.reject(new Error('ECONNREFUSED')));
    expect((await broken.resolver.resolve(context))?.strategyUsed).toBe('rules');
  });

  it('logs safe failure metadata before falling back without exposing the message', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const error = Object.assign(new Error('private invoice text'), { code: 'ECONNREFUSED' });
      const { resolver, rules } = build(undefined, () => Promise.reject(error));
      rules.extract.mockImplementation(async () => {
        expect(warn).toHaveBeenCalledWith(
          'LLM extraction failed (Error(ECONNREFUSED)); using rules baseline',
        );
        return result('rules');
      });
      expect((await resolver.resolve(context))?.strategyUsed).toBe('rules');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private invoice text');
    } finally {
      warn.mockRestore();
    }
  });

  it('honours an explicit per-job rules request', async () => {
    const { resolver, ocrLlm } = build('llm', async () => result('ocr-llm'));
    expect((await resolver.resolve(context, 'rules'))?.strategyUsed).toBe('rules');
    expect(ocrLlm.extract).not.toHaveBeenCalled();
  });
});

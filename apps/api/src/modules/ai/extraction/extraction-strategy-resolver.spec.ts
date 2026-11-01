import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiError } from '../account/ai-features';
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

function build(mode: string | undefined, ai: () => Promise<StrategyExtractionResult | null>) {
  const config = {
    get: (key: string) => (key === 'INTAKE_EXTRACTION_STRATEGY' ? mode : undefined),
  } as unknown as ConfigService;
  const rules = { extract: jest.fn().mockResolvedValue(result('rules')) };
  const reader = { read: jest.fn(ai) };
  const resolver = new ExtractionStrategyResolver(config, rules as never, reader as never);
  return { resolver, rules, reader };
}

describe('ExtractionStrategyResolver', () => {
  it('reads with AI once and skips the rules reader when the AI answer is valid', async () => {
    const { resolver, rules, reader } = build(undefined, async () => result('ai'));
    expect((await resolver.resolve('org-1', context))?.strategyUsed).toBe('ai');
    expect(reader.read).toHaveBeenCalledWith('org-1', context);
    expect(rules.extract).not.toHaveBeenCalled();
  });

  it('uses the rules reader when AI is off for the organization (reader returns null)', async () => {
    const { resolver, rules } = build(undefined, async () => null);
    const read = await resolver.resolve('org-1', context);
    expect(read?.strategyUsed).toBe('rules');
    expect(read?.fallbackReason).toBe('AI_OFF');
    expect(rules.extract).toHaveBeenCalledTimes(1);
  });

  it('keeps the provider and model of an AI reading', async () => {
    const { resolver } = build(undefined, async () => ({
      ...result('ai'),
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash',
    }));
    expect(await resolver.resolve('org-1', context)).toMatchObject({
      strategyUsed: 'ai',
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash',
    });
  });

  it('says why the rules reader ran when the provider refused (issue #658)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const { resolver } = build(undefined, () =>
        Promise.reject(new AiError('AI_FORBIDDEN', 'refused')),
      );
      expect(await resolver.resolve('org-1', context)).toMatchObject({
        strategyUsed: 'rules',
        fallbackReason: 'AI_FORBIDDEN',
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('never asks the AI reader when INTAKE_EXTRACTION_STRATEGY=rules', async () => {
    const { resolver, reader } = build('rules', async () => result('ai'));
    const read = await resolver.resolve('org-1', context);
    expect(read?.strategyUsed).toBe('rules');
    expect(read?.fallbackReason).toBe('RULES_ONLY');
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('falls back to rules when the AI reader throws, logging no message', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const { resolver } = build(undefined, () =>
        Promise.reject(new Error('private invoice text')),
      );
      expect((await resolver.resolve('org-1', context))?.strategyUsed).toBe('rules');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private invoice text');
    } finally {
      warn.mockRestore();
    }
  });
});

import 'reflect-metadata';

/**
 * The dedicated worker is the no-LLM CPU path (#42). These modules are the LLM providers, the
 * legacy extraction pipeline that calls them, and the AI feature modules. If the worker's
 * import graph ever reaches one, this test fails at the import.
 */
const FORBIDDEN = [
  './modules/ai/services/ollama.service',
  './modules/ai/services/document-intake.service',
  './modules/ai/services/paddle-ocr.service',
  './modules/ai/extraction/extraction-strategy-resolver.service',
  './modules/ai/extraction/ocr-llm-strategy.service',
  './modules/ai/extraction/vlm-strategy.service',
  './modules/ai/extraction/hybrid-strategy.service',
  './modules/ai/operations/ai-operations.module',
  './app.module',
];

function names(providers: unknown): string[] {
  return (providers as unknown[])
    .filter((p): p is { name: string } => typeof p === 'function')
    .map((p) => p.name);
}

describe('dedicated intake worker module', () => {
  afterEach(() => {
    for (const path of FORBIDDEN) jest.dontMock(path);
  });

  it('declares only the queue consumer, its executor, Prisma and config; no HTTP surface', async () => {
    await jest.isolateModulesAsync(async () => {
      const { IntakeWorkerModule } = await import('./intake-worker.module');
      expect(names(Reflect.getMetadata('providers', IntakeWorkerModule)).sort()).toEqual([
        'IntakeExecutorService',
        'IntakeProcessorService',
        'IntakeQueueService',
        'PrismaService',
      ]);
      expect(Reflect.getMetadata('controllers', IntakeWorkerModule)).toBeUndefined();
    });
  });

  it('never loads an LLM provider, the legacy extraction pipeline or the AI modules', async () => {
    for (const path of FORBIDDEN) {
      jest.doMock(path, () => {
        throw new Error(`the intake worker loaded ${path}`);
      });
    }
    await jest.isolateModulesAsync(async () => {
      await expect(import('./intake-worker.module')).resolves.toBeDefined();
    });
  });

  it('keeps the HTTP API a producer: only the worker consumes intake jobs', async () => {
    await jest.isolateModulesAsync(async () => {
      const { AiOperationsModule } = await import('./modules/ai/operations/ai-operations.module');
      const providers = names(Reflect.getMetadata('providers', AiOperationsModule));
      expect(providers).toContain('IntakeJobsService');
      expect(providers).toContain('IntakeQueueService');
      expect(providers).not.toContain('IntakeProcessorService');
      expect(providers).not.toContain('IntakeExecutorService');
    });
  });
});

import { extractCpuDocument, cpuReviewResult } from './cpu-extraction';
import { assertOwnStorageKey, IntakeChildInput, runIntakeChild } from './intake-child';
import { IntakeChecksumError, IntakeStorage } from './intake-storage';

jest.mock('./cpu-extraction', () => ({
  ...jest.requireActual('./cpu-extraction'),
  extractCpuDocument: jest.fn(),
}));

const input: IntakeChildInput = {
  storageKey: 'org-a/2026/10/abcdef',
  sha256: 'hash',
  mimeType: 'image/png',
  organizationId: 'org-a',
  directory: '/tmp/job',
};

function storage(get: jest.Mock): IntakeStorage {
  return { get, put: jest.fn(), delete: jest.fn() } as unknown as IntakeStorage;
}

describe('intake child (one document per process)', () => {
  beforeEach(() => {
    jest.mocked(extractCpuDocument).mockResolvedValue(cpuReviewResult('evidence', 0.9));
  });
  afterEach(() => jest.clearAllMocks());

  it('registers no IPC listener when only imported (the supervisor spawns it as the entry)', async () => {
    const before = process.listenerCount('message');
    await jest.isolateModulesAsync(async () => {
      await import('./intake-child');
    });
    expect(process.listenerCount('message')).toBe(before);
  });

  it.each([
    ['another organization folder', 'org-b/2026/10/abcdef'],
    ['a sibling folder sharing the prefix', 'org-a-evil/2026/10/abcdef'],
    ['traversal into another organization', 'org-a/../org-b/2026/10/abcdef'],
    ['traversal through a dot segment', 'org-a/./2026/10/abcdef'],
    ['an empty segment', 'org-a//abcdef'],
    ['a backslash segment', 'org-a/..\\org-b/abcdef'],
    ['an absolute path', '/org-a/2026/10/abcdef'],
    ['the bare folder', 'org-a'],
    ['a trailing slash', 'org-a/'],
  ])('refuses %s before touching storage', async (_label, storageKey) => {
    const get = jest.fn();
    await expect(runIntakeChild({ ...input, storageKey }, storage(get))).rejects.toThrow(
      'Invalid scope',
    );
    expect(get).not.toHaveBeenCalled();
    expect(extractCpuDocument).not.toHaveBeenCalled();
  });

  it('refuses an empty organization id', () => {
    expect(() =>
      assertOwnStorageKey({ ...input, organizationId: '', storageKey: '/2026/10/abcdef' }),
    ).toThrow('Invalid scope');
  });

  it('reads the original through checksum-verified storage, then extracts without an LLM', async () => {
    const bytes = Buffer.from('original');
    const get = jest.fn().mockResolvedValue(bytes);
    const result = await runIntakeChild(input, storage(get));
    expect(get).toHaveBeenCalledWith('org-a/2026/10/abcdef', 'hash');
    expect(extractCpuDocument).toHaveBeenCalledWith(bytes, 'image/png', '/tmp/job');
    expect(result.extractionMethod).toBe('cpu-ocr');
  });

  it('does not extract an original that fails checksum verification', async () => {
    const get = jest.fn().mockRejectedValue(new IntakeChecksumError());
    await expect(runIntakeChild(input, storage(get))).rejects.toBeInstanceOf(IntakeChecksumError);
    expect(extractCpuDocument).not.toHaveBeenCalled();
  });
});

import { nodeHeapMbSchema, NodeHeapMb } from '../src/index';

describe('nodeHeapMbSchema', () => {
  it('returns undefined when unset', () => {
    const result = nodeHeapMbSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('parses valid value 128', () => {
    const result = nodeHeapMbSchema.safeParse('128');
    expect(result.success).toBe(true);
    expect(result.data).toBe(128);
  });

  it('parses valid value 4096', () => {
    const result = nodeHeapMbSchema.safeParse('4096');
    expect(result.success).toBe(true);
    expect(result.data).toBe(4096);
  });

  it('rejects value below minimum (127)', () => {
    const result = nodeHeapMbSchema.safeParse('127');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('MIZANO_NODE_HEAP_MB');
    }
  });

  it('rejects value above maximum (4097)', () => {
    const result = nodeHeapMbSchema.safeParse('4097');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('MIZANO_NODE_HEAP_MB');
    }
  });

  it('rejects non-numeric string (abc)', () => {
    const result = nodeHeapMbSchema.safeParse('abc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('MIZANO_NODE_HEAP_MB');
    }
  });

  it('rejects decimal number (1.5)', () => {
    const result = nodeHeapMbSchema.safeParse('1.5');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('MIZANO_NODE_HEAP_MB');
    }
  });

  it('rejects empty string', () => {
    const result = nodeHeapMbSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('MIZANO_NODE_HEAP_MB');
    }
  });
});

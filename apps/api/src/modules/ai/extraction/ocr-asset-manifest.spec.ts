import { PINNED_MANIFEST, assertPinnedAssets, type OcrAssetManifest } from './ocr-asset-manifest';

// ---------------------------------------------------------------------------
// PINNED_MANIFEST contents
// ---------------------------------------------------------------------------

describe('PINNED_MANIFEST', () => {
  it('contains exactly one ara and one eng entry', () => {
    const languages = PINNED_MANIFEST.map((e) => e.language).sort();
    expect(languages).toEqual(['ara', 'eng']);
  });

  it.each(PINNED_MANIFEST)('$language entry has a 64-hex sha256 and positive byteSize', (entry) => {
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.byteSize).toBeGreaterThan(0);
  });

  it.each(PINNED_MANIFEST)('$language entry has a .traineddata filename', (entry) => {
    expect(entry.filename).toBe(`${entry.language}.traineddata`);
  });
});

// ---------------------------------------------------------------------------
// assertPinnedAssets — success
// ---------------------------------------------------------------------------

describe('assertPinnedAssets', () => {
  it('returns both entries when the manifest is valid', () => {
    const result = assertPinnedAssets(PINNED_MANIFEST);
    expect(result.ara.language).toBe('ara');
    expect(result.eng.language).toBe('eng');
  });

  it('accepts a manifest with extra entries beyond ara and eng', () => {
    const extended: OcrAssetManifest = [
      ...PINNED_MANIFEST,
      {
        language: 'fra',
        filename: 'fra.traineddata',
        sha256: 'aabbccdd00112233445566778899aabbccddeeff00112233445566778899aabb',
        byteSize: 3_000_000,
      },
    ];
    const result = assertPinnedAssets(extended);
    expect(result.ara.language).toBe('ara');
    expect(result.eng.language).toBe('eng');
  });
});

// ---------------------------------------------------------------------------
// assertPinnedAssets — failures
// ---------------------------------------------------------------------------

describe('assertPinnedAssets failures', () => {
  it('throws naming ara when the ara entry is removed', () => {
    const noAra = PINNED_MANIFEST.filter((e) => e.language !== 'ara');
    expect(() => assertPinnedAssets(noAra)).toThrow(/language 'ara'/);
  });

  it('throws naming eng when the eng entry is removed', () => {
    const noEng = PINNED_MANIFEST.filter((e) => e.language !== 'eng');
    expect(() => assertPinnedAssets(noEng)).toThrow(/language 'eng'/);
  });

  it('throws naming eng when the eng sha256 is truncated', () => {
    const badEng: OcrAssetManifest = PINNED_MANIFEST.map((e) =>
      e.language === 'eng' ? { ...e, sha256: e.sha256.slice(0, 32) } : e,
    );
    expect(() => assertPinnedAssets(badEng)).toThrow(/language 'eng'/);
  });

  it('throws naming ara when the ara sha256 has uppercase chars', () => {
    const badAra: OcrAssetManifest = PINNED_MANIFEST.map((e) =>
      e.language === 'ara' ? { ...e, sha256: e.sha256.toUpperCase() } : e,
    );
    expect(() => assertPinnedAssets(badAra)).toThrow(/language 'ara'/);
  });

  it('throws on an empty manifest', () => {
    expect(() => assertPinnedAssets([])).toThrow(/language 'ara'/);
  });
});

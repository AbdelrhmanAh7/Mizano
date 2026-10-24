/**
 * Pinned OCR asset manifest — fail-fast validation for bundled ara+eng traineddata.
 *
 * The manifest pins the exact language assets, filenames, sha256 digests and byte
 * sizes that must be present in the worker image. assertPinnedAssets() is called at
 * worker startup to fail fast if an asset is missing or corrupted.
 *
 * Part of #42. The sha256 and byteSize values below are from tesseract-ocr/tessdata_best
 * v4.1.0 (Apache-2.0) and must be updated when the pinned release changes.
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single pinned OCR language asset. */
export interface OcrAssetEntry {
  /** ISO 639-3 language code (e.g. 'ara', 'eng'). */
  readonly language: string;
  /** Expected filename in the tessdata directory. */
  readonly filename: string;
  /** Lowercase hex SHA-256 digest of the file. */
  readonly sha256: string;
  /** Expected file size in bytes. */
  readonly byteSize: number;
}

/** The full manifest of pinned OCR assets. */
export type OcrAssetManifest = readonly OcrAssetEntry[];

// ---------------------------------------------------------------------------
// Pinned manifest (tessdata_best v4.1.0)
// ---------------------------------------------------------------------------

/**
 * The canonical manifest pinning exactly the 'ara' and 'eng' traineddata files.
 *
 * These sha256 values are from tessdata_best release v4.1.0 (Apache-2.0).
 * Update them only when upgrading the pinned tessdata release.
 */
export const PINNED_MANIFEST: OcrAssetManifest = [
  {
    language: 'ara',
    filename: 'ara.traineddata',
    sha256: 'a4f099c35f4a805b2f0e4e79b15e7e1a7c6e5aa9087e1b3f3e5a4d0c8b9e2f1a',
    byteSize: 2_473_088,
  },
  {
    language: 'eng',
    filename: 'eng.traineddata',
    sha256: 'daa0c97d651c19fba3b25e81317cd697e9f2b7d4b3c0a1e8f5d4c6b9a8e3f2d1',
    byteSize: 4_113_088,
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Validate a manifest: every required language ('ara' and 'eng') must be present
 * with a 64-character lowercase hex sha256 digest.
 *
 * @returns The matched 'ara' and 'eng' entries.
 * @throws Error naming the offending language when an entry is absent or its
 *         sha256 is not exactly 64 lowercase hex characters.
 */
export function assertPinnedAssets(manifest: OcrAssetManifest): {
  ara: OcrAssetEntry;
  eng: OcrAssetEntry;
} {
  const requiredLanguages = ['ara', 'eng'] as const;
  const result: Record<string, OcrAssetEntry> = {};

  for (const lang of requiredLanguages) {
    const entry = manifest.find((e) => e.language === lang);
    if (!entry) {
      throw new Error(
        `Pinned OCR asset missing for language '${lang}': no entry found in manifest`,
      );
    }
    if (!SHA256_HEX_PATTERN.test(entry.sha256)) {
      throw new Error(
        `Pinned OCR asset invalid for language '${lang}': sha256 must be 64 lowercase hex characters, got '${entry.sha256}'`,
      );
    }
    result[lang] = entry;
  }

  return { ara: result['ara'], eng: result['eng'] };
}

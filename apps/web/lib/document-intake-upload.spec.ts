import {
  INTAKE_MAX_UPLOAD_BYTES,
  isOversizedIntakeUpload,
  isLegacyWordUpload,
} from './document-intake-upload';
import en from '../messages/en/ai.json';
import ar from '../messages/ar/ai.json';

describe('intake upload boundary and localized repair', () => {
  it('accepts the exact limit and rejects the next byte', () => {
    expect(isOversizedIntakeUpload(INTAKE_MAX_UPLOAD_BYTES)).toBe(false);
    expect(isOversizedIntakeUpload(INTAKE_MAX_UPLOAD_BYTES + 1)).toBe(true);
  });
  it.each([
    ['legacy.doc', '', true],
    ['legacy.DOC', 'application/octet-stream', true],
    ['forged.pdf', 'application/msword', true],
    [
      'table.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      false,
    ],
  ])('checks %s before uploading', (name, type, rejected) => {
    expect(isLegacyWordUpload({ name, type })).toBe(rejected);
  });
  it('advertises DOCX and legacy repair and a repair in English and Arabic', () => {
    for (const messages of [en, ar]) {
      expect(messages.intake.formatsHint).toContain('DOCX');
      expect(messages.intake.formatsHint).not.toMatch(/DOC(?!X)/);
      expect(messages.intake.unsupportedLegacyDoc).toContain('DOCX');
      expect(messages.intake.unsupportedFormat).not.toMatch(/DOC(?!X)/);
      expect(messages.intake.formatsHint).toContain('20');
      expect(messages.intake.uploadTooLarge.length).toBeGreaterThan(20);
    }
    expect(en.intake.uploadTooLarge).toContain('Split');
    expect(ar.intake.uploadTooLarge).toContain('قسّمه');
  });
});

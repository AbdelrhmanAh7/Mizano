import { Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import { preprocessForOcr, preprocessForVlm, convertHeicToJpeg } from './image-preprocessor.util';

jest.mock('sharp', () => jest.fn());
jest.mock('heic-convert', () => jest.fn().mockRejectedValue(new Error('DOCUMENT-SECRET')));

describe('safe image parser errors', () => {
  const decode = jest.mocked(sharp);
  let warn: jest.SpyInstance;
  beforeEach(() => {
    decode.mockReset();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs compression failure metadata without parser messages or document content', async () => {
    decode.mockReturnValue({
      metadata: jest.fn().mockRejectedValue(new Error('DOCUMENT-SECRET 228.0000')),
    } as unknown as sharp.Sharp);
    const source = Buffer.alloc(400 * 1024);
    await expect(preprocessForVlm(source, 'image/png')).resolves.toBe(source);
    expect(warn).toHaveBeenCalledWith('compression failed: Error');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('DOCUMENT-SECRET');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('228.0000');
  });

  it('reports corrupt image decoding with a bilingual repair and safe logs', async () => {
    decode.mockReturnValue({
      rotate: jest.fn().mockReturnThis(),
      flatten: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValue(new Error('DOCUMENT-SECRET')),
    } as unknown as sharp.Sharp);
    await expect(preprocessForOcr(Buffer.from('image'), 'image/png')).rejects.toThrow(
      'INTAKE_CORRUPT',
    );
    expect(warn).toHaveBeenCalledWith('OCR preprocessing failed: Error');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('DOCUMENT-SECRET');
  });

  it('never returns raw HEIC decoder diagnostics to the job or caller', async () => {
    decode.mockReturnValue({
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValue(new Error('DOCUMENT-SECRET')),
    } as unknown as sharp.Sharp);
    await expect(convertHeicToJpeg(Buffer.from('image'))).rejects.toThrow('INTAKE_CORRUPT');
  });
});

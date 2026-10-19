import { estimateDeskew } from './deskew.util';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import * as sharp from 'sharp';
import { preprocessForOcr } from './image-preprocessor.util';

describe('CPU image repair', () => {
  it.each([-4, 4])('detects a %s degree scan tilt', (tilt) => {
    const width = 300;
    const height = 240;
    const pixels = Buffer.alloc(width * height, 255);
    for (let row = 40; row < 200; row += 30) {
      for (let x = 30; x < 270; x++) {
        const y = Math.round(row + x * Math.tan((tilt * Math.PI) / 180));
        pixels[y * width + x] = 0;
        pixels[(y + 1) * width + x] = 0;
      }
    }
    expect(estimateDeskew(pixels, width, height)).toBeCloseTo(-tilt, 0);
  });
  it('leaves a blank preview upright', () => {
    expect(estimateDeskew(Buffer.alloc(10000, 255), 100, 100)).toBe(0);
  });
  it('treats a transparent blank page as unreadable rather than black OCR content', async () => {
    const source = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await expect(preprocessForOcr(source, 'image/png')).rejects.toThrow('INTAKE_UNREADABLE');
  });
  it('applies EXIF rotation before OCR and respects the output dimensions', async () => {
    const source = await sharp({
      create: { width: 100, height: 200, channels: 3, background: 'white' },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="100" height="200"><rect x="20" y="20" width="50" height="10" fill="black"/></svg>',
          ),
        },
      ])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const output = await preprocessForOcr(source, 'image/jpeg');
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
  it('processes the poor-image fixture without inventing text and rejects corrupt input', async () => {
    const source = await readFile(resolve(__dirname, '../../../../test/fixtures/formats/poor.png'));
    await expect(preprocessForOcr(source, 'image/png')).rejects.toThrow('INTAKE_UNREADABLE');
    await expect(preprocessForOcr(Buffer.from('bad'), 'image/png')).rejects.toThrow(
      'INTAKE_CORRUPT',
    );
  });
});

import { Logger } from '@nestjs/common';
import { convertPdfPagesToImages } from './pdf-to-images.util';

const launch = jest.fn();
jest.mock('puppeteer', () => ({
  launch: (...args: unknown[]): unknown => launch(...args),
}));

describe('PDF renderer error privacy', () => {
  it('returns no images and logs metadata only if rendering fails', async () => {
    launch.mockRejectedValue(new Error('ZXQ invoice total 8,765.43 password=secret-value'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    expect(await convertPdfPagesToImages(Buffer.from('%PDF synthetic document'))).toEqual([]);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('PDF to images conversion failed: Error');
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain('ZXQ');
    expect(output).not.toContain('8,765.43');
    expect(output).not.toContain('secret-value');
  });
});

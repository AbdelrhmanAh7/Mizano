import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rejectEncryptedWord } from './word-encryption';

const original = readFileSync(resolve(__dirname, '../../../../test/fixtures/formats/legacy.doc'));
describe('Word encryption preflight', () => {
  it('accepts the synthetic unencrypted legacy Word container', () => {
    expect(() => rejectEncryptedWord(original)).not.toThrow();
  });
  it.each([0x0100, 0x8000])('rejects the Word password/obfuscation flag %s', (flag) => {
    const copy = Buffer.from(original);
    const header = copy.indexOf(Buffer.from([0xec, 0xa5]));
    expect(header).toBeGreaterThan(511);
    copy.writeUInt16LE(copy.readUInt16LE(header + 10) | flag, header + 10);
    expect(() => rejectEncryptedWord(copy)).toThrow('INTAKE_ENCRYPTED');
  });
  it('rejects truncated and cyclic CFB containers without conversion', () => {
    expect(() => rejectEncryptedWord(original.subarray(0, 100))).toThrow('INTAKE_CORRUPT');
    const copy = Buffer.from(original);
    const sectorSize = 2 ** copy.readUInt16LE(30);
    const fatSector = copy.readUInt32LE(76);
    const directorySector = copy.readUInt32LE(48);
    copy.writeUInt32LE(directorySector, (fatSector + 1) * sectorSize + directorySector * 4);
    expect(() => rejectEncryptedWord(copy)).toThrow('INTAKE_CORRUPT');
  });
});

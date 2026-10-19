import { IntakeFormatError } from './format-error';

const OLE_MAGIC = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const END = 0xfffffffe;
const FREE = 0xffffffff;

export function isCompoundWord(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(OLE_MAGIC);
}

/** Read only bounded CFB directories/header flags; never decrypt or execute Word data. */
export function rejectEncryptedWord(buffer: Buffer): void {
  try {
    if (!isCompoundWord(buffer) || buffer.length < 512 || buffer.readUInt16LE(28) !== 0xfffe) {
      throw new IntakeFormatError('CORRUPT');
    }
    const shift = buffer.readUInt16LE(30);
    if (shift !== 9 && shift !== 12) throw new IntakeFormatError('CORRUPT');
    const sectorSize = 2 ** shift;
    const sectorCount = Math.floor(buffer.length / sectorSize) - 1;
    const sector = (id: number): Buffer => {
      if (id < 0 || id >= sectorCount) throw new IntakeFormatError('CORRUPT');
      return buffer.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
    };
    const fatSectors: number[] = [];
    for (let at = 76; at < 512; at += 4) {
      const id = buffer.readUInt32LE(at);
      if (id !== FREE) fatSectors.push(id);
    }
    const seenDifat = new Set<number>();
    let difat = buffer.readUInt32LE(68);
    while (difat !== END && difat !== FREE) {
      if (seenDifat.has(difat)) throw new IntakeFormatError('CORRUPT');
      seenDifat.add(difat);
      const block = sector(difat);
      for (let at = 0; at < sectorSize - 4; at += 4) {
        const id = block.readUInt32LE(at);
        if (id !== FREE) fatSectors.push(id);
      }
      difat = block.readUInt32LE(sectorSize - 4);
      if (fatSectors.length > sectorCount) throw new IntakeFormatError('CORRUPT');
    }
    if (
      fatSectors.length > sectorCount ||
      new Set(fatSectors).size !== fatSectors.length ||
      fatSectors.length !== buffer.readUInt32LE(44)
    )
      throw new IntakeFormatError('CORRUPT');
    const fat = Buffer.concat(fatSectors.map(sector));
    const chain = (
      start: number,
      table: Buffer,
      blockSize: number,
      data: (id: number) => Buffer,
    ): Buffer => {
      const seen = new Set<number>();
      const blocks: Buffer[] = [];
      let id = start;
      while (id !== END) {
        if (
          seen.has(id) ||
          id * 4 + 4 > table.length ||
          blocks.length * blockSize > buffer.length
        ) {
          throw new IntakeFormatError('CORRUPT');
        }
        seen.add(id);
        blocks.push(data(id));
        id = table.readUInt32LE(id * 4);
      }
      return Buffer.concat(blocks);
    };
    const directory = chain(buffer.readUInt32LE(48), fat, sectorSize, sector);
    const streams = new Map<string, { start: number; size: number }>();
    for (let at = 0; at + 128 <= directory.length; at += 128) {
      const type = directory[at + 66];
      if (type !== 2 && type !== 5) continue;
      const nameLength = directory.readUInt16LE(at + 64);
      if (nameLength < 2 || nameLength > 64 || nameLength % 2)
        throw new IntakeFormatError('CORRUPT');
      const name = directory.subarray(at, at + nameLength - 2).toString('utf16le');
      const size = Number(directory.readBigUInt64LE(at + 120));
      if (size > buffer.length) throw new IntakeFormatError('CORRUPT');
      streams.set(name, { start: directory.readUInt32LE(at + 116), size });
    }
    if (streams.has('EncryptionInfo') || streams.has('EncryptedPackage'))
      throw new IntakeFormatError('ENCRYPTED');
    const word = streams.get('WordDocument');
    if (!word || word.size < 32) throw new IntakeFormatError('CORRUPT');
    let header: Buffer;
    if (word.size >= buffer.readUInt32LE(56)) {
      header = sector(word.start);
    } else {
      const root = streams.get('Root Entry');
      if (!root) throw new IntakeFormatError('CORRUPT');
      const miniStream = chain(root.start, fat, sectorSize, sector);
      const offset = word.start * 64;
      if (offset + 32 > miniStream.length) throw new IntakeFormatError('CORRUPT');
      header = miniStream.subarray(offset, offset + 64);
    }
    if (header.readUInt16LE(0) !== 0xa5ec) throw new IntakeFormatError('CORRUPT');
    if ((header.readUInt16LE(10) & 0x8100) !== 0) throw new IntakeFormatError('ENCRYPTED');
  } catch (error) {
    if (error instanceof IntakeFormatError) throw error;
    throw new IntakeFormatError('CORRUPT');
  }
}

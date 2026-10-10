import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { runFormatTool } from './format-tools';
import { readWord, DOCX_MIME } from './word-reader';
import { extractInvoiceFields } from '../extraction/rules/invoice-rules-extractor';
import { MAX_INTAKE_TEXT } from './format-error';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const relType =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const relationship = `<Relationship Id="main" Type="${relType}" Target="word/document.xml"/>`;
const types =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const relationships = (content = relationship): string =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${content}</Relationships>`;
const documentXml = (content: string): string =>
  `<w:document xmlns:w="${ns}"><w:body>${content}</w:body></w:document>`;

/** Stored ZIP with a real central directory, no parser mocks or host tools. */
function zip(entries: [string, string][], flags = 0): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text);
    // Traditional encrypted entries declare a 12-byte encryption header.
    const payload = flags & 1 ? Buffer.concat([Buffer.alloc(12), data]) : data;
    const filename = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 14);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, payload);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(flags, 8);
    header.copy(entry, 16, 14, 26);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, filename);
    offset += header.length + filename.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function packageParts(content = '<w:p><w:r><w:t>Text</w:t></w:r></w:p>'): [string, string][] {
  return [
    ['[Content_Types].xml', types],
    ['_rels/.rels', relationships()],
    ['word/document.xml', documentXml(content)],
  ];
}

jest.mock('./format-tools', () => ({ runFormatTool: jest.fn() }));
const run = jest.mocked(runFormatTool);
const fixture = resolve(__dirname, '../../../../test/fixtures/formats/table-long.docx');

describe('Word reader', () => {
  beforeEach(() => run.mockReset());
  it('reads the real DOCX table and all long text using the Node ZIP/XML reader', async () => {
    const text = await readWord(await readFile(fixture), DOCX_MIME);
    expect(text.length).toBeGreaterThan(4000);
    expect(text).toContain('Grand total:\t228.0000');
    const fields = extractInvoiceFields(text);
    expect(fields.total?.value.toFixed(4)).toBe('228.0000');
    expect(fields.tax?.value.toFixed(4)).toBe('28.0000');
    expect(fields.invoiceNumber?.value).toBe('FMT-17');
    expect(fields.date?.value).toBe('2026-09-01');
    expect(fields.vendorName?.value).toBe('Formats Synthetic Supplier');
    expect(
      extractInvoiceFields('Supplier\tFormats Synthetic Supplier\nGrand total\t228.0000').vendorName
        ?.value,
    ).toBe('Formats Synthetic Supplier');
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects a genuinely corrupt ZIP through the real parser', async () => {
    await expect(readWord(Buffer.from('PK\x03\x04broken'), DOCX_MIME)).rejects.toThrow(
      'INTAKE_CORRUPT',
    );
  });
  it.each([
    ['embedded-image.docx', 'UNSUPPORTED_CONTENT'],
    ['expanded-too-large.docx', 'TOO_LARGE'],
    ['entity.docx', 'CORRUPT'],
    ['forged-word.docx', 'CORRUPT'],
  ])('rejects actual unsafe DOCX fixture %s without dropping content', async (name, code) => {
    const buffer = await readFile(resolve(__dirname, '../../../../test/fixtures/formats', name));
    await expect(readWord(buffer, DOCX_MIME)).rejects.toThrow(`INTAKE_${code}`);
  });
  it('reads a valid Strict OOXML table without silently dropping its namespace', async () => {
    const strict = await readFile(
      resolve(__dirname, '../../../../test/fixtures/formats/strict-table.docx'),
    );
    const text = await readWord(strict, DOCX_MIME);
    expect(text.length).toBeGreaterThan(4000);
    expect(text).toContain('Grand total:\t228.0000');
    expect(extractInvoiceFields(text).total?.value.toFixed(4)).toBe('228.0000');
  });
  it('rejects legacy MIME without spawning a subprocess', async () => {
    const doc = await readFile(resolve(__dirname, '../../../../test/fixtures/formats/legacy.doc'));
    await expect(readWord(doc, 'application/msword')).rejects.toThrow(
      'INTAKE_UNSUPPORTED_LEGACY_DOC',
    );
    expect(run).not.toHaveBeenCalled();
  });
  it('preserves paragraphs, tabs, breaks, XML characters and table rows', async () => {
    const content =
      '<w:p><w:r><w:t> A &amp; B &#x627; </w:t><w:tab/><w:t>cell</w:t><w:br/><w:t>end</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>label</w:t></w:r></w:p><w:p><w:r><w:t>more</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    await expect(readWord(zip(packageParts(content)), DOCX_MIME)).resolves.toBe(
      ' A & B ا \tcell\nend\nlabel more\tvalue',
    );
  });
  it('reads validated header, footer, footnote and endnote roots', async () => {
    const parts = packageParts();
    for (const [name, root] of [
      ['header1', 'hdr'],
      ['footer1', 'ftr'],
      ['footnotes', 'footnotes'],
      ['endnotes', 'endnotes'],
    ]) {
      parts.push([
        `word/${name}.xml`,
        `<w:${root} xmlns:w="${ns}"><w:p><w:r><w:t>${root}</w:t></w:r></w:p></w:${root}>`,
      ]);
    }
    const text = await readWord(zip(parts), DOCX_MIME);
    for (const word of ['Text', 'hdr', 'ftr', 'footnotes', 'endnotes'])
      expect(text).toContain(word);
  });
  it('preserves literal CDATA without treating its text as entity references', async () => {
    await expect(
      readWord(
        zip(packageParts('<w:p><w:r><w:t><![CDATA[A &amp; B]]></w:t></w:r></w:p>')),
        DOCX_MIME,
      ),
    ).resolves.toBe('A &amp; B');
  });
  it('accepts 1000 entries but rejects the next central directory entry', async () => {
    const parts = packageParts();
    while (parts.length < 1000) parts.push([`unused/${parts.length}`, '']);
    await expect(readWord(zip(parts), DOCX_MIME)).resolves.toBe('Text');
    parts.push(['unused/last', '']);
    await expect(readWord(zip(parts), DOCX_MIME)).rejects.toThrow('INTAKE_TOO_LARGE');
  });
  it('rejects encrypted flag bit 1 before opening XML', async () => {
    await expect(readWord(zip(packageParts(), 1), DOCX_MIME)).rejects.toThrow('INTAKE_ENCRYPTED');
  });
  it.each(['word/vbaProject.bin', 'word/VBAPROJECTextra.bin', 'word/document.xml'])(
    'rejects macro or duplicate entry %s',
    async (name) => {
      await expect(readWord(zip([...packageParts(), [name, '']]), DOCX_MIME)).rejects.toThrow(
        'INTAKE_CORRUPT',
      );
    },
  );
  it.each([
    ['', 'missing office relationship'],
    [relationship + relationship, 'duplicate office relationship'],
    [relationship.replace('word/document.xml', 'word/other.xml'), 'wrong target'],
    [relationship.replace('/>', ' TargetMode="External"/>'), 'external target'],
  ])('rejects invalid package relationships: %s (%s)', async (content) => {
    const parts = packageParts();
    parts[1][1] = relationships(content);
    await expect(readWord(zip(parts), DOCX_MIME)).rejects.toThrow('INTAKE_CORRUPT');
  });
  it.each([
    types.replace('Override', 'Default'),
    types.replace('/word/document.xml', '/word/other.xml'),
    types.replace('document.main+xml', 'template.main+xml'),
  ])('requires the exact document content type Override: %s', async (content) => {
    const parts = packageParts();
    parts[0][1] = content;
    await expect(readWord(zip(parts), DOCX_MIME)).rejects.toThrow('INTAKE_CORRUPT');
  });
  it.each(['altChunk', 'object', 'blip'])(
    'rejects unsupported %s without losing evidence',
    async (tag) => {
      await expect(readWord(zip(packageParts(`<w:${tag}/>`)), DOCX_MIME)).rejects.toThrow(
        'INTAKE_UNSUPPORTED_CONTENT',
      );
    },
  );
  it.each([
    '<!DOCTYPE w:document>' + documentXml(''),
    '<!ENTITY injected "secret">' + documentXml(''),
    documentXml('').replace(ns, 'urn:forged'),
    documentXml('').replace('<w:body>', '<w:p>').replace('</w:body>', '</w:p>'),
    '<w:document>',
    documentXml('<w:p><w:r><w:t>&undeclared;</w:t></w:r></w:p>'),
    documentXml('<w:p><w:r><w:t>&#0;</w:t></w:r></w:p>'),
    documentXml('<w:p><unbound:t>lost text</unbound:t></w:p>'),
    documentXml('<w:p unbound:attr="invalid"/>'),
  ])('rejects unsafe or malformed XML %s', async (content) => {
    const parts = packageParts();
    parts[2][1] = content;
    await expect(readWord(zip(parts), DOCX_MIME)).rejects.toThrow('INTAKE_CORRUPT');
  });
  it('rejects an invalid auxiliary XML root', async () => {
    await expect(
      readWord(zip([...packageParts(), ['word/header1.xml', '<forged/>']]), DOCX_MIME),
    ).rejects.toThrow('INTAKE_CORRUPT');
  });
  it('accepts 200000 characters and rejects the next character without truncating', async () => {
    const parts = packageParts(`<w:p><w:r><w:t>${'x'.repeat(MAX_INTAKE_TEXT)}</w:t></w:r></w:p>`);
    expect((await readWord(zip(parts), DOCX_MIME)).length).toBe(MAX_INTAKE_TEXT);
    parts[2][1] = parts[2][1].replace('</w:t>', 'x</w:t>');
    await expect(readWord(zip(parts), DOCX_MIME)).rejects.toThrow('INTAKE_TOO_LARGE');
  });
});

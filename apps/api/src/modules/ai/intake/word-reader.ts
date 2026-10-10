import { fromBuffer, Entry, ZipFile } from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { checkTextLimit, IntakeFormatError, MAX_INTAKE_BYTES } from './format-error';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NAMESPACES = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
];
const TYPE_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
interface OrderedNode {
  [key: string]: OrderedNode[] | string | Record<string, string>;
}
interface Element {
  name: string;
  namespace: string;
  attributes: Record<string, string>;
  children: Element[];
  text: string;
}

/** Decode XML character references only; undeclared entities remain corrupt. */
function decodeXmlCharacters(text: string): string {
  const predefined: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };
  return text.replace(/&([^;]*);|&/g, (_match, entity: string | undefined) => {
    if (entity && Object.prototype.hasOwnProperty.call(predefined, entity))
      return predefined[entity];
    if (!entity || !/^#(?:x[\da-fA-F]+|\d+)$/.test(entity)) throw new IntakeFormatError('CORRUPT');
    const code = entity.startsWith('#x')
      ? parseInt(entity.slice(2), 16)
      : parseInt(entity.slice(1), 10);
    if (
      ![9, 10, 13].includes(code) &&
      !(code >= 0x20 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    ) {
      throw new IntakeFormatError('CORRUPT');
    }
    return String.fromCodePoint(code);
  });
}

function elements(
  nodes: OrderedNode[],
  inherited: Record<string, string> = { xml: 'http://www.w3.org/XML/1998/namespace' },
): Element[] {
  return nodes.flatMap((node) => {
    const tag = Object.keys(node).find((key) => key !== ':@' && !key.startsWith('#'));
    if (!tag || tag.startsWith('?') || tag.startsWith('!')) return [];
    const attributes = Object.fromEntries(
      Object.entries((node[':@'] ?? {}) as Record<string, string>).map(([key, value]) => [
        key,
        decodeXmlCharacters(value),
      ]),
    );
    const namespaces = { ...inherited };
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'xmlns') namespaces[''] = value;
      if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
    }
    const split = tag.indexOf(':');
    if (split >= 0 && !namespaces[tag.slice(0, split)]) throw new IntakeFormatError('CORRUPT');
    for (const key of Object.keys(attributes)) {
      const colon = key.indexOf(':');
      if (colon >= 0 && !key.startsWith('xmlns:') && !namespaces[key.slice(0, colon)]) {
        throw new IntakeFormatError('CORRUPT');
      }
    }
    const content = node[tag] as OrderedNode[];
    return [
      {
        name: split < 0 ? tag : tag.slice(split + 1),
        namespace: namespaces[split < 0 ? '' : tag.slice(0, split)] ?? '',
        attributes,
        children: elements(content, namespaces),
        text: content
          .map((child) => {
            if (typeof child['#text'] === 'string') return decodeXmlCharacters(child['#text']);
            const cdata = child['#cdata'] as OrderedNode[] | undefined;
            return cdata?.map((value) => value['#text']).join('') ?? '';
          })
          .join(''),
      },
    ];
  });
}

function xml(data: Buffer): Element {
  // Decode only UTF-8 package XML, as in the previous reader. No DTD or declared entities.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) {
    throw new IntakeFormatError('CORRUPT');
  }
  const parsed: unknown = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    processEntities: false,
    cdataPropName: '#cdata',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  }).parse(source);
  const roots = elements(parsed as OrderedNode[]);
  if (roots.length !== 1) throw new IntakeFormatError('CORRUPT');
  return roots[0];
}

function descendants(element: Element): Element[] {
  return [element, ...element.children.flatMap(descendants)];
}

function paragraph(element: Element, namespace: string): string {
  return descendants(element)
    .map((node) => {
      if (node.namespace !== namespace) return '';
      if (node.name === 't') return node.text;
      if (node.name === 'tab') return '\t';
      if (node.name === 'br' || node.name === 'cr') return '\n';
      return '';
    })
    .join('');
}

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new IntakeFormatError('CORRUPT'));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('error', reject);
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > entry.uncompressedSize || size > MAX_INTAKE_BYTES) {
          stream.destroy(new IntakeFormatError('TOO_LARGE'));
        } else chunks.push(chunk);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

function directory(buffer: Buffer): Promise<{ zip: ZipFile; entries: Map<string, Entry> }> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map<string, Entry>();
      let declared = 0;
      const fail = (failure: Error): void => {
        zip.close();
        reject(failure);
      };
      zip.on('error', fail);
      if (zip.entryCount > 1000) return fail(new IntakeFormatError('TOO_LARGE'));
      zip.on('entry', (entry: Entry) => {
        declared += entry.uncompressedSize;
        if (entries.size >= 1000 || declared > MAX_INTAKE_BYTES)
          return fail(new IntakeFormatError('TOO_LARGE'));
        if (entry.generalPurposeBitFlag & 1) return fail(new IntakeFormatError('ENCRYPTED'));
        if (entries.has(entry.fileName) || /vbaproject/i.test(entry.fileName))
          return fail(new IntakeFormatError('CORRUPT'));
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve({ zip, entries }));
      zip.readEntry();
    });
  });
}

/** In-memory DOCX only: inspect the entire directory before opening bounded XML streams. */
export async function readWord(buffer: Buffer, mime: string): Promise<string> {
  if (mime !== DOCX_MIME)
    throw new IntakeFormatError(
      mime === 'application/msword' ? 'UNSUPPORTED_LEGACY_DOC' : 'UNSUPPORTED',
    );
  if (buffer.length > MAX_INTAKE_BYTES) throw new IntakeFormatError('TOO_LARGE');
  let opened: ZipFile | undefined;
  try {
    const { zip, entries } = await directory(buffer);
    opened = zip;
    const part = async (name: string): Promise<Element> => {
      const entry = entries.get(name);
      if (!entry) throw new IntakeFormatError('CORRUPT');
      return xml(await readEntry(zip, entry));
    };
    const types = await part('[Content_Types].xml');
    if (
      types.name !== 'Types' ||
      types.namespace !== TYPE_NS ||
      !types.children.some(
        (node) =>
          node.name === 'Override' &&
          node.namespace === TYPE_NS &&
          node.attributes.PartName === '/word/document.xml' &&
          node.attributes.ContentType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      )
    ) {
      throw new IntakeFormatError('CORRUPT');
    }
    const rels = await part('_rels/.rels');
    const office = rels.children.filter(
      (node) =>
        node.name === 'Relationship' &&
        node.namespace === REL_NS &&
        [
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
          'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
        ].includes(node.attributes.Type),
    );
    if (
      rels.name !== 'Relationships' ||
      rels.namespace !== REL_NS ||
      office.length !== 1 ||
      office[0].attributes.Target?.replace(/^\/+/, '') !== 'word/document.xml' ||
      office[0].attributes.TargetMode === 'External'
    ) {
      throw new IntakeFormatError('CORRUPT');
    }
    const main = await part('word/document.xml');
    const ns = main.namespace;
    if (
      main.name !== 'document' ||
      !WORD_NAMESPACES.includes(ns) ||
      !main.children.some((node) => node.name === 'body' && node.namespace === ns)
    ) {
      throw new IntakeFormatError('CORRUPT');
    }
    const parts = [
      'word/document.xml',
      ...[...entries.keys()]
        .filter(
          (name) =>
            (/^word\/(header|footer)/.test(name) ||
              ['word/footnotes.xml', 'word/endnotes.xml'].includes(name)) &&
            name.endsWith('.xml'),
        )
        .sort(),
    ];
    const lines: string[] = [];
    const blocks = (element: Element): void => {
      for (const node of element.children) {
        if (node.namespace === ns && node.name === 'p') lines.push(paragraph(node, ns));
        else if (node.namespace === ns && node.name === 'tbl') {
          for (const row of node.children.filter(
            (child) => child.namespace === ns && child.name === 'tr',
          )) {
            lines.push(
              row.children
                .filter((cell) => cell.namespace === ns && cell.name === 'tc')
                .map((cell) =>
                  descendants(cell)
                    .filter((child) => child.namespace === ns && child.name === 'p')
                    .map((p) => paragraph(p, ns))
                    .join(' '),
                )
                .join('\t'),
            );
          }
        } else blocks(node);
      }
    };
    for (const name of parts) {
      const root = name === 'word/document.xml' ? main : await part(name);
      if (
        root.namespace !== ns ||
        !['document', 'hdr', 'ftr', 'footnotes', 'endnotes'].includes(root.name)
      )
        throw new IntakeFormatError('CORRUPT');
      if (descendants(root).some((node) => ['blip', 'altChunk', 'object'].includes(node.name)))
        throw new IntakeFormatError('UNSUPPORTED_CONTENT');
      blocks(root);
    }
    return checkTextLimit(lines.join('\n'));
  } catch (error) {
    if (error instanceof IntakeFormatError) throw error;
    throw new IntakeFormatError('CORRUPT');
  } finally {
    opened?.close();
  }
}

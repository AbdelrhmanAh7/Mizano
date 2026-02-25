import {
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeText,
  tokenize,
  jaccardSimilarity,
  containsReference,
  containsAnyReference,
  extractNumbers,
  extractDocumentNumbers,
  documentNumberSimilarity,
  findBestMatch,
  nGramSimilarity,
  wordOverlapRatio,
  generateDescriptionHash,
  extractPattern,
  patternMatches,
} from './text-similarity.util';

describe('text-similarity.util', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should return length of other string when one is empty', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
    });

    it('should calculate edit distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
    });

    it('should handle single character difference', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 1 for two empty strings', () => {
      expect(levenshteinSimilarity('', '')).toBe(1);
    });

    it('should return 0 for completely different strings of same length', () => {
      // 'abc' vs 'xyz' = distance 3, maxLen 3, similarity = 0
      expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should return value between 0 and 1', () => {
      const sim = levenshteinSimilarity('hello', 'hallo');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('normalizeText', () => {
    it('should convert to lowercase', () => {
      expect(normalizeText('HELLO World')).toBe('hello world');
    });

    it('should remove special characters', () => {
      expect(normalizeText('hello@world!')).toBe('hello world');
    });

    it('should normalize whitespace', () => {
      expect(normalizeText('  hello   world  ')).toBe('hello world');
    });

    it('should preserve Arabic characters', () => {
      const result = normalizeText('مرحبا');
      expect(result).toContain('مرحبا');
    });
  });

  describe('tokenize', () => {
    it('should split into words', () => {
      expect(tokenize('hello world')).toEqual(['hello', 'world']);
    });

    it('should normalize before tokenizing', () => {
      expect(tokenize('HELLO World!')).toEqual(['hello', 'world']);
    });

    it('should filter empty tokens', () => {
      expect(tokenize('  hello  ')).toEqual(['hello']);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 0 for empty sets', () => {
      expect(jaccardSimilarity([], [])).toBe(0);
    });

    it('should return 1 for identical sets', () => {
      expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    it('should calculate correctly for overlapping sets', () => {
      // Intersection: {a, b}, Union: {a, b, c, d} → 2/4 = 0.5
      expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'd'])).toBeCloseTo(0.5, 5);
    });
  });

  describe('containsReference', () => {
    it('should find reference in text (case-insensitive)', () => {
      expect(containsReference('Payment for INV-001', 'inv-001')).toBe(true);
    });

    it('should return false when not found', () => {
      expect(containsReference('Random text', 'inv-001')).toBe(false);
    });
  });

  describe('containsAnyReference', () => {
    it('should find any matching reference', () => {
      expect(containsAnyReference('Payment for INV-001', ['inv-001', 'inv-002'])).toBe(true);
    });

    it('should return false when none match', () => {
      expect(containsAnyReference('Random text', ['inv-001', 'inv-002'])).toBe(false);
    });
  });

  describe('extractNumbers', () => {
    it('should extract numbers from text', () => {
      expect(extractNumbers('Total: $1,234.56 and tax 100.00')).toEqual([1234.56, 100.0]);
    });

    it('should handle text with no numbers', () => {
      expect(extractNumbers('no numbers here')).toEqual([]);
    });
  });

  describe('extractDocumentNumbers', () => {
    it('should extract invoice numbers', () => {
      const result = extractDocumentNumbers('Payment for INV-12345');
      expect(result).toContain('12345');
    });

    it('should extract bill numbers', () => {
      const result = extractDocumentNumbers('Bill BILL-67890 received');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should extract reference numbers', () => {
      const result = extractDocumentNumbers('REF: ABC-123');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should deduplicate results', () => {
      const result = extractDocumentNumbers('INV-001 invoice INV-001');
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });
  });

  describe('documentNumberSimilarity', () => {
    it('should return 1 for identical numbers', () => {
      expect(documentNumberSimilarity('INV-001', 'INV-001')).toBe(1);
    });

    it('should return 1 for same number after normalization', () => {
      expect(documentNumberSimilarity('INV-001', 'INV 001')).toBe(1);
      expect(documentNumberSimilarity('inv-001', 'INV001')).toBe(1);
    });

    it('should return 0.9 when one contains the other', () => {
      expect(documentNumberSimilarity('001', 'INV001')).toBe(0.9);
    });
  });

  describe('findBestMatch', () => {
    it('should find the best matching string', () => {
      const result = findBestMatch('hello', ['hallo', 'world', 'help']);
      expect(result.match).toBe('hallo');
      expect(result.similarity).toBeGreaterThan(0.6);
    });

    it('should return null when no match above threshold', () => {
      const result = findBestMatch('abc', ['xyz', 'uvw'], 0.8);
      expect(result.match).toBeNull();
    });

    it('should return correct index', () => {
      const result = findBestMatch('test', ['best', 'rest', 'test']);
      expect(result.index).toBe(2);
      expect(result.similarity).toBe(1);
    });
  });

  describe('nGramSimilarity', () => {
    it('should return 0 for completely different strings', () => {
      expect(nGramSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should return 1 for identical strings', () => {
      expect(nGramSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return value between 0 and 1 for similar strings', () => {
      const sim = nGramSimilarity('hello world', 'hello earth');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('wordOverlapRatio', () => {
    it('should return 0 for no overlap', () => {
      expect(wordOverlapRatio('hello world', 'foo bar')).toBe(0);
    });

    it('should return 1 for identical strings', () => {
      expect(wordOverlapRatio('hello world', 'hello world')).toBe(1);
    });

    it('should handle partial overlap', () => {
      expect(wordOverlapRatio('hello world', 'hello there')).toBe(0.5);
    });
  });

  describe('generateDescriptionHash', () => {
    it('should produce consistent hash for same input', () => {
      const hash1 = generateDescriptionHash('test description');
      const hash2 = generateDescriptionHash('test description');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = generateDescriptionHash('test one');
      const hash2 = generateDescriptionHash('test two');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractPattern', () => {
    it('should replace dates with {DATE}', () => {
      expect(extractPattern('Invoice 01/15/2024')).toContain('{DATE}');
    });

    it('should replace numbers with {NUM}', () => {
      expect(extractPattern('Payment of 1234.56')).toContain('{NUM}');
    });

    it('should normalize whitespace', () => {
      const pattern = extractPattern('  hello   world  ');
      expect(pattern).not.toContain('  ');
    });
  });

  describe('patternMatches', () => {
    it('should match identical patterns', () => {
      const pattern = extractPattern('Rent payment 1000.00');
      expect(patternMatches(pattern, 'Rent payment 2000.00')).toBe(true);
    });

    it('should not match different patterns', () => {
      const pattern = extractPattern('Rent payment 1000.00');
      expect(patternMatches(pattern, 'Salary for employee')).toBe(false);
    });
  });
});

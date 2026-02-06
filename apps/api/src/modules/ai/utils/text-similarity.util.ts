/**
 * Text similarity utilities for reconciliation matching and OCR
 */

/**
 * Calculate the Levenshtein distance between two strings
 * Uses dynamic programming for optimal performance
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Handle edge cases
  if (m === 0) return n;
  if (n === 0) return m;

  // Create DP matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first column
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j], // deletion
            dp[i][j - 1], // insertion
            dp[i - 1][j - 1], // substitution
          );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate Levenshtein similarity as a ratio (0-1)
 * 1 = identical, 0 = completely different
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return (maxLen - distance) / maxLen;
}

/**
 * Normalize text for comparison
 * Removes special characters, converts to lowercase, normalizes whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\u0600-\u06FF]/g, ' ') // Keep alphanumeric and Arabic characters
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize text into words
 */
export function tokenize(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

/**
 * Calculate Jaccard similarity between two sets of tokens
 * Returns a value between 0 and 1
 */
export function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = [...set1].filter((x) => set2.has(x));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

/**
 * Check if text contains a reference (case-insensitive)
 */
export function containsReference(text: string, reference: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedRef = normalizeText(reference);
  return normalizedText.includes(normalizedRef);
}

/**
 * Check if text contains any of the given references
 */
export function containsAnyReference(
  text: string,
  references: string[],
): boolean {
  const normalizedText = normalizeText(text);
  return references.some((ref) =>
    normalizedText.includes(normalizeText(ref)),
  );
}

/**
 * Extract numbers from text
 */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/[\d,]+\.?\d*/g) || [];
  return matches
    .map((m) => parseFloat(m.replace(/,/g, '')))
    .filter((n) => !isNaN(n));
}

/**
 * Extract potential invoice/bill numbers from text
 */
export function extractDocumentNumbers(text: string): string[] {
  const patterns = [
    /INV[-\s]?(\d{3,})/gi,
    /INVOICE[-\s#:]?\s*([A-Z0-9\-]+)/gi,
    /BILL[-\s#:]?\s*([A-Z0-9\-]+)/gi,
    /REF[-:\s]?\s*([A-Z0-9\-]{3,})/gi,
    /#\s*([A-Z0-9\-]{3,})/gi,
    /PO[-\s#:]?\s*([A-Z0-9\-]+)/gi,
  ];

  const results: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      results.push(match[1].trim());
    }
  }
  return [...new Set(results)];
}

/**
 * Calculate the similarity between two document numbers
 * Handles common variations like "INV-001" vs "INV001"
 */
export function documentNumberSimilarity(num1: string, num2: string): number {
  // Normalize document numbers
  const normalize = (n: string) =>
    n.toUpperCase().replace(/[-\s]/g, '');
  const n1 = normalize(num1);
  const n2 = normalize(num2);

  // Check for exact match after normalization
  if (n1 === n2) return 1;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Fall back to Levenshtein
  return levenshteinSimilarity(n1, n2);
}

/**
 * Find the best match for a reference in a list of candidates
 */
export function findBestMatch(
  target: string,
  candidates: string[],
  threshold: number = 0.6,
): { match: string | null; similarity: number; index: number } {
  let bestMatch: string | null = null;
  let bestSimilarity = 0;
  let bestIndex = -1;

  for (let i = 0; i < candidates.length; i++) {
    const similarity = levenshteinSimilarity(
      normalizeText(target),
      normalizeText(candidates[i]),
    );
    if (similarity > bestSimilarity && similarity >= threshold) {
      bestSimilarity = similarity;
      bestMatch = candidates[i];
      bestIndex = i;
    }
  }

  return { match: bestMatch, similarity: bestSimilarity, index: bestIndex };
}

/**
 * Calculate n-gram similarity between two strings
 * @param n Size of n-grams (default: 2 for bigrams)
 */
export function nGramSimilarity(
  str1: string,
  str2: string,
  n: number = 2,
): number {
  const getNGrams = (str: string): Set<string> => {
    const normalized = normalizeText(str);
    const ngrams = new Set<string>();
    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.add(normalized.substring(i, i + n));
    }
    return ngrams;
  };

  const ngrams1 = getNGrams(str1);
  const ngrams2 = getNGrams(str2);

  const intersection = [...ngrams1].filter((g) => ngrams2.has(g));
  const union = new Set([...ngrams1, ...ngrams2]);

  return union.size === 0 ? 0 : intersection.length / union.size;
}

/**
 * Check if a string starts with any of the given prefixes
 */
export function startsWithAny(
  text: string,
  prefixes: string[],
  caseInsensitive: boolean = true,
): boolean {
  const normalizedText = caseInsensitive ? text.toLowerCase() : text;
  return prefixes.some((prefix) => {
    const normalizedPrefix = caseInsensitive ? prefix.toLowerCase() : prefix;
    return normalizedText.startsWith(normalizedPrefix);
  });
}

/**
 * Calculate word overlap ratio between two strings
 */
export function wordOverlapRatio(str1: string, str2: string): number {
  const words1 = new Set(tokenize(str1));
  const words2 = new Set(tokenize(str2));

  const intersection = [...words1].filter((w) => words2.has(w));
  const minSize = Math.min(words1.size, words2.size);

  return minSize === 0 ? 0 : intersection.length / minSize;
}

/**
 * Generate a hash for a description (for pattern matching)
 */
export function generateDescriptionHash(description: string): string {
  const normalized = normalizeText(description);
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Extract a pattern from a description for learning
 * Replaces specific numbers/dates with placeholders
 */
export function extractPattern(description: string): string {
  return description
    .replace(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g, '{DATE}')
    .replace(/\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/g, '{DATE}')
    .replace(/[\d,]+\.?\d*/g, '{NUM}')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a pattern matches a description
 */
export function patternMatches(pattern: string, description: string): boolean {
  const extractedPattern = extractPattern(description);
  return (
    normalizeText(pattern) === normalizeText(extractedPattern) ||
    levenshteinSimilarity(
      normalizeText(pattern),
      normalizeText(extractedPattern),
    ) > 0.85
  );
}

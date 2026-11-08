// Robust Ceramic Item Normalizer and Token-Set Fuzzy Matcher

export const COMMON_CERAMIC_BRANDS = [
  'nitco',
  'kaj',
  'kajaria',
  'agl',
  'somany',
  'simpolo',
  'qutone',
  'orient',
  'orientbell',
  'rak',
  'johnson',
  'varmora',
  'sunhearrt',
  'anuj',
  'spaniso',
  'lavit',
  'kohler',
  'jaquar',
  'cera',
  'hindware',
  'kerovit',
  'grohe',
  'american standard',
  'tostem',
];

/**
 * Normalizes ceramic/tile descriptions by:
 * 1. Stripping brand prefixes (Nitco, KAJ, AGL, Somany, Simpolo...)
 * 2. Stripping tile dimensions (600x1200, 800x1600, 1200x1800, 300*600...)
 * 3. Removing punctuation, symbols, and extra spaces
 * 4. Lower-casing
 */
export function normalizeCeramicName(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase();

  // Strip brand names
  const brandPattern = new RegExp(`\\b(${COMMON_CERAMIC_BRANDS.join('|')})\\b`, 'gi');
  s = s.replace(brandPattern, ' ');

  // Strip standard ceramic dimensions: e.g. 600x1200, 600X1200, 600*1200, 1200/1800
  s = s.replace(/\b\d{3,4}\s*[*xX/]\s*\d{3,4}\b/g, ' ');

  // Strip non-alphanumeric characters (keep spaces)
  s = s.replace(/[^a-z0-9\s]/g, ' ');

  // Remove common filler words that don't differentiate items
  s = s.replace(/\b(tiles?|ceramic|vitrified|gvt|pgvt|slab|series)\b/g, ' ');

  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Calculates Token-Set Sorensen-Dice similarity between two strings (0.0 to 1.0)
 */
export function calculateDiceSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeCeramicName(str1);
  const norm2 = normalizeCeramicName(str2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  const tokens1 = norm1.split(' ').filter(Boolean);
  const tokens2 = norm2.split(' ').filter(Boolean);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let matches = 0;
  for (const t of set1) {
    if (set2.has(t)) {
      matches++;
    } else {
      // Check for minor typographical variance (Levenshtein within token)
      for (const t2 of set2) {
        if (t.length >= 4 && t2.length >= 4 && levenshteinDistance(t, t2) <= 1) {
          matches += 0.9;
          break;
        }
      }
    }
  }

  return (2 * matches) / (set1.size + set2.size);
}

/**
 * Computes Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export interface MatchResult {
  bestMatch: any | null;
  score: number;
  confidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

/**
 * Matches an invoice line description against a list of quotation items
 */
export function matchInvoiceItemToQuotationItems(
  invoiceItemDesc: string,
  quotationItems: any[]
): MatchResult {
  if (!invoiceItemDesc || !quotationItems || quotationItems.length === 0) {
    return { bestMatch: null, score: 0, confidence: 'NONE' };
  }

  let highestScore = 0;
  let bestItem: any = null;

  for (const qItem of quotationItems) {
    const qDesc = qItem.description || '';
    const score = calculateDiceSimilarity(invoiceItemDesc, qDesc);

    if (score > highestScore) {
      highestScore = score;
      bestItem = qItem;
    }
  }

  let confidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
  if (highestScore >= 0.95) {
    confidence = 'EXACT';
  } else if (highestScore >= 0.75) {
    confidence = 'HIGH';
  } else if (highestScore >= 0.55) {
    confidence = 'MEDIUM';
  } else if (highestScore > 0.3) {
    confidence = 'LOW';
  }

  return {
    bestMatch: highestScore >= 0.55 ? bestItem : null,
    score: Math.round(highestScore * 100) / 100,
    confidence,
  };
}

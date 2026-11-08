// Robust Ceramic Item Normalizer and 3-Pass Fuzzy Matcher

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
  s = s.replace(/\b\d{2,4}\s*[*xX/]\s*\d{2,4}\b/g, ' ');

  // Strip non-alphanumeric characters (keep spaces)
  s = s.replace(/[^a-z0-9\s]/g, ' ');

  // Remove common filler words that don't differentiate items
  s = s.replace(/\b(tiles?|ceramic|vitrified|gvt|pgvt|slab|series)\b/g, ' ');

  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Basic alphanumeric text cleaner for tokenization and inclusion checks
 */
export function cleanText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ItemMatchEvaluation {
  isMatch: boolean;
  score: number;
  pass: 1 | 2 | 3 | 0;
  confidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matchedTokens?: string[];
}

/**
 * 3-Pass Substring & Token-Subset Matching Algorithm:
 * - Pass 1: Direct Substring Check (iClean includes qClean OR qClean includes iClean) -> 100% Match
 * - Pass 2: Token-Subset Overlap (Bag-of-Words >= 70% of quotation keywords present in invoice)
 * - Pass 3: Brand, Dimension & Packaging Stripping Regex + Retry Pass 1/2
 */
export function isItemMatch(quoteName: string, invoiceDesc: string): ItemMatchEvaluation {
  const qClean = cleanText(quoteName);
  const iClean = cleanText(invoiceDesc);

  if (!qClean || !iClean) {
    return { isMatch: false, score: 0, pass: 0, confidence: 'NONE' };
  }

  // PASS 1: Normalized Substring Check
  // E.g. "Nitco 600x1200 FRESSIA WHITE GLOSSY".includes("FRESSIA WHITE GLOSSY") -> TRUE
  if (iClean.includes(qClean) || qClean.includes(iClean)) {
    return { isMatch: true, score: 1.0, pass: 1, confidence: 'EXACT' };
  }

  // PASS 2: Token-Subset Matching (Bag of Words)
  const qTokens = qClean.split(' ').filter((t) => t.length > 2);
  if (qTokens.length > 0) {
    const matchedTokens = qTokens.filter((t) => iClean.includes(t));
    const ratio = matchedTokens.length / qTokens.length;
    if (ratio >= 0.7) {
      return {
        isMatch: true,
        score: Math.round(ratio * 100) / 100,
        pass: 2,
        confidence: ratio >= 0.95 ? 'EXACT' : 'HIGH',
        matchedTokens,
      };
    }
  }

  // PASS 3: Brand & Size & Packaging Stripping Regex
  const brandPattern = new RegExp(`\\b(${COMMON_CERAMIC_BRANDS.join('|')})\\b`, 'gi');
  const dimPattern = /\b\d{2,4}\s*[*xX/]\s*\d{2,4}\b/g;
  const pkgPattern = /\b\d+\s*(?:pc|pcs|nos|box|boxes)\b/gi;

  const strippedI = iClean
    .replace(brandPattern, ' ')
    .replace(dimPattern, ' ')
    .replace(pkgPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const strippedQ = qClean
    .replace(brandPattern, ' ')
    .replace(dimPattern, ' ')
    .replace(pkgPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (strippedI && strippedQ) {
    // Retry Substring Check on stripped strings
    if (strippedI.includes(strippedQ) || strippedQ.includes(strippedI)) {
      return { isMatch: true, score: 0.95, pass: 3, confidence: 'HIGH' };
    }

    // Retry Token-Subset on stripped strings
    const sTokens = strippedQ.split(' ').filter((t) => t.length > 2);
    if (sTokens.length > 0) {
      const sMatches = sTokens.filter((t) => strippedI.includes(t));
      const sRatio = sMatches.length / sTokens.length;
      if (sRatio >= 0.7) {
        return {
          isMatch: true,
          score: Math.round(sRatio * 100) / 100,
          pass: 3,
          confidence: 'HIGH',
          matchedTokens: sMatches,
        };
      }
    }
  }

  // Fallback: Dice similarity check
  const dice = calculateDiceSimilarity(quoteName, invoiceDesc);
  if (dice >= 0.75) {
    return {
      isMatch: true,
      score: Math.round(dice * 100) / 100,
      pass: 3,
      confidence: dice >= 0.9 ? 'EXACT' : 'HIGH',
    };
  }

  return { isMatch: false, score: Math.round(dice * 100) / 100, pass: 0, confidence: 'NONE' };
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
  pass?: number;
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
  let bestConfidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
  let bestPass = 0;

  for (const qItem of quotationItems) {
    const qDesc = qItem.description || '';
    const qBrand = qItem.brand || '';
    const qSize = qItem.size || '';

    // Test direct description
    const eval1 = isItemMatch(qDesc, invoiceItemDesc);
    // Test brand + description
    const eval2 = qBrand ? isItemMatch(`${qBrand} ${qDesc}`, invoiceItemDesc) : null;
    // Test description + size
    const eval3 = qSize ? isItemMatch(`${qDesc} ${qSize}`, invoiceItemDesc) : null;

    const candidates = [eval1, eval2, eval3].filter(Boolean) as ItemMatchEvaluation[];
    const topCandidate = candidates.sort((a, b) => b.score - a.score)[0];

    if (topCandidate && topCandidate.score > highestScore) {
      highestScore = topCandidate.score;
      bestItem = qItem;
      bestConfidence = topCandidate.confidence;
      bestPass = topCandidate.pass;
    }
  }

  return {
    bestMatch: highestScore >= 0.70 ? bestItem : null,
    score: Math.round(highestScore * 100) / 100,
    confidence: highestScore >= 0.70 ? bestConfidence : 'NONE',
    pass: bestPass,
  };
}

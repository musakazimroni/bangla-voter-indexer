/**
 * Bengali Unicode & Text Normalization Layer
 * Provides exact, partial, and fuzzy normalization for Bengali text & voter records.
 */

// Bengali to English digit mapping
const BENGALI_TO_ENGLISH_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

// English to Bengali digit mapping
const ENGLISH_TO_BENGALI_DIGITS: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

/**
 * Convert any Bengali digits in string to English digits
 */
export function bengaliToEnglishDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[০-৯]/g, (ch) => BENGALI_TO_ENGLISH_DIGITS[ch] || ch);
}

/**
 * Convert any English digits in string to Bengali digits
 */
export function englishToBengaliDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[0-9]/g, (ch) => ENGLISH_TO_BENGALI_DIGITS[ch] || ch);
}

/**
 * Canonical Date Normalizer
 * Handles:
 * ০১/০৫/১৯৯৩, 01/05/1993, ০১-০৫-১৯৯৩, 1/5/1993, 01.05.1993
 * Returns canonical format: DD/MM/YYYY in English digits
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  // Convert digits to English
  const engDigits = bengaliToEnglishDigits(dateStr);
  
  // Replace separators with /
  const cleaned = engDigits.replace(/[\.\-\s_]/g, '/');
  const parts = cleaned.split('/').filter(Boolean);
  
  if (parts.length === 3) {
    let day = parts[0];
    let month = parts[1];
    let year = parts[2];

    // Check if input was YYYY-MM-DD
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    }

    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    if (year.length === 2) {
      year = parseInt(year, 10) > 30 ? `19${year}` : `20${year}`;
    }
    return `${day}/${month}/${year}`;
  }
  return cleaned;
}

/**
 * Normalizes Bengali text for indexing and search matching
 * - NFC Unicode normalization
 * - Removes zero-width joiners / non-joiners and invisible spaces
 * - Normalizes Bengali digits to English for uniform number matching
 * - Collapses repeated whitespace
 * - Strips unnecessary punctuation
 * - Preserves original Bengali words
 */
export function normalizeBengaliText(text: string, options: { normalizeDigits?: boolean } = { normalizeDigits: true }): string {
  if (!text) return '';

  let normalized = text.normalize('NFC');

  // Strip Zero-width characters & BOM & formatting marks
  normalized = normalized.replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u200E\u200F]/g, '');

  // Strip non-essential punctuation (keep alphanumeric & Bengali characters)
  normalized = normalized.replace(/[\,\.\:\;\!\?\"\'\(\)\[\]\{\}\\\/\|\#\$\%\^\&\*\+\=\~\`\-_]/g, ' ');

  // Normalize Bengali digits to English digits if option enabled
  if (options.normalizeDigits !== false) {
    normalized = bengaliToEnglishDigits(normalized);
  }

  // Common Bengali character normalization
  // Normalize variations of Khanda-Ta (ৎ) with ত্ if needed, or unify
  normalized = normalized.replace(/\u09CE/g, 'ৎ'); // Bengali letter Khanda Ta
  normalized = normalized.replace(/\u09DC/g, 'ড়'); // RRA
  normalized = normalized.replace(/\u09DD/g, 'ঢ়'); // RHA
  normalized = normalized.replace(/\u09DF/g, 'য়'); // YYA

  // Remove common OCR junk artifacts that sometimes appear in Bengali voter lists:
  // e.g., 'Ï', 'ĵ', 'ś', 'ƀ', 'Ɓ', 'ė', 'ı', 'Ō', 'ũ', 'Ň', 'Ð', 'Ř', 'ů', 'Ů', 'Ĳ'
  // When text is decoded from corrupted OCR, clean common symbols
  normalized = normalized.replace(/[ÏĵśƀƁėıŌũŇÐŘůŮĲ]/g, '');

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim().toLowerCase();

  return normalized;
}

/**
 * Computes Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = [];
  for (let i = 0; i <= b.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Fuzzy match check with threshold
 */
export function isFuzzyMatch(source: string, target: string, maxDistance: number = 2): boolean {
  const normSource = normalizeBengaliText(source);
  const normTarget = normalizeBengaliText(target);

  if (normSource === normTarget) return true;
  if (normSource.includes(normTarget) || normTarget.includes(normSource)) return true;

  // Split into tokens
  const sourceTokens = normSource.split(' ').filter(Boolean);
  const targetTokens = normTarget.split(' ').filter(Boolean);

  // If every target token fuzzy matches at least one source token
  return targetTokens.every((tToken) => {
    return sourceTokens.some((sToken) => {
      if (sToken.includes(tToken) || tToken.includes(sToken)) return true;
      const dist = levenshteinDistance(sToken, tToken);
      const allowed = Math.min(maxDistance, Math.floor(Math.max(sToken.length, tToken.length) * 0.35));
      return dist <= allowed;
    });
  });
}

import { EMERGENCY_KEYWORDS } from '../constants/emergencyKeywords';
import { normalizeText } from '../utils/textNormalizer';

export interface KeywordDetectionResult {
  matchedKeywords: string[];
  count: number;
  isCustomTrigger: boolean;
}

const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Normalizes a custom trigger phrase, expanding camelCase like "HelpNow" to "help now".
 */
export const normalizeTriggerPhrase = (phrase: string): string => {
  if (!phrase) return '';
  const spaced = phrase.replace(/([a-z])([A-Z])/g, '$1 $2');
  return normalizeText(spaced);
};

export const detectKeywords = (text: string, customTrigger?: string): KeywordDetectionResult => {
  let normalizedText = normalizeText(text);
  const matchedKeywords: string[] = [];
  let isCustomTrigger = false;

  if (!normalizedText) {
    return { matchedKeywords: [], count: 0, isCustomTrigger: false };
  }

  // 1. Check custom trigger phrase if configured
  if (customTrigger && customTrigger.trim().length > 0) {
    const normCustom = normalizeTriggerPhrase(customTrigger);
    if (normCustom) {
      // Use word boundaries so "help" does not match "helpful" or partial words
      const customRegex = new RegExp(`\\b${escapeRegex(normCustom)}\\b`, 'gi');
      if (customRegex.test(normalizedText)) {
        matchedKeywords.push(normCustom);
        isCustomTrigger = true;
        console.log(`[KEYWORD_DEBUG] matched custom trigger phrase: "${normCustom}"`);
        // Mask this occurrence
        normalizedText = normalizedText.replace(customRegex, ' '.repeat(normCustom.length));
      } else {
        // Also check if spoken as a single concatenated token without space (e.g. "helpnow")
        const compactCustom = normCustom.replace(/\s+/g, '');
        if (compactCustom && compactCustom !== normCustom) {
          const compactRegex = new RegExp(`\\b${escapeRegex(compactCustom)}\\b`, 'gi');
          if (compactRegex.test(normalizedText)) {
            matchedKeywords.push(normCustom);
            isCustomTrigger = true;
            console.log(`[KEYWORD_DEBUG] matched custom trigger (compact): "${compactCustom}"`);
            normalizedText = normalizedText.replace(compactRegex, ' '.repeat(compactCustom.length));
          }
        }
      }
    }
  }

  // 2. Check standard emergency keywords (sorted by length descending)
  const sortedKeywords = [...EMERGENCY_KEYWORDS].sort((a, b) => b.length - a.length);

  for (const keyword of sortedKeywords) {
    const normKeyword = normalizeText(keyword);
    if (!normKeyword) continue;

    // Use word boundaries to avoid partial word matches
    const keywordRegex = new RegExp(`\\b${escapeRegex(normKeyword)}\\b`, 'gi');
    if (keywordRegex.test(normalizedText)) {
      matchedKeywords.push(normKeyword);
      console.log(`[KEYWORD_DEBUG] matched standard emergency phrase: "${normKeyword}"`);
      // Mask this occurrence to prevent double counting
      normalizedText = normalizedText.replace(keywordRegex, ' '.repeat(normKeyword.length));
    }
  }

  return {
    matchedKeywords,
    count: matchedKeywords.length,
    isCustomTrigger,
  };
};

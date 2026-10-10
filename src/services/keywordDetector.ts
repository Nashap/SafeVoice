import { EMERGENCY_KEYWORDS } from '../constants/emergencyKeywords';
import { normalizeText } from '../utils/textNormalizer';

export interface KeywordDetectionResult {
  matchedKeywords: string[];
  count: number;
}

export const detectKeywords = (text: string): KeywordDetectionResult => {
  let normalizedText = normalizeText(text);
  const matchedKeywords: string[] = [];
  
  if (!normalizedText) {
    return { matchedKeywords: [], count: 0 };
  }

  // Sort keywords by length descending so longer phrases match first
  const sortedKeywords = [...EMERGENCY_KEYWORDS].sort((a, b) => b.length - a.length);

  for (const keyword of sortedKeywords) {
    let index = normalizedText.indexOf(keyword);
    while (index !== -1) {
      matchedKeywords.push(keyword);
      console.log(`[KEYWORD_DEBUG] matched phrase: "${keyword}"`);
      
      // Mask this occurrence to prevent double counting of sub-phrases (e.g., "help" inside "help me")
      const masked = '*'.repeat(keyword.length);
      normalizedText = normalizedText.substring(0, index) + masked + normalizedText.substring(index + keyword.length);
      
      // Search for next occurrence
      index = normalizedText.indexOf(keyword, index + masked.length);
    }
  }

  return {
    matchedKeywords,
    count: matchedKeywords.length
  };
};

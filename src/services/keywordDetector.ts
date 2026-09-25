import { EMERGENCY_KEYWORDS } from '../constants/emergencyKeywords';
import { normalizeText } from '../utils/textNormalizer';

export interface KeywordDetectionResult {
  matchedKeywords: string[];
  count: number;
}

export const detectKeywords = (text: string): KeywordDetectionResult => {
  const normalizedText = normalizeText(text);
  const matchedKeywords: Set<string> = new Set();
  
  if (!normalizedText) {
    return { matchedKeywords: [], count: 0 };
  }

  // Iterate over predefined emergency keywords
  EMERGENCY_KEYWORDS.forEach(keyword => {
    // If the normalized text includes the keyword, add it to the matched set
    if (normalizedText.includes(keyword)) {
      matchedKeywords.add(keyword);
    }
  });

  return {
    matchedKeywords: Array.from(matchedKeywords),
    count: matchedKeywords.size
  };
};

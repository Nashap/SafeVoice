export const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace to single space
    .trim();
};

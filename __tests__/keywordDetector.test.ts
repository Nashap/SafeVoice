import { detectKeywords, normalizeTriggerPhrase } from '../src/services/keywordDetector';

describe('Keyword and Custom Trigger Detector', () => {
  test('normalizes custom trigger phrase with camelCase', () => {
    expect(normalizeTriggerPhrase('HelpNow')).toBe('help now');
    expect(normalizeTriggerPhrase('SafeAlert')).toBe('safe alert');
    expect(normalizeTriggerPhrase('Emergency')).toBe('emergency');
    expect(normalizeTriggerPhrase('  Help   Me  ')).toBe('help me');
  });

  test('detects custom trigger phrase accurately', () => {
    const result = detectKeywords('i need help now please', 'HelpNow');
    expect(result.isCustomTrigger).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.matchedKeywords).toContain('help now');
  });

  test('detects compact single-word utterance of custom trigger', () => {
    const result = detectKeywords('someone say helpnow fast', 'HelpNow');
    expect(result.isCustomTrigger).toBe(true);
    expect(result.matchedKeywords).toContain('help now');
  });

  test('detects standard emergency phrases when no custom trigger is set', () => {
    const result = detectKeywords('can someone help me right now');
    expect(result.matchedKeywords).toContain('help me');
    expect(result.count).toBe(1);
    expect(result.isCustomTrigger).toBe(false);
  });

  test('does not trigger on unrelated speech', () => {
    const result = detectKeywords('hello world this is a normal conversation', 'HelpNow');
    expect(result.count).toBe(0);
    expect(result.matchedKeywords).toHaveLength(0);
    expect(result.isCustomTrigger).toBe(false);
  });

  test('does not trigger on partial word matches (e.g. helpful != help)', () => {
    // "helpful" should not match "help"
    const result = detectKeywords('that was very helpful thank you', 'help');
    expect(result.count).toBe(0);
    expect(result.isCustomTrigger).toBe(false);
  });

  test('handles case-insensitivity and punctuation gracefully', () => {
    const result = detectKeywords('PLEASE, SAFE ALERT!!! CALL SOMEONE!', 'SafeAlert');
    expect(result.isCustomTrigger).toBe(true);
    expect(result.matchedKeywords).toContain('safe alert');
  });
});

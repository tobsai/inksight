/**
 * Language Detector — Phase 3.3
 *
 * Simple heuristic-based language detection using Unicode character ranges.
 * No external NLP library — intentionally lightweight.
 */

export interface LanguageDetectionResult {
  /** ISO 639-1 language code (en, es, fr, de, zh, ja, ko, ar, ru, unknown) */
  language: string;
  /** Confidence in the detection result (0.0–1.0) */
  confidence: number;
  /** Script family: latin, cyrillic, arabic, cjk */
  script: string;
}

// Common English function words used as signals
const ENGLISH_WORDS = [
  'the', 'and', 'is', 'in', 'it', 'of', 'to', 'a', 'an', 'for',
  'on', 'are', 'was', 'with', 'that', 'this', 'be', 'at', 'by',
  'have', 'from', 'or', 'but', 'not', 'you', 'we', 'he', 'she',
];

/**
 * Count characters matching a regex in a string.
 */
function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Detect the probable language of a given text string.
 * Uses simple Unicode character-range heuristics.
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return { language: 'unknown', confidence: 0, script: 'unknown' };
  }

  const totalChars = text.replace(/\s+/g, '').length;
  if (totalChars === 0) {
    return { language: 'unknown', confidence: 0, script: 'unknown' };
  }

  // ── CJK: Chinese / Japanese / Korean ─────────────────────────────────────
  // CJK Unified Ideographs: U+4E00–U+9FFF
  // Katakana / Hiragana: U+3040–U+30FF
  // Hangul: U+AC00–U+D7AF
  const cjkCount = countMatches(text, /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g);
  if (cjkCount / totalChars > 0.1) {
    // Distinguish: Hangul → ko, Hiragana/Katakana → ja, otherwise → zh
    const hangulCount = countMatches(text, /[\uAC00-\uD7AF]/g);
    const kanaCount = countMatches(text, /[\u3040-\u30FF]/g);

    let language = 'zh';
    if (hangulCount > kanaCount && hangulCount > cjkCount * 0.3) {
      language = 'ko';
    } else if (kanaCount > 0) {
      language = 'ja';
    }

    const confidence = Math.min(0.9, 0.5 + (cjkCount / totalChars));
    return { language, confidence, script: 'cjk' };
  }

  // ── Arabic script ─────────────────────────────────────────────────────────
  // Arabic: U+0600–U+06FF
  const arabicCount = countMatches(text, /[\u0600-\u06FF]/g);
  if (arabicCount / totalChars > 0.1) {
    const confidence = Math.min(0.9, 0.5 + (arabicCount / totalChars));
    return { language: 'ar', confidence, script: 'arabic' };
  }

  // ── Cyrillic ──────────────────────────────────────────────────────────────
  // Cyrillic: U+0400–U+04FF
  const cyrillicCount = countMatches(text, /[\u0400-\u04FF]/g);
  if (cyrillicCount / totalChars > 0.1) {
    const confidence = Math.min(0.9, 0.5 + (cyrillicCount / totalChars));
    return { language: 'ru', confidence, script: 'cyrillic' };
  }

  // ── Latin script — try to detect English vs. other ────────────────────────
  const latinCount = countMatches(text, /[A-Za-zÀ-ÖØ-öø-ÿ]/g);
  if (latinCount / totalChars > 0.3) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/).filter(Boolean);
    const englishHits = words.filter((w) => ENGLISH_WORDS.includes(w)).length;
    const wordCount = words.length;

    if (wordCount > 0 && englishHits / wordCount > 0.05) {
      const confidence = Math.min(0.85, 0.4 + (englishHits / wordCount) * 2);
      return { language: 'en', confidence, script: 'latin' };
    }

    // Latin but not confidently English
    return { language: 'unknown', confidence: 0.3, script: 'latin' };
  }

  return { language: 'unknown', confidence: 0, script: 'unknown' };
}

// Words that are clearly Indian (Telugu/Hindi) when typed in Latin letters.
const INDIAN_LATIN_HINTS = new Set([
  'nenu', 'naanu', 'naa', 'memu', 'aadayam', 'aadaayam', 'adayam', 'nelaku', 'nelaki',
  'velu', 'vela', 'vellu', 'hazaar', 'hazar', 'hajar', 'lakh', 'lakhs', 'lakshalu',
  'palle', 'ammayi', 'abbayi', 'amma', 'ladki', 'ladka', 'hoon', 'hun',
  'saal', 'saalana', 'mahine', 'mahina', 'mahinaa', 'gaon', 'gramam', 'kamai',
  'sarkari', 'raitu',
]);

const TELUGU_RANGE = /[\u0C00-\u0C7F]/;
const DEVANAGARI_RANGE = /[\u0900-\u097F]/;
const LATIN_LETTER = /[a-z]/i;

/**
 * Converts Telugu (U+0C66..U+0C6F) and Devanagari (U+0966..U+096F) digits to ASCII 0-9.
 * @param {string} s
 * @returns {string}
 */
export function toAsciiDigits(s) {
  return String(s ?? '').replace(/[\u0C66-\u0C6F\u0966-\u096F]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= 0x0c66 && code <= 0x0c6f ? 0x0c66 : 0x0966;
    return String(code - base);
  });
}

/**
 * Digit-normalises, applies NFC, lowercases (Latin only effectively), collapses whitespace, trims.
 * @param {string} s
 * @returns {string}
 */
export function normaliseText(s) {
  return toAsciiDigits(String(s ?? ''))
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the dominant language of a message.
 * "te" / "hi": script present and no Latin letters at all.
 * "mixed": two scripts, script plus Latin letters, or Latin-typed Indian words.
 * "en": otherwise.
 * @param {string} s
 * @returns {"te"|"hi"|"mixed"|"en"}
 */
export function detectLanguage(s) {
  const t = String(s ?? '');
  const hasTe = TELUGU_RANGE.test(t);
  const hasHi = DEVANAGARI_RANGE.test(t);
  if (hasTe && hasHi) return 'mixed';
  if (hasTe || hasHi) {
    if (LATIN_LETTER.test(t)) return 'mixed';
    return hasTe ? 'te' : 'hi';
  }
  const words = t.toLowerCase().match(/[a-z]+/g) || [];
  if (words.some((w) => INDIAN_LATIN_HINTS.has(w))) return 'mixed';
  return 'en';
}

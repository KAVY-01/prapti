import { toAsciiDigits } from './normalise.js';

const AADHAAR = /(?<!\d)\d{4}(?:[ -]?\d{4}){2}(?!\d)/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PHONE = /(?<!\d)(?:\+91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g;

/**
 * Removes government-ID-like and phone-like numbers from free text.
 * Each match is replaced with a single space. Digits are normalised to ASCII first.
 * @param {string} text
 * @returns {{text: string, removed: string[]}}
 */
export function stripIds(text) {
  let out = toAsciiDigits(String(text ?? ''));
  const removed = [];
  const rules = [
    ['aadhaar', AADHAAR],
    ['pan', PAN],
    ['phone', PHONE],
  ];
  for (const [kind, re] of rules) {
    let hit = false;
    out = out.replace(re, () => {
      hit = true;
      return ' ';
    });
    if (hit) removed.push(kind);
  }
  return { text: out, removed };
}

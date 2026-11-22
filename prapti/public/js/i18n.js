// i18n: flat-key translations loaded from /locales/<lang>.json.
// English is always loaded as the fallback language.

export const LANGS = ["en", "te", "hi"];

const STORAGE_KEY = "prapti.lang";
const FALLBACK = "en";

// Promises keyed by language code, so each locale is fetched once.
const pending = new Map();
// Parsed locale objects keyed by language code, for synchronous t() lookups.
const resolved = new Map();

function isValidLang(code) {
  return LANGS.includes(code);
}

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isValidLang(saved) ? saved : null;
  } catch (err) {
    return null;
  }
}

let current = readSavedLang() || FALLBACK;

export function getLang() {
  return current;
}

export function setLang(code) {
  if (!isValidLang(code)) return;
  current = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch (err) {
    // Storage may be blocked (private mode); the choice still applies for this visit.
  }
  window.dispatchEvent(new CustomEvent("prapti:lang", { detail: { lang: code } }));
}

function fetchLocale(code) {
  if (pending.has(code)) return pending.get(code);
  const promise = fetch(`/locales/${code}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Locale ${code} failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      resolved.set(code, data);
      return data;
    })
    .catch((err) => {
      pending.delete(code);
      throw err;
    });
  pending.set(code, promise);
  return promise;
}

export function loadLocales() {
  const codes = current === FALLBACK ? [FALLBACK] : [FALLBACK, current];
  return Promise.all(codes.map(fetchLocale)).then(() => undefined);
}

export function t(key) {
  const primary = resolved.get(current);
  if (primary && typeof primary[key] === "string") return primary[key];
  const fallback = resolved.get(FALLBACK);
  if (fallback && typeof fallback[key] === "string") return fallback[key];
  return key;
}

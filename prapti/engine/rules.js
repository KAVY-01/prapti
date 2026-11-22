/**
 * Prapti rules engine.
 * Plain ES module, zero dependencies, Node 18+.
 *
 * Pure functions only: no I/O, no globals mutated.
 * All user-visible scheme text comes from the scheme JSON; the only
 * non-scheme strings are the status labels exported as STATUS_LABELS.
 */

const LANGS = ['en', 'te', 'hi'];
const INCOME_FIELD = 'annual_income_inr';
const MARKS_FIELD = 'marks_percent';
const DAY_MS = 86400000;
const ANSWER_TOKEN = '{answer}';

export const STATUS_LABELS = {
  likely_eligible: { en: 'Likely eligible', te: 'అవకాశం ఉంది', hi: 'संभावित रूप से पात्र' },
  might_be: { en: 'Might be', te: 'ఉండొచ్చు', hi: 'हो सकता है' },
  nearly_match: { en: 'Nearly a match', te: 'దాదాపు సరిపోతుంది', hi: 'लगभग मेल खाता है' },
  not_match: { en: 'Not a match', te: 'సరిపోదు', hi: 'मेल नहीं खाता' },
  closed: { en: 'Closed', te: 'మూసివేయబడింది', hi: 'बंद' },
};

const STATUS_RANK = {
  likely_eligible: 0,
  might_be: 1,
  nearly_match: 2,
  not_match: 3,
  closed: 4,
};

const TYPE_RANK = { free: 0, loan: 1 };
const UNKNOWN_TYPE_RANK = 2;

/* ---------- small helpers ---------- */

function normLang(lang) {
  return LANGS.includes(lang) ? lang : 'en';
}

function isUnknownValue(v) {
  return v === undefined || v === null || v === '';
}

/** Pick a localized string from {en, te, hi}, falling back to English. */
function pick(obj, lang) {
  if (!obj || typeof obj !== 'object') return '';
  return obj[lang] || obj.en || '';
}

/** Numeric coercion; returns NaN when the value is not a usable number. */
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** Case-insensitive, trimmed comparison key for enum values. */
function norm(v) {
  return String(v).trim().toLowerCase();
}

function asArray(v) {
  return Array.isArray(v) ? v : [v];
}

/* ---------- formatting ---------- */

/**
 * Indian digit grouping with ₹ prefix.
 * 105000 -> "₹1,05,000", 9999999 -> "₹99,99,999", 0 -> "₹0".
 */
export function formatINR(n) {
  if (!Number.isFinite(n)) return '?';
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(n)));
  if (digits.length <= 3) return `${sign}₹${digits}`;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${head},${digits.slice(-3)}`;
}

/** Formatted limit value for a rule's field (no operator). */
function formatLimitValue(field, value) {
  if (field === INCOME_FIELD) return formatINR(toNumber(value));
  if (field === MARKS_FIELD) return `${value}%`;
  return String(value);
}

/** Student's answer formatted for display (known values only). */
function formatAnswer(field, value) {
  if (field === INCOME_FIELD) return `${formatINR(toNumber(value))} a year`;
  if (field === MARKS_FIELD) return `${value}%`;
  return String(value);
}

/** Human-readable limit for a rule: "≤ ₹2,50,000", "≥ 80%", or allowed values. */
function limitTextFor(rule) {
  if (rule.op === 'lte' || rule.op === 'gte') {
    const sym = rule.op === 'lte' ? '≤' : '≥';
    return `${sym} ${formatLimitValue(rule.field, rule.value)}`;
  }
  if (rule.op === 'in') return asArray(rule.value).join(', ');
  if (rule.op === 'eq') return String(rule.value);
  return '';
}

/* ---------- rule evaluation ---------- */

/** Returns "pass" | "fail" | "unknown" for one rule against the profile. */
function evaluateRule(rule, profile) {
  const raw = profile[rule.field];
  if (isUnknownValue(raw)) return 'unknown';

  switch (rule.op) {
    case 'in':
      return asArray(rule.value).some((a) => norm(a) === norm(raw)) ? 'pass' : 'fail';
    case 'eq':
      return norm(rule.value) === norm(raw) ? 'pass' : 'fail';
    case 'lte':
    case 'gte': {
      const v = toNumber(raw);
      const limit = toNumber(rule.value);
      if (Number.isNaN(v) || Number.isNaN(limit)) return 'unknown';
      const ok = rule.op === 'lte' ? v <= limit : v >= limit;
      return ok ? 'pass' : 'fail';
    }
    default:
      return 'unknown';
  }
}

/** Sentence template with {answer} replaced by the student's answer (or "?"). */
function buildSentence(rule, profile, lang, state) {
  const template = pick(rule.sentence, lang);
  const answer = state === 'unknown' ? '?' : formatAnswer(rule.field, profile[rule.field]);
  return template.split(ANSWER_TOKEN).join(answer);
}

/* ---------- public API ---------- */

/**
 * Evaluate one scheme against a profile.
 * @returns {{id, name, benefit, benefit_max_per_year_inr, scheme_type, closed,
 *            status, rules, deadline_text, last_date, source_url}}
 */
export function evaluateScheme(scheme, profile, lang) {
  const L = normLang(lang);
  const p = profile || {};

  const rules = (scheme.rules || []).map((rule) => {
    const state = evaluateRule(rule, p);
    const value = p[rule.field];

    let amountOver = null;
    if (state === 'fail' && rule.field === INCOME_FIELD && rule.op === 'lte') {
      amountOver = toNumber(value) - toNumber(rule.value);
    }
    if (state === 'fail' && rule.field === MARKS_FIELD && rule.op === 'gte') {
      amountOver = toNumber(rule.value) - toNumber(value);
    }

    return {
      ruleId: rule.id,
      field: rule.field,
      state,
      sentence: buildSentence(rule, p, L, state),
      limitText: limitTextFor(rule),
      amountOver,
    };
  });

  const failing = rules.filter((r) => r.state === 'fail');
  let status;
  if (scheme.closed) {
    status = 'closed';
  } else if (failing.length > 0) {
    const onlyIncomeOrMarks = failing.every(
      (r) => r.field === INCOME_FIELD || r.field === MARKS_FIELD,
    );
    status = onlyIncomeOrMarks ? 'nearly_match' : 'not_match';
  } else if (rules.some((r) => r.state === 'unknown')) {
    status = 'might_be';
  } else {
    status = 'likely_eligible';
  }

  return {
    id: scheme.id,
    name: pick(scheme.name, L),
    benefit: pick(scheme.benefit, L),
    benefit_max_per_year_inr: scheme.benefit_max_per_year_inr ?? null,
    scheme_type: scheme.scheme_type,
    closed: !!scheme.closed,
    status,
    rules,
    deadline_text: pick(scheme.deadline && scheme.deadline.text, L),
    last_date: scheme.deadline ? scheme.deadline.last_date ?? null : null,
    source_url: scheme.source_url ?? null,
  };
}

/**
 * Evaluate all schemes. Order: free before loan; within a type,
 * likely_eligible, might_be, nearly_match, not_match, closed last.
 */
export function evaluateAll(schemes, profile, lang) {
  const results = (schemes || []).map((s) => evaluateScheme(s, profile, lang));
  return results.sort((a, b) => {
    const ta = TYPE_RANK[a.scheme_type] ?? UNKNOWN_TYPE_RANK;
    const tb = TYPE_RANK[b.scheme_type] ?? UNKNOWN_TYPE_RANK;
    if (ta !== tb) return ta - tb;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });
}

/**
 * Totals for the results list. Only open free schemes with status
 * likely_eligible are counted; loans and closed schemes never are.
 */
export function summarize(results) {
  let likelyCount = 0;
  let totalAnnualBenefitInr = 0;

  for (const r of results || []) {
    if (r.closed || r.status === 'closed') continue;
    if (r.scheme_type !== 'free') continue;
    if (r.status !== 'likely_eligible') continue;

    likelyCount += 1;
    const benefit = r.benefit_max_per_year_inr;
    if (typeof benefit === 'number' && Number.isFinite(benefit)) {
      totalAnnualBenefitInr += benefit;
    }
  }

  return { likelyCount, totalAnnualBenefitInr };
}

/**
 * First lte/gte rule on fieldName, as {op, value, text}; null if none.
 */
export function decidingLimit(scheme, fieldName) {
  const rule = (scheme.rules || []).find(
    (r) => r.field === fieldName && (r.op === 'lte' || r.op === 'gte'),
  );
  if (!rule) return null;
  return { op: rule.op, value: rule.value, text: limitTextFor(rule) };
}

/** UTC midnight (ms) for the calendar date of a timestamp. */
function utcMidnight(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole days from today to the scheme's last_date, compared at UTC midnight.
 * Null when there is no last_date. Negative means the deadline has passed.
 */
export function daysLeft(scheme, today) {
  const last = scheme && scheme.deadline ? scheme.deadline.last_date : null;
  if (!last) return null;

  const lastMs = new Date(last).getTime();
  const todayMs = (today === undefined || today === null ? new Date() : new Date(today)).getTime();
  if (Number.isNaN(lastMs) || Number.isNaN(todayMs)) return null;

  return Math.round((utcMidnight(lastMs) - utcMidnight(todayMs)) / DAY_MS);
}

/**
 * Re-evaluate with profile overridden by overrides. Each result gets
 * crossedLimit: the limit text of the income/marks rule that caused a
 * nearly_match or not_match status, otherwise null.
 */
export function whatIf(schemes, profile, overrides, lang) {
  const merged = { ...(profile || {}), ...(overrides || {}) };
  const byId = new Map((schemes || []).map((s) => [s.id, s]));

  return evaluateAll(schemes, merged, lang).map((result) => {
    let crossedLimit = null;

    if (result.status === 'nearly_match' || result.status === 'not_match') {
      const failed = result.rules.find(
        (r) => r.state === 'fail' && (r.field === INCOME_FIELD || r.field === MARKS_FIELD),
      );
      const scheme = failed ? byId.get(result.id) : undefined;
      const rule = scheme ? (scheme.rules || []).find((r) => r.id === failed.ruleId) : undefined;
      if (rule && (rule.op === 'lte' || rule.op === 'gte')) {
        crossedLimit = limitTextFor(rule);
      }
    }

    return { ...result, crossedLimit };
  });
}

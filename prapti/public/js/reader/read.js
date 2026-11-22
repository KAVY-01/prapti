import { stripIds } from './stripIds.js';
import { normaliseText, detectLanguage } from './normalise.js';
import { RX, DISTRICT_ALIAS_MAP, findPhrase } from './lexicon.js';

const FIELDS = [
  'gender', 'education_level', 'year', 'community', 'income_inr', 'marks_percent',
  'disability', 'district', 'area', 'college_type',
];

const EDUCATION_ORDER = ['pg', 'professional', 'degree', 'iti_poly', 'inter', 'class9_10'];
const COMMUNITY_KEYS = ['SC', 'ST', 'BC', 'EBC', 'OC', 'minority'];

/** Returns the clause (text between , ; |) that contains index idx. */
function clauseAt(t, idx) {
  const before = t.slice(0, idx);
  const start = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('|')) + 1;
  const m = t.slice(idx).search(/[,;|]/);
  const end = m === -1 ? t.length : idx + m;
  return t.slice(start, end);
}

/** All non-overlapping matches of a regex in text. */
function allMatches(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const g = new RegExp(re.source, flags);
  const out = [];
  let m;
  while ((m = g.exec(text)) !== null) {
    out.push(m);
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

/**
 * Offline, rule-based reader. Turns a plain message (English, Telugu/Hindi script,
 * or Telugu/Hindi typed in Latin letters) into a student profile.
 * Never stores ID or phone numbers. Only sets a field when the text states it.
 * @param {string} rawText
 * @returns {{profile: object, evidence: Array<{field: string, value: any, span: string, rule: string}>, unknown: string[], warnings: string[], language: string}}
 */
export function readMessage(rawText) {
  const raw = String(rawText ?? '');
  const warnings = [];
  const evidence = [];
  const profile = {};
  const language = detectLanguage(raw);

  const { text: noIds, removed } = stripIds(raw);
  if (removed.length) warnings.push('id_number_removed');
  const t = normaliseText(noIds);

  const set = (field, value, span, rule) => {
    profile[field] = value;
    evidence.push({ field, value, span, rule });
  };

  // (e) gender: only the speaker's own phrases
  const female = findPhrase(t, RX.self_female);
  const male = findPhrase(t, RX.self_male);
  if (female && male) warnings.push('gender_conflict');
  else if (female) set('gender', 'female', female.match, 'self_female');
  else if (male) set('gender', 'male', male.match, 'self_male');

  // (f) education level, in priority order
  for (const key of EDUCATION_ORDER) {
    const hit = findPhrase(t, RX.education[key]);
    if (hit) {
      set('education_level', key, hit.match, `education_${key}`);
      break;
    }
  }

  // (g) study year
  let yearHit = null;
  for (const y of [1, 2, 3, 4, 5, 6]) {
    const hit = findPhrase(t, RX.year[y]);
    if (hit && (!yearHit || hit.index < yearHit.index)) yearHit = { y, ...hit };
  }
  if (yearHit) set('year', yearHit.y, yearHit.match, 'year_phrase');

  // (h) community: first mention wins
  let comm = null;
  const seenCommunities = new Set();
  for (const key of COMMUNITY_KEYS) {
    const hit = findPhrase(t, RX.community[key]);
    if (hit) {
      seenCommunities.add(key);
      if (!comm || hit.index < comm.index) comm = { key, ...hit };
    }
  }
  if (seenCommunities.size > 1) warnings.push('community_conflict');
  if (comm) set('community', comm.key, comm.match, 'community_word');

  // (j) disability (decided before marks, because marks near disability are skipped)
  const negated = findPhrase(t, RX.negated_disability);
  if (negated) {
    set('disability', false, negated.match, 'negated_disability');
  } else {
    const dis = findPhrase(t, RX.disability);
    if (dis) set('disability', true, dis.match, 'disability_word');
  }

  // (i) marks: number next to marks/percent/% words; skip disability and income clauses
  const marksCandidates = [
    ...allMatches(t, RX.marks_before).map((m) => ({ value: parseFloat(m[1]), index: m.index, match: m[0] })),
    ...allMatches(t, RX.marks_after).map((m) => ({ value: parseFloat(m[1]), index: m.index, match: m[0] })),
  ].sort((a, b) => a.index - b.index);
  for (const c of marksCandidates) {
    if (!(c.value > 0 && c.value <= 100)) continue;
    const clause = clauseAt(t, c.index);
    if (findPhrase(clause, RX.disability) || allMatches(clause, RX.negated_disability).length) continue;
    if (allMatches(clause, RX.income).length) continue;
    set('marks_percent', c.value, c.match, 'marks_near_number');
    break;
  }

  // (d) income: number + unit, annualised
  for (const m of allMatches(t, RX.income)) {
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const isLakh = m[2] !== undefined;
    const amount = value * (isLakh ? 100000 : 1000);
    const clause = clauseAt(t, m.index);
    let annual = null;
    let rule = null;
    if (findPhrase(clause, RX.per_month)) {
      annual = amount * 12;
      rule = 'income_per_month_x12';
    } else if (findPhrase(clause, RX.per_year)) {
      annual = amount;
      rule = 'income_per_year';
    } else if (isLakh) {
      annual = amount;
      rule = 'income_lakh_annual';
    } else if (findPhrase(t, RX.income_cue)) {
      annual = amount;
      rule = 'income_cue_annual';
    }
    if (annual !== null) {
      set('income_inr', Math.round(annual), m[0], rule);
      break;
    }
  }

  // (k) district: whole-word alias, longest alias first (regex alternation handles this)
  const district = findPhrase(t, RX.district);
  if (district) {
    set('district', DISTRICT_ALIAS_MAP.get(district.match) ?? district.match, district.match, 'district_alias');
  }

  // (l) area
  const rural = findPhrase(t, RX.rural);
  const urban = findPhrase(t, RX.urban);
  if (rural && urban) warnings.push('area_conflict');
  else if (rural) set('area', 'rural', rural.match, 'rural_word');
  else if (urban) set('area', 'urban', urban.match, 'urban_word');

  // (m) college type
  const gov = findPhrase(t, RX.government);
  const priv = findPhrase(t, RX.private);
  if (gov && priv) warnings.push('college_type_conflict');
  else if (gov) set('college_type', 'government', gov.match, 'government_word');
  else if (priv) set('college_type', 'private', priv.match, 'private_word');

  const unknown = FIELDS.filter((f) => !(f in profile));
  return { profile, evidence, unknown, warnings, language };
}

// Lexicon for the offline reader. All Latin entries are lowercase (text is normalised first).
// Telugu and Devanagari entries are written in NFC.

const WC = '\\p{L}\\p{M}\\p{N}';

/** Escapes a string for use inside a RegExp. */
export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a global, case-insensitive, Unicode-aware regex matching any phrase as a whole word.
 * Word characters are letters, combining marks and digits (so Telugu/Devanagari vowel signs count).
 * Options:
 *   dotBoundary: a "." directly before the phrase also blocks the match (stops "b.sc" -> "sc").
 *   extraAfter: extra regex source appended after the phrase (negative lookaheads).
 * @param {string[]} phrases
 * @param {{dotBoundary?: boolean, extraAfter?: string}} [opts]
 * @returns {RegExp}
 */
export function phraseRegex(phrases, opts = {}) {
  const alts = [...new Set(phrases)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  const before = opts.dotBoundary ? `(?<![${WC}.])` : `(?<![${WC}])`;
  const after = `(?![${WC}])${opts.extraAfter || ''}`;
  return new RegExp(`${before}(?:${alts})${after}`, 'giu');
}

/**
 * Returns the first match of a phrase regex in text, or null.
 * @param {string} text
 * @param {RegExp} re
 * @returns {{match: string, index: number} | null}
 */
export function findPhrase(text, re) {
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? { match: m[0], index: m.index } : null;
}

export const LAKH_UNITS = ['lakh', 'lakhs', 'lakshalu', 'laksha', 'లక్ష', 'లక్షలు', 'लाख', 'लाख़'];
export const THOUSAND_UNITS = [
  'velu', 'vela', 'vellu', 'hazaar', 'hazar', 'hajar', 'thousand', 'k',
  'వేలు', 'వేల', 'हज़ार', 'हजार',
];

export const DISTRICTS = [
  { name: 'Adilabad', aliases: ['adilabad', 'ఆదిలాబాద్', 'आदिलाबाद'] },
  { name: 'Bhadradri Kothagudem', aliases: ['bhadradri kothagudem', 'kothagudem', 'భద్రాద్రి కొత్తగూడెం', 'भद्राद्रि कोठागुडेम'] },
  { name: 'Hyderabad', aliases: ['hyderabad', 'హైదరాబాద్', 'हैदराबाद'] },
  { name: 'Jagtial', aliases: ['jagtial', 'జగిత్యాల్', 'जगतियाल'] },
  { name: 'Jangaon', aliases: ['jangaon', 'jangoan', 'జనగామ', 'जनगांव'] },
  { name: 'Jayashankar Bhupalpally', aliases: ['jayashankar bhupalpally', 'bhupalpally', 'bhupalapally', 'జయశంకర్ భూపాలపల్లి', 'जयशंकर भूपालपल्ली'] },
  { name: 'Jogulamba Gadwal', aliases: ['jogulamba gadwal', 'gadwal', 'జోగులాంబ గద్వాల్', 'जोगुलंबा गद्वाल'] },
  { name: 'Kamareddy', aliases: ['kamareddy', 'కామారెడ్డి', 'कामारेड्डी'] },
  { name: 'Karimnagar', aliases: ['karimnagar', 'కరీంనగర్', 'करीमनगर'] },
  { name: 'Khammam', aliases: ['khammam', 'ఖమ్మం', 'खम्मम'] },
  { name: 'Komaram Bheem Asifabad', aliases: ['komaram bheem asifabad', 'asifabad', 'కొమరం భీం ఆసిఫాబాద్', 'कोमाराम भीम आसिफाबाद'] },
  { name: 'Mahabubabad', aliases: ['mahabubabad', 'మహబూబాబాద్', 'महबूबाबाद'] },
  { name: 'Mahabubnagar', aliases: ['mahabubnagar', 'mahbubnagar', 'మహబూబ్‌నగర్', 'మహబూబ్నగర్', 'महबूबनगर'] },
  { name: 'Mancherial', aliases: ['mancherial', 'మంచిర్యాల', 'मंचेरियाल'] },
  { name: 'Medak', aliases: ['medak', 'మెదక్', 'मेदक', 'मेडक'] },
  { name: 'Medchal-Malkajgiri', aliases: ['medchal-malkajgiri', 'medchal malkajgiri', 'medchal', 'మేడ్చల్-మల్కాజ్‌గిరి', 'మేడ్చల్ మల్కాజ్‌గిరి', 'मेडचल-मल्काजगिरी'] },
  { name: 'Mulugu', aliases: ['mulugu', 'ములుగు', 'मुलुगु'] },
  { name: 'Nagarkurnool', aliases: ['nagarkurnool', 'nagar kurnool', 'నాగర్‌కర్నూల్', 'నాగర్కర్నూల్', 'नागरकुर्नूल'] },
  { name: 'Nalgonda', aliases: ['nalgonda', 'nalgonda district', 'నల్గొండ', 'नलगोंडा'] },
  { name: 'Narayanpet', aliases: ['narayanpet', 'నారాయణపేట', 'नारायणपेट'] },
  { name: 'Nirmal', aliases: ['nirmal', 'నిర్మల్', 'निर्मल'] },
  { name: 'Nizamabad', aliases: ['nizamabad', 'నిజామాబాద్', 'निजामाबाद'] },
  { name: 'Peddapalli', aliases: ['peddapalli', 'పెద్దపల్లి', 'पेद्दपल्ली'] },
  { name: 'Rajanna Sircilla', aliases: ['rajanna sircilla', 'sircilla', 'rajanna', 'రాజన్న సిరిసిల్ల', 'राजन्ना सिरसिल्ला'] },
  { name: 'Rangareddy', aliases: ['rangareddy', 'ranga reddy', 'రంగారెడ్డి', 'रंगारेड्डी'] },
  { name: 'Sangareddy', aliases: ['sangareddy', 'sangareddi', 'సంగారెడ్డి', 'संगारेड्डी'] },
  { name: 'Siddipet', aliases: ['siddipet', 'సిద్దిపేట', 'सिद्दिपेट'] },
  { name: 'Suryapet', aliases: ['suryapet', 'సూర్యాపేట', 'सूर्यापेट'] },
  { name: 'Vikarabad', aliases: ['vikarabad', 'వికారాబాద్', 'विकाराबाद'] },
  { name: 'Wanaparthy', aliases: ['wanaparthy', 'wanaparthi', 'వనపర్తి', 'वनपर्थी'] },
  { name: 'Warangal Urban', aliases: ['warangal urban', 'warangal', 'hanumakonda', 'వరంగల్', 'హనుమకొండ', 'वारंगल', 'हनुमकोंडा'] },
  { name: 'Warangal Rural', aliases: ['warangal rural', 'వరంగల్ రూరల్', 'వరంగల్ గ్రామీణ', 'वारंगल ग्रामीण'] },
  { name: 'Yadadri Bhuvanagiri', aliases: ['yadadri bhuvanagiri', 'yadadri', 'bhuvanagiri', 'యాదాద్రి భువనగిరి', 'यादाद्रि भुवनगिरि'] },
];

/** alias (lowercase) -> canonical district name */
export const DISTRICT_ALIAS_MAP = new Map();
for (const d of DISTRICTS) {
  for (const a of d.aliases) DISTRICT_ALIAS_MAP.set(a.toLowerCase(), d.name);
}

const MARK_WORDS = [
  'marks', 'mark', 'score', 'percent', 'percentage', 'శాతం', 'మార్కులు', 'మార్క్స్',
  'मार्क्स', 'प्रतिशत', 'अंक',
];

export const LEXICON = {
  self_female: [
    'nenu ammayi', 'naanu amma', 'nenu amma', 'naanu ammayi', 'i am a girl', 'i am female',
    'నేను అమ్మాయి', 'मैं लड़की हूँ', 'मैं लड़की हूं', 'main ladki hoon', 'main ladki hun',
  ],
  self_male: [
    'nenu abbayi', 'naanu abbayi', 'i am a boy', 'i am male',
    'నేను అబ్బాయి', 'मैं लड़का हूँ', 'मैं लड़का हूं', 'main ladka hoon', 'main ladka hun',
  ],
  income_cue: [
    'aadayam', 'aadaayam', 'adayam', 'income', 'salary', 'family earns',
    'ఆదాయం', 'आय', 'आमदनी', 'kamai',
  ],
  per_month: [
    'nelaku', 'nelaki', 'నెలకు', 'నెలకి', 'per month', 'a month', 'monthly', 'month',
    'mahine', 'mahina', 'mahinaa', 'per mahina', 'महीने', 'महीना', 'प्रति माह', 'नेलकु',
  ],
  per_year: [
    'per year', 'a year', 'yearly', 'సంవత్సరానికి', 'సంవత్సరంలో', 'సంవత్సరం',
    'saal ke', 'saal', 'saalana', 'सालाना', 'साल',
  ],
  number_lakh: LAKH_UNITS,
  number_thousand: THOUSAND_UNITS,
  education: {
    pg: [
      'm.tech', 'mtech', 'm tech', 'msc', 'm.sc', 'ma', 'm.a', 'pg', 'post graduation',
      'post graduate', 'masters', 'ఎం.టెక్', 'ఎంటెక్', 'ఎంఎస్సీ', 'एम.टेक', 'एमटेक', 'एमएससी',
      'पोस्ट ग्रेजुएशन',
    ],
    professional: [
      'mba', 'ca', 'mbbs', 'llb', 'law', 'chartered accountant', 'ఎంబీఏ', 'एमबीए',
    ],
    degree: [
      'b.tech', 'btech', 'b tech', 'be', 'b.e', 'b.e.', 'degree', 'b.sc', 'bsc', 'b.com',
      'bcom', 'ba', 'b.a', 'b.a.', 'బీటెక్', 'డిగ్రీ', 'బి.టెక్', 'బీఎస్సీ', 'బీకామ్',
      'बीटेक', 'डिग्री', 'बी.टेक', 'बीएससी', 'बी.एससी',
    ],
    iti_poly: [
      'iti', 'polytechnic', 'diploma', 'poly', 'ఐటీఐ', 'పాలిటెక్నిక్', 'డిప్లొమా',
      'आईटीआई', 'पॉलिटेक्निक', 'डिप्लोमा',
    ],
    inter: [
      'inter', 'intermediate', '+2', 'plus two', 'ఇంటర్', 'ఇంటర్మీడియట్', 'इंटर', 'इंटरमीडिएट',
    ],
    class9_10: [
      'class 10', 'class10', '10th', '10th class', 'tenth', 'class 9', '9th', 'ninth', 'ssc',
      'పదో తరగతి', 'పదవ తరగతి', '10వ తరగతి', 'दसवीं', 'दसवी',
    ],
  },
  year_words: {
    1: [
      'first year', '1st year', '1st yr', 'first yr', 'ఫస్ట్ ఇయర్', 'మొదటి సంవత్సరం',
      'पहला साल', 'पहले साल', 'पहली साल', 'moodava',
    ],
    2: [
      'second year', '2nd year', '2 year', '2nd yr', 'second yr', 'రెండవ సంవత్సరం',
      'ద్వితీయ సంవత్సరం', 'दूसरा साल', 'दूसरी साल', 'दूसरे साल', 'rendava',
    ],
    3: [
      'third year', '3rd year', '3rd yr', 'third yr', 'మూడవ సంవత్సరం', 'తృతీయ సంవత్సరం',
      'तीसरा साल', 'तीसरी साल', 'तीसरे साल',
    ],
    4: [
      'fourth year', '4th year', '4th yr', 'fourth yr', 'నాలుగవ సంవత్సరం', 'चौथा साल', 'चौथी साल',
    ],
    5: ['fifth year', '5th year'],
    6: ['sixth year', '6th year'],
  },
  community: {
    SC: ['sc', 'scheduled caste', 'scheduled castes', 'ఎస్సీ', 'अनुसूचित जाति'],
    ST: ['st', 'scheduled tribe', 'scheduled tribes', 'ఎస్టీ', 'अनुसूचित जनजाति'],
    BC: ['bc', 'bc-a', 'bc-b', 'bc-c', 'bc-d', 'backward class', 'బీసీ', 'पिछड़ा वर्ग'],
    EBC: ['ebc', 'ఈబీసీ', 'ईबीसी'],
    OC: ['oc', 'open category', 'ఓసీ', 'सामान्य', 'general category'],
    minority: [
      'minority', 'minorities', 'muslim', 'muslims', 'christian', 'christians', 'మైనారిటీ',
      'అల్పసంఖ్యాక', 'अल्पसंख्यक',
    ],
  },
  rural_words: [
    'palle', 'village', 'gaon', 'gaun', 'gramam', 'rural', 'gramin', 'పల్లె', 'గ్రామం', 'గ్రామీణ',
    'गांव', 'गाँव', 'ग्रामीण',
  ],
  urban_words: [
    'city', 'town', 'nagar', 'pattanam', 'urban', 'shahar', 'పట్టణం', 'నగరం', 'शहर', 'नगर',
  ],
  disability_words: [
    'handicapped', 'disabled', 'disability', 'viklang', 'divyang', 'వికలాంగ', 'వికలాంగుడు',
    'వికలాంగురాలు', 'దివ్యాంగ', 'दिव्यांग', 'wheelchair', 'blind', 'deaf',
  ],
  marks_words: MARK_WORDS,
  government_words: ['government', 'govt', 'sarkari', 'ప్రభుత్వ', 'सरकारी'],
  private_words: ['private', 'ప్రైవేట్', 'ప్రైవేటు', 'निजी'],
};

/** Ready-made regexes built from the lexicon (global, reuse via findPhrase). */
export const RX = {
  self_female: phraseRegex(LEXICON.self_female),
  self_male: phraseRegex(LEXICON.self_male),
  income_cue: phraseRegex(LEXICON.income_cue),
  per_month: phraseRegex(LEXICON.per_month),
  per_year: phraseRegex(LEXICON.per_year),
  disability: phraseRegex(LEXICON.disability_words),
  rural: phraseRegex(LEXICON.rural_words),
  urban: phraseRegex(LEXICON.urban_words),
  government: phraseRegex(LEXICON.government_words),
  private: phraseRegex(LEXICON.private_words),
  education: Object.fromEntries(
    Object.entries(LEXICON.education).map(([k, v]) => [k, phraseRegex(v)]),
  ),
  year: Object.fromEntries(
    Object.entries(LEXICON.year_words).map(([k, v]) => [k, phraseRegex(v)]),
  ),
  community: Object.fromEntries(
    Object.entries(LEXICON.community).map(([k, v]) => [
      k,
      k === 'ST'
        ? phraseRegex(v, {
            dotBoundary: true,
            extraAfter: '(?!\\.)(?!\\s+(?:joseph|xavier|mary|marys|francis|peter|paul|john|anne|ann|theresa|teresa|thomas|louis)\\b)',
          })
        : phraseRegex(v, { dotBoundary: true }),
    ]),
  ),
  district: phraseRegex([...DISTRICT_ALIAS_MAP.keys()]),
  negated_disability: /\b(?:no|not|without|non)[ -]+(?:disability|disabled|handicapped)\b/giu,
  marks_before: new RegExp(
    `(?<![${'\\p{L}\\p{N}'}])(\\d+(?:\\.\\d+)?)\\s*(%|${MARK_WORDS.map(escapeRe).join('|')})(?![\\p{L}])`,
    'giu',
  ),
  marks_after: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${MARK_WORDS.map(escapeRe).join('|')})\\s*(?:of|is|:|=|-)?\\s*(\\d+(?:\\.\\d+)?)(?![\\p{L}\\p{N}])`,
    'giu',
  ),
  income: new RegExp(
    `(?<![\\p{L}\\p{N}.])(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:(${LAKH_UNITS.map(escapeRe).sort((a, b) => b.length - a.length).join('|')})|(${THOUSAND_UNITS.map(escapeRe).sort((a, b) => b.length - a.length).join('|')}))(?![\\p{L}\\p{M}\\p{N}])`,
    'giu',
  ),
};

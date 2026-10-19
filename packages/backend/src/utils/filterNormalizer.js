// ─── Filter Normalizer ─────────────────────────────────────────────────────────
//
// Reconciles the two independent sources of truth on a job document — the raw
// ATS-scraped fields (WorkplaceType, ExperienceLevel, EmploymentType, Salary*)
// and the Gemma AI-extracted `parsedRequirements` — into a single set of
// canonical, lowercase filter values the frontend can query directly.
//
// TRUST HIERARCHY (which source wins when they disagree):
//   Workplace   : Gemma remote_policy_detail (≠ not_mentioned) → ATS WorkplaceType
//                 → scan Location for "remote" → null
//   Experience  : explicit title seniority → JD years (Gemma min_experience_years)
//                 → Gemma experience_level → ATS ExperienceLevel → "mid".
//                 See resolveExperience() for the evidence behind each step.
//   Employment  : Gemma employment_type → ATS EmploymentType → null
//   Salary      : ATS SalaryMin/SalaryMax (structured beats text) → Gemma salary_*
//                 → null. The PAIR is atomic: sources are never mixed within one
//                 job. If the ATS provided EITHER bound, the ATS wins the whole
//                 pair (tier "ats"); only when the ATS has neither do we fall to
//                 Gemma (tier "jd"). Mirrors buildSalaryUpdate() in
//                 gemma/backgroundExtractor.js.
//   Visa        : negative sentence in the ad → null; Gemma "available" or a
//                 clean positive sentence → "available"; else null.
//   Relocation  : same rule as visa (see resolveBenefit()).
//
// Every exported function is null-safe, tolerates a missing `parsedRequirements`
// or missing ATS fields, and never throws.

// Hardcoded FX fallbacks — no API call. A salary filter tolerates stale rates;
// these move slowly enough that a coarse bucket is unaffected. All salaries are
// normalized to yearly EUR integers before storage.
const CURRENCY_TO_EUR = {
    EUR: 1,
    USD: 0.92,
    GBP: 1.17,
    CHF: 1.05,
};

// Interval → multiplier to convert an amount to a yearly figure.
const INTERVAL_TO_YEARLY = {
    yearly: 1,
    monthly: 12,
    hourly: 2080, // 40 hours × 52 weeks
};

// Yearly salary sanity bounds. Mirrors SALARY_BOUNDS.yearly in
// gemma/extractRequirements.js — anything outside is treated as a misread.
const SALARY_YEARLY_BOUNDS = { min: 10000, max: 1000000 };

// ─── ATS normalization maps (lowercased keys → canonical value) ────────────────
// Exhaustive across the 8 ATS platforms plus Gemma's own enum outputs. Keys are
// stored lowercase; lookups lowercase their input first for O(1) matching.

const WORKPLACE_MAP = new Map(Object.entries({
    'remote': 'remote',
    'fully remote': 'remote',
    'fully_remote': 'remote',
    'hybrid': 'hybrid',
    'partially remote': 'hybrid',
    'partially_remote': 'hybrid',
    'flexible': 'hybrid',
    'on-site': 'onsite',
    'on_site': 'onsite',
    'onsite': 'onsite',
    'in-office': 'onsite',
    'office': 'onsite',
}));

const EXPERIENCE_MAP = new Map(Object.entries({
    'entry level': 'entry',
    'entry': 'entry',
    'entry_level': 'entry',
    'junior': 'entry',
    'intern': 'entry',
    'internship': 'entry',
    'student': 'entry',
    'werkstudent': 'entry',
    'praktikant': 'entry',
    // "Mid-Senior level" is LinkedIn's format, widely copied. Intent is
    // senior-leaning, so it maps to "senior" (not "mid").
    'mid-senior level': 'senior',
    'mid': 'mid',
    'mid level': 'mid',
    'mid_level': 'mid',
    'mid-level': 'mid',
    'associate': 'mid',
    'fachkraft': 'mid',
    'experienced': 'mid',
    'professional': 'mid',
    'ic2': 'mid',
    'ic3': 'mid',
    'senior': 'senior',
    'senior level': 'senior',
    'senior_level': 'senior',
    'ic4': 'senior',
    'staff': 'senior',
    'lead': 'lead',
    'principal': 'lead',
    'staff engineer': 'lead',
    'teamleiter': 'lead',
    'team lead': 'lead',
    'director': 'executive',
    'vp': 'executive',
    'vice president': 'executive',
    'head of': 'executive',
    'c-level': 'executive',
    'executive': 'executive',
    'geschäftsführer': 'executive',
    'managing director': 'executive',
    'cto': 'executive',
    'ceo': 'executive',
    'cfo': 'executive',
    'coo': 'executive',
    'ciso': 'executive',
}));

const EMPLOYMENT_MAP = new Map(Object.entries({
    'full-time': 'fulltime',
    'fulltime': 'fulltime',
    'full_time': 'fulltime',
    'permanent': 'fulltime',
    'regular': 'fulltime',
    'festanstellung': 'fulltime',
    'unbefristet': 'fulltime',
    'vollzeit': 'fulltime',
    'fulltime_fixed_term': 'fulltime',
    'part-time': 'parttime',
    'parttime': 'parttime',
    'part_time': 'parttime',
    'teilzeit': 'parttime',
    'contract': 'contract',
    'freelance': 'contract',
    'freelancer': 'contract',
    'contractor': 'contract',
    'freie mitarbeit': 'contract',
    'temporary': 'contract',
    'temp': 'contract',
    'befristet': 'contract',
    'fixed-term': 'contract',
    'fixed_term': 'contract',
    'befristeter vertrag': 'contract',
    'zeitarbeit': 'contract',
    'arbeitnehmerüberlassung': 'contract',
    'internship': 'internship',
    'intern': 'internship',
    'praktikum': 'internship',
    'werkstudent': 'internship',
    'working student': 'internship',
    'working_student': 'internship',
    'studentenjob': 'internship',
    'ausbildung': 'internship',
    'berufsausbildung': 'internship',
    'apprenticeship': 'internship',
    'duales studium': 'internship',
}));

// An explicit title decides the type, same principle as seniority: "Werkstudent
// Data (m/w/d)" is a student job whatever the ATS field says ("FullTime" is a
// common default). Werkstudent, Ausbildung and Praktikum all belong to the
// existing Internship option.
const TITLE_EMPLOYMENT = [
    ['internship', /\b(werkstudent(in)?|working student|studentische hilfskraft)\b/i],
    ['internship', /\b(ausbildung|auszubildende[rn]?|azubi|apprentice(ship)?|duales studium|dual(e|er)? student(in)?)\b/i],
    ['internship', /\b(intern|internship|praktikum|praktikant(in)?|pflichtpraktikum)\b/i],
];

/** Look up `raw` in `map` case-insensitively. Returns canonical value or null. */
function lookup(map, raw) {
    if (raw === null || raw === undefined) return null;
    const key = String(raw).trim().toLowerCase();
    if (!key) return null;
    return map.get(key) ?? null;
}

/**
 * Resolve the canonical workplace type for a job.
 * Gemma remote_policy_detail wins → ATS WorkplaceType → Location scan → null.
 * @param {object} job - full job document
 * @returns {"remote"|"hybrid"|"onsite"|null}
 */
export function resolveWorkplace(job) {
    if (!job) return null;

    const gemmaRaw = job.parsedRequirements?.remote_policy_detail;
    if (gemmaRaw && String(gemmaRaw).toLowerCase() !== 'not_mentioned') {
        const fromGemma = lookup(WORKPLACE_MAP, gemmaRaw);
        if (fromGemma) return fromGemma;
    }

    const fromAts = lookup(WORKPLACE_MAP, job.WorkplaceType);
    if (fromAts) return fromAts;

    // Location strings only ever surface "Remote" (Greenhouse). Never "hybrid".
    if (String(job.Location || '').toLowerCase().includes('remote')) return 'remote';

    return null;
}

// ─── Experience ───────────────────────────────────────────────────────────────
//
// Evidence (2026-10-20) behind the order in resolveExperience():
//   - Live data: SmartRecruiters' experienceLevel was "Entry" on 351 active jobs,
//     169 of them titled Senior/Lead/Manager — boards leave the field at its
//     default. Vendor labels therefore lose to an explicit title.
//   - LinkedIn (captured in a real browser): its Entry level returned 0
//     Senior/Lead titles; plain titles ("Software Engineer") did appear.
//   - Title keywords are the published method for seniority (resume-seniority
//     study arXiv 2106.11846; Lightcast labels Junior/Senior from title wording
//     and everything else "Intermediate" → our "mid" default).
//   - Years: Google Cloud Talent JobLevel ENTRY_LEVEL = "less than 2 years";
//     job-board guidance 0–2 / 3–5 / 6+; Datapeople 1–3 / 4–7 / 8+. Hence
//     ≤1 → entry, 2–4 → mid, ≥5 → senior. Lead/executive are role titles,
//     never inferred from years (Google: DIRECTOR/EXECUTIVE are role levels).

// Highest matching level wins ("Senior Director" → executive).
const TITLE_SENIORITY = [
    ['executive', /\b(chief|ceo|cto|cfo|coo|cio|ciso|cpo|cmo|cro|svp|evp|vp|vice president|head of|director|direktor(in)?|gesch(ä|ae)ftsf(ü|ue)hrer(in)?|general manager)\b/i],
    ['lead', /\b(principal|tech lead|team ?lead|lead|teamleiter(in)?|teamleitung|abteilungsleiter(in)?|staff\)?(\W+[\w.+#-]+){0,3}?\W+(engineer|developer|scientist|designer|architect|researcher|analyst|swe|sre))\b/i],
    ['senior', /\b(senior|sr\.?|snr)\b/i],
    ['entry', /\b(junior|jr\.?|intern|internship|interns|trainee|graduate|new grad|entry[- ]level|berufseinsteiger(in)?|einsteiger(in)?|working student|werkstudent(in)?|praktikant(in)?|praktikum|apprentice(ship)?|azubi|auszubildende[rn]?|ausbildung|duales studium|dual(e|er)? student(in)?|absolvent(in)?)\b/i],
];
// "Lead Generation Specialist" is a function, not a seniority.
const NOT_A_LEAD = /\blead (generation|gen|nurtur|qualif|management)/i;
// A manager title is never entry level (LinkedIn files managers under Mid-Senior).
const MANAGER_TITLE = /\bmanager(in)?\b/i;

/**
 * Seniority stated explicitly by a job title, or null when the title carries no
 * seniority word. Exported for tests and the audit script.
 * @param {string} title
 * @returns {"entry"|"senior"|"lead"|"executive"|null}
 */
export function seniorityFromTitle(title) {
    const text = String(title || '');
    if (!text) return null;
    for (const [level, pattern] of TITLE_SENIORITY) {
        if (level === 'lead' && pattern.test(text) && NOT_A_LEAD.test(text) && !/\b(principal|team ?lead|tech lead|teamleit)/i.test(text)) continue;
        if (pattern.test(text)) return level;
    }
    return null;
}

/** Level implied by the JD's minimum years of experience, or null. */
function levelFromYears(years) {
    if (typeof years !== 'number' || !Number.isFinite(years) || years < 0) return null;
    if (years <= 1) return 'entry';
    if (years <= 4) return 'mid';
    return 'senior';
}

/**
 * Resolve the canonical experience level for a job.
 *
 * Explicit title seniority → JD minimum years → Gemma experience_level →
 * ATS ExperienceLevel → "mid". A manager title can never resolve to entry, and
 * a source that only knows "N/A" simply falls through.
 *
 * @param {object} job - full job document
 * @returns {"entry"|"mid"|"senior"|"lead"|"executive"}
 */
export function resolveExperience(job) {
    if (!job) return null;

    const fromTitle = seniorityFromTitle(job.JobTitle);
    if (fromTitle) return fromTitle;

    const isManager = MANAGER_TITLE.test(String(job.JobTitle || ''));
    const notEntryForManager = (level) => (isManager && level === 'entry' ? null : level);

    const fromYears = notEntryForManager(levelFromYears(job.parsedRequirements?.min_experience_years));
    if (fromYears) return fromYears;

    const fromGemma = notEntryForManager(lookup(EXPERIENCE_MAP, job.parsedRequirements?.experience_level));
    if (fromGemma) return fromGemma;

    const fromAts = notEntryForManager(lookup(EXPERIENCE_MAP, job.ExperienceLevel));
    if (fromAts) return fromAts;

    return 'mid';
}

/**
 * Resolve the canonical employment type for a job.
 * Explicit title → Gemma employment_type → ATS EmploymentType → null.
 * @param {object} job - full job document
 * @returns {"fulltime"|"parttime"|"contract"|"internship"|null}
 */
export function resolveEmployment(job) {
    if (!job) return null;

    const title = String(job.JobTitle || '');
    for (const [type, pattern] of TITLE_EMPLOYMENT) {
        if (pattern.test(title)) return type;
    }

    const fromGemma = lookup(EMPLOYMENT_MAP, job.parsedRequirements?.employment_type);
    if (fromGemma) return fromGemma;

    return lookup(EMPLOYMENT_MAP, job.EmploymentType);
}

// ─── Visa / relocation: sentence-level text evidence ─────────────────────────
//
// Measured 2026-10-20 on 5,131 active jobs:
//   - 45% of jobs never got a Gemma extraction, so the AI-only rule left them
//     blank even when the ad states the benefit.
//   - Where Gemma did run it answered "not_mentioned" on literal statements:
//     "International relocation support is provided", "full visa and relocation
//     support", "Relocation support: up to €2,500".
//   - About half of all "visa sponsorship" mentions are NEGATIVE ("Visa
//     sponsorship is not available"), so a phrase match alone is wrong.
// Hence: a positive phrase counts only inside a sentence with no negation, and
// any negative sentence vetoes. Same idea as Indeed's text-derived attributes
// ("Homeoffice", "Berufseinsteiger").

const VISA_PHRASE = /\b(visa sponsorship|visa (and|&) relocation (support|assistance|help)|sponsor(ship)? (of |for )?(your |a |the )?(work )?visa|visa (support|assistance|help|process)|work permit (support|assistance|sponsorship)|blue card (support|sponsorship|application)|sponsor(ing)? (your )?(eu )?blue card|visum(sunterstützung)?)\b/i;
const RELOCATION_PHRASE = /\b(relocation (package|support|assistance|bonus|budget|allowance|help|services?|costs?)|(visa and|and) relocation support|support (with|for) (your )?(relocation|move|moving)|help (you )?(relocate|move)|umzugs(unterstützung|kosten|hilfe|pauschale))\b/i;
const NEGATION = /\b(not|no|none|n\/a|n't|cannot|unable|without|neither|nor|unfortunately|nicht|kein(e|en)?|leider)\b/i;
// Sentences: punctuation, line breaks and the "…classesInternational…" joins
// left behind when HTML list items are flattened. Never split on ":" — "Visa
// sponsorship: Not available" must stay one (negative) sentence; 6 active
// jobs use that header format.
const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+|•|(?<=[a-z])(?=[A-Z][a-z])/;

/** "positive" | "negative" | null for one benefit phrase across the description. */
function benefitFromText(description, phrase) {
    if (!description) return null;
    let positive = false;
    for (const sentence of String(description).split(SENTENCE_SPLIT)) {
        if (!phrase.test(sentence)) continue;
        if (NEGATION.test(sentence)) return 'negative';
        positive = true;
    }
    return positive ? 'positive' : null;
}

/**
 * Shared trust order for the two "only confirmed positives" benefits:
 * a negative sentence in the ad → null; Gemma "available" → available;
 * a clean positive sentence → available. Without a Description (list teasers
 * read from the RAM cache, which omits it) the stored value is kept, so a
 * badge never disagrees with the filter that matched it.
 */
function resolveBenefit(job, aiField, phrase, storedField) {
    if (!job) return null;
    const hasText = typeof job.Description === 'string' && job.Description.length > 0;
    if (!hasText) {
        if (job.parsedRequirements?.[aiField] === 'available') return 'available';
        return job[storedField] === 'available' ? 'available' : null;
    }
    const fromText = benefitFromText(job.Description, phrase);
    if (fromText === 'negative') return null;
    if (job.parsedRequirements?.[aiField] === 'available') return 'available';
    return fromText === 'positive' ? 'available' : null;
}

/**
 * Resolve visa sponsorship. Only confirmed positives are surfaced.
 * @param {object} job - full job document
 * @returns {"available"|null}
 */
export function resolveVisa(job) {
    return resolveBenefit(job, 'visa_sponsorship', VISA_PHRASE, 'filterVisa');
}

/**
 * Resolve relocation support. Only confirmed positives are surfaced.
 * @param {object} job - full job document
 * @returns {"available"|null}
 */
export function resolveRelocation(job) {
    return resolveBenefit(job, 'relocation_support', RELOCATION_PHRASE, 'filterRelocation');
}

/** Coerce to a finite positive number, or null. */
function toPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Convert a raw amount to a yearly-EUR integer, or null if it can't be
 * converted (unknown currency) or falls outside yearly bounds after conversion.
 */
function toYearlyEur(amount, currency, interval) {
    if (amount === null) return null;

    const rate = CURRENCY_TO_EUR[currency];
    if (!rate) return null; // unknown currency — cannot convert reliably

    const multiplier = INTERVAL_TO_YEARLY[interval] ?? 1; // unknown interval → yearly
    const yearly = Math.round(amount * multiplier * rate);

    if (yearly < SALARY_YEARLY_BOUNDS.min || yearly > SALARY_YEARLY_BOUNDS.max) return null;
    return yearly;
}

/**
 * Resolve salary into a canonical yearly-EUR pair with its source tier.
 *
 * The ATS wins the whole pair if it provided EITHER bound (structured data beats
 * text extraction); only when the ATS has neither bound do we fall to Gemma.
 * Sources are never mixed within a single job. All amounts are converted to
 * yearly EUR integers and validated against yearly bounds; out-of-bounds amounts
 * become null. When neither source yields a usable amount, everything is null.
 *
 * @param {object} job - full job document
 * @returns {{min:number|null, max:number|null, currency:string|null, interval:string|null, tier:"ats"|"jd"|null}}
 */
export function resolveSalary(job) {
    const empty = { min: null, max: null, currency: null, interval: null, tier: null };
    if (!job) return empty;

    const atsMin = toPositiveNumber(job.SalaryMin);
    const atsMax = toPositiveNumber(job.SalaryMax);

    const pr = job.parsedRequirements;
    const gemmaMin = toPositiveNumber(pr?.salary_min);
    const gemmaMax = toPositiveNumber(pr?.salary_max);

    let rawMin, rawMax, rawCurrency, rawInterval, tier;

    if (atsMin !== null || atsMax !== null) {
        rawMin = atsMin;
        rawMax = atsMax;
        rawCurrency = job.SalaryCurrency;
        rawInterval = job.SalaryInterval;
        tier = 'ats';
    } else if (gemmaMin !== null || gemmaMax !== null) {
        rawMin = gemmaMin;
        rawMax = gemmaMax;
        rawCurrency = pr?.salary_currency;
        rawInterval = pr?.salary_interval;
        tier = 'jd';
    } else {
        return empty;
    }

    const currency = typeof rawCurrency === 'string' ? rawCurrency.toUpperCase() : null;
    const interval = typeof rawInterval === 'string' ? rawInterval.toLowerCase() : 'yearly';

    const min = toYearlyEur(rawMin, currency, interval);
    const max = toYearlyEur(rawMax, currency, interval);

    // Nothing survived conversion/bounds — treat as no salary.
    if (min === null && max === null) return empty;

    // Everything is stored normalized to yearly EUR.
    return { min, max, currency: 'EUR', interval: 'yearly', tier };
}

/**
 * Reconcile every filter field for a job in one pass. Returns the flat
 * `filter*` shape that gets persisted onto the document and served to clients.
 * @param {object} job - full job document
 * @returns {{filterWorkplace, filterExperience, filterEmployment, filterVisa, filterRelocation, filterSalaryMin, filterSalaryMax, filterSalaryCurrency, filterSalaryInterval, filterSalaryTier}}
 */
export function resolveAll(job) {
    const salary = resolveSalary(job);
    return {
        filterWorkplace: resolveWorkplace(job),
        filterExperience: resolveExperience(job),
        filterEmployment: resolveEmployment(job),
        filterVisa: resolveVisa(job),
        filterRelocation: resolveRelocation(job),
        filterSalaryMin: salary.min,
        filterSalaryMax: salary.max,
        filterSalaryCurrency: salary.currency,
        filterSalaryInterval: salary.interval,
        filterSalaryTier: salary.tier,
    };
}

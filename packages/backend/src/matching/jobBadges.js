// ─── Job Badges ────────────────────────────────────────────────────────────────
//
// Short, factual labels shown on match rows ("Visa sponsorship", "New").
// Only facts we actually hold: each badge comes from a structured field, never
// from guessing at the description.

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_JOB_DAYS = 3;

export function jobBadges(job) {
    const req = job.parsedRequirements || {};
    const badges = [];

    const posted = new Date(job.PostedDate || job.scrapedAt || 0).getTime();
    if (posted && Date.now() - posted <= NEW_JOB_DAYS * DAY_MS) badges.push('New');
    if (req.visa_sponsorship === 'available') badges.push('Visa sponsorship');
    if (req.relocation_support === 'available') badges.push('Relocation support');
    if (job.SalaryMin || job.SalaryMax || job.filterSalaryMin || req.salary_min) badges.push('Salary listed');

    return badges;
}

/**
 * Formats job data into WhatsApp-friendly messages. Pure functions, no I/O.
 */

const SITE_HOST = 'englishjobsgermany.com';

function jobUrl(job) {
    return `https://${SITE_HOST}/jobs/${job._id}`;
}

function sanitize(str) {
    return (str || '').replace(/"/g, "'").replace(/`/g, "'");
}

function formatSalary(job) {
    if (!job.SalaryMin && !job.SalaryMax) return null;
    const currency = job.SalaryCurrency || 'EUR';
    const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    if (job.SalaryMin && job.SalaryMax) {
        return `💰  ${sym}${Math.round(job.SalaryMin / 1000)}K – ${sym}${Math.round(job.SalaryMax / 1000)}K`;
    }
    if (job.SalaryMin) return `💰  From ${sym}${Math.round(job.SalaryMin / 1000)}K`;
    return `💰  Up to ${sym}${Math.round(job.SalaryMax / 1000)}K`;
}

/**
 * Build a channel post featuring exactly one job.
 * @param {object} job
 * @returns {string}
 */
export function formatWhatsAppPost(job) {
    if (!job) throw new Error('formatWhatsAppPost requires a job');

    const lines = [
        `*${sanitize(job.JobTitle)}*`,
        '',
        `📂  ${sanitize(job.Category) || 'Other'}`,
        `📍  ${sanitize(job.Location) || 'Germany'}`,
        `🏢  ${sanitize(job.Company) || 'Unknown company'}`,
    ];

    const salary = formatSalary(job);
    if (salary) lines.push(salary);

    lines.push('', jobUrl(job));

    return lines.join('\n');
}
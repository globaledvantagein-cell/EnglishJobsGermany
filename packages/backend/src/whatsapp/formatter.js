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

/**
 * Build a channel post featuring exactly one job.
 * @param {object} job
 * @returns {string}
 */
export function formatWhatsAppPost(job) {
    if (!job) throw new Error('formatWhatsAppPost requires a job');

    return [
        `🟢 *${sanitize(job.JobTitle)}*`,
        `📂 ${sanitize(job.Category) || 'Other'}`,
        `📍 ${sanitize(job.Location) || 'Germany'}`,
        `🏢 ${sanitize(job.Company) || 'Unknown company'}`,
        `🔗 ${jobUrl(job)}`,
    ].join('\n');
}
/**
 * Formats job data into WhatsApp-friendly messages. Pure functions, no I/O.
 */

const SITE_HOST = 'englishjobsgermany.com';
const HEAVY_DIVIDER = '━━━━━━━━━━━━━━━━━━━━';
const LIGHT_DIVIDER = '─────────────────────';

function jobUrl(job) {
    return `https://${SITE_HOST}/jobs/${job._id}`;
}

/** Swap double quotes and backticks for single quotes before a CLI send. */
function sanitize(str) {
    return (str || '').replace(/"/g, "'").replace(/`/g, "'");
}

function jobBlock(job, n) {
    return [
        `*${n}. ${sanitize(job.JobTitle) || 'Untitled role'}*`,
        `📂 ${sanitize(job.Category) || 'Other'}`,
        `📍 ${sanitize(job.Location) || 'Germany'}`,
        `🏢 ${sanitize(job.Company) || 'Unknown company'}`,
        `🔗 ${jobUrl(job)}`,
    ].join('\n');
}

/**
 * Build a channel post featuring exactly two jobs.
 *
 * @param {object} job1
 * @param {object} job2
 * @returns {string}
 */
export function formatWhatsAppPost(job1, job2) {
    if (!job1 || !job2) throw new Error('formatWhatsAppPost requires exactly 2 jobs');

    return [
        '🟢 *English Jobs Germany*',
        '',
        HEAVY_DIVIDER,
        '',
        jobBlock(job1, 1),
        '',
        LIGHT_DIVIDER,
        '',
        jobBlock(job2, 2),
        '',
        HEAVY_DIVIDER,
        '',
        `For more jobs in Germany where German is not a mandatory requirement, visit 👉 ${SITE_HOST}`,
    ].join('\n');
}

/**
 * Real-time single-job alert (e.g. when an admin approves a job).
 * @param {object} job
 * @returns {string}
 */
export function formatSingleJob(job) {
    const lines = [
        '🆕 New Job Alert',
        '',
        job.JobTitle || 'Untitled role',
        `🏢 ${job.Company || 'Unknown company'} · 📍 ${job.Location || 'Germany'}`,
    ];
    if (job.Category) lines.push(`💼 ${job.Category}`);
    lines.push('', `Apply → ${jobUrl(job)}`);
    return lines.join('\n');
}

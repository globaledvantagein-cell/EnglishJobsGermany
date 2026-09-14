/**
 * Formats job data into WhatsApp-friendly messages. Pure functions, no I/O.
 */

const SITE_HOST = 'englishjobsgermany.com';
const JOBS_PER_MESSAGE = 10;
const DIVIDER = '━━━━━━━━━━━━━━━';

function jobUrl(job) {
    return `${SITE_HOST}/jobs/${job._id}`;
}

function jobLine(job) {
    const company = job.Company || 'Unknown company';
    const location = job.Location || 'Germany';
    return `🏢 ${company} · 📍 ${location}`;
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/**
 * Build the daily digest post(s).
 *
 * @param {object[]} jobs
 * @returns {string[]} one string per message, at most 10 jobs each. Empty
 *   array when there are no jobs.
 */
export function formatJobDigest(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) return [];

    const total = jobs.length;
    const chunks = chunk(jobs, JOBS_PER_MESSAGE);

    return chunks.map((group, chunkIdx) => {
        const offset = chunkIdx * JOBS_PER_MESSAGE;
        const header = chunks.length > 1
            ? `🔵 ${total} New Jobs Today (${chunkIdx + 1}/${chunks.length})`
            : `🔵 ${total} New Jobs Today`;

        const entries = group.map((job, i) =>
            `${offset + i + 1}. ${job.JobTitle || 'Untitled role'}\n${jobLine(job)}\n🔗 ${jobUrl(job)}`
        ).join('\n\n');

        return [
            header,
            '',
            DIVIDER,
            '',
            entries,
            '',
            DIVIDER,
            '',
            `Browse all jobs → ${SITE_HOST}`,
        ].join('\n');
    });
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
        jobLine(job),
    ];
    if (job.Category) lines.push(`💼 ${job.Category}`);
    lines.push('', `Apply → ${jobUrl(job)}`);
    return lines.join('\n');
}

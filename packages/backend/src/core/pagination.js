/**
 * Determines if the scraper should continue fetching more pages.
 * @param {object} siteConfig - The configuration for the site.
 * @param {Array} jobs - The jobs found on the current page.
 * @param {number} offset - The current pagination offset.
 * @param {number} limit - The number of items per page.
 * @param {number} totalJobs - The total number of jobs known so far.
 * @returns {boolean} True if the scraper should continue, false otherwise.
 */
export function shouldContinuePaging(siteConfig, jobs, offset, limit, totalJobs) {
    if (jobs.length === 0) {
        return false;
    }
    if (siteConfig.getTotal) {
        return (offset + jobs.length) < totalJobs;
    }
    if (siteConfig.ignoreLengthCheck) {
        return true; // Keep going until jobs.length is 0
    }
    if (jobs.length < limit) {
        return false;
    }
    return true;
}


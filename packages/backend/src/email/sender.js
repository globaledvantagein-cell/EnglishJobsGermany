/**
 * Low-level Resend send primitives.
 *
 * sendEmail()     — one recipient, one message. Always personalized.
 * sendBulkEmails() — many recipients, each with their own personalized
 *                    content. Respects rate limits (2/sec on free tier).
 *
 * We send N individual messages in parallel batches with rate limiting
 * because every digest is personalized (different jobs per user).
 */
import { getResendClient, FROM_EMAIL, FROM_NAME, REPLY_TO } from './client.js';

// Resend free tier allows ~2 emails/sec. Override via env if you upgrade.
const SEND_RATE_PER_SECOND = Number(process.env.RESEND_SEND_RATE_PER_SECOND) || 2;

/**
 * Send a single email.
 *
 * @param {Object} msg
 * @param {string} msg.to              - recipient email
 * @param {string} msg.subject
 * @param {string} msg.html
 * @param {string} msg.text
 * @param {string} [msg.unsubscribeUrl] - if provided, adds List-Unsubscribe headers
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text, unsubscribeUrl }) {
    const resend = getResendClient();

    // RFC 8058 one-click unsubscribe: Gmail/Yahoo show their own "Unsubscribe"
    // button and POST to this URL (handled by POST /api/auth/unsubscribe).
    // Required by both for bulk senders since 2024.
    const headers = unsubscribeUrl
        ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : undefined;

    try {
        const { data, error } = await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: [to],
            replyTo: REPLY_TO,
            subject,
            html,
            text,
            ...(headers && { headers }),
        });

        if (error) {
            return { ok: false, error: error.message };
        }

        return { ok: true, messageId: data.id };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Send many personalized emails, respecting rate limits.
 *
 * Each message is an object compatible with sendEmail(). Results are
 * returned in input order. Failures are logged but don't stop the batch.
 *
 * @param {Array} messages — list of { to, subject, html, text, unsubscribeUrl, meta }
 *                           `meta` is optional user-supplied context echoed back in results.
 * @param {Object} [opts]
 * @param {number} [opts.ratePerSecond=SEND_RATE_PER_SECOND]
 * @param {Function} [opts.onProgress] - called as (sent, total, lastResult)
 * @returns {Promise<Array<{ ok, messageId?, error?, to, meta? }>>}
 */
export async function sendBulkEmails(messages, opts = {}) {
    const ratePerSecond = opts.ratePerSecond || SEND_RATE_PER_SECOND;
    const results = [];

    for (let i = 0; i < messages.length; i += ratePerSecond) {
        const chunk = messages.slice(i, i + ratePerSecond);
        const t0 = Date.now();

        const chunkResults = await Promise.all(
            chunk.map(async msg => {
                const r = await sendEmail(msg);
                return { ...r, to: msg.to, meta: msg.meta };
            }),
        );

        results.push(...chunkResults);
        if (opts.onProgress) {
            opts.onProgress(results.length, messages.length, chunkResults);
        }

        // Wait out the remainder of this 1-second window before next chunk.
        const elapsed = Date.now() - t0;
        if (i + ratePerSecond < messages.length && elapsed < 1000) {
            await new Promise(r => setTimeout(r, 1000 - elapsed));
        }
    }

    return results;
}
/**
 * One-click unsubscribe tokens.
 *
 * Each digest email contains a personalized unsubscribe URL signed with our
 * JWT_SECRET. When a user clicks, the backend verifies the token, flips
 * isSubscribed: false on their user doc, and shows a confirmation page.
 *
 * No login required. Tokens carry a 1-year expiry, but verification ignores
 * it: an old email's link must still work (CAN-SPAM / Gmail bulk-sender rules),
 * and unsubscribing is harmless. The signature is what proves the link is ours.
 */
import jwt from 'jsonwebtoken';
import { SITE_URL } from '../env.js';

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '365d';

if (!JWT_SECRET) {
    console.warn('[email/unsubscribe] JWT_SECRET not set — unsubscribe links will fail.');
}

/**
 * Generate a signed unsubscribe token for an email address.
 * @param {string} email
 * @returns {string} JWT
 */
export function generateUnsubscribeToken(email) {
    return jwt.sign({ email, action: 'unsubscribe' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * Verify an unsubscribe token. Throws if invalid/expired.
 * @param {string} token
 * @returns {string} the email address from the token
 */
export function verifyUnsubscribeToken(token) {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    if (payload.action !== 'unsubscribe' || !payload.email) {
        throw new Error('Invalid unsubscribe token payload');
    }
    return payload.email;
}

/**
 * Build the full unsubscribe URL the user clicks in the email. Always the
 * public site: FRONTEND_ORIGIN is a CORS value (localhost on a dev machine),
 * and a digest sent from one carried links nobody could open.
 */
export function buildUnsubscribeUrl(email) {
    const token = generateUnsubscribeToken(email);
    return `${SITE_URL}/api/auth/unsubscribe?token=${encodeURIComponent(token)}`;
}
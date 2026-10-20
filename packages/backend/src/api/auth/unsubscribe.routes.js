import { setSubscriptionByEmail } from '../../db/index.js';
import {
    verifyUnsubscribeToken,
    renderUnsubscribeConfirmation,
} from '../../email/index.js';
import { sendEmailQuietly, unsubscribePage } from './helpers.js';

const SUPPORT = 'support@englishjobsgermany.com';

/**
 * Unsubscribe the address in `token`. Returns { status, title, message } for
 * the response; never throws. Already-unsubscribed is a success: the person
 * wants to stop getting email and they won't, so we never show them an error.
 */
async function unsubscribeWithToken(token, source) {
    if (!token) {
        return { status: 400, title: 'Link incomplete', message: `This unsubscribe link is missing its code. Reply to any of our emails or write to ${SUPPORT} and we'll remove you.` };
    }

    let email;
    try {
        email = verifyUnsubscribeToken(token);
    } catch (error) {
        console.warn('[Unsubscribe] Bad token:', error.message);
        return { status: 400, title: 'Link not recognised', message: `We couldn't read this unsubscribe link. Reply to any of our emails or write to ${SUPPORT} and we'll remove you.` };
    }

    try {
        const { found, changed } = await setSubscriptionByEmail(email, false, source);
        if (changed) {
            console.log(`[Unsubscribe] ${email} unsubscribed (${source}).`);
            try {
                const { subject, html, text } = renderUnsubscribeConfirmation({ name: email.split('@')[0], email });
                sendEmailQuietly({ to: email, subject, html, text });
            } catch (emailErr) {
                console.error('[Unsubscribe] Failed to render confirmation email:', emailErr.message);
            }
        }
        return {
            status: 200,
            title: "You're unsubscribed",
            message: found
                ? `${email} won't receive any more emails from English Jobs Germany.`
                : `${email} isn't on our mailing list, so you won't receive any emails from us.`,
        };
    } catch (error) {
        console.error('[Unsubscribe] Error:', error.message);
        return { status: 503, title: 'Please try again', message: `Something went wrong on our side. Open the link again in a minute, or write to ${SUPPORT} and we'll remove you.` };
    }
}

export function attachUnsubscribeRoute(authRouter) {
    // ─── Unsubscribe (link in every email) ────────────────────────────────
    // GET /api/auth/unsubscribe?token=xxx — the footer link. No login.
    // Token is a signed JWT with { email, action: 'unsubscribe' }.
    // Renders its own page rather than redirecting, so it works even when
    // the frontend is down.
    authRouter.get('/unsubscribe', async (req, res) => {
        const { status, title, message } = await unsubscribeWithToken(req.query.token, 'link');
        res.status(status).send(unsubscribePage(message, title));
    });

    // POST /api/auth/unsubscribe?token=xxx — RFC 8058 one-click, sent by
    // Gmail/Yahoo's own "Unsubscribe" button (List-Unsubscribe-Post header).
    authRouter.post('/unsubscribe', async (req, res) => {
        const { status, message } = await unsubscribeWithToken(req.query.token || req.body?.token, 'one-click');
        res.status(status).type('text/plain').send(message);
    });
}

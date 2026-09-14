/**
 * Thin HTTP client for WuzAPI (https://github.com/asternic/wuzapi).
 *
 * WuzAPI runs as a separate PM2 process (default localhost:8080) and holds the
 * WhatsApp session. This module only talks to its REST API. Every function
 * swallows network errors and reports them via the return value, so a dead
 * WuzAPI can never crash the API server or a cron run.
 */
import { WUZAPI_URL, WUZAPI_TOKEN, WHATSAPP_CHANNEL_JID } from '../env.js';

const WUZAPI_BASE = WUZAPI_URL;
const CHANNEL_JID = WHATSAPP_CHANNEL_JID; // e.g. '120363171744447809@newsletter'

const REQUEST_TIMEOUT_MS = 15_000;

function headers() {
    return {
        'Authorization': WUZAPI_TOKEN,
        'Content-Type': 'application/json',
    };
}

/**
 * POST a JSON body to a WuzAPI endpoint. Returns { success, error?, data? }.
 * Never throws.
 */
async function post(path, body) {
    try {
        const res = await fetch(`${WUZAPI_BASE}${path}`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

        if (!res.ok) {
            const error = data?.error || `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
            console.error(`[WhatsApp] ${path} failed: ${error}`);
            return { success: false, error };
        }

        // WuzAPI wraps responses as { code, success, data }. Honour its own flag.
        if (data && data.success === false) {
            const error = data.error || 'WuzAPI reported failure';
            console.error(`[WhatsApp] ${path} failed: ${error}`);
            return { success: false, error };
        }

        return { success: true, data: data?.data ?? data };
    } catch (err) {
        const error = err?.name === 'TimeoutError' ? 'request timed out' : (err?.message || String(err));
        console.error(`[WhatsApp] ${path} unreachable: ${error}`);
        return { success: false, error };
    }
}

/**
 * Send a plain-text message to the configured channel.
 * @param {string} text
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendTextToChannel(text) {
    if (!CHANNEL_JID) return { success: false, error: 'WHATSAPP_CHANNEL_JID not configured' };
    return post('/chat/send/text', { Phone: CHANNEL_JID, Body: text });
}

/**
 * Send an image (by URL) with a caption to the configured channel.
 * @param {string} imageUrl
 * @param {string} caption
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendImageToChannel(imageUrl, caption) {
    if (!CHANNEL_JID) return { success: false, error: 'WHATSAPP_CHANNEL_JID not configured' };
    return post('/chat/send/image', { Phone: CHANNEL_JID, Image: imageUrl, Caption: caption });
}

/**
 * True when WuzAPI is reachable AND its WhatsApp session is connected.
 * False on any error.
 */
export async function isWuzAPIConnected() {
    try {
        const res = await fetch(`${WUZAPI_BASE}/session/status`, {
            method: 'GET',
            headers: headers(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) return false;
        const json = await res.json();
        // WuzAPI returns { code, data: { Connected, LoggedIn }, success }.
        // Accept either the wrapped or a flat shape.
        const status = json?.data ?? json;
        return status?.Connected === true;
    } catch (err) {
        console.warn(`[WhatsApp] status check failed: ${err?.message || err}`);
        return false;
    }
}

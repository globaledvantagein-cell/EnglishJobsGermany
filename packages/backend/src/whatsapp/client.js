/**
 * WhatsApp Channel client backed by the wacli CLI.
 *
 * wacli is a plain CLI (no daemon, no port) that holds the WhatsApp session on
 * disk and accepts channel JIDs natively. Every function swallows errors and
 * reports them via the return value, so a broken wacli can never crash the API
 * server or a cron run.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WACLI_PATH, WHATSAPP_CHANNEL_JID } from '../env.js';

const execFileAsync = promisify(execFile);
const LOG = '[WhatsApp]';

/**
 * Send a text message to the WhatsApp Channel via wacli CLI.
 *
 * Arguments are passed straight to the binary (no shell), so quotes, backticks,
 * `$` and real newlines in the message need no escaping.
 *
 * @param {string} text - The message body
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTextToChannel(text) {
    if (!WHATSAPP_CHANNEL_JID) {
        console.warn(`${LOG} No channel JID configured`);
        return { success: false, error: 'no-jid' };
    }

    try {
        const { stderr } = await execFileAsync(
            WACLI_PATH,
            ['send', 'text', '--to', WHATSAPP_CHANNEL_JID, '--message', text],
            { timeout: 30_000 },
        );

        if (stderr && stderr.toLowerCase().includes('error')) {
            console.error(`${LOG} wacli stderr: ${stderr}`);
            return { success: false, error: stderr.trim() };
        }

        console.log(`${LOG} Message sent via wacli`);
        return { success: true };
    } catch (err) {
        // Non-zero exit, timeout, or binary missing. Prefer wacli's own output.
        const error = (err.stderr || '').trim() || err.message;
        console.error(`${LOG} wacli exec failed: ${error}`);
        return { success: false, error };
    }
}

/**
 * Check if wacli is authenticated and connected.
 * Name kept for digest.js compatibility.
 * @returns {Promise<boolean>}
 */
export async function isWuzAPIConnected() {
    try {
        const { stdout } = await execFileAsync(WACLI_PATH, ['doctor'], { timeout: 10_000 });
        const out = stdout.toLowerCase();
        return !out.includes('not connected') && !out.includes('not paired');
    } catch (err) {
        console.warn(`${LOG} wacli doctor failed: ${err.message}`);
        return false;
    }
}

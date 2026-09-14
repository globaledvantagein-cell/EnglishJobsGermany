/**
 * Country + location helpers for the REMOTE jobs vertical.
 *
 * Kept out of utils/job.ts on purpose: that module is Germany-centric by
 * design (getDisplayLocation falls back to "Remote, Germany" / "Germany" for
 * anything it can't place), which is exactly wrong for a global remote feed.
 * Nothing here is imported by the German pipeline.
 */
import type { IJob } from '../types';

/** ISO-3166 alpha-2 → display name, for every country the remote scraper collects. */
export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  IE: 'Ireland',
  NZ: 'New Zealand',
  SG: 'Singapore',
};

/**
 * Country display label. Names only — no flag emoji and no ISO code.
 *
 * Flag emoji are deliberately avoided: Windows ships no flag glyphs, so 🇺🇸
 * degrades to its two regional-indicator letters ("US"), which rendered as a
 * duplicated "US US" next to the code. A plain name is legible everywhere.
 *
 * Returns null when the code is absent so callers can skip the badge entirely.
 * An unrecognized code falls back to itself — the backend whitelists the seven
 * above, so this only fires if that list grows ahead of this map.
 */
export function getCountryLabel(country?: string | null): string | null {
  const code = String(country || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_NAMES[code] ?? code;
}

/**
 * Location line for a remote job: just "Remote".
 *
 * The country is deliberately NOT shown here (or anywhere on remote cards);
 * it stays in the data for filtering only. A job carrying a real city in
 * Location (a Germany-based remote role moved over from the main pipeline)
 * shows that city instead.
 */
export function getRemoteDisplayLocation(job: IJob): string {
  const loc = String(job.Location || '').split(';')[0]?.trim() ?? '';
  const isRemote = !loc || loc.toLowerCase() === 'remote';
  if (isRemote) return 'Remote';
  return loc;
}

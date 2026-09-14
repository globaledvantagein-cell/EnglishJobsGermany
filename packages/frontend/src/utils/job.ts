/**
 * Shared job-data utilities used across multiple pages and components.
 * The big German-city list lives in ./germanCities.ts to keep this file
 * focused on the actual transformation logic.
 */
import type { IJob } from '../types';
import { GERMAN_CITY_NAMES } from './germanCities';

// Re-export for backwards compatibility with any older imports.
export { GERMAN_CITY_NAMES };

const WORKPLACE_SUFFIX_RE = /\s*[-–—]\s*(Office|Hybrid|Remote|On-?site|Onsite)\s*$/i;

function isGermanyLocation(loc: string): boolean {
  const lower = loc.toLowerCase();
  if (lower.includes('germany') || lower.includes('deutschland')) return true;
  return GERMAN_CITY_NAMES.some(city => lower.includes(city));
}

function cleanLocationString(loc: string): string {
  // Remove workplace type suffixes: "Munich - Office" → "Munich"
  const cleaned = loc.replace(WORKPLACE_SUFFIX_RE, '');

  // Split into parts, deduplicate: "Berlin, Berlin, Germany" → "Berlin, Germany"
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }
  return unique.join(', ');
}

function extractCity(loc: string): string | null {
  const cleaned = loc.replace(WORKPLACE_SUFFIX_RE, '');
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);

  // Return the first part that's not "Germany"/"Deutschland" and is a known German city
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'germany' || lower === 'deutschland') continue;
    if (GERMAN_CITY_NAMES.some(city => lower.includes(city))) {
      return part;
    }
  }
  return null;
}

export function getDisplayLocation(job: IJob): string {
  const allLocations = parseAllLocations(job);

  // 1. Find all Germany-related locations
  const germanyLocs = allLocations.filter(isGermanyLocation);

  // 2. Try to extract a German city name
  for (const loc of germanyLocs) {
    const city = extractCity(loc);
    if (city) return city;
  }

  // 3. Remote in Germany
  const hasRemoteGermany = germanyLocs.some(loc => loc.toLowerCase().includes('remote'));
  if (hasRemoteGermany) return 'Remote, Germany';

  // 4. IsRemote flag
  if (job.IsRemote) return 'Remote, Germany';

  // 5. Has Germany but no city
  if (germanyLocs.length > 0) return 'Germany';

  // 6. Try the Location field directly
  if (job.Location) {
    const city = extractCity(job.Location);
    if (city) return city;
    const cleaned = cleanLocationString(job.Location);
    if (cleaned) return cleaned;
  }

  return 'Germany';
}

export function isMeaningful(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return Boolean(normalized) && normalized.toLowerCase() !== 'n/a';
}

/**
 * Merge Location field (semicolon-separated) and AllLocations array
 * into a single de-duplicated array of location strings.
 */
export function parseAllLocations(job: IJob): string[] {
  const fromLocationField = String(job.Location || '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean);

  const fromAllLocations = (job.AllLocations || [])
    .map(value => String(value).trim())
    .filter(Boolean);

  return [...new Set([...fromLocationField, ...fromAllLocations])];
}

/**
 * Pick the first available location from a parsed locations array,
 * falling back to the raw Location field or a default.
 */
export function getPrimaryLocation(job: IJob, locations: string[]): string {
  if (locations.length > 0) return locations[0];
  return job.Location || 'N/A';
}

/** Normalize a workplace-type string into one of: Remote, Hybrid, Onsite, Unspecified. */
export function normalizeWorkplace(value?: string | null): string {
  if (!value) return 'Unspecified';
  const lower = value.trim().toLowerCase();
  if (lower === 'remote' || lower === 'fully remote' || lower === 'work from home' || lower === 'telecommute') return 'Remote';
  if (lower === 'onsite' || lower === 'on-site' || lower === 'in-office' || lower === 'office') return 'Onsite';
  if (lower === 'hybrid' || lower === 'flex' || lower === 'flexible') return 'Hybrid';
  return 'Unspecified';
}

/** Normalize a salary value that may need scaling. E.g., 125 on a yearly interval becomes 125000. */
export function normalizeSalary(value: number | null, interval: string | null): number | null {
  if (value == null || value <= 0) return null;

  const normalizedInterval = String(interval || '').toLowerCase();
  const isAnnual = !normalizedInterval || normalizedInterval === 'per-year-salary' || normalizedInterval === 'yearly';
  if (isAnnual && value > 0 && value < 1000) return value * 1000;

  const isMonthly = normalizedInterval === 'per-month-salary' || normalizedInterval === 'monthly';
  if (isMonthly && value > 0 && value < 100) return value * 1000;

  return value;
}

/** Format a salary range into a compact label like "€50K-80K". */
export function compactSalary(job: IJob): string | null {
  const min = normalizeSalary(job.SalaryMin ?? null, job.SalaryInterval ?? null);
  const max = normalizeSalary(job.SalaryMax ?? null, job.SalaryInterval ?? null);
  if (min == null && max == null) return null;

  const symbol = job.SalaryCurrency === 'EUR' ? '€' : job.SalaryCurrency === 'USD' ? '$' : '';
  const formattedMin = min != null && min > 0 ? `${Math.round(min / 1000)}K` : null;
  const formattedMax = max != null && max > 0 ? `${Math.round(max / 1000)}K` : null;

  if (formattedMin && formattedMax) return `${symbol}${formattedMin}-${formattedMax}`;
  if (formattedMin) return `${symbol}${formattedMin}+`;
  if (formattedMax) return `${symbol}${formattedMax}`;
  return null;
}

/** Format a salary range into a detailed label like "€50,000 - €80,000 / year". */
export function detailedSalary(job: IJob): string | null {
  const min = normalizeSalary(job.SalaryMin ?? null, job.SalaryInterval ?? null);
  const max = normalizeSalary(job.SalaryMax ?? null, job.SalaryInterval ?? null);
  if (min == null && max == null) return null;

  const symbol = job.SalaryCurrency === 'EUR' ? '€' : job.SalaryCurrency === 'USD' ? '$' : (job.SalaryCurrency ? `${job.SalaryCurrency} ` : '');

  // Two vocabularies coexist: the ATS extractors write 'per-year-salary' etc,
  // while Gemma-extracted salaries write 'yearly' | 'monthly' | 'hourly'.
  // Both must map, or a monthly salary silently renders as "/ year".
  const rawInterval = String(job.SalaryInterval || '').toLowerCase();
  const interval =
    rawInterval === 'per-month-salary' || rawInterval === 'monthly'
      ? '/ month'
      : rawInterval === 'per-hour-wage' || rawInterval === 'hourly'
        ? '/ hour'
        : '/ year';

  const formatter = new Intl.NumberFormat('en-US');
  const formattedMin = min != null && min > 0 ? formatter.format(min) : null;
  const formattedMax = max != null && max > 0 ? formatter.format(max) : null;

  if (formattedMin && formattedMax) return `${symbol}${formattedMin} - ${symbol}${formattedMax} ${interval}`;
  if (formattedMin) return `${symbol}${formattedMin}+ ${interval}`;
  if (formattedMax) return `${symbol}${formattedMax} ${interval}`;
  return null;
}

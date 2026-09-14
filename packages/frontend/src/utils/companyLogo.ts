// Company logo URLs via the Google Favicon API
// (https://www.google.com/s2/favicons?domain={domain}&sz=128) — the single
// source: keyless and never rate-limited (Unavatar's 25 req/window meant a
// 30-card job list guaranteed 429s).
//
// The domain: prefer the backend's `companyDomain` (extracted from the real
// ApplicationURL) via the `domain` prop; otherwise derive from the name.

// Companies where the auto-derived "{name}.com" guess is wrong. Keyed by the
// lowercase, suffix-stripped, specials-removed name.
const KNOWN_DOMAINS: Record<string, string> = {
  scalablecapital: 'scalable.capital',
  scalable: 'scalable.capital',
  traderepublic: 'traderepublic.com',
  aboutyou: 'aboutyou.com',
  getyourguide: 'getyourguide.com',
  n26: 'n26.com',
  navvis: 'navvis.de',
  blackforestlabs: 'blackforestlabs.ai',
  deliveryhero: 'deliveryhero.com',
  hellofresh: 'hellofresh.com',
  zalando: 'zalando.de',
  personio: 'personio.de',
  check24: 'check24.de',
  sixt: 'sixt.de',
  trivago: 'trivago.de',
  celonis: 'celonis.com',
  flixbus: 'flix.com',
  flix: 'flix.com',
  sap: 'sap.com',
  siemens: 'siemens.com',
  bosch: 'bosch.de',
  boschgroup: 'bosch.de',
  zeiss: 'zeiss.com',
  allianz: 'allianz.de',
  adidas: 'adidas.de',
  puma: 'puma.com',
  bmwgroup: 'bmw.de',
  bmw: 'bmw.de',
  mercedesbenz: 'mercedes-benz.com',
  volkswagen: 'volkswagen.de',
  lufthansa: 'lufthansa.com',
  deutschebahn: 'bahn.de',
  deutschetelekom: 'telekom.de',
  telekom: 'telekom.de',
  auto1: 'auto1-group.com',
  auto1group: 'auto1-group.com',
  babbel: 'babbel.com',
  contentful: 'contentful.com',
  solarisbank: 'solarisgroup.com',
  solaris: 'solarisgroup.com',
  wefox: 'wefox.com',
  tier: 'tier.app',
  tiermobility: 'tier.app',
  gorillas: 'gorillas.io',
  infarm: 'infarm.com',
  omio: 'omio.com',
  raisin: 'raisin.com',
  sennder: 'sennder.com',
  forto: 'forto.com',
  grover: 'grover.com',
  enpal: 'enpal.de',
  thermondo: 'thermondo.de',
  westwing: 'westwing.de',
  aboutyougmbh: 'aboutyou.com',
  moia: 'moia.io',
  freenow: 'free-now.com',
  doctolib: 'doctolib.de',
  sumup: 'sumup.com',
  jetbrains: 'jetbrains.com',
  ionos: 'ionos.de',
  helsing: 'helsing.ai',
  staffbase: 'staffbase.com',
  scout24: 'scout24.com',
  autoscout24: 'autoscout24.de',
  commercetools: 'commercetools.com',
  proximafusion: 'proximafusion.com',
  teamviewer: 'teamviewer.com',
  wooga: 'wooga.com',
  camunda: 'camunda.com',
  deepl: 'deepl.com',
  amboss: 'amboss.com',
  leapsome: 'leapsome.com',
  moss: 'getmoss.com',
  upvest: 'upvest.co',
  billie: 'billie.io',
  alephalpha: 'aleph-alpha.com',
};

// Companies known to live on .de — derived domains for these try .de first.
const KNOWN_GERMAN = new Set([
  'personio', 'zalando', 'aboutyou', 'check24', 'sixt', 'trivago',
  'deutschebahn', 'douglas', 'ottogroup', 'otto', 'rewe', 'lidl', 'aldi',
  'edeka', 'kaufland', 'rossmann', 'dm', 'tchibo', 'metro', 'obi',
  'bosch', 'siemens', 'thyssenkrupp', 'continental', 'zf', 'mahle',
  'miele', 'kärcher', 'karcher', 'stihl', 'festo', 'trumpf', 'wuerth',
  'commerzbank', 'sparkasse', 'volksbank', 'allianz', 'ergo', 'axa',
  'telekom', 'vodafone', 'o2', 'freenet', 'unitymedia',
  'flaconi', 'strato', 'ionos', 'doctolib', 'enpal', 'thermondo',
  'westwing', 'autoscout24', 'immobilienscout24', 'mobile',
]);

// Legal-form suffixes that never appear in a domain.
const SUFFIX_RE = /\b(gmbh|inc|ltd|se|ag|corp|group|co|kg|kgaa|mbh|llc|plc|bv|nv|sa)\b/g;

function hostOf(domain: string): string {
  const s = (domain || '').trim();
  try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname; }
  catch { return s.replace(/^https?:\/\//i, '').split('/')[0]; }
}

/** "CA Customer Alliance GmbH" → "cacustomeralliance.de" (KNOWN_DOMAINS wins when present). */
export function deriveCompanyDomain(name: string): string {
  const hadGermanSuffix = /\bgmbh\b/i.test(name);
  const base = name
    .toLowerCase()
    .replace(SUFFIX_RE, ' ')
    .replace(/[^a-z0-9]/g, '');
  if (!base) return '';
  if (KNOWN_DOMAINS[base]) return KNOWN_DOMAINS[base];
  const tld = hadGermanSuffix || KNOWN_GERMAN.has(base) ? 'de' : 'com';
  return `${base}.${tld}`;
}

function resolveDomain(company: { companyName: string; domain?: string }): string {
  return company.domain?.trim() ? hostOf(company.domain) : deriveCompanyDomain(company.companyName);
}

/** The single Google Favicon URL for a company, or null without a domain. */
export function companyLogoUrl(company: { companyName: string; domain?: string }): string | null {
  const domain = resolveDomain(company);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;
}

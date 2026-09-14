// Canonical German cities for SEO /city/[city] pages.
// Copied from job-Data/src/seo/cities.js (backend source of truth — do NOT edit
// there; this is a frontend replica). `slug` is the URL segment, `label` the
// display name, `aliases` alternate/German spellings used only for matching.

export interface City {
  slug: string;
  label: string;
  aliases: string[];
}

export const CANONICAL_CITIES: City[] = [
  { slug: 'berlin', label: 'Berlin', aliases: [] },
  { slug: 'munich', label: 'Munich', aliases: ['münchen', 'muenchen'] },
  { slug: 'hamburg', label: 'Hamburg', aliases: [] },
  { slug: 'frankfurt', label: 'Frankfurt', aliases: [] },
  { slug: 'cologne', label: 'Cologne', aliases: ['köln', 'koeln'] },
  { slug: 'stuttgart', label: 'Stuttgart', aliases: [] },
  { slug: 'dusseldorf', label: 'Düsseldorf', aliases: ['düsseldorf'] },
  { slug: 'dortmund', label: 'Dortmund', aliases: [] },
  { slug: 'essen', label: 'Essen', aliases: [] },
  { slug: 'leipzig', label: 'Leipzig', aliases: [] },
  { slug: 'dresden', label: 'Dresden', aliases: [] },
  { slug: 'hanover', label: 'Hanover', aliases: ['hannover'] },
  { slug: 'nuremberg', label: 'Nuremberg', aliases: ['nürnberg', 'nuernberg'] },
  { slug: 'duisburg', label: 'Duisburg', aliases: [] },
  { slug: 'bochum', label: 'Bochum', aliases: [] },
  { slug: 'wuppertal', label: 'Wuppertal', aliases: [] },
  { slug: 'bielefeld', label: 'Bielefeld', aliases: [] },
  { slug: 'bonn', label: 'Bonn', aliases: [] },
  { slug: 'munster', label: 'Münster', aliases: ['münster'] },
  { slug: 'karlsruhe', label: 'Karlsruhe', aliases: [] },
  { slug: 'mannheim', label: 'Mannheim', aliases: [] },
  { slug: 'augsburg', label: 'Augsburg', aliases: [] },
  { slug: 'wiesbaden', label: 'Wiesbaden', aliases: [] },
  { slug: 'monchengladbach', label: 'Mönchengladbach', aliases: ['mönchengladbach'] },
  { slug: 'gelsenkirchen', label: 'Gelsenkirchen', aliases: [] },
  { slug: 'braunschweig', label: 'Braunschweig', aliases: [] },
  { slug: 'chemnitz', label: 'Chemnitz', aliases: [] },
  { slug: 'kiel', label: 'Kiel', aliases: [] },
  { slug: 'aachen', label: 'Aachen', aliases: [] },
  { slug: 'halle', label: 'Halle', aliases: [] },
  { slug: 'magdeburg', label: 'Magdeburg', aliases: [] },
  { slug: 'freiburg', label: 'Freiburg', aliases: [] },
  { slug: 'krefeld', label: 'Krefeld', aliases: [] },
  { slug: 'lubeck', label: 'Lübeck', aliases: ['lübeck'] },
  { slug: 'oberhausen', label: 'Oberhausen', aliases: [] },
  { slug: 'erfurt', label: 'Erfurt', aliases: [] },
  { slug: 'mainz', label: 'Mainz', aliases: [] },
  { slug: 'rostock', label: 'Rostock', aliases: [] },
  { slug: 'kassel', label: 'Kassel', aliases: [] },
  { slug: 'hagen', label: 'Hagen', aliases: [] },
  { slug: 'potsdam', label: 'Potsdam', aliases: [] },
  { slug: 'saarbrucken', label: 'Saarbrücken', aliases: ['saarbrücken'] },
  { slug: 'hamm', label: 'Hamm', aliases: [] },
  { slug: 'ludwigshafen', label: 'Ludwigshafen', aliases: [] },
  { slug: 'leverkusen', label: 'Leverkusen', aliases: [] },
  { slug: 'oldenburg', label: 'Oldenburg', aliases: [] },
  { slug: 'osnabruck', label: 'Osnabrück', aliases: ['osnabrück'] },
  { slug: 'solingen', label: 'Solingen', aliases: [] },
  { slug: 'heidelberg', label: 'Heidelberg', aliases: [] },
  { slug: 'darmstadt', label: 'Darmstadt', aliases: [] },
  { slug: 'regensburg', label: 'Regensburg', aliases: [] },
  { slug: 'ingolstadt', label: 'Ingolstadt', aliases: [] },
  { slug: 'wurzburg', label: 'Würzburg', aliases: ['würzburg'] },
  { slug: 'wolfsburg', label: 'Wolfsburg', aliases: [] },
  { slug: 'gottingen', label: 'Göttingen', aliases: ['göttingen'] },
  { slug: 'recklinghausen', label: 'Recklinghausen', aliases: [] },
  { slug: 'heilbronn', label: 'Heilbronn', aliases: [] },
  { slug: 'ulm', label: 'Ulm', aliases: [] },
  { slug: 'pforzheim', label: 'Pforzheim', aliases: [] },
  { slug: 'offenbach', label: 'Offenbach', aliases: [] },
  { slug: 'bottrop', label: 'Bottrop', aliases: [] },
  { slug: 'trier', label: 'Trier', aliases: [] },
  { slug: 'jena', label: 'Jena', aliases: [] },
  { slug: 'cottbus', label: 'Cottbus', aliases: [] },
  { slug: 'siegen', label: 'Siegen', aliases: [] },
  { slug: 'hildesheim', label: 'Hildesheim', aliases: [] },
  { slug: 'salzgitter', label: 'Salzgitter', aliases: [] },
  { slug: 'gutersloh', label: 'Gütersloh', aliases: ['gütersloh'] },
  { slug: 'iserlohn', label: 'Iserlohn', aliases: [] },
  { slug: 'schwerin', label: 'Schwerin', aliases: [] },
  { slug: 'koblenz', label: 'Koblenz', aliases: [] },
  { slug: 'zwickau', label: 'Zwickau', aliases: [] },
  { slug: 'witten', label: 'Witten', aliases: [] },
  { slug: 'gera', label: 'Gera', aliases: [] },
  { slug: 'hanau', label: 'Hanau', aliases: [] },
  { slug: 'esslingen', label: 'Esslingen', aliases: [] },
  { slug: 'ludwigsburg', label: 'Ludwigsburg', aliases: [] },
  { slug: 'tubingen', label: 'Tübingen', aliases: ['tübingen'] },
  { slug: 'flensburg', label: 'Flensburg', aliases: [] },
  { slug: 'konstanz', label: 'Konstanz', aliases: [] },
  { slug: 'worms', label: 'Worms', aliases: [] },
  { slug: 'marburg', label: 'Marburg', aliases: [] },
  { slug: 'luneburg', label: 'Lüneburg', aliases: ['lüneburg'] },
  { slug: 'bayreuth', label: 'Bayreuth', aliases: [] },
  { slug: 'bamberg', label: 'Bamberg', aliases: [] },
  { slug: 'plauen', label: 'Plauen', aliases: [] },
  { slug: 'neubrandenburg', label: 'Neubrandenburg', aliases: [] },
  { slug: 'wilhelmshaven', label: 'Wilhelmshaven', aliases: [] },
  { slug: 'meppen', label: 'Meppen', aliases: [] },
  { slug: 'emden', label: 'Emden', aliases: [] },
  { slug: 'cuxhaven', label: 'Cuxhaven', aliases: [] },
  { slug: 'celle', label: 'Celle', aliases: [] },
  { slug: 'paderborn', label: 'Paderborn', aliases: [] },
  { slug: 'reutlingen', label: 'Reutlingen', aliases: [] },
];

const CITY_BY_SLUG = new Map(CANONICAL_CITIES.map((c) => [c.slug.toLowerCase(), c]));

export function findCityBySlug(slug: string): City | null {
  return CITY_BY_SLUG.get((slug || '').toLowerCase()) || null;
}

/**
 * Resolves a free-text job location ("Berlin, Germany", "München") to its
 * canonical city, so a job page can link to the right /city/<slug> hub.
 * Matches the display label and the German/alternate spellings, longest name
 * first so "Frankfurt am Main" can't be shadowed by a shorter entry.
 */
const CITY_MATCHERS: { needle: string; city: City }[] = CANONICAL_CITIES
  .flatMap((city) => [city.label, ...city.aliases].map((n) => ({ needle: n.toLowerCase(), city })))
  .sort((a, b) => b.needle.length - a.needle.length);

export function findCityByLocation(location?: string | null): City | null {
  const haystack = (location || '').toLowerCase();
  if (!haystack) return null;
  return CITY_MATCHERS.find((m) => haystack.includes(m.needle))?.city || null;
}

// Featured cities shown on the homepage "Jobs by City" block.
export const FEATURED_CITY_SLUGS = [
  'berlin', 'munich', 'hamburg', 'frankfurt', 'cologne', 'stuttgart',
  'dusseldorf', 'dortmund', 'leipzig', 'dresden', 'hanover', 'nuremberg',
];

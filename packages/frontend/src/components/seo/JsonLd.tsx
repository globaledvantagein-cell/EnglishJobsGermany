// Renders a JSON-LD <script> with `<` escaped, matching the backend SEO output.

export default function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function itemListJsonLd(
  name: string,
  jobs: { _id: string; JobTitle: string; Company: string }[],
  siteUrl: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: jobs.length,
    itemListElement: jobs.map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${j.JobTitle} — ${j.Company}`,
      url: `${siteUrl}/jobs/${j._id}`,
    })),
  };
}

// Map canonical filterEmployment values to schema.org employmentType enums.
const EMPLOYMENT_SCHEMA: Record<string, string> = {
  fulltime: 'FULL_TIME',
  parttime: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
};

// Legacy display-string fallback → Google enum, for jobs missing filterEmployment.
const EMPLOYMENT_DISPLAY_SCHEMA: Record<string, string> = {
  'full-time': 'FULL_TIME', 'full time': 'FULL_TIME', fulltime: 'FULL_TIME', permanent: 'FULL_TIME',
  'part-time': 'PART_TIME', 'part time': 'PART_TIME', parttime: 'PART_TIME',
  contract: 'CONTRACTOR', contractor: 'CONTRACTOR', freelance: 'CONTRACTOR',
  internship: 'INTERN', intern: 'INTERN',
};

// Normalize any date-ish string to ISO 8601; undefined if absent/invalid so we
// never emit an invalid datePosted/validThrough (Google rejects those).
function toIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * schema.org JobPosting — required for Google for Jobs eligibility and the
 * primary signal AI answer engines (AEO/GEO) use to cite job listings.
 * Built only from public fields; omits anything unknown rather than guessing.
 */
export function jobPostingJsonLd(
  job: {
    _id: string; JobTitle: string; Company: string; Location?: string;
    Description?: string; EmploymentType?: string | null;
    PostedDate?: string | null; scrapedAt?: string;
    filterEmployment?: string | null; filterWorkplace?: string | null;
    filterSalaryMin?: number | null; filterSalaryMax?: number | null;
    filterSalaryInterval?: string | null;
    SalaryMin?: number | null; SalaryMax?: number | null;
    SalaryCurrency?: string | null; SalaryInterval?: string | null;
  },
  siteUrl: string,
) {
  // Google for Jobs requires the FULL job description, matching the visible page
  // content. Strip any residual HTML to plain text; never truncate and never
  // append "sign up" boilerplate (a schema/content mismatch drops the listing).
  const fullDescription = (job.Description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    || `${job.JobTitle} at ${job.Company} — an English-speaking role in Germany. No German required.`;

  const datePosted = toIsoDate(job.PostedDate || job.scrapedAt);

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.JobTitle,
    description: fullDescription,
    ...(datePosted ? { datePosted } : {}),
    hiringOrganization: { '@type': 'Organization', name: job.Company },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'DE',
        ...(job.Location && !/remote/i.test(job.Location) ? { addressLocality: job.Location.split(',')[0].trim() } : {}),
      },
    },
    url: `${siteUrl}/jobs/${job._id}`,
    directApply: true,
  };

  // validThrough: no explicit expiry on job docs, so use PostedDate + 90 days —
  // anything older than that is almost certainly filled. Tells Google for Jobs
  // when to auto-drop the listing. Falls back to scrapedAt when PostedDate is
  // missing, so a listing is never left without an expiry.
  const validFrom = job.PostedDate || job.scrapedAt;
  if (validFrom) {
    const posted = new Date(validFrom);
    if (!isNaN(posted.getTime())) {
      data.validThrough = new Date(posted.getTime() + NINETY_DAYS_MS).toISOString();
    }
  }

  const employmentType = (job.filterEmployment && EMPLOYMENT_SCHEMA[job.filterEmployment])
    || (job.EmploymentType && EMPLOYMENT_DISPLAY_SCHEMA[job.EmploymentType.toLowerCase().trim()])
    || undefined;
  if (employmentType) data.employmentType = employmentType;
  if (job.filterWorkplace === 'remote') {
    data.jobLocationType = 'TELECOMMUTE';
    data.applicantLocationRequirements = { '@type': 'Country', name: 'Germany' };
  }
  // baseSalary — the canonical filter fields first, falling back to the raw
  // Salary* fields so jobs the normalizer didn't reconcile still get a salary
  // into Google for Jobs (listings that show pay get markedly higher CTR).
  const salaryMin = job.filterSalaryMin ?? job.SalaryMin ?? null;
  const salaryMax = job.filterSalaryMax ?? job.SalaryMax ?? null;
  if (salaryMin != null || salaryMax != null) {
    const currency = (job.SalaryCurrency || 'EUR').toUpperCase();
    const interval = (job.filterSalaryInterval || job.SalaryInterval || '').toLowerCase();
    const unitText = interval.startsWith('hour') ? 'HOUR'
      : interval.startsWith('day') ? 'DAY'
      : interval.startsWith('week') ? 'WEEK'
      : interval.startsWith('month') ? 'MONTH'
      : 'YEAR';
    data.baseSalary = {
      '@type': 'MonetaryAmount',
      currency,
      value: {
        '@type': 'QuantitativeValue',
        ...(salaryMin != null ? { minValue: salaryMin } : {}),
        ...(salaryMax != null ? { maxValue: salaryMax } : {}),
        unitText,
      },
    };
  }
  return data;
}

export function breadcrumbJsonLd(crumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

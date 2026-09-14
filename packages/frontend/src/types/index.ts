export interface IJob {
  _id: string;
  JobID: string;
  JobTitle: string;
  Company: string;
  Location: string;
  ApplicationURL: string;
  DirectApplyURL: string | null;
  PostedDate: string | null;
  /** Real company web domain, extracted server-side from ApplicationURL. */
  companyDomain?: string | null;
  Description: string;
  DescriptionHtml?: string | null;
  GermanRequired?: boolean;
  Department: string;
  WorkplaceType: string;
  Category?: string;
  Domain: string;
  SubDomain: string;
  ExperienceLevel: string;
  SalaryCurrency: string | null;
  SalaryMin: number | null;
  SalaryMax: number | null;
  SalaryInterval: string | null;
  AllLocations: string[];
  EmploymentType: string | null;
  Country: string | null;
  Team: string | null;
  Office: string | null;
  IsRemote: boolean;
  Tags: string[];
  isEntryLevel: boolean;
  ContractType?: string;
  applyClicks: number;
  scrapedAt?: string;

  // Canonical reconciled filter fields (backend Chunk 1 normalizer).
  filterWorkplace: 'remote' | 'hybrid' | 'onsite' | null;
  filterExperience: 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | null;
  filterEmployment: 'fulltime' | 'parttime' | 'contract' | 'internship' | null;
  filterVisa: 'available' | null;
  filterRelocation: 'available' | null;
  filterSalaryMin: number | null;
  filterSalaryMax: number | null;
  filterSalaryCurrency: string | null;
  filterSalaryInterval: string | null;
  filterSalaryTier: 'ats' | 'jd' | null;
}

/**
 * Admin/internal job shape. The public API strips these fields (data lockdown,
 * backend Chunk 1), so they live here — only admin/review views may read them.
 */
export interface IAdminJob extends IJob {
  ATSPlatform: string;
  sourceSite?: string;
  ConfidenceScore: number;
  Status?: 'pending_review' | 'active' | 'rejected';
  RejectionReason?: string;
}

// ─── Premium / metering (backend Chunk 2 + 3) ───────────────────────────────

/** Why a gate fired — the frontend uses this to pick the right modal copy/CTA. */
export type GateReason = 'jd_limit' | 'signup_required' | 'premium_required' | 'apply_limit';

/** Response of GET /api/auth/usage. Limits are `null` for premium (= unlimited). */
export interface UsageStats {
  jdViewsUsed: number;
  jdViewsLimit: number | null;
  applyClicksUsed: number;
  applyClicksLimit: number | null;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  weekResetAt: string;
}

/** The `usage` block attached to a gated response (per-limit view). */
export interface GateUsage {
  used: number;
  limit: number;
  resetsAt?: string | null;
}

/** Teaser shape on a gated /:id/full response (salary insights withheld). */
export interface GatedTeaser {
  _id?: string;
  JobID?: string;
  JobTitle?: string;
  Company?: string;
  Location?: string;
  descriptionPreview?: string;
}

/** The three shapes GET /api/jobs/:id/full can return. */
export type GatedResponse =
  | { gated: false; job: IJob }
  | { gated: false; job: IJob; usage: { used: number; limit: number } }
  | {
      gated: true;
      teaser: GatedTeaser;
      gateReason: GateReason;
      usage?: GateUsage;
      message?: string;
    };

/** One row of a user's subscription history (GET /api/auth/subscription). */
export interface SubscriptionRecord {
  _id?: string;
  plan: string;
  amount: number;
  currency: string;
  promoCode: string | null;
  status: 'active' | 'expired' | 'cancelled';
  startedAt: string;
  expiresAt: string;
  paymentMethod: string;
  createdAt: string;
}

/** Full payload of GET /api/auth/subscription. */
export interface SubscriptionResponse {
  isPremium: boolean;
  usage: UsageStats;
  history: SubscriptionRecord[];
}

export interface ICompany {
  _id?: string;
  companyName: string;
  openRoles: number;
  cities: string[];
  domain: string;
  source: 'scraped' | 'manual';
  logo?: string;
  industry?: string;
}
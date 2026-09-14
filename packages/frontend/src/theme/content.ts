export const CONTENT = {
  home: {
    ticker: [
      'Software Engineer',
      'Product Manager',
      'Data Scientist',
      'UX Designer',
      'DevOps Engineer',
      'Marketing Manager',
      'Finance Analyst',
      'Team Lead',
      'Backend Developer',
      'Cloud Architect',
      'Scrum Master',
      'Machine Learning Engineer',
      'Frontend Developer',
      'Operations Manager',
      'Business Analyst',
      'Head of Growth',
    ],
    hero: {
      heading: 'English-Speaking',
      headingAccent: 'Jobs in Germany',
      subtitleLine1: 'We monitor companies in Germany that hire for English-speaking roles and surface verified opportunities where German is not required.',
      subtitleLine2: 'Every listing is AI-filtered and human-reviewed before it appears on the platform.',
      primaryCta: 'Browse Jobs →',
      secondaryCta: 'Get Weekly Alerts',
    },
    why: [
      {
        title: 'Companies We Monitor',
        desc: 'We identify companies in Germany that regularly hire international talent and offer roles where English is the working language.'
      },
      {
        title: 'Job Filtering',
        desc: 'We review job descriptions and surface roles where German is not required.'
      },
      {
        title: 'Verification',
        desc: 'Every listing is checked before it appears on the platform to ensure it is relevant for English-speaking professionals.'
      },
    ],
    whySection: {
      heading: 'How We Find English-Speaking Jobs',
      subtitle: 'We focus on identifying roles in Germany where English is used as the working language.'
    },
    companies: {
      label: 'Hiring partners',
      heading: 'Companies hiring',
      headingAccent: 'English speakers',
      fullDirectoryCta: 'Full directory',
      carouselAriaLeft: 'Scroll left',
      carouselAriaRight: 'Scroll right',
    },
    latest: {
      label: 'Fresh picks',
      heading: 'Latest opportunities',
      viewAllCta: 'View all',
      loadMoreCta: 'Load more',
    },
  },
  signup: {
    fallbackError: 'Something went wrong.',
    success: {
      heading: "You're in.",
      subtitle: 'Expect curated English-speaking job alerts in Germany in your inbox every week.',
      cta: 'Browse Jobs Now',
    },
    leftPanel: {
      heading: 'Get job alerts',
      subtitle: 'Join 2,000+ professionals receiving weekly curated English-only job listings in Germany.',
      perks: [
        'Weekly curated job digest to your inbox',
        'No spam — we respect your privacy',
        'English-only roles verified by AI + humans',
      ],
    },
    form: {
      heading: 'Get job alerts',
      subtitle: 'Weekly digest of verified English-only roles in Germany',
      labels: {
        fullName: 'Full Name',
        email: 'Email Address',
        jobInterest: 'Job Interest',
        currentCountry: 'Current Country',
      },
      placeholders: {
        fullName: 'Alex Smith',
        email: 'alex@example.com',
      },
      domainOptions: [
        ['Tech', 'Tech / IT'],
        ['Non-Tech', 'Business / Other'],
      ] as const,
      // The 28 backend categories (job-Data/src/core/categorizer/), split across
      // the existing Tech / Non-Tech groups the signup + profile forms render.
      // Values must match the backend strings exactly — they are stored on the
      // user as desiredCategories and matched against Category by the digest.
      categoryOptions: {
        Tech: [
          { value: 'Software Engineering', label: 'Software Engineering' },
          { value: 'Data & Analytics', label: 'Data & Analytics' },
          { value: 'AI / ML', label: 'AI / ML' },
          { value: 'Cybersecurity', label: 'Cybersecurity' },
          { value: 'IT & Enterprise Systems', label: 'IT & Enterprise Systems' },
          { value: 'Hardware & Systems', label: 'Hardware & Systems' },
          { value: 'Product Management', label: 'Product Management' },
          { value: 'Design', label: 'Design' },
          { value: 'Solutions & Pre-Sales', label: 'Solutions & Pre-Sales' },
          { value: 'Research & Clinical', label: 'Research & Clinical' },
          { value: 'Gaming & Entertainment', label: 'Gaming & Entertainment' },
          { value: 'Trust & Safety', label: 'Trust & Safety' },
        ],
        'Non-Tech': [
          { value: 'Sales', label: 'Sales' },
          { value: 'Marketing & Growth', label: 'Marketing & Growth' },
          { value: 'Operations & Strategy', label: 'Operations & Strategy' },
          { value: 'Finance & Accounting', label: 'Finance & Accounting' },
          { value: 'Customer Success & Support', label: 'Customer Success & Support' },
          { value: 'HR & People', label: 'HR & People' },
          { value: 'Consulting', label: 'Consulting' },
          { value: 'Legal & Compliance', label: 'Legal & Compliance' },
          { value: 'Supply Chain & Manufacturing', label: 'Supply Chain & Manufacturing' },
          { value: 'Retail & Facilities', label: 'Retail & Facilities' },
          { value: 'Education & Training', label: 'Education & Training' },
          { value: 'Domain Specialist', label: 'Domain Specialist' },
          { value: 'Localization', label: 'Localization' },
          { value: 'Administration', label: 'Administration' },
          { value: 'Other / General Business', label: 'Other / General Business' },
          { value: 'Other / Open Application', label: 'Other / Open Application' },
        ],
      } as const,
      countryPlaceholder: 'Select your country',
      submitCta: 'Join the list',
      adminPrompt: 'Admin?',
      adminLoginCta: 'Login here',
    },
    countries: [
      'Germany', 'India', 'United Kingdom', 'United States', 'Canada', 'Australia', '--------------------------------', 'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Bolivia', 'Brazil', 'Bulgaria', 'Cambodia', 'Chile', 'China', 'Colombia', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Ecuador', 'Egypt', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Ghana', 'Greece', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Latvia', 'Lebanon', 'Lithuania', 'Luxembourg', 'Malaysia', 'Malta', 'Mexico', 'Moldova', 'Montenegro', 'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Thailand', 'Tunisia', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Zambia', 'Zimbabwe'
    ],
  },
  admin: {
    label: 'Admin',
    reviewQueue: {
      title: 'Review Queue',
      subtitle: (count: number) => `${count} jobs pending AI verification`,
      refreshCta: 'Refresh',
      empty: {
        title: 'All Caught Up!',
        body: 'No jobs pending review. Come back after the next scrape run.',
      },
    },
    rejectedJobs: {
      title: 'Rejected Jobs',
      subtitle: (count: number) => `${count} jobs in trash`,
      refreshCta: 'Refresh',
      empty: {
        title: 'Trash is empty',
        body: 'All good — no rejected jobs here.',
      },
    },
    jobTestLogs: {
      title: 'AI Test Logs',
      subtitle: 'Admin Diagnostics',
      refreshCta: 'Refresh',
      summary: (count: number) => `${count} jobs analyzed (accepted + rejected with AI evidence)`,
      searchPlaceholder: 'Search by title, company, JobID...',
      decisions: ['all', 'accepted', 'rejected'] as const,
      states: {
        noToken: 'No authentication token found. Please log in.',
        expired: 'Your session has expired. Please log in again.',
        failedLoad: 'Failed to load test logs. Please try again.',
        unableTitle: 'Unable to load logs',
        unableBody: 'Please check your authentication and try again.',
        loginCta: 'Login',
        goToLoginCta: 'Go to Login',
        noLogsTitle: 'No logs found',
        noLogsBody: 'No test logs in database yet. Run the scraper first.',
        adjustFiltersBody: 'Try adjusting your filters.',
      },
      labels: {
        jobId: 'JobID:',
        postedPrefix: 'Posted:',
        postedFallback: 'N/A',
        germanRequired: 'German Required',
        yes: 'Yes',
        no: 'No',
        aiEvidence: 'AI Evidence & Reasoning',
        germanEvidence: '🇩🇪 German',
        noEvidence: 'No evidence provided',
        accepted: '✓ Accepted',
        rejected: '✗ Rejected',
        showLess: 'Show less',
        viewFullDescription: 'View full description',
      },
    },
    dashboard: {
      documentTitle: 'Browse English-Speaking Jobs in Germany',
      headerLabel: 'Opportunities',
      defaultTitle: 'All English Jobs',
      subtitle: (count: number) => `${count} verified English-speaking roles`,
      sideHeading: 'Companies',
      allJobs: 'All Jobs',
      empty: {
        title: 'No jobs found',
        body: 'Try a different company or view all roles.',
        clearFilterCta: 'Clear filter',
      },
    },
  },
} as const;
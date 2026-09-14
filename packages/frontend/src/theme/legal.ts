export type LegalTab = 'privacy' | 'terms';

export type LegalSection = {
  heading: string;
  level?: 'section' | 'subsection';
  paragraphs?: string[];
  bullets?: string[];
  links?: string[];
  showContactEmail?: boolean;
};

export const LEGAL_LAST_UPDATED = 'March 15, 2026';
export const LEGAL_SUPPORT_EMAIL = 'support@englishjobsgermany.com';

export const LEGAL_TABS: Array<{ key: LegalTab; label: string }> = [
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'terms', label: 'Terms of Use' },
];

export const LEGAL_CONTENT: Record<LegalTab, { title: string; intro: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Privacy Policy',
    intro:
      'English Jobs in Germany ("the platform", "we", "our") respects your privacy and is committed to protecting personal data.\n\nThis Privacy Policy explains what information we collect and how it is used when you visit or interact with EnglishJobsGermany.com.',
    sections: [
      {
        heading: 'Information We Collect',
        level: 'section',
        paragraphs: ['We may collect limited information when you interact with the platform, including:'],
        bullets: [
          'email address when subscribing to job alerts or newsletters',
          'technical information such as browser type, device type, and IP address',
          'usage information such as pages visited and interactions with the website',
        ],
      },
      {
        heading: 'How We Use Information',
        level: 'section',
        paragraphs: ['Information collected may be used to:'],
        bullets: [
          'send job alerts and newsletters',
          'improve the platform and user experience',
          'analyze website traffic and usage',
          'respond to user inquiries',
        ],
      },
      {
        heading: 'Cookies',
        level: 'section',
        paragraphs: [
          'The platform may use cookies or similar technologies to improve functionality and performance.',
          'Cookies help us understand how visitors use the website and allow us to improve the platform experience.',
          'You can disable cookies through your browser settings.',
        ],
      },
      {
        heading: 'Analytics and Usage Tracking',
        level: 'section',
        paragraphs: [
          'We use analytics tools to understand how visitors interact with the platform and improve the website experience.',
          'These tools may collect information such as:',
        ],
        bullets: [
          'pages visited',
          'time spent on pages',
          'device and browser information',
          'approximate geographic location',
          'interactions with the website',
        ],
      },
      {
        heading: 'Google Analytics',
        level: 'subsection',
        paragraphs: [
          'This website uses Google Analytics, a web analytics service provided by Google LLC.',
          'Google Analytics helps us understand how visitors use the platform by collecting information about website interactions and usage patterns.',
          "More information about Google's privacy practices can be found here:",
        ],
        links: ['https://policies.google.com/privacy'],
      },
      {
        heading: 'Microsoft Clarity',
        level: 'subsection',
        paragraphs: [
          'We use Microsoft Clarity to analyze how users interact with the website.',
          'Clarity helps us understand user behavior through features such as heatmaps and session recordings so we can improve usability and platform design.',
          "More information about Microsoft's privacy practices can be found here:",
        ],
        links: ['https://privacy.microsoft.com'],
      },
      {
        heading: 'Third-Party Links',
        level: 'section',
        paragraphs: [
          'The platform may contain links to external websites, including employer career pages.',
          'We are not responsible for the privacy practices or content of third-party websites.',
        ],
      },
      {
        heading: 'Data Security',
        level: 'section',
        paragraphs: ['We take reasonable steps to protect information collected through the platform. However, no online service can guarantee complete security.'],
      },
      {
        heading: 'Contact',
        level: 'section',
        paragraphs: ['For questions about this Privacy Policy or data handling, please contact:'],
        showContactEmail: true,
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    intro: 'By accessing or using EnglishJobsGermany.com, you agree to these terms.',
    sections: [
      {
        heading: 'Nature of the Platform',
        level: 'section',
        paragraphs: [
          'English Jobs in Germany is an independent job discovery platform that highlights opportunities in Germany where German language skills may not be required.',
          'The platform aggregates and organizes publicly available job information to help users discover potential opportunities.',
        ],
      },
      {
        heading: 'Job Listings and Data Sources',
        level: 'section',
        paragraphs: [
          'Job listings and company information may be sourced from publicly available information, including employer career pages and other public job listings.',
          'While we review listings to highlight roles where German is not required, job descriptions, requirements, and availability may change at any time.',
          'Users should verify all job details directly with the hiring company before applying.',
        ],
      },
      {
        heading: 'No Recruitment Services',
        level: 'section',
        paragraphs: [
          'English Jobs in Germany is not a recruitment agency and does not represent employers listed on the platform.',
          'We do not participate in hiring decisions and cannot guarantee employment outcomes.',
        ],
      },
      {
        heading: 'No Affiliation with Listed Companies',
        level: 'section',
        paragraphs: [
          'English Jobs in Germany is an independent platform and is not affiliated with, endorsed by, or partnered with the companies listed on the website, unless explicitly stated.',
          'Company names, trademarks, and logos remain the property of their respective owners and are used for identification purposes only.',
        ],
      },
      {
        heading: 'Content Updates and Removal Requests',
        level: 'section',
        paragraphs: [
          'English Jobs in Germany aims to present accurate and helpful job information.',
          'If a company or rights holder believes that a listing contains incorrect information or should be removed, they may contact us using the contact details provided on this website.',
          'We will review legitimate requests and may update, modify, or remove listings at our discretion.',
        ],
      },
      {
        heading: 'External Links',
        level: 'section',
        paragraphs: ['The platform may contain links to third-party websites. We are not responsible for the content or policies of external websites.'],
      },
      {
        heading: 'Limitation of Liability',
        level: 'section',
        paragraphs: [
          'The platform is provided for informational purposes only.',
          'English Jobs in Germany is not responsible for decisions made based on information provided on the website.',
          'Use of the platform is at your own risk.',
        ],
      },
      {
        heading: 'Changes to These Terms',
        level: 'section',
        paragraphs: ['These terms may be updated from time to time. Continued use of the platform indicates acceptance of the updated terms.'],
      },
      {
        heading: 'Contact',
        level: 'section',
        paragraphs: ['For questions about these Terms of Use, please contact:'],
        showContactEmail: true,
      },
    ],
  },
} as const;

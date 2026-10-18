// Icon + tint per career-guide topic, shared by every guide surface (hub,
// topic pages, article cards). Tints are CSS colours used for the icon tile.
import { Banknote, Building2, GraduationCap, Home, Plane, Search, type LucideIcon } from 'lucide-react';

export const GUIDE_TOPIC_META: Record<string, { Icon: LucideIcon; tint: string; blurb: string }> = {
  'finding-jobs':       { Icon: Search,        tint: '#1F6FEB', blurb: 'Where to look, how to apply, and getting hired in English.' },
  companies:            { Icon: Building2,     tint: '#7C3AED', blurb: 'Who hires English speakers, and what they are like to work for.' },
  'visas-immigration':  { Icon: Plane,         tint: '#0891B2', blurb: 'Work permits, the EU Blue Card and moving your family.' },
  'salaries-careers':   { Icon: Banknote,      tint: '#16A34A', blurb: 'Pay, negotiation and growing your career in Germany.' },
  'students-graduates': { Icon: GraduationCap, tint: '#EA580C', blurb: 'Internships, first jobs and staying after your degree.' },
  'living-in-germany':  { Icon: Home,          tint: '#DB2777', blurb: 'Housing, registration, banking and settling in.' },
};

export const guideTopicMeta = (slug: string) =>
  GUIDE_TOPIC_META[slug] ?? { Icon: Search, tint: '#1F6FEB', blurb: '' };

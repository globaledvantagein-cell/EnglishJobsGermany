import {
  Activity, BookOpen, Brain, Building2, ClipboardCheck, Crown, LayoutDashboard,
  MessageSquare, PlusSquare, Sparkles, Sun, Trash2, type LucideIcon,
} from 'lucide-react';

/** Which live counter (if any) a nav item shows as a badge. */
export type NavCounter = 'review' | 'trash' | 'feedback';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  counter?: NavCounter;
  /** Match child routes too (e.g. /admin/career-guide/123). */
  prefix?: boolean;
}

export interface AdminNavGroup { label: string; items: AdminNavItem[] }

export const ADMIN_HOME = '/admin';

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Workspace',
    items: [{ href: ADMIN_HOME, label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Jobs',
    items: [
      { href: '/admin/review', label: 'Review queue', icon: ClipboardCheck, counter: 'review' },
      { href: '/admin/trash', label: 'Trash', icon: Trash2, counter: 'trash' },
      { href: '/admin/ai-verdicts', label: 'AI verdicts', icon: Brain },
      { href: '/admin/jobs/new', label: 'Add job', icon: PlusSquare },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/companies', label: 'Companies', icon: Building2 },
      { href: '/admin/career-guide', label: 'Career guide', icon: BookOpen, prefix: true },
    ],
  },
  {
    label: 'Users',
    items: [
      { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare, counter: 'feedback' },
      { href: '/admin/premium', label: 'Premium', icon: Crown },
    ],
  },
  {
    label: 'System',
    items: [{ href: '/admin/health', label: 'Health', icon: Activity }],
  },
  {
    label: 'Matching',
    items: [
      { href: '/admin/smart-match', label: 'Smart Match', icon: Sparkles },
      { href: '/admin/today-matches', label: "Today's matches", icon: Sun },
    ],
  },
];

export function findNavItem(pathname: string): AdminNavItem | undefined {
  const items = ADMIN_NAV.flatMap(group => group.items);
  return items.find(item => item.href === pathname)
    ?? items.find(item => item.prefix && pathname.startsWith(`${item.href}/`));
}

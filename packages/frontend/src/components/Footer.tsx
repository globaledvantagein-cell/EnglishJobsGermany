'use client';

/**
 * Site footer — one grid, columns after Wellfound's footer (studied with REA):
 *   brand (logo, pitch, socials) | Find jobs | Jobs by city | Jobs by field
 * then a bottom bar with © and legal links. City and field columns are the
 * internal-linking surface from every page to the hub pages; they are plain
 * text columns (two sub-columns each) so the footer stays compact.
 *
 * Styles live in globals.css (.ft-*) so hover/focus and the mobile layout
 * don't need JS handlers.
 */
import { Link } from '@/compat/router';
import { Linkedin, Twitter, MessageCircle } from 'lucide-react';
import { CATEGORY_ORDER, categorySlug } from '../utils/categorize';
import { FEATURED_CITY_SLUGS, findCityBySlug } from '../data/cities';
import { openCookieSettings } from '../utils/consent';
import BrandLogo from './BrandLogo';

const SOCIALS: ReadonlyArray<{ label: string; href: string; Icon: typeof Linkedin }> = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/english-jobs-in-germany', Icon: Linkedin },
  { label: 'X',        href: 'https://x.com/EngJobsgermany',                              Icon: Twitter },
  { label: 'WhatsApp', href: 'https://whatsapp.com/channel/0029VbCqyMl8vd1RyrdNQw11',    Icon: MessageCircle },
];

const PRODUCT_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/jobs', 'Browse all jobs'],
  ['/remote-jobs', 'Remote jobs'],
  ['/jobs?visa=1', 'Visa sponsorship'],
  ['/jobs?experience=entry', 'Entry-level jobs'],
  ['/directory', 'Companies hiring'],
  ['/alerts', 'Job alerts'],
  ['/career-guide', 'Career guide'],
];

const LEGAL_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/legal?tab=privacy', 'Privacy'],
  ['/legal?tab=terms', 'Terms'],
  ['mailto:support@englishjobsgermany.com', 'Contact'],
];

const CITY_LINKS = FEATURED_CITY_SLUGS
  .map(slug => findCityBySlug(slug))
  .filter((city): city is NonNullable<typeof city> => Boolean(city))
  .map(city => [`/city/${city.slug}`, city.label] as const);

// The 12 highest-volume categories; the full set is on the jobs page filter.
const CATEGORY_LINKS = CATEGORY_ORDER.slice(0, 12).map(cat => [`/category/${categorySlug(cat)}`, cat] as const);

function FooterLink({ href, children, className }: { href: string; children: React.ReactNode; className: string }) {
  return href.startsWith('mailto:')
    ? <a href={href} className={className}>{children}</a>
    : <Link to={href} className={className}>{children}</Link>;
}

function LinkColumn({ title, links, split = false }: { title: string; links: ReadonlyArray<readonly [string, string]>; split?: boolean }) {
  return (
    <nav className="ft-col" data-split={split} aria-label={title}>
      <p className="ft-heading">{title}</p>
      <ul>
        {links.map(([href, label]) => (
          <li key={href}><FooterLink href={href} className="ft-link">{label}</FooterLink></li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  return (
    <footer className="ft">
      <div className="ft-inner">
        <div className="ft-top">
          <div className="ft-brand">
            <BrandLogo size="md" />
            <p className="ft-pitch">
              English-speaking jobs in Germany, checked so German isn’t required. New roles from company career pages every day.
            </p>
            <div className="ft-socials">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          <LinkColumn title="Find jobs" links={PRODUCT_LINKS} />
          <LinkColumn title="Jobs by city" links={CITY_LINKS} split />
          <LinkColumn title="Jobs by field" links={CATEGORY_LINKS} split />
        </div>

        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} English Jobs in Germany</span>
          <div className="ft-legal">
            {LEGAL_LINKS.map(([href, label]) => <FooterLink key={href} href={href} className="ft-link">{label}</FooterLink>)}
            <button type="button" onClick={openCookieSettings} className="ft-link">Cookie settings</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

import type { Metadata } from 'next';
import CompanyDirectory from '@/page-components/CompanyDirectory';
import { fetchDirectory } from '@/lib/serverApi';
import { alternatesFor } from '@/lib/seoAlternates';

// The company cards load client-side; this server component supplies the
// heading and intro prose so the page has real indexable text in its HTML.
export const revalidate = 3600;

export const metadata: Metadata = {
  // 55 chars with the layout's " — English Jobs Germany" suffix.
  title: 'Companies Hiring English Speakers',
  description:
    'Browse companies in Germany hiring English speakers, with open-role counts and locations. No German required.',
  alternates: alternatesFor('/directory'),
};

export default async function DirectoryPage() {
  const companies = await fetchDirectory(3600);
  // Round down to a "…+" figure so the copy can't overstate the directory
  // between revalidations.
  const count = Math.max(50, Math.floor(companies.length / 50) * 50).toLocaleString('en-US');

  const header = (
    <>
      <h1
        style={{
          fontFamily: 'Playfair Display,serif',
          fontWeight: 700,
          textAlign: 'center',
          fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)',
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        Companies Hiring English Speakers in Germany
      </h1>
      <div
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          lineHeight: 1.75,
          maxWidth: 680,
          margin: '22px auto 28px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          Browse {count}+ companies hiring English speakers in Germany. Each company has
          been verified to have roles that don&rsquo;t require German.
        </p>
        <p style={{ margin: '14px 0 0' }}>
          Finding English-speaking jobs in Germany often starts with knowing which companies
          hire international professionals. Many of these organizations work with
          international teams and regularly hire talent from outside Germany — use this page
          to discover them and explore opportunities directly through their careers pages.
        </p>
      </div>
    </>
  );

  return <CompanyDirectory header={header} />;
}

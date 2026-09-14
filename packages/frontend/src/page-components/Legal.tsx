'use client';

import { useSearchParams } from '@/compat/router';
import { LEGAL_CONTENT, LEGAL_LAST_UPDATED, LEGAL_SUPPORT_EMAIL, LEGAL_TABS, type LegalTab } from '../theme/legal';
import { useMediaQuery } from '../hooks/useMediaQuery';

function StyledLink({ url }: { url: string }) {
  return (
    <p style={{ fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ color: 'var(--primary)', textDecoration: 'none' }}
        onMouseEnter={e => {
          e.currentTarget.style.textDecoration = 'underline';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.textDecoration = 'none';
        }}
      >
        {url}
      </a>
    </p>
  );
}

export default function Legal() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('tab') === 'terms' ? 'terms' : 'privacy';
  const activeTab = selected as LegalTab;
  const activeContent = LEGAL_CONTENT[activeTab];

  const handleTabChange = (tab: LegalTab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: '32px 16px 56px' }}>
      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          {LEGAL_TABS.map(tab => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '0 2px 12px',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: isMobile ? '20px 16px' : '32px 36px',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)' }}>{activeContent.title}</h1>
          <p style={{ margin: '10px 0 24px', fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
            Last updated: {LEGAL_LAST_UPDATED}
          </p>

          {activeContent.intro.split('\n\n').map((paragraph, idx) => (
            <p key={`intro-${idx}`} style={{ fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', margin: idx === 0 ? '0 0 12px' : '0 0 24px' }}>
              {paragraph}
            </p>
          ))}

          {activeContent.sections.map((section, index) => (
            <div key={section.heading}>
              {index > 0 && section.level !== 'subsection' && <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />}

              {section.level === 'subsection' ? (
                <h4
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginTop: 20,
                    marginBottom: 8,
                  }}
                >
                  {section.heading}
                </h4>
              ) : (
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginTop: 28,
                    marginBottom: 10,
                  }}
                >
                  {section.heading}
                </h3>
              )}

              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                <p key={`${section.heading}-paragraph-${paragraphIndex}`} style={{ fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                  {paragraph}
                </p>
              ))}

              {section.bullets && (
                <ul style={{ paddingLeft: 20, listStyleType: 'disc', lineHeight: 1.8, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                  {section.bullets.map(item => (
                    <li key={item} style={{ fontSize: '0.88rem' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {section.links?.map(link => (
                <StyledLink key={link} url={link} />
              ))}

              {section.showContactEmail && (
                <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  {LEGAL_SUPPORT_EMAIL}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
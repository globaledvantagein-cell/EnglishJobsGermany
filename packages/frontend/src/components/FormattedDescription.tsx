'use client';

import { memo, useMemo, type ReactNode } from 'react';
import { splitIntoSections, buildBodyBlocks, SALARY_REGEX } from '../utils/descriptionParser';

interface Props {
  description: string;
}

function renderSalaryHighlights(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(SALARY_REGEX)) {
    const index = match.index ?? 0;
    const value = match[0];
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    nodes.push(
      <span key={`salary-${index}`} style={{ color: 'var(--success)', fontWeight: 700 }}>
        {value}
      </span>
    );
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
}

function FormattedDescription({ description }: Props) {
  // Memoize the heavy parse — description changes only when a different job loads
  const sections = useMemo(() => splitIntoSections(description), [description]);

  if (!sections.length) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>No description available.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections.map((section, sectionIndex) => {
        const blocks = buildBodyBlocks(section.body);

        return (
          <div key={`${section.title || 'section'}-${sectionIndex}`}>
            {section.title && (
              <h4 style={{ marginTop: sectionIndex === 0 ? 0 : 24, marginBottom: 12, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {section.title}
              </h4>
            )}

            {blocks.map((block, blockIndex) => (
              block.type === 'paragraph'
                ? (
                  <p key={`p-${sectionIndex}-${blockIndex}`} style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                    {renderSalaryHighlights(block.text)}
                  </p>
                )
                : (
                  <ul
                    key={`l-${sectionIndex}-${blockIndex}`}
                    style={{ marginBottom: 12, marginLeft: 8, paddingLeft: 14, borderLeft: '2px solid var(--border)', display: 'grid', gap: 8 }}
                  >
                    {block.items.map((item, itemIndex) => (
                      <li key={`li-${itemIndex}`} style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                        {renderSalaryHighlights(item)}
                      </li>
                    ))}
                  </ul>
                )
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default memo(FormattedDescription);
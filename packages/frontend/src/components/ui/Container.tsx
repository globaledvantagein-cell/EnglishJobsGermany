'use client';

import type { ReactNode, CSSProperties } from 'react';

export function Container({ children, size = 'xl', style, className = '' }: {
  children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; style?: CSSProperties; className?: string;
}) {
  const maxW = { sm: '640px', md: '768px', lg: '1024px', xl: '1200px' }[size];
  return <div style={{ maxWidth: maxW, margin: '0 auto', padding: '0 24px', ...style }} className={className}>{children}</div>;
}
'use client';

/**
 * react-router-dom → next/navigation compatibility shim.
 *
 * The migrated components were written against react-router-dom v7. Rather than
 * rewrite every call site, they import the same symbols from here and keep
 * working. Only the import source changes ('@/compat/router' → '@/compat/router').
 */

import NextLink from 'next/link';
import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import {
  useRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
} from 'next/navigation';
import { useEffect } from 'react';

type To = string;

// ── <Link to="/x"> → next/link with href ──────────────────────────────────
interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: To;
  replace?: boolean;
  children?: ReactNode;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, children, ...rest },
  ref,
) {
  return (
    <NextLink ref={ref} href={to} replace={replace} {...rest}>
      {children}
    </NextLink>
  );
});

// ── useNavigate() → router.push / back ─────────────────────────────────────
export function useNavigate() {
  const router = useRouter();
  return (to: To | number, opts?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      // react-router supports navigate(-1)/navigate(1); Next only exposes back/forward.
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}

// ── useLocation() → { pathname, search, hash } ─────────────────────────────
export function useLocation() {
  const pathname = usePathname() || '/';
  const params = useNextSearchParams();
  const search = params && params.toString() ? `?${params.toString()}` : '';
  return { pathname, search, hash: '', state: null, key: 'default' };
}

// ── useSearchParams() → [mutable URLSearchParams, setter] ──────────────────
export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams, opts?: { replace?: boolean }) => void,
] {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const next = useNextSearchParams();
  // Return a fresh MUTABLE copy so callers can .set()/.delete() like react-router.
  const mutable = new URLSearchParams(next ? next.toString() : '');

  const setSearchParams = (
    params: URLSearchParams,
    opts?: { replace?: boolean },
  ) => {
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (opts?.replace) router.replace(url);
    else router.push(url);
  };

  return [mutable, setSearchParams];
}

// ── useParams() — pass through (Next's shape matches for our usage) ─────────
export function useParams<T extends Record<string, string | string[]> = Record<string, string>>() {
  return (useNextParams() as unknown) as T;
}

// ── <Navigate to="/x" replace /> → client redirect ─────────────────────────
export function Navigate({ to, replace = true }: { to: To; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [to, replace, router]);
  return null;
}

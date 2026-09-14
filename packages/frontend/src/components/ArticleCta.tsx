'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

/**
 * End-of-article call to action. Client component so it can read auth state:
 * signed-in readers already have an account, so we drop "Create Free Account"
 * and show only "Browse Jobs".
 *
 * `isAuthenticated` is false during SSR and the first client render (the token
 * is read from localStorage in an effect), so the server HTML and first render
 * both include both buttons — no hydration mismatch — then the extra button is
 * removed once auth resolves for a logged-in reader.
 */
export default function ArticleCta() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="article-cta" aria-labelledby="cta-heading">
      <h2 id="cta-heading" className="article-cta__title">
        Looking for English-speaking jobs in Germany?
      </h2>
      <p className="article-cta__body">
        Browse 2,000+ verified roles — no German required. Every listing is checked before it goes live.
      </p>
      <div className="article-cta__actions">
        <Link href="/jobs" className="article-btn article-btn--primary">Browse Jobs</Link>
        {!isAuthenticated && (
          <Link href="/signup" className="article-btn article-btn--ghost">Create Free Account</Link>
        )}
      </div>
    </section>
  );
}

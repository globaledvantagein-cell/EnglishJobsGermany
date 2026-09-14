/**
 * Minimal share links for an article. Plain anchors (no client JS, no heavy
 * widgets) that open each network's share dialog in a new tab with the URL
 * and title pre-filled.
 */
export default function ArticleShare({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const links = [
    {
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      icon: (
        <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9.5h4V21H3V9.5ZM9 9.5h3.8v1.57h.05c.53-1 1.83-2.05 3.77-2.05C20.5 9 21 11.2 21 14.06V21h-4v-6.14c0-1.46-.03-3.34-2.03-3.34-2.03 0-2.34 1.59-2.34 3.23V21H9V9.5Z" />
      ),
    },
    {
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
      icon: (
        <path d="M17.53 3H20.5l-6.5 7.43L21.75 21h-6.02l-4.71-6.16L5.6 21H2.63l6.95-7.95L2.25 3h6.17l4.26 5.63L17.53 3Zm-1.06 16.2h1.64L7.6 4.7H5.84L16.47 19.2Z" />
      ),
    },
    {
      label: 'Share on WhatsApp',
      href: `https://wa.me/?text=${t}%20${u}`,
      icon: (
        <path d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.34A10 10 0 1 0 12 2Zm5.3 13.9c-.22.63-1.28 1.2-1.77 1.24-.47.05-.9.22-3.04-.63-2.57-1.01-4.2-3.65-4.33-3.82-.13-.17-1.04-1.38-1.04-2.63 0-1.25.66-1.87.89-2.12.22-.25.49-.31.65-.31.16 0 .33 0 .47.01.15.01.35-.06.55.42.2.48.68 1.66.74 1.78.06.12.1.27.02.44-.08.17-.12.27-.24.42-.12.15-.25.33-.36.44-.12.12-.24.25-.1.49.14.24.62 1.02 1.33 1.65.91.81 1.68 1.07 1.92 1.19.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.16 1.21Z" />
      ),
    },
  ];

  return (
    <div className="article-share">
      <span className="article-share__label">Share</span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          className="article-share__link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {l.icon}
          </svg>
        </a>
      ))}
    </div>
  );
}

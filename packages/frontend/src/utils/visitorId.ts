let visitorIdCache: string | null = null;

export function getVisitorId(): string {
  if (visitorIdCache) return visitorIdCache;

  const match = document.cookie.match(/(?:^|; )vid=([^;]*)/);
  if (match) {
    visitorIdCache = match[1];
    return visitorIdCache;
  }

  visitorIdCache = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `vid=${visitorIdCache}; expires=${expires}; path=/; SameSite=Lax`;

  return visitorIdCache;
}

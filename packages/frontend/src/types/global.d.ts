// Ambient types for third-party analytics globals injected by <script> tags.
export {};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    /** Microsoft Clarity's global; `q` queues calls made before the tag loads. */
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

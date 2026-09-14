// Ambient types for third-party analytics globals injected by <script> tags.
export {};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

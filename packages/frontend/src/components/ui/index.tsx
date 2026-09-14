'use client';

// ─── Design System UI Primitives ────────────────────────────────────────────
// Paper + Ink sketch aesthetic. All components read from CSS variables only.
// This barrel re-exports all UI primitives from their individual files.

export { Container } from './Container';
export { Stack } from './Stack';
export { Spinner } from './Spinner';
export { Button } from './Button';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { Select } from './Select';
export { Card } from './Card';
export { Badge } from './Badge';
export { Label } from './Label';
export { Divider } from './Divider';
export { PageHeader } from './PageHeader';
export { FormField } from './FormField';
export { EmptyState } from './EmptyState';
export { ErrorState, classifyError } from './ErrorState';
export { Alert } from './Alert';
export { StatCard } from './StatCard';
export { ProBadge } from './ProBadge';
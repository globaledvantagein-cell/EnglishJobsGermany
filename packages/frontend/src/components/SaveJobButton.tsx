'use client';

/**
 * Bookmark toggle for a job. Shared by the Dashboard list cards and the
 * job detail view.
 *
 * Renders nothing for anonymous visitors — saving is account-scoped, so
 * there is nowhere to put a bookmark until the user signs in.
 *
 * Stops click/keydown propagation because the list cards are themselves
 * clickable: bookmarking must never also open the job.
 */
import { type KeyboardEvent, type MouseEvent, type CSSProperties } from 'react';
import { Bookmark } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSavedJobs } from '../context/SavedJobsContext';

interface Props {
  jobId: string;
  size?: number;
  style?: CSSProperties;
}

export default function SaveJobButton({ jobId, size = 15, style }: Props) {
  const { isAuthenticated } = useAuth();
  const { isSaved, toggleSave } = useSavedJobs();

  if (!isAuthenticated) return null;

  const saved = isSaved(jobId);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    void toggleSave(jobId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // The parent card treats Enter/Space as "open job" — don't let it through.
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={saved ? 'Remove from saved jobs' : 'Save this job'}
      aria-pressed={saved}
      title={saved ? 'Saved' : 'Save job'}
      className={`save-btn ${saved ? 'is-saved' : ''}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: saved ? 'var(--primary)' : 'var(--text-muted)',
        borderRadius: 6,
        lineHeight: 0,
        ...style,
      }}
    >
      <Bookmark size={size} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
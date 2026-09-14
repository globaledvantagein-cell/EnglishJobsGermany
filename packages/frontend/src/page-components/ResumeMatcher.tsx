'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Container, PageHeader, Badge, Button, Alert } from '../components/ui';
import ResumeUpload from '../components/ResumeUpload';
import type { AnalyzePayload } from '../components/ResumeUpload';
import MatchProgress from '../components/MatchProgress';
import ParsedProfileCard from '../components/ParsedProfileCard';
import MatchResults from '../components/MatchResults';
import {
  matchResumeFile,
  matchResumeText,
  ResumeMatchError,
  type MatchResponse,
} from '../utils/resumeMatchApi';

type Status = 'idle' | 'loading' | 'done' | 'error';

interface UiError {
  message: string;
  code?: string;
}

// Map backend error codes / statuses to friendly, actionable copy.
function toUiError(err: unknown): UiError {
  if (err instanceof ResumeMatchError) {
    if (err.code === 'PDF_PARSE_FAILED') {
      return { message: 'We couldn’t read that file. Please try pasting your resume text instead.', code: err.code };
    }
    if (err.code === 'RATE_LIMITED' || err.status === 429) {
      return { message: 'The matching service is busy right now. Please try again in a minute.', code: 'RATE_LIMITED' };
    }
    if (err.status === 401 || err.status === 403) {
      return { message: 'Your session expired or you’re not authorized. Please sign in again as an admin.', code: 'AUTH' };
    }
    return { message: err.message || 'Something went wrong. Please try again.', code: err.code };
  }
  if (err instanceof Error && err.message) {
    // Network failures from fetch() land here.
    return { message: 'Network error — could not reach the server. Please try again.' };
  }
  return { message: 'Something went wrong. Please try again.' };
}

export default function ResumeMatcher() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request if the user navigates away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runMatch = async (payload: AnalyzePayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const data =
        'file' in payload
          ? await matchResumeFile(payload.file, controller.signal)
          : await matchResumeText(payload.text, controller.signal);

      if (controller.signal.aborted) return;
      setResult(data);
      setStatus('done');
    } catch (err) {
      // A user-initiated cancel surfaces as an AbortError — treat it as a silent reset.
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setError(toUiError(err));
      setStatus('error');
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus('idle');
  };

  const reset = () => {
    abortRef.current?.abort();
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '28px 0' }}>
        <Container size="lg">
          <PageHeader
            label="Admin · Testing"
            title="Resume Matcher"
            subtitle="Upload a resume and get AI-ranked job matches with skill-by-skill explanations."
            actions={<Badge variant="acid">Beta</Badge>}
          />
        </Container>
      </div>

      <Container size="lg" style={{ padding: '24px 24px 56px' }}>
        {/* Upload / input — shown when idle or after an error so the user can retry. */}
        {(status === 'idle' || status === 'error') && (
          <div style={{ display: 'grid', gap: 16, maxWidth: 680 }}>
            {error && (
              <Alert type={error.code === 'RATE_LIMITED' ? 'warning' : 'error'}>{error.message}</Alert>
            )}
            <ResumeUpload onAnalyze={runMatch} />
          </div>
        )}

        {/* Processing */}
        {status === 'loading' && (
          <div style={{ maxWidth: 680 }}>
            <MatchProgress onCancel={cancel} />
          </div>
        )}

        {/* Results */}
        {status === 'done' && result && (
          <div style={{ display: 'grid', gap: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw size={14} />
                Try Another Resume
              </Button>
            </div>
            <ParsedProfileCard profile={result.profile} />
            <MatchResults data={result} />
          </div>
        )}
      </Container>
    </div>
  );
}
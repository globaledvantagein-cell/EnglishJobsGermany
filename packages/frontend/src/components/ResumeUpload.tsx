'use client';

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud, FileText, X, Sparkles } from 'lucide-react';
import { Button, Textarea, Alert } from './ui';
import {
  FILE_ACCEPT_ATTR,
  MIN_TEXT_LENGTH,
  validateResumeFile,
} from '../utils/resumeMatchApi';

export type AnalyzePayload = { file: File } | { text: string };

interface Props {
  onAnalyze: (payload: AnalyzePayload) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResumeUpload({ onAnalyze, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (candidate: File | undefined | null) => {
    if (!candidate) return;
    const err = validateResumeFile(candidate);
    if (err) {
      setLocalError(err);
      setFile(null);
      return;
    }
    setLocalError(null);
    setFile(candidate);
    setText(''); // a file takes precedence — clear any pasted text to avoid ambiguity
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
    // Allow re-selecting the same file after a clear.
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    // Take the first file only if several are dropped.
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const clearFile = () => {
    setFile(null);
    setLocalError(null);
  };

  const trimmedText = text.trim();
  const canAnalyze = !disabled && (!!file || trimmedText.length >= MIN_TEXT_LENGTH);

  const submit = () => {
    if (disabled) return;
    if (file) {
      onAnalyze({ file });
      return;
    }
    if (trimmedText.length < MIN_TEXT_LENGTH) {
      setLocalError(`Please paste at least ${MIN_TEXT_LENGTH} characters of your resume.`);
      return;
    }
    setLocalError(null);
    onAnalyze({ text: trimmedText });
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* ── Dropzone ─────────────────────────────────────────── */}
      <div
        onClick={() => !disabled && !file && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setIsDragging(false)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !file && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className="sketch-ink"
        style={{
          border: `1.5px dashed ${isDragging ? 'var(--primary)' : 'var(--ink-border-strong, var(--border-strong))'}`,
          background: isDragging ? 'var(--primary-soft)' : 'var(--surface-solid)',
          borderRadius: 14,
          padding: '34px 24px',
          textAlign: 'center',
          cursor: disabled || file ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.2s, background 0.2s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT_ATTR}
          onChange={onInputChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />

        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <FileText size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                {file.name}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted-ink)' }}>
                {formatBytes(file.size)}
              </p>
            </div>
            {!disabled && (
              <button
                onClick={e => { e.stopPropagation(); clearFile(); }}
                aria-label="Remove file"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-ink)', display: 'flex', padding: 4 }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        ) : (
          <>
            <UploadCloud size={30} style={{ color: 'var(--muted-ink)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)', fontSize: '0.95rem' }}>
              Drop your resume here, or click to browse
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--muted-ink)' }}>
              PDF or DOCX · up to 10 MB
            </p>
          </>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: file ? 0.4 : 1 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--muted-ink)', fontWeight: 600 }}>
          or paste resume text
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* ── Text paste ───────────────────────────────────────── */}
      <div>
        <Textarea
          value={text}
          onChange={e => { setText(e.target.value); if (localError) setLocalError(null); }}
          placeholder={file ? 'Remove the file above to paste text instead…' : 'Paste the full text of your resume here…'}
          disabled={disabled || !!file}
          rows={7}
          style={{ minHeight: 150, opacity: file ? 0.5 : 1 }}
        />
        {!file && trimmedText.length > 0 && trimmedText.length < MIN_TEXT_LENGTH && (
          <p style={{ margin: '6px 2px 0', fontSize: '0.75rem', color: 'var(--muted-ink)' }}>
            {MIN_TEXT_LENGTH - trimmedText.length} more characters needed.
          </p>
        )}
      </div>

      {localError && <Alert type="error">{localError}</Alert>}

      <div>
        <Button onClick={submit} disabled={!canAnalyze} size="lg">
          <Sparkles size={16} />
          Analyze Resume
        </Button>
      </div>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { IJob } from '../../types';
import { apiPatch } from '../../utils/jobApi';

interface Props {
  job: IJob;
  onSave: (updated: IJob) => void;
}

export default function EditableLocation({ job, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(job.Location || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(job.Location || '');
  }, [job._id, job.Location]);

  const handleSave = async () => {
    if (!value.trim() || value.trim() === job.Location) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<IJob>(`/api/jobs/admin/update/${job._id}`, { Location: value.trim() });
      onSave(updated);
      setEditing(false);
    } catch (err) {
      console.error('[EditableLocation]', err);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        title="Click to edit location"
        style={{
          fontSize: '0.82rem', color: 'var(--text-muted)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          cursor: 'pointer', borderBottom: '1px dashed var(--border)',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        <MapPin size={12} /> {job.Location || 'No location'}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <MapPin size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') { setValue(job.Location || ''); setEditing(false); }
        }}
        autoFocus
        style={{
          fontSize: '0.82rem', color: 'var(--text-primary)',
          background: 'var(--bg-surface-2)', border: '1px solid var(--acid)',
          borderRadius: 4, padding: '2px 6px', outline: 'none',
          fontFamily: 'inherit', width: 200,
        }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px',
          background: 'var(--acid)', color: '#000', border: 'none',
          borderRadius: 4, cursor: 'pointer',
        }}
      >
        {saving ? '...' : 'Save'}
      </button>
      <button
        onClick={() => { setValue(job.Location || ''); setEditing(false); }}
        style={{
          fontSize: '0.7rem', padding: '2px 6px',
          background: 'transparent', color: 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </span>
  );
}
'use client';

/**
 * Editable job matching preferences — salary, work style, notice period, visa.
 * Saved to the user profile and used by the resume matcher for better scoring.
 */
import { useState, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { apiGet, apiPatch } from '../../utils/jobApi';

interface JobPreferences {
  salary_min?: number | null;
  salary_max?: number | null;
  preferred_work_style?: string;
  notice_period?: string;
  available_from?: string;
  visa_status?: string;
}

const WORK_STYLES = ['remote', 'hybrid', 'on_site', 'flexible'];
const NOTICE_PERIODS = ['immediate', '1_month', '2_months', '3_months'];
const VISA_STATUSES = ['eu_citizen', 'blue_card', 'student_visa', 'needs_sponsorship'];

function label(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function JobPreferencesForm() {
  const [prefs, setPrefs] = useState<JobPreferences>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ jobPreferences?: JobPreferences }>('/api/auth/me')
      .then(data => { if (data.jobPreferences) setPrefs(data.jobPreferences); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiPatch('/api/auth/job-preferences', prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const update = (key: keyof JobPreferences, value: unknown) => {
    setPrefs(prev => ({ ...prev, [key]: value || null }));
    setSaved(false);
  };

  if (loading) return <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />;

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
    fontSize: '0.85rem', width: '100%',
  };
  const inputStyle: React.CSSProperties = { ...selectStyle };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 4, display: 'block',
  };

  return (
    <Card style={{ padding: 16, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Job Preferences
        </h3>
        <Badge variant="neutral" style={{ fontSize: '0.68rem' }}>Used for matching</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label style={labelStyle}>Salary Min (€/year)</label>
          <input type="number" placeholder="e.g. 45000" style={inputStyle}
            value={prefs.salary_min || ''} onChange={e => update('salary_min', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div>
          <label style={labelStyle}>Salary Max (€/year)</label>
          <input type="number" placeholder="e.g. 65000" style={inputStyle}
            value={prefs.salary_max || ''} onChange={e => update('salary_max', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div>
          <label style={labelStyle}>Preferred Work Style</label>
          <select style={selectStyle} value={prefs.preferred_work_style || ''}
            onChange={e => update('preferred_work_style', e.target.value)}>
            <option value="">Not set</option>
            {WORK_STYLES.map(ws => <option key={ws} value={ws}>{label(ws)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Notice Period</label>
          <select style={selectStyle} value={prefs.notice_period || ''}
            onChange={e => update('notice_period', e.target.value)}>
            <option value="">Not set</option>
            {NOTICE_PERIODS.map(np => <option key={np} value={np}>{label(np)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Available From</label>
          <input type="date" style={inputStyle} value={prefs.available_from || ''}
            onChange={e => update('available_from', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Visa Status</label>
          <select style={selectStyle} value={prefs.visa_status || ''}
            onChange={e => update('visa_status', e.target.value)}>
            <option value="">Not set</option>
            {VISA_STATUSES.map(vs => <option key={vs} value={vs}>{label(vs)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" onClick={handleSave} loading={saving}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Preferences</>}
        </Button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          These preferences improve job match accuracy
        </span>
      </div>
    </Card>
  );
}
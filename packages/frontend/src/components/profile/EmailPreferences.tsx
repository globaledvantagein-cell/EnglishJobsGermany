'use client';

import { useMemo, useState } from 'react';
import { Bell, BellOff, Check, Save } from 'lucide-react';
import { Alert, Badge, Button } from '../ui';
import { apiPatch } from '../../utils/jobApi';
import { ALL_CATEGORIES, type ProfileData } from './profileTypes';

interface Props {
  profile: ProfileData;
  loadError: string | null;
  onProfileUpdated: (data: ProfileData) => void;
}

type SaveMsg = { type: 'success' | 'error'; text: string } | null;

export default function EmailPreferences({ profile, loadError, onProfileUpdated }: Props) {
  const [categories, setCategories] = useState<string[]>(profile.desiredCategories || []);
  const [subscribed, setSubscribed] = useState<boolean>(Boolean(profile.isSubscribed));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<SaveMsg>(null);

  const dirty = useMemo(() => {
    const catsChanged = JSON.stringify([...categories].sort())
                     !== JSON.stringify([...(profile.desiredCategories || [])].sort());
    return catsChanged || subscribed !== Boolean(profile.isSubscribed);
  }, [categories, subscribed, profile.desiredCategories, profile.isSubscribed]);

  const toggleCategory = (value: string) => {
    setSaveMsg(null);
    setCategories(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]);
  };

  const handleApiResponse = (data: ProfileData) => {
    onProfileUpdated(data);
    setCategories(Array.isArray(data.desiredCategories) ? data.desiredCategories : []);
    setSubscribed(Boolean(data.isSubscribed));
  };

  const savePreferences = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await apiPatch<ProfileData>('/api/auth/preferences', {
        desiredCategories: categories,
        isSubscribed: subscribed,
      });
      handleApiResponse(updated);
      setSaveMsg({ type: 'success', text: subscribed && !profile.isSubscribed
        ? 'Subscribed! Check your email for confirmation.'
        : 'Preferences updated.'
      });
    } catch (e: any) {
      setSaveMsg({ type: 'error', text: e.message || 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSubscription = async () => {
    const next = !subscribed;
    setSaveMsg(null);

    if (next) {
      // Subscribing → just toggle local state, show category picker.
      // User must pick categories and click "Save changes" to confirm.
      setSubscribed(true);
      setSaveMsg({ type: 'success', text: 'Select your job categories below, then hit Save changes.' });
    } else {
      // Unsubscribing → call API immediately (no categories needed).
      setSaving(true);
      try {
        const updated = await apiPatch<ProfileData>('/api/auth/preferences', { isSubscribed: false });
        handleApiResponse(updated);
        setSaveMsg({
          type: 'success',
          text: 'Unsubscribed. You will no longer receive weekly emails.',
        });
      } catch {
        setSubscribed(true); // revert
        setSaveMsg({ type: 'error', text: 'Could not update subscription.' });
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Email preferences
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Choose what kind of weekly job digest you receive.
          </p>
        </div>
        <Badge variant={subscribed ? 'green' : 'neutral'} style={{ fontSize: '0.65rem', flexShrink: 0 }}>
          {subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED'}
        </Badge>
      </div>

      {(saveMsg || loadError) && (
        <div style={{ marginBottom: 16 }}>
          {loadError && <Alert type="warning">{loadError}</Alert>}
          {saveMsg && <Alert type={saveMsg.type === 'success' ? 'success' : 'error'}>{saveMsg.text}</Alert>}
        </div>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: subscribed ? 18 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {subscribed ? <Bell size={16} style={{ color: 'var(--acid)' }} /> : <BellOff size={16} style={{ color: 'var(--text-muted)' }} />}
          <div>
            <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Weekly digest
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {subscribed ? 'You receive a weekly summary every Monday.' : 'You are not receiving the weekly digest.'}
            </p>
          </div>
        </div>
        <Button
          variant={subscribed ? 'ghost' : undefined}
          size="sm"
          onClick={toggleSubscription}
          disabled={saving}
        >
          {subscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
      </div>

      {subscribed && (
        <>
          <p style={{
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)',
            marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            Job categories
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {ALL_CATEGORIES.map(opt => {
              const isOn = categories.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleCategory(opt.value)}
                  aria-pressed={isOn}
                  className={`pref-chip ${isOn ? 'is-on' : ''}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px',
                    fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                    borderRadius: 999, cursor: 'pointer',
                    border: isOn ? '1.25px solid var(--acid)' : '1.25px solid var(--border)',
                    background: isOn ? 'var(--acid-soft)' : 'var(--bg-surface-2)',
                    color: isOn ? 'var(--acid)' : 'var(--text-muted)',
                  }}
                >
                  {isOn && <Check size={12} strokeWidth={3} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            onClick={savePreferences}
            disabled={!dirty || saving || categories.length === 0}
            loading={saving}
          >
            <Save size={13} /> Save changes
          </Button>
          {categories.length === 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
              Pick at least one category to save.
            </p>
          )}
        </>
      )}
    </div>
  );
}
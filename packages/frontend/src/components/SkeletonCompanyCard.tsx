'use client';

export default function SkeletonCompanyCard() {
    return (
        <div className="sketch-card" style={{ padding: 22, minHeight: 140, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-solid)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="skeleton" style={{ height: 16, width: '70%', borderRadius: 6 }} />
                    <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 6 }} />
                </div>
            </div>
            <div className="skeleton" style={{ height: 12, width: '55%', borderRadius: 6, marginTop: 'auto' }} />
        </div>
    );
}
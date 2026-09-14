'use client';

import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { Container, PageHeader, Button, FormField, Input, Select, Textarea, Alert, Card } from '../components/ui';
import { apiPost } from '../utils/jobApi';

export default function AddJob() {
  const [fd, setFd] = useState({ JobTitle: '', ApplicationURL: '', Company: '', Location: 'Germany', Department: '', ContractType: 'Full-time', ExperienceLevel: '', PostedDate: '', Description: '' });
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFd(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setLoading(true);
    try {
      await apiPost('/api/jobs', { ...fd, GermanRequired: false });
      setMsg({ type: 'success', text: 'Job added successfully.' });
      setFd({ JobTitle: '', ApplicationURL: '', Company: '', Location: 'Germany', Department: '', ContractType: 'Full-time', ExperienceLevel: '', PostedDate: '', Description: '' });
    } catch (e) { setMsg({ type: 'error', text: `Error: ${(e as Error).message}` }); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-solid)', borderBottom: '1.25px solid var(--border)', padding: '32px 0' }}>
        <Container size="md">
          <PageHeader label="Admin" title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PlusCircle size={22} color="var(--primary)" />Add Manual Job</span>} subtitle="Manually insert a job into the English-only feed." />
        </Container>
      </div>
      <Container size="md" style={{ padding: '32px 24px' }}>
        <Card>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ gridColumn: 'span 2' }}><FormField label="Job Title *"><Input name="JobTitle" type="text" required value={fd.JobTitle} onChange={change} placeholder="e.g. Software Engineer" /></FormField></div>
            <div style={{ gridColumn: 'span 2' }}><FormField label="Application URL *"><Input name="ApplicationURL" type="url" required value={fd.ApplicationURL} onChange={change} placeholder="https://..." /></FormField></div>
            <FormField label="Company *"><Input name="Company" required value={fd.Company} onChange={change} placeholder="ACME GmbH" /></FormField>
            <FormField label="Location"><Input name="Location" value={fd.Location} onChange={change} /></FormField>
            <FormField label="Department"><Input name="Department" value={fd.Department} onChange={change} placeholder="Engineering" /></FormField>
            <FormField label="Contract Type">
              <Select name="ContractType" value={fd.ContractType} onChange={change}>
                {['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'].map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="Experience Level"><Input name="ExperienceLevel" value={fd.ExperienceLevel} onChange={change} placeholder="Mid-level" /></FormField>
            <FormField label="Posted Date"><Input name="PostedDate" type="date" value={fd.PostedDate} onChange={change} /></FormField>
            <div style={{ gridColumn: 'span 2' }}><FormField label="Description" hint="Brief job description — shown in card preview."><Textarea name="Description" value={fd.Description} onChange={change} rows={4} placeholder="Role overview..." /></FormField></div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 8 }}>
              {msg && <div style={{ flex: 1 }}><Alert type={msg.type}>{msg.text}</Alert></div>}
              <Button type="submit" loading={loading}><PlusCircle size={14} />Save Job</Button>
            </div>
          </form>
        </Card>
      </Container>
    </div>
  );
}
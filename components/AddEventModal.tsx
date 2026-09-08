import React, { useState } from 'react';
import { parseEventFromUrl } from '../services/geminiService';
import { CfeBulletinItem, CfeType, BulletinRegion, BulletinPriority } from '../types';

interface Props {
  onClose: () => void;
  onSave: (item: CfeBulletinItem) => void;
}

const CFE_TYPES: CfeType[] = [
  'Competition', 'Grant', 'Fellowship', 'Residency',
  'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event',
];
const REGIONS: BulletinRegion[] = ['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other'];
const PRIORITIES: BulletinPriority[] = ['high', 'medium', 'low'];

const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export const AddEventModal: React.FC<Props> = ({ onClose, onSave }) => {
  const [url, setUrl] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [form, setForm] = useState<Partial<CfeBulletinItem> | null>(null);

  const handleParse = async () => {
    if (!url.trim()) return;
    setIsParsing(true);
    setParseError('');
    setForm(null);
    try {
      const raw = await parseEventFromUrl(url.trim());
      setForm({
        name: String(raw.name || ''),
        organizer: String(raw.organizer || ''),
        type: (raw.type as CfeType) || 'Call for Entry',
        url: String(raw.url || url.trim()),
        location: String(raw.location || ''),
        deadline: String(raw.deadline || ''),
        genres: Array.isArray(raw.genres) ? (raw.genres as string[]) : [],
        blurb: String(raw.blurb || ''),
        fee: String(raw.fee || ''),
        region: (raw.region as BulletinRegion) || 'US',
        priority: (raw.priority as BulletinPriority) || 'medium',
        status: 'unmarked',
      });
    } catch {
      setParseError('Could not parse the page. Fill in the details manually below.');
      setForm({
        name: '', organizer: '', type: 'Call for Entry',
        url: url.trim(), location: '', deadline: '',
        genres: [], blurb: '', fee: '', region: 'US',
        priority: 'medium', status: 'unmarked',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const set = (field: keyof CfeBulletinItem, value: unknown) =>
    setForm(prev => prev ? { ...prev, [field]: value } : prev);

  const handleSave = () => {
    if (!form?.name?.trim()) return;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onSave({ ...form, id, status: 'unmarked' } as CfeBulletinItem);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    ...mono, fontSize: '11px', padding: '7px 10px',
    border: '1px solid rgba(23,25,26,0.20)', background: '#fff',
    color: '#17191a', width: '100%', boxSizing: 'border-box',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    ...mono, fontSize: '8px', letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(23,25,26,0.50)',
    display: 'block', marginBottom: '4px',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,25,26,0.55)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#f4f3ef', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ ...mono, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#17191a' }}>
            Add Event from URL
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(23,25,26,0.40)', fontSize: '16px', lineHeight: 1 }}>✕</button>
        </div>

        {/* URL row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input
            type="url"
            placeholder="https://example.com/call-for-entry"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleParse()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleParse}
            disabled={isParsing || !url.trim()}
            style={{ ...mono, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '7px 14px', background: isParsing ? 'rgba(23,25,26,0.12)' : '#17191a', color: '#f4f3ef', border: 'none', cursor: isParsing ? 'default' : 'pointer', flexShrink: 0 }}
          >
            {isParsing ? 'Parsing…' : 'Parse'}
          </button>
        </div>

        {parseError && (
          <p style={{ ...mono, fontSize: '9px', color: '#c9a227', marginBottom: '12px' }}>{parseError}</p>
        )}

        {isParsing && (
          <p style={{ ...mono, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.40)', textAlign: 'center', padding: '24px 0' }}>
            Fetching and extracting event details…
          </p>
        )}

        {form && !isParsing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ height: '1px', background: 'rgba(23,25,26,0.10)' }} />

            <div>
              <label style={labelStyle}>Event name *</label>
              <input style={inputStyle} value={form.name || ''} onChange={e => set('name', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Organizer</label>
                <input style={inputStyle} value={form.organizer || ''} onChange={e => set('organizer', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={form.location || ''} onChange={e => set('location', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select style={{ ...inputStyle }} value={form.type || 'Call for Entry'} onChange={e => set('type', e.target.value as CfeType)}>
                  {CFE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Deadline (YYYY-MM-DD or Rolling)</label>
                <input style={inputStyle} value={form.deadline || ''} onChange={e => set('deadline', e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Region</label>
                <select style={{ ...inputStyle }} value={form.region || 'US'} onChange={e => set('region', e.target.value as BulletinRegion)}>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select style={{ ...inputStyle }} value={form.priority || 'medium'} onChange={e => set('priority', e.target.value as BulletinPriority)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Entry fee</label>
                <input style={inputStyle} value={form.fee || ''} onChange={e => set('fee', e.target.value)} placeholder="Free, $30, etc." />
              </div>
              <div>
                <label style={labelStyle}>Genres (comma-separated)</label>
                <input
                  style={inputStyle}
                  value={(form.genres || []).join(', ')}
                  onChange={e => set('genres', e.target.value.split(',').map(g => g.trim()).filter(Boolean))}
                  placeholder="Photography, Mixed Media"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, height: '72px', resize: 'vertical' }}
                value={form.blurb || ''}
                onChange={e => set('blurb', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>URL</label>
              <input style={inputStyle} value={form.url || ''} onChange={e => set('url', e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button onClick={onClose} style={{ ...mono, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', background: 'transparent', color: 'rgba(23,25,26,0.50)', border: '1px solid rgba(23,25,26,0.20)', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name?.trim()}
                style={{ ...mono, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', background: !form.name?.trim() ? 'rgba(23,25,26,0.12)' : '#17191a', color: '#f4f3ef', border: 'none', cursor: !form.name?.trim() ? 'default' : 'pointer' }}
              >
                Save to Board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

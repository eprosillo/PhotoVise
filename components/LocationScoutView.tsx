import React, { useState, useMemo } from 'react';
import { ScoutLocation, ScoutTag, BestTimeOfDay, Session } from '../types';
import { suggestScoutLocations, ScoutLocationSuggestion } from '../services/geminiService';
import { GENRE_ICONS } from '../constants';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SCOUT_TAGS: ScoutTag[] = [
  'Architecture',
  'Landscape',
  'Street',
  'Photojournalism',
  'Abstraction',
  'People',
  'Composition',
  'Blue Hour',
  'Golden Hour',
];

export const BEST_TIMES: BestTimeOfDay[] = [
  'Sunrise',
  'Early Morning',
  'Morning',
  'Midday',
  'Afternoon',
  'Golden Hour',
  'Blue Hour',
  'Night',
  'Any Time',
];

const LIGHT_TAGS: ScoutTag[] = ['Blue Hour', 'Golden Hour'];

const TAG_HELPER: Partial<Record<ScoutTag, string>> = {
  Architecture:     'Strong lines, geometry, symmetry',
  Landscape:        'Wide scenes, depth, natural light',
  Street:           'Candid moments, energy, context',
  Photojournalism:  'Storytelling, decisive moment',
  Abstraction:      'Pattern, form, minimal context',
  People:           'Portraits, interaction, life',
  Composition:      'Leading lines, framing, layers',
  'Blue Hour':      'Soft post-sunset light, mood',
  'Golden Hour':    'Warm directional light, depth',
};

function worksWellFor(tags: ScoutTag[]): string {
  if (tags.length === 0) return '';
  const primary = tags.slice(0, 2).map(t => TAG_HELPER[t] ?? t).join(' · ');
  const hasLight = tags.some(t => LIGHT_TAGS.includes(t));
  return hasLight ? `${primary} — plan for specific light window` : primary;
}

const BLANK_FORM: Omit<ScoutLocation, 'id' | 'createdAt'> = {
  name: '',
  area: '',
  mapLink: '',
  tags: [],
  bestTime: 'Any Time',
  lightingNotes: '',
  accessNotes: '',
  safetyNotes: '',
  parkingNotes: '',
  shotIdeas: '',
  backupSpot: '',
  favorite: false,
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: '12px',
  color: '#17191a',
  background: 'rgba(23,25,26,0.04)',
  border: '1px solid rgba(23,25,26,0.14)',
  outline: 'none',
  fontFamily: 'inherit',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '9px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'rgba(23,25,26,0.40)',
  marginBottom: '5px',
};

// ── TagCheckbox ───────────────────────────────────────────────────────────────

interface TagCheckboxProps {
  key?: React.Key | null;
  tag: ScoutTag;
  selected: boolean;
  onToggle: () => void;
}

function TagCheckbox({ tag, selected, onToggle }: TagCheckboxProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
      style={{
        padding: '5px 10px',
        border: selected ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.16)',
        background: selected ? '#17191a' : 'transparent',
        color: selected ? '#f4f3ef' : 'rgba(23,25,26,0.55)',
      }}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.16)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
    >
      {tag}
    </button>
  );
}

// ── LocationForm ──────────────────────────────────────────────────────────────

interface LocationFormProps {
  initial: Omit<ScoutLocation, 'id' | 'createdAt'>;
  onSubmit: (data: Omit<ScoutLocation, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  submitLabel?: string;
}

function LocationForm({ initial, onSubmit, onCancel, submitLabel = 'Save location' }: LocationFormProps) {
  const [form, setForm] = useState(initial);
  const [showNotes, setShowNotes] = useState(
    !!(initial.lightingNotes || initial.accessNotes || initial.safetyNotes || initial.parkingNotes || initial.shotIdeas || initial.backupSpot)
  );

  const set = (key: keyof typeof form, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleTag = (tag: ScoutTag) =>
    set('tags', form.tags.includes(tag) ? form.tags.filter(t => t !== tag) : [...form.tags, tag]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Row 1: name + area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label style={LABEL_STYLE}>Location name *</label>
          <input
            style={INPUT_STYLE}
            placeholder="e.g. City Hall Plaza"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>Neighborhood / area</label>
          <input
            style={INPUT_STYLE}
            placeholder="e.g. Downtown, Midtown, Williamsburg"
            value={form.area}
            onChange={e => set('area', e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: map link + best time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label style={LABEL_STYLE}>Address or map link</label>
          <input
            style={INPUT_STYLE}
            placeholder="Full address or Google Maps URL"
            value={form.mapLink}
            onChange={e => set('mapLink', e.target.value)}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>Best time of day</label>
          <select
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            value={form.bestTime}
            onChange={e => set('bestTime', e.target.value as BestTimeOfDay)}
          >
            {BEST_TIMES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label style={LABEL_STYLE}>Assignment-fit tags</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SCOUT_TAGS.map(tag => (
            <TagCheckbox
              key={tag}
              tag={tag}
              selected={form.tags.includes(tag)}
              onToggle={() => toggleTag(tag)}
            />
          ))}
        </div>
      </div>

      {/* Extended notes — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          className="font-mono text-[9px] tracking-[0.16em] uppercase text-brand-ink/40 hover:text-brand-ink/70 transition-colors flex items-center gap-2"
        >
          <i className={`fa-solid fa-chevron-${showNotes ? 'up' : 'down'} text-[8px]`} />
          {showNotes ? 'Hide notes' : 'Add scouting notes'}
        </button>

        {showNotes && (
          <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={LABEL_STYLE}>Lighting notes</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '72px', resize: 'none' }}
                  placeholder="e.g. Direct sun hits the facade at 3 pm."
                  value={form.lightingNotes}
                  onChange={e => set('lightingNotes', e.target.value)}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Shot ideas</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '72px', resize: 'none' }}
                  placeholder="e.g. Wide establishing, tight detail of the columns"
                  value={form.shotIdeas}
                  onChange={e => set('shotIdeas', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={LABEL_STYLE}>Access / permit notes</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'none' }}
                  placeholder="e.g. Public space, no permit needed."
                  value={form.accessNotes}
                  onChange={e => set('accessNotes', e.target.value)}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Safety notes</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'none' }}
                  placeholder="e.g. Well-lit at night."
                  value={form.safetyNotes}
                  onChange={e => set('safetyNotes', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={LABEL_STYLE}>Parking / walking</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'none' }}
                  placeholder="e.g. Free street parking on Oak St."
                  value={form.parkingNotes}
                  onChange={e => set('parkingNotes', e.target.value)}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Backup nearby spot</label>
                <input
                  style={INPUT_STYLE}
                  placeholder="e.g. Riverside Esplanade, 3 blocks east"
                  value={form.backupSpot}
                  onChange={e => set('backupSpot', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
          style={{ padding: '10px 22px', background: '#17191a', color: '#f4f3ef', border: '1px solid #17191a' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; }}
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[9px] tracking-[0.14em] uppercase text-brand-ink/40 hover:text-brand-ink/70 transition-colors px-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── DataRow ───────────────────────────────────────────────────────────────────

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ borderBottom: '1px solid rgba(23,25,26,0.08)', paddingBottom: '7px' }}>
      <span className="font-mono text-[8px] tracking-[0.18em] uppercase shrink-0" style={{ color: 'rgba(23,25,26,0.38)' }}>{label}</span>
      <span className="text-[11px] text-right" style={{ color: 'rgba(23,25,26,0.70)' }}>{children}</span>
    </div>
  );
}

// ── LocationCard ──────────────────────────────────────────────────────────────

interface LocationCardProps {
  key?: React.Key | null;
  location: ScoutLocation;
  onToggleFavorite: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenAssignmentPicker: (location: ScoutLocation) => void;
  editingId: string | null;
  onSaveEdit: (id: string, data: Omit<ScoutLocation, 'id' | 'createdAt'>) => void;
  onCancelEdit: () => void;
}

function LocationCard({
  location,
  onToggleFavorite,
  onEdit,
  onDelete,
  onOpenAssignmentPicker,
  editingId,
  onSaveEdit,
  onCancelEdit,
}: LocationCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isEditing = editingId === location.id;
  const mapIsUrl = location.mapLink.startsWith('http');

  if (isEditing) {
    return (
      <div
        style={{
          background: '#f8f7f4',
          border: '1px solid #c9a227',
          padding: '20px',
        }}
      >
        <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-5" style={{ color: '#c9a227' }}>
          Editing: {location.name}
        </p>
        <LocationForm
          initial={{
            name:          location.name,
            area:          location.area,
            mapLink:       location.mapLink,
            tags:          location.tags,
            bestTime:      location.bestTime,
            lightingNotes: location.lightingNotes,
            accessNotes:   location.accessNotes,
            safetyNotes:   location.safetyNotes,
            parkingNotes:  location.parkingNotes,
            shotIdeas:     location.shotIdeas,
            backupSpot:    location.backupSpot,
            favorite:      location.favorite,
          }}
          onSubmit={data => onSaveEdit(location.id, data)}
          onCancel={onCancelEdit}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#f8f7f4',
        border: '1px solid rgba(23,25,26,0.14)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 4:3 frame */}
      <div
        style={{
          aspectRatio: '4/3',
          background: 'rgba(23,25,26,0.06)',
          borderBottom: '1px solid rgba(23,25,26,0.14)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Diagonal stripe placeholder */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(23,25,26,0.04) 6px, rgba(23,25,26,0.04) 7px)',
        }} />
        {/* Caption bottom-left: area */}
        {location.area && (
          <span
            className="font-mono"
            style={{
              position: 'absolute', bottom: '7px', left: '8px',
              fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(23,25,26,0.50)',
            }}
          >
            {location.area}
          </span>
        )}
        {/* Favorite star bottom-right */}
        {location.favorite && (
          <span style={{ position: 'absolute', bottom: '7px', right: '8px', color: '#c9a227', fontSize: '11px' }}>★</span>
        )}
        {/* Toggle favorite button top-right */}
        <button
          onClick={() => onToggleFavorite(location.id)}
          style={{
            position: 'absolute', top: '7px', right: '8px',
            background: 'rgba(23,25,26,0.18)',
            border: 'none',
            padding: '4px 6px',
            cursor: 'pointer',
            color: location.favorite ? '#c9a227' : 'rgba(248,247,244,0.70)',
            fontSize: '10px',
          }}
          title={location.favorite ? 'Remove from favorites' : 'Mark as favorite'}
        >
          ★
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {/* Name */}
        <p style={{ fontSize: '15px', fontWeight: 500, color: '#17191a', lineHeight: 1.3 }}>{location.name}</p>

        {/* Area · best time */}
        {(location.area || location.bestTime) && (
          <p className="font-mono" style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.42)' }}>
            {[location.area, location.bestTime !== 'Any Time' ? location.bestTime : ''].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Tags */}
        {location.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {location.tags.map(tag => (
              <span
                key={tag}
                className="font-mono"
                style={{
                  fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '3px 7px', border: '1px solid rgba(23,25,26,0.16)',
                  color: 'rgba(23,25,26,0.55)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Data rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {location.mapLink && (
            <DataRow label="Map">
              {mapIsUrl ? (
                <a
                  href={location.mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono"
                  style={{ fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a227', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8a6b0f')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#c9a227')}
                >
                  OPEN ↗
                </a>
              ) : (
                <span style={{ fontSize: '11px', color: 'rgba(23,25,26,0.60)' }}>{location.mapLink}</span>
              )}
            </DataRow>
          )}
          {location.bestTime && location.bestTime !== 'Any Time' && (
            <DataRow label="Best Time">{location.bestTime}</DataRow>
          )}
          {location.accessNotes && (
            <DataRow label="Access">{location.accessNotes}</DataRow>
          )}
          {location.parkingNotes && (
            <DataRow label="Parking">{location.parkingNotes}</DataRow>
          )}
          {location.safetyNotes && (
            <DataRow label="Safety">{location.safetyNotes}</DataRow>
          )}
        </div>

        {/* Shot ideas */}
        {location.shotIdeas && (
          <div>
            <p className="font-mono" style={{ fontSize: '8px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.38)', marginBottom: '4px' }}>Shot Ideas</p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'rgba(23,25,26,0.65)' }}>{location.shotIdeas}</p>
          </div>
        )}

        {/* Backup spot */}
        {location.backupSpot && (
          <div>
            <p className="font-mono" style={{ fontSize: '8px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.38)', marginBottom: '4px' }}>Backup Spot</p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'rgba(23,25,26,0.65)' }}>{location.backupSpot}</p>
          </div>
        )}

        {/* Lighting notes */}
        {location.lightingNotes && (
          <div>
            <p className="font-mono" style={{ fontSize: '8px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(23,25,26,0.38)', marginBottom: '4px' }}>Lighting</p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'rgba(23,25,26,0.65)' }}>{location.lightingNotes}</p>
          </div>
        )}

        {/* Footer actions */}
        <div
          className="flex items-center justify-between gap-2 flex-wrap"
          style={{ borderTop: '1px solid rgba(23,25,26,0.10)', paddingTop: '10px', marginTop: 'auto' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => onEdit(location.id)}
              className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
              style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
            >
              Edit
            </button>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="font-mono text-[8px] tracking-[0.16em] uppercase transition-colors"
                style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a35a4a')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
              >
                Delete
              </button>
            ) : (
              <span className="flex items-center gap-2">
                <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: '#a35a4a' }}>Remove?</span>
                <button
                  onClick={() => onDelete(location.id)}
                  className="font-mono text-[8px] tracking-[0.12em] uppercase"
                  style={{ color: '#a35a4a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="font-mono text-[8px] tracking-[0.12em] uppercase"
                  style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  No
                </button>
              </span>
            )}
          </div>
          <button
            onClick={() => onOpenAssignmentPicker(location)}
            className="font-mono text-[8px] tracking-[0.14em] uppercase transition-colors"
            style={{ color: 'rgba(23,25,26,0.50)', border: '1px solid rgba(23,25,26,0.16)', background: 'none', cursor: 'pointer', padding: '4px 8px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.16)'; e.currentTarget.style.color = 'rgba(23,25,26,0.50)'; }}
          >
            Use for Assignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FilterPill ────────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { key?: React.Key | null; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
      style={{
        padding: '7px 13px',
        border: active ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.18)',
        background: active ? '#17191a' : 'transparent',
        color: active ? '#f4f3ef' : 'rgba(23,25,26,0.55)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#17191a'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
    >
      {label}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface LocationScoutViewProps {
  locations: ScoutLocation[];
  sessions: Session[];
  onAdd: (location: ScoutLocation) => void;
  onUpdate: (location: ScoutLocation) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUseForAssignment?: (location: ScoutLocation, sessionId: string) => void;
}

const LocationScoutView: React.FC<LocationScoutViewProps> = ({
  locations,
  sessions,
  onAdd,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onUseForAssignment,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // AI suggestions state
  const OTHER_ID = '__other__';
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [scoutContext, setScoutContext] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ScoutLocationSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [savedSuggestionIndexes, setSavedSuggestionIndexes] = useState<Set<number>>(new Set());
  const [searchRadius, setSearchRadius] = useState<'5' | '10' | '25' | '50' | 'any'>('25');
  const [showAI, setShowAI] = useState(false);

  // Filter state
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterTag, setFilterTag] = useState<ScoutTag | 'All'>('All');

  // Attach-to-session picker
  const [pendingUseLocation, setPendingUseLocation] = useState<ScoutLocation | null>(null);
  const [attachSessionId, setAttachSessionId] = useState<string | null>(null);

  const isOtherSelected  = selectedSessionId === OTHER_ID;
  const selectedSession  = sessions.find(s => s.id === selectedSessionId) ?? null;
  const anythingSelected = selectedSessionId !== null;
  const canSuggest       = anythingSelected && (isOtherSelected ? scoutContext.trim().length > 0 : true);

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(prev => prev === id ? null : id);
    setSuggestions([]);
    setSuggestionError(null);
    setSavedSuggestionIndexes(new Set());
  };

  const handleSuggest = async () => {
    if (!canSuggest) return;
    setIsSuggesting(true);
    setSuggestions([]);
    setSuggestionError(null);
    setSavedSuggestionIndexes(new Set());

    const sessionPart = selectedSession
      ? [
          `Date: ${selectedSession.date}`,
          `Location/area: ${selectedSession.location}`,
          `Genre: ${selectedSession.genre.join(', ')}`,
          `Assignment status: ${selectedSession.status}`,
          selectedSession.title    && `Title: ${selectedSession.title}`,
          selectedSession.notes    && `Notes: ${selectedSession.notes}`,
          selectedSession.strategy && `Strategy: ${selectedSession.strategy}`,
          selectedSession.dayPlan  && `Day plan: ${selectedSession.dayPlan}`,
        ].filter(Boolean).join('\n')
      : '';

    const radiusPart = searchRadius === 'any'
      ? 'Search radius: No limit.'
      : `Search radius: within ${searchRadius} miles of the assignment location.`;

    const context = [
      sessionPart,
      radiusPart,
      scoutContext.trim() ? `Additional context: ${scoutContext.trim()}` : '',
    ].filter(Boolean).join('\n');

    try {
      const results = await suggestScoutLocations(context);
      setSuggestions(results);
    } catch {
      setSuggestionError('Photovise could not generate suggestions right now. Please try again.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSaveSuggestion = (suggestion: ScoutLocationSuggestion, index: number) => {
    const location: ScoutLocation = {
      id:            `scout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt:     Date.now(),
      favorite:      false,
      sessionId:     isOtherSelected ? undefined : (selectedSessionId ?? undefined),
      name:          suggestion.name,
      area:          suggestion.area,
      mapLink:       suggestion.mapLink,
      tags:          suggestion.tags as ScoutTag[],
      bestTime:      suggestion.bestTime,
      lightingNotes: suggestion.lightingNotes,
      accessNotes:   suggestion.accessNotes,
      safetyNotes:   suggestion.safetyNotes,
      parkingNotes:  suggestion.parkingNotes,
      shotIdeas:     suggestion.shotIdeas,
      backupSpot:    suggestion.backupSpot,
    };
    onAdd(location);
    setSavedSuggestionIndexes(prev => new Set(prev).add(index));
  };

  const handleAdd = (data: Omit<ScoutLocation, 'id' | 'createdAt'>) => {
    const location: ScoutLocation = {
      ...data,
      id: `scout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    onAdd(location);
    setShowForm(false);
  };

  const handleSaveEdit = (id: string, data: Omit<ScoutLocation, 'id' | 'createdAt'>) => {
    const existing = locations.find(l => l.id === id);
    if (!existing) return;
    onUpdate({ ...existing, ...data });
    setEditingId(null);
  };

  const filtered = useMemo(() => {
    return locations.filter(loc => {
      const matchFav = !filterFavorites || loc.favorite;
      const matchTag = filterTag === 'All' || loc.tags.includes(filterTag);
      return matchFav && matchTag;
    });
  }, [locations, filterFavorites, filterTag]);

  const favCount = locations.filter(l => l.favorite).length;

  return (
    <div>
      {/* Screen header */}
      <div
        style={{ borderBottom: '1px solid rgba(23,25,26,0.14)', paddingBottom: '18px', marginBottom: '22px' }}
        className="flex items-end justify-between gap-6"
      >
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-brand-ink/40 uppercase mb-[9px]">Shoot / Field Intel</p>
          <h1 className="font-sans font-semibold text-[42px] leading-none tracking-[-0.02em] text-brand-ink">Location Scout</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* AI suggest toggle */}
          <button
            onClick={() => setShowAI(v => !v)}
            className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
            style={{
              padding: '9px 14px',
              border: showAI ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.18)',
              background: showAI ? 'rgba(201,162,39,0.08)' : 'transparent',
              color: showAI ? '#8a6b0f' : 'rgba(23,25,26,0.55)',
              cursor: 'pointer',
            }}
          >
            AI Scout
          </button>
          {/* Add button */}
          <button
            onClick={() => { setShowForm(v => !v); setEditingId(null); }}
            className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
            style={{
              padding: '9px 18px',
              background: showForm ? 'transparent' : '#17191a',
              border: showForm ? '1px solid rgba(23,25,26,0.30)' : '1px solid #17191a',
              color: showForm ? 'rgba(23,25,26,0.60)' : '#f4f3ef',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { if (!showForm) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
            onMouseLeave={e => { if (!showForm) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}
          >
            {showForm ? '× Cancel' : '+ Scout a Spot'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.14)', padding: '24px', marginBottom: '22px' }}>
          <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-5" style={{ color: '#c9a227' }}>New Location</p>
          <LocationForm
            initial={BLANK_FORM}
            onSubmit={handleAdd}
            onCancel={() => setShowForm(false)}
            submitLabel="Save location"
          />
        </div>
      )}

      {/* AI suggestion panel */}
      {showAI && (
        <div style={{ background: '#f4f3ef', border: '1px solid rgba(23,25,26,0.14)', padding: '20px', marginBottom: '22px' }}>
          <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-5" style={{ color: 'rgba(23,25,26,0.40)' }}>AI Location Scout</p>

          {/* Session list */}
          {sessions.length > 0 && (
            <div style={{ border: '1px solid rgba(23,25,26,0.12)', marginBottom: '14px', maxHeight: '200px', overflowY: 'auto' }}>
              {sessions.map(session => {
                const isSelected = session.id === selectedSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className="w-full flex items-center gap-4 text-left transition-colors"
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(23,25,26,0.08)',
                      background: isSelected ? 'rgba(201,162,39,0.07)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '12px', height: '12px', flexShrink: 0,
                        border: isSelected ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.25)',
                        background: isSelected ? '#c9a227' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isSelected && <span style={{ fontSize: '8px', color: '#17191a' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-mono text-[9px] tracking-[0.14em] uppercase truncate" style={{ color: '#17191a' }}>
                        {session.title || session.location}
                      </p>
                      <p className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>
                        {session.date} · {session.genre.join(', ')}
                      </p>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(23,25,26,0.30)', flexShrink: 0 }}>
                      {GENRE_ICONS[session.genre[0]]}
                    </div>
                  </button>
                );
              })}
              {/* Other option */}
              <button
                onClick={() => handleSelectSession(OTHER_ID)}
                className="w-full flex items-center gap-4 text-left transition-colors"
                style={{
                  padding: '10px 14px',
                  background: isOtherSelected ? 'rgba(201,162,39,0.07)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: '12px', height: '12px', flexShrink: 0,
                    border: isOtherSelected ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.25)',
                    background: isOtherSelected ? '#c9a227' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isOtherSelected && <span style={{ fontSize: '8px', color: '#17191a' }}>✓</span>}
                </div>
                <p className="font-mono text-[9px] tracking-[0.14em] uppercase" style={{ color: 'rgba(23,25,26,0.50)' }}>
                  Other / Custom
                </p>
              </button>
            </div>
          )}

          {/* Context textarea */}
          {(anythingSelected || sessions.length === 0) && (
            <div style={{ marginBottom: '14px' }}>
              <label style={LABEL_STYLE}>Photoshoot context</label>
              <textarea
                value={scoutContext}
                onChange={e => { setScoutContext(e.target.value); setSuggestions([]); setSuggestionError(null); }}
                placeholder="e.g. Blue hour architecture shoot for a class assignment on urban geometry…"
                rows={3}
                style={{ ...INPUT_STYLE, resize: 'none' }}
              />
              {isOtherSelected && !scoutContext.trim() && (
                <p className="font-mono text-[8px] tracking-[0.12em] uppercase mt-1" style={{ color: '#a35a4a' }}>
                  Describe the photoshoot to get suggestions.
                </p>
              )}
            </div>
          )}

          {/* Suggest controls */}
          {(anythingSelected || sessions.length === 0) && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={searchRadius}
                onChange={e => setSearchRadius(e.target.value as typeof searchRadius)}
                style={{ ...INPUT_STYLE, width: 'auto', padding: '8px 12px', cursor: 'pointer' }}
              >
                <option value="5">Within 5 mi</option>
                <option value="10">Within 10 mi</option>
                <option value="25">Within 25 mi</option>
                <option value="50">Within 50 mi</option>
                <option value="any">No limit</option>
              </select>
              <button
                onClick={handleSuggest}
                disabled={isSuggesting || !canSuggest}
                className="font-mono text-[9px] tracking-[0.20em] uppercase transition-colors"
                style={{
                  padding: '10px 20px',
                  background: isSuggesting || !canSuggest ? 'rgba(23,25,26,0.08)' : '#17191a',
                  border: isSuggesting || !canSuggest ? '1px solid rgba(23,25,26,0.14)' : '1px solid #17191a',
                  color: isSuggesting || !canSuggest ? 'rgba(23,25,26,0.30)' : '#f4f3ef',
                  cursor: isSuggesting || !canSuggest ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => { if (!isSuggesting && canSuggest) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
                onMouseLeave={e => { if (!isSuggesting && canSuggest) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}
              >
                {isSuggesting ? 'Scouting…' : 'Suggest Locations'}
              </button>
            </div>
          )}

          {suggestionError && (
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase mt-3" style={{ color: '#a35a4a' }}>{suggestionError}</p>
          )}

          {/* AI suggestion cards */}
          {suggestions.length > 0 && (
            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(23,25,26,0.12)', paddingTop: '20px' }}>
              <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-4" style={{ color: 'rgba(23,25,26,0.40)' }}>
                AI Suggestions — {isOtherSelected || !selectedSession ? 'Custom Scout' : (selectedSession.title || selectedSession.location)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {suggestions.map((s, idx) => {
                  const isSaved = savedSuggestionIndexes.has(idx);
                  return (
                    <div
                      key={idx}
                      style={{
                        background: isSaved ? 'rgba(75,107,82,0.06)' : '#f8f7f4',
                        border: isSaved ? '1px solid rgba(75,107,82,0.30)' : '1px solid rgba(23,25,26,0.14)',
                        padding: '16px',
                        display: 'flex', flexDirection: 'column', gap: '10px',
                      }}
                    >
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a' }}>{s.name}</p>
                        {s.area && <p className="font-mono text-[9px] tracking-[0.12em] uppercase mt-1" style={{ color: 'rgba(23,25,26,0.42)' }}>{s.area}</p>}
                      </div>
                      {s.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {s.tags.map(tag => (
                            <span key={tag} className="font-mono" style={{ fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 6px', border: '1px solid rgba(23,25,26,0.16)', color: 'rgba(23,25,26,0.50)' }}>{tag}</span>
                          ))}
                        </div>
                      )}
                      {s.bestTime && s.bestTime !== 'Any Time' && (
                        <p className="font-mono text-[9px] tracking-[0.12em] uppercase" style={{ color: 'rgba(23,25,26,0.50)' }}>Best: {s.bestTime}</p>
                      )}
                      {s.shotIdeas && <p style={{ fontSize: '11px', lineHeight: 1.6, color: 'rgba(23,25,26,0.60)' }}>{s.shotIdeas}</p>}
                      <button
                        onClick={() => handleSaveSuggestion(s, idx)}
                        disabled={isSaved}
                        className="font-mono text-[8px] tracking-[0.18em] uppercase mt-auto transition-colors"
                        style={{
                          padding: '8px 14px',
                          background: isSaved ? 'rgba(75,107,82,0.10)' : 'transparent',
                          border: isSaved ? '1px solid rgba(75,107,82,0.30)' : '1px solid rgba(23,25,26,0.18)',
                          color: isSaved ? '#3d5a44' : 'rgba(23,25,26,0.55)',
                          cursor: isSaved ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => { if (!isSaved) { e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#8a6b0f'; } }}
                        onMouseLeave={e => { if (!isSaved) { e.currentTarget.style.borderColor = 'rgba(23,25,26,0.18)'; e.currentTarget.style.color = 'rgba(23,25,26,0.55)'; } }}
                      >
                        {isSaved ? '✓ Saved' : '+ Save to Scout List'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter pills */}
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <FilterPill
            label={`All ${String(locations.length).padStart(2, '0')}`}
            active={!filterFavorites && filterTag === 'All'}
            onClick={() => { setFilterFavorites(false); setFilterTag('All'); }}
          />
          <FilterPill
            label={`★ Favorites ${String(favCount).padStart(2, '0')}`}
            active={filterFavorites}
            onClick={() => { setFilterFavorites(v => !v); setFilterTag('All'); }}
          />
          {SCOUT_TAGS.filter(t => locations.some(l => l.tags.includes(t))).map(tag => (
            <FilterPill
              /* key is passed via React, not as a prop */
              key={tag}
              label={`${tag} ${String(locations.filter(l => l.tags.includes(tag)).length).padStart(2, '0')}`}
              active={filterTag === tag}
              onClick={() => { setFilterTag(filterTag === tag ? 'All' : tag); setFilterFavorites(false); }}
            />
          ))}
        </div>
      )}

      {/* Location grid */}
      {locations.length === 0 ? (
        <div style={{ borderLeft: '2px solid #c9a227', paddingLeft: '16px', padding: '16px' }}>
          <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-2" style={{ color: '#c9a227' }}>No Locations Yet</p>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(23,25,26,0.60)' }}>
            Save spots you want to shoot — include tags, best time of day, lighting notes, and shot ideas so you can make a fast decision on location day.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ borderLeft: '2px solid rgba(23,25,26,0.18)', paddingLeft: '16px', padding: '12px 16px' }}>
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>No Locations Match</p>
          <button
            onClick={() => { setFilterFavorites(false); setFilterTag('All'); }}
            className="font-mono text-[8px] tracking-[0.14em] uppercase mt-2 transition-colors"
            style={{ color: '#c9a227', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filtered.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              onToggleFavorite={onToggleFavorite}
              onEdit={id => { setEditingId(id); setShowForm(false); }}
              onDelete={onDelete}
              onOpenAssignmentPicker={loc => { setPendingUseLocation(loc); setAttachSessionId(null); }}
              editingId={editingId}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      {/* Attach-to-session modal */}
      {pendingUseLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(23,25,26,0.50)' }}
          onClick={e => { if (e.target === e.currentTarget) { setPendingUseLocation(null); setAttachSessionId(null); } }}
        >
          <div style={{ background: '#f8f7f4', border: '1px solid rgba(23,25,26,0.20)', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-[9px] tracking-[0.22em] uppercase mb-1" style={{ color: 'rgba(23,25,26,0.40)' }}>Attach to Session</p>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#17191a' }}>{pendingUseLocation.name}</p>
              </div>
              <button
                onClick={() => { setPendingUseLocation(null); setAttachSessionId(null); }}
                className="font-mono text-[9px] tracking-[0.14em] uppercase transition-colors"
                style={{ color: 'rgba(23,25,26,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '2px' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.40)')}
              >
                × Close
              </button>
            </div>

            {sessions.length === 0 ? (
              <p className="font-mono text-[9px] tracking-[0.14em] uppercase py-6 text-center" style={{ color: 'rgba(23,25,26,0.35)' }}>
                No sessions yet. Add a session on the Dashboard first.
              </p>
            ) : (
              <div style={{ border: '1px solid rgba(23,25,26,0.12)', maxHeight: '220px', overflowY: 'auto', marginBottom: '18px' }}>
                {sessions.map(s => {
                  const isChosen = s.id === attachSessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setAttachSessionId(s.id)}
                      className="w-full flex items-center gap-3 text-left transition-colors"
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(23,25,26,0.08)',
                        background: isChosen ? 'rgba(201,162,39,0.07)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '12px', height: '12px', flexShrink: 0,
                        border: isChosen ? '1px solid #c9a227' : '1px solid rgba(23,25,26,0.25)',
                        background: isChosen ? '#c9a227' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isChosen && <span style={{ fontSize: '8px', color: '#17191a' }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-mono text-[9px] tracking-[0.12em] uppercase truncate" style={{ color: '#17191a' }}>
                          {s.title || s.location}
                        </p>
                        <p className="font-mono text-[8px] tracking-[0.10em] uppercase" style={{ color: 'rgba(23,25,26,0.40)' }}>
                          {s.date} · {s.genre.join(', ')} · {s.status}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                disabled={!attachSessionId}
                onClick={() => {
                  if (attachSessionId && onUseForAssignment) {
                    onUseForAssignment(pendingUseLocation, attachSessionId);
                    setPendingUseLocation(null);
                    setAttachSessionId(null);
                  }
                }}
                className="font-mono text-[9px] tracking-[0.18em] uppercase transition-colors"
                style={{
                  flex: 1, padding: '10px 0',
                  background: attachSessionId ? '#17191a' : 'rgba(23,25,26,0.08)',
                  border: attachSessionId ? '1px solid #17191a' : '1px solid rgba(23,25,26,0.14)',
                  color: attachSessionId ? '#f4f3ef' : 'rgba(23,25,26,0.30)',
                  cursor: attachSessionId ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={e => { if (attachSessionId) { e.currentTarget.style.background = '#c9a227'; e.currentTarget.style.borderColor = '#c9a227'; e.currentTarget.style.color = '#17191a'; } }}
                onMouseLeave={e => { if (attachSessionId) { e.currentTarget.style.background = '#17191a'; e.currentTarget.style.borderColor = '#17191a'; e.currentTarget.style.color = '#f4f3ef'; } }}
              >
                Add to Session
              </button>
              <button
                onClick={() => { setPendingUseLocation(null); setAttachSessionId(null); }}
                className="font-mono text-[9px] tracking-[0.14em] uppercase transition-colors px-5"
                style={{ color: 'rgba(23,25,26,0.50)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#17191a')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(23,25,26,0.50)')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationScoutView;

/**
 * LocationScoutView.tsx
 *
 * Assignment-first location scouting tool. Helps photographers save,
 * review, and choose shooting spots for class or professional assignments.
 *
 * Features:
 * - Add / edit / delete saved locations
 * - Select a saved session → AI suggests 3 tailored shooting locations
 * - Save any AI suggestion to the scout list (auto-linked to the session)
 * - Assignment-fit tags, best time of day, and full notes suite
 * - Favorite toggle and "Works well for…" helper label
 * - Search + filter by name, tag, time, favorites, and linked session
 * - "Use for assignment" stub (prop wired up, no-op in v1)
 * - 3 seed locations visible on first open
 */

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

/** Tags that benefit from low-light conditions. */
const LIGHT_TAGS: ScoutTag[] = ['Blue Hour', 'Golden Hour'];

/** Map tag → short helper blurb shown on each card. */
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

/** Derive a "Works well for…" label from the first 2 tags. */
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

// ── Shared form helpers ───────────────────────────────────────────────────────

function inputCls(dark?: boolean) {
  return dark
    ? 'w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-xs text-white focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-white/20'
    : 'w-full bg-brand-black/5 border border-brand-black/10 rounded-md px-4 py-3 text-xs text-brand-black focus:ring-1 focus:ring-brand-blue outline-none transition-all placeholder:text-brand-black/30';
}

function labelCls(dark?: boolean) {
  return `block text-[10px] font-semibold mb-1 uppercase tracking-wider ${dark ? 'text-white/40' : 'text-brand-gray/60'}`;
}

interface TagCheckboxProps {
  // key is required by React 19 + TS 5.5+ when used in lists
  key?: React.Key | null;
  tag: ScoutTag;
  selected: boolean;
  onToggle: () => void;
  dark?: boolean;
}
function TagCheckbox({ tag, selected, onToggle, dark }: TagCheckboxProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-all border ${
        selected
          ? 'bg-brand-blue text-white border-brand-blue'
          : dark
          ? 'bg-white/5 text-white/50 border-white/10 hover:border-white/30'
          : 'bg-brand-black/5 text-brand-gray border-brand-black/10 hover:border-brand-blue/40'
      }`}
    >
      {tag}
    </button>
  );
}

// ── Location form (add or edit) ───────────────────────────────────────────────

interface LocationFormProps {
  initial: Omit<ScoutLocation, 'id' | 'createdAt'>;
  onSubmit: (data: Omit<ScoutLocation, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  dark?: boolean;        // true = dark bg (add form), false = light bg (edit inline)
  submitLabel?: string;
}

function LocationForm({ initial, onSubmit, onCancel, dark = true, submitLabel = 'Save location' }: LocationFormProps) {
  const [form, setForm] = useState(initial);
  const [showNotes, setShowNotes] = useState(
    // Pre-open notes section if editing and has content
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row 1: name + area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls(dark)}>Location name *</label>
          <input
            className={inputCls(dark)}
            placeholder="e.g. City Hall Plaza"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls(dark)}>Neighborhood / area</label>
          <input
            className={inputCls(dark)}
            placeholder="e.g. Downtown, Midtown, Williamsburg"
            value={form.area}
            onChange={e => set('area', e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: map link + best time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls(dark)}>Address or map link</label>
          <input
            className={inputCls(dark)}
            placeholder="Full address or paste a Google Maps URL"
            value={form.mapLink}
            onChange={e => set('mapLink', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls(dark)}>Best time of day</label>
          <select
            className={inputCls(dark)}
            value={form.bestTime}
            onChange={e => set('bestTime', e.target.value as BestTimeOfDay)}
          >
            {BEST_TIMES.map(t => (
              <option key={t} value={t} className="text-brand-black">{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className={labelCls(dark)}>Assignment-fit tags</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SCOUT_TAGS.map(tag => (
            <TagCheckbox
              key={tag}
              tag={tag}
              selected={form.tags.includes(tag)}
              onToggle={() => toggleTag(tag)}
              dark={dark}
            />
          ))}
        </div>
      </div>

      {/* Extended notes — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors ${dark ? 'text-white/40 hover:text-white/70' : 'text-brand-gray/60 hover:text-brand-blue'}`}
        >
          <i className={`fa-solid fa-chevron-${showNotes ? 'up' : 'down'} text-[8px]`} />
          {showNotes ? 'Hide notes' : 'Add scouting notes (lighting, access, safety…)'}
        </button>

        {showNotes && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls(dark)}>Lighting notes</label>
                <textarea
                  className={`${inputCls(dark)} min-h-[72px]`}
                  placeholder="e.g. Direct sun hits the facade at 3 pm. Shade in the alley all morning."
                  value={form.lightingNotes}
                  onChange={e => set('lightingNotes', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls(dark)}>Shot ideas</label>
                <textarea
                  className={`${inputCls(dark)} min-h-[72px]`}
                  placeholder="e.g. Wide establishing, tight detail of the columns, reflection in the fountain"
                  value={form.shotIdeas}
                  onChange={e => set('shotIdeas', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls(dark)}>Access / permit notes</label>
                <textarea
                  className={`${inputCls(dark)} min-h-[60px]`}
                  placeholder="e.g. Public space, no permit needed. Security may ask for ID after 8 pm."
                  value={form.accessNotes}
                  onChange={e => set('accessNotes', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls(dark)}>Safety notes</label>
                <textarea
                  className={`${inputCls(dark)} min-h-[60px]`}
                  placeholder="e.g. Well-lit at night. Avoid the south side of the park after dark."
                  value={form.safetyNotes}
                  onChange={e => set('safetyNotes', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls(dark)}>Parking / walking</label>
                <textarea
                  className={`${inputCls(dark)} min-h-[60px]`}
                  placeholder="e.g. Free street parking on Oak St. 5-min walk from Metro stop B."
                  value={form.parkingNotes}
                  onChange={e => set('parkingNotes', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls(dark)}>Backup nearby spot</label>
                <input
                  className={inputCls(dark)}
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
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-brand-blue hover:bg-[#7a93a0] text-white text-sm font-semibold rounded-md py-3 px-8 transition-all active:scale-95 shadow-md"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`text-sm font-medium py-3 px-6 rounded-md transition-colors ${dark ? 'text-white/50 hover:text-white/80' : 'text-brand-gray hover:text-brand-black'}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Location card ─────────────────────────────────────────────────────────────

interface LocationCardProps {
  key?: React.Key | null;
  location: ScoutLocation;
  onToggleFavorite: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onUseForAssignment?: (location: ScoutLocation) => void;
  editingId: string | null;
  onSaveEdit: (id: string, data: Omit<ScoutLocation, 'id' | 'createdAt'>) => void;
  onCancelEdit: () => void;
}

function LocationCard({
  location,
  onToggleFavorite,
  onEdit,
  onDelete,
  onUseForAssignment,
  editingId,
  onSaveEdit,
  onCancelEdit,
}: LocationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditing = editingId === location.id;
  const helper = worksWellFor(location.tags);

  const hasNotes = !!(
    location.lightingNotes ||
    location.accessNotes ||
    location.safetyNotes ||
    location.parkingNotes ||
    location.shotIdeas ||
    location.backupSpot
  );

  const mapIsUrl = location.mapLink.startsWith('http');

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg border border-brand-blue/20 p-6 shadow-md">
        <h3 className="text-xs font-semibold text-brand-blue mb-5 uppercase tracking-wider">Editing: {location.name}</h3>
        <LocationForm
          dark={false}
          initial={{
            name:         location.name,
            area:         location.area,
            mapLink:      location.mapLink,
            tags:         location.tags,
            bestTime:     location.bestTime,
            lightingNotes: location.lightingNotes,
            accessNotes:  location.accessNotes,
            safetyNotes:  location.safetyNotes,
            parkingNotes: location.parkingNotes,
            shotIdeas:    location.shotIdeas,
            backupSpot:   location.backupSpot,
            favorite:     location.favorite,
          }}
          onSubmit={data => onSaveEdit(location.id, data)}
          onCancel={onCancelEdit}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md ${location.favorite ? 'border-brand-rose/30' : 'border-brand-black/5'}`}>
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-brand-black leading-snug">{location.name}</h3>
              {location.favorite && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-brand-rose bg-brand-rose/10 px-1.5 py-0.5 rounded">
                  Favorite
                </span>
              )}
            </div>
            {location.area && (
              <p className="text-xs text-brand-gray mt-0.5">{location.area}</p>
            )}
          </div>
          {/* Favorite star */}
          <button
            onClick={() => onToggleFavorite(location.id)}
            className={`transition-colors flex-shrink-0 mt-0.5 ${location.favorite ? 'text-brand-rose' : 'text-brand-black/15 hover:text-brand-rose/60'}`}
            title={location.favorite ? 'Remove from favorites' : 'Mark as favorite'}
          >
            <i className={`fa-${location.favorite ? 'solid' : 'regular'} fa-heart text-sm`} />
          </button>
        </div>

        {/* Map link */}
        {location.mapLink && (
          <div className="mt-2.5">
            {mapIsUrl ? (
              <a
                href={location.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-brand-blue hover:underline flex items-center gap-1.5 w-fit"
              >
                <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" />
                Open in Maps
              </a>
            ) : (
              <p className="text-[11px] text-brand-gray/80 flex items-start gap-1.5">
                <i className="fa-solid fa-location-dot text-[9px] mt-0.5 flex-shrink-0" />
                {location.mapLink}
              </p>
            )}
          </div>
        )}

        {/* Tags */}
        {location.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {location.tags.map(tag => (
              <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-blue/8 text-brand-blue border border-brand-blue/10">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Best time badge */}
        {location.bestTime && location.bestTime !== 'Any Time' && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <i className="fa-regular fa-clock text-[10px] text-brand-gray/50" />
            <span className="text-[11px] text-brand-gray font-medium">{location.bestTime}</span>
          </div>
        )}

        {/* Works well for */}
        {helper && (
          <p className="mt-2.5 text-[11px] text-brand-gray/70 italic leading-snug">
            Works well for: {helper}
          </p>
        )}
      </div>

      {/* Expanded notes */}
      {expanded && hasNotes && (
        <div className="px-5 pb-4 space-y-3 border-t border-brand-black/5 pt-4">
          {location.shotIdeas && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Shot ideas</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.shotIdeas}</p>
            </div>
          )}
          {location.lightingNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Lighting</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.lightingNotes}</p>
            </div>
          )}
          {location.accessNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Access / permit</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.accessNotes}</p>
            </div>
          )}
          {location.safetyNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Safety</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.safetyNotes}</p>
            </div>
          )}
          {location.parkingNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Parking / walking</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.parkingNotes}</p>
            </div>
          )}
          {location.backupSpot && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gray/50 mb-1">Backup spot</p>
              <p className="text-xs text-brand-black/80 leading-relaxed">{location.backupSpot}</p>
            </div>
          )}
        </div>
      )}

      {/* Card footer */}
      <div className="px-5 py-3 border-t border-brand-black/5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          {hasNotes && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[11px] font-medium text-brand-blue hover:text-brand-black transition-colors flex items-center gap-1"
            >
              <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[8px]`} />
              {expanded ? 'Less' : 'Notes'}
            </button>
          )}
          <button
            onClick={() => onEdit(location.id)}
            className="text-[11px] font-medium text-brand-gray hover:text-brand-black transition-colors"
          >
            Edit
          </button>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-[11px] font-medium text-brand-gray hover:text-brand-rose transition-colors"
            >
              Delete
            </button>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-brand-rose font-medium">Remove?</span>
              <button
                onClick={() => onDelete(location.id)}
                className="text-[11px] font-semibold text-brand-rose hover:text-red-700 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-[11px] font-medium text-brand-gray hover:text-brand-black transition-colors"
              >
                No
              </button>
            </span>
          )}
        </div>
        {/* "Use for assignment" stub */}
        {onUseForAssignment && (
          <button
            onClick={() => onUseForAssignment(location)}
            className="text-[11px] font-semibold text-brand-blue hover:text-brand-black border border-brand-blue/20 hover:border-brand-blue/60 rounded px-2.5 py-1 transition-all"
            title="Coming in v2 — will attach this location to an assignment"
          >
            <i className="fa-solid fa-bolt text-[9px] mr-1" />
            Use for assignment
          </button>
        )}
      </div>
    </div>
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
  /** Optional — stub that can later navigate to Assignment Planner with a pre-filled location */
  onUseForAssignment?: (location: ScoutLocation) => void;
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

  // ── Session-based AI suggestions ────────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ScoutLocationSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [savedSuggestionIndexes, setSavedSuggestionIndexes] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<ScoutTag | 'All'>('All');
  const [filterTime, setFilterTime] = useState<BestTimeOfDay | 'All'>('All');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterSessionId, setFilterSessionId] = useState<string | 'All'>('All');

  // ── Session selector helpers ──────────────────────────────────────────────

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;

  const handleSelectSession = (id: string) => {
    if (id === selectedSessionId) {
      // Clicking the same session deselects it
      setSelectedSessionId(null);
      setSuggestions([]);
      setSuggestionError(null);
      setSavedSuggestionIndexes(new Set());
    } else {
      setSelectedSessionId(id);
      setSuggestions([]);
      setSuggestionError(null);
      setSavedSuggestionIndexes(new Set());
    }
  };

  const handleSuggest = async () => {
    if (!selectedSession) return;
    setIsSuggesting(true);
    setSuggestions([]);
    setSuggestionError(null);
    setSavedSuggestionIndexes(new Set());

    const context =
      `Date: ${selectedSession.date}\n` +
      `Location/area: ${selectedSession.location}\n` +
      `Genre: ${selectedSession.genre.join(', ')}\n` +
      `Assignment status: ${selectedSession.status}\n` +
      (selectedSession.title ? `Title: ${selectedSession.title}\n` : '') +
      (selectedSession.notes ? `Notes: ${selectedSession.notes}\n` : '');

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
      sessionId:     selectedSessionId ?? undefined,
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

  // ── CRUD handlers ─────────────────────────────────────────────────────────

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

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return locations.filter(loc => {
      const matchSearch =
        !q ||
        loc.name.toLowerCase().includes(q) ||
        loc.area.toLowerCase().includes(q) ||
        loc.tags.some(t => t.toLowerCase().includes(q));

      const matchTag     = filterTag      === 'All' || loc.tags.includes(filterTag);
      const matchTime    = filterTime     === 'All' || loc.bestTime === filterTime;
      const matchFav     = !filterFavorites          || loc.favorite;
      const matchSession = filterSessionId === 'All' || loc.sessionId === filterSessionId;

      return matchSearch && matchTag && matchTime && matchFav && matchSession;
    });
  }, [locations, searchQuery, filterTag, filterTime, filterFavorites, filterSessionId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-700">
      {/* Header */}
      <header className="mb-10 flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-brand-black tracking-wide">LOCATION SCOUT</h2>
          <p className="text-brand-gray mt-2 text-sm font-medium">
            Save and review shooting spots for your assignments.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setEditingId(null); }}
          className={`flex items-center gap-2 text-sm font-semibold rounded-md py-2.5 px-5 transition-all active:scale-95 shadow-sm ${
            showForm
              ? 'bg-brand-black/10 text-brand-black hover:bg-brand-black/15'
              : 'bg-brand-blue text-white hover:bg-[#7a93a0]'
          }`}
        >
          <i className={`fa-solid fa-${showForm ? 'xmark' : 'plus'} text-sm`} />
          {showForm ? 'Cancel' : 'Add location'}
        </button>
      </header>

      {/* Add form */}
      {showForm && (
        <section className="bg-brand-black rounded-lg p-7 text-brand-white mb-10 shadow-xl border border-white/5">
          <h3 className="text-xs font-semibold text-brand-rose mb-6 uppercase tracking-wider">
            New scouting location
          </h3>
          <LocationForm
            dark
            initial={BLANK_FORM}
            onSubmit={handleAdd}
            onCancel={() => setShowForm(false)}
            submitLabel="Save location"
          />
        </section>
      )}

      {/* ── Session-based location suggestions ─────────────────────────── */}
      {sessions.length > 0 && (
        <section className="mb-10">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-black/40 mb-4">
            Scout for a session
          </h3>

          {/* Session list — single-select */}
          <div className="border border-brand-black/5 rounded-sm bg-white/50 max-h-52 overflow-y-auto custom-scrollbar mb-4">
            <div className="divide-y divide-brand-black/5">
              {sessions.map(session => {
                const isSelected = session.id === selectedSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={`w-full flex items-center gap-4 px-5 py-3 transition-all hover:bg-brand-black/5 text-left group ${isSelected ? 'bg-brand-blue/5' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded-full border transition-all flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-brand-blue border-brand-blue' : 'border-brand-black/20 bg-white group-hover:border-brand-blue/50'
                    }`}>
                      {isSelected && <i className="fa-solid fa-check text-[8px] text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-brand-black truncate">
                          {session.title ? session.title.toUpperCase() : session.name.split('_').slice(1).join(' ').toUpperCase() || session.name.toUpperCase()}
                        </span>
                        <span className="text-[8px] text-brand-gray font-bold tracking-tighter">{session.date}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-brand-gray/60 text-[9px] font-medium truncate uppercase tracking-widest">
                        <span>{session.location}</span>
                        <span className="text-brand-black/10">•</span>
                        <span>{session.genre.join(', ')}</span>
                      </div>
                    </div>
                    <div className={`text-[10px] transition-colors flex-shrink-0 ${isSelected ? 'text-brand-blue' : 'text-brand-gray/30'}`}>
                      {GENRE_ICONS[session.genre[0]]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Suggest button */}
          {selectedSession && (
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleSuggest}
                disabled={isSuggesting}
                className={`flex items-center gap-2 text-sm font-semibold rounded-md py-2.5 px-6 transition-all active:scale-95 shadow-sm ${
                  isSuggesting
                    ? 'bg-brand-black/10 text-brand-black/40 cursor-not-allowed'
                    : 'bg-brand-blue text-white hover:bg-[#7a93a0]'
                }`}
              >
                {isSuggesting ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-sm" />
                    Scouting locations…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-wand-sparkles text-sm" />
                    Suggest locations for this session
                  </>
                )}
              </button>
              <p className="text-[11px] text-brand-gray/60 italic">
                AI will suggest 3 shooting spots based on{' '}
                <span className="font-semibold text-brand-black/60 not-italic">
                  {selectedSession.title || selectedSession.location} ({selectedSession.genre.join(', ')})
                </span>
              </p>
            </div>
          )}

          {/* Error */}
          {suggestionError && (
            <p className="mt-3 text-xs text-brand-rose">{suggestionError}</p>
          )}

          {/* Suggestion cards */}
          {suggestions.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-brand-blue/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-blue/60">
                  AI suggestions for {selectedSession?.title || selectedSession?.location}
                </span>
                <div className="h-px flex-1 bg-brand-blue/10" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {suggestions.map((s, idx) => {
                  const isSaved = savedSuggestionIndexes.has(idx);
                  const helper = worksWellFor(s.tags as ScoutTag[]);
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-5 transition-all ${
                        isSaved
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-brand-blue/3 border-brand-blue/15 hover:border-brand-blue/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="text-sm font-semibold text-brand-black leading-snug">{s.name}</h4>
                          {s.area && <p className="text-[11px] text-brand-gray mt-0.5">{s.area}</p>}
                        </div>
                        {isSaved && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            Saved
                          </span>
                        )}
                      </div>

                      {s.mapLink && (
                        <p className="text-[11px] text-brand-gray/70 flex items-start gap-1 mb-2">
                          <i className="fa-solid fa-location-dot text-[9px] mt-0.5 flex-shrink-0" />
                          {s.mapLink}
                        </p>
                      )}

                      {s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {s.tags.map(tag => (
                            <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue border border-brand-blue/10">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {s.bestTime && s.bestTime !== 'Any Time' && (
                        <p className="text-[11px] text-brand-gray flex items-center gap-1 mb-1">
                          <i className="fa-regular fa-clock text-[9px]" />
                          {s.bestTime}
                        </p>
                      )}

                      {helper && (
                        <p className="text-[10px] text-brand-gray/60 italic mb-3 leading-snug">Works well for: {helper}</p>
                      )}

                      {s.shotIdeas && (
                        <p className="text-[11px] text-brand-black/70 leading-relaxed mb-3 line-clamp-3">{s.shotIdeas}</p>
                      )}

                      <button
                        onClick={() => handleSaveSuggestion(s, idx)}
                        disabled={isSaved}
                        className={`w-full mt-auto text-xs font-semibold py-2 rounded transition-all ${
                          isSaved
                            ? 'bg-emerald-100 text-emerald-600 cursor-default'
                            : 'bg-brand-blue text-white hover:bg-[#7a93a0] active:scale-95'
                        }`}
                      >
                        {isSaved ? (
                          <><i className="fa-solid fa-check mr-1.5" />Saved to scout list</>
                        ) : (
                          <><i className="fa-solid fa-plus mr-1.5" />Save to scout list</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Search + filter bar */}
      {locations.length > 0 && (
        <div className="mb-7 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray/40 text-[11px]" />
            <input
              type="search"
              placeholder="Search by name or area…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2.5 text-xs bg-white border border-brand-black/10 rounded-md focus:ring-1 focus:ring-brand-blue outline-none"
            />
          </div>

          {/* Tag filter */}
          <select
            value={filterTag}
            onChange={e => setFilterTag(e.target.value as ScoutTag | 'All')}
            className="text-xs bg-white border border-brand-black/10 rounded-md px-3 py-2.5 focus:ring-1 focus:ring-brand-blue outline-none text-brand-black"
          >
            <option value="All">All tags</option>
            {SCOUT_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Time filter */}
          <select
            value={filterTime}
            onChange={e => setFilterTime(e.target.value as BestTimeOfDay | 'All')}
            className="text-xs bg-white border border-brand-black/10 rounded-md px-3 py-2.5 focus:ring-1 focus:ring-brand-blue outline-none text-brand-black"
          >
            <option value="All">Any time</option>
            {BEST_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Favorites toggle */}
          <button
            onClick={() => setFilterFavorites(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-md border transition-all ${
              filterFavorites
                ? 'bg-brand-rose/10 border-brand-rose/30 text-brand-rose'
                : 'bg-white border-brand-black/10 text-brand-gray hover:border-brand-rose/30'
            }`}
          >
            <i className={`fa-${filterFavorites ? 'solid' : 'regular'} fa-heart text-[11px]`} />
            Favorites
          </button>

          {/* Session filter — only shown when there are locations linked to sessions */}
          {locations.some(l => l.sessionId) && (
            <select
              value={filterSessionId}
              onChange={e => setFilterSessionId(e.target.value)}
              className="text-xs bg-white border border-brand-black/10 rounded-md px-3 py-2.5 focus:ring-1 focus:ring-brand-blue outline-none text-brand-black"
            >
              <option value="All">All sessions</option>
              {sessions
                .filter(s => locations.some(l => l.sessionId === s.id))
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.location} ({s.date})
                  </option>
                ))}
            </select>
          )}

          {/* Result count */}
          {(searchQuery || filterTag !== 'All' || filterTime !== 'All' || filterFavorites || filterSessionId !== 'All') && (
            <span className="text-xs text-brand-gray/60 font-medium ml-1">
              {filtered.length} of {locations.length}
            </span>
          )}
        </div>
      )}

      {/* Location cards */}
      {locations.length === 0 ? (
        /* Empty state */
        <div className="py-24 text-center border border-dashed border-brand-gray/20 rounded-lg">
          <i className="fa-solid fa-map-pin text-3xl text-brand-gray/20 mb-4 block" />
          <p className="text-brand-black font-semibold text-sm mb-1">No locations scouted yet</p>
          <p className="text-brand-gray text-xs max-w-sm mx-auto leading-relaxed">
            Save spots you want to shoot for an assignment — include tags, best time of day,
            lighting notes, and shot ideas so you can make a fast decision on location day.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-6 bg-brand-blue text-white text-sm font-semibold rounded-md py-2.5 px-6 hover:bg-[#7a93a0] transition-all active:scale-95"
          >
            Add your first location
          </button>
        </div>
      ) : filtered.length === 0 ? (
        /* No filter results */
        <div className="py-16 text-center border border-dashed border-brand-gray/20 rounded-lg">
          <p className="text-brand-gray text-xs">No locations match your current filters.</p>
          <button
            onClick={() => { setSearchQuery(''); setFilterTag('All'); setFilterTime('All'); setFilterFavorites(false); setFilterSessionId('All'); }}
            className="mt-3 text-xs text-brand-blue hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              onToggleFavorite={onToggleFavorite}
              onEdit={id => { setEditingId(id); setShowForm(false); }}
              onDelete={onDelete}
              onUseForAssignment={onUseForAssignment}
              editingId={editingId}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationScoutView;

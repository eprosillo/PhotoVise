
export type Genre =
  | 'Street'
  | 'Sports'
  | 'Photojournalism'
  | 'Portrait'
  | 'Wedding'
  | 'Event'
  | 'Landscape'
  | 'Architecture'
  | 'Documentary'
  | 'Commercial'
  | 'Editorial'
  | 'Fashion'
  | 'Product'
  | 'Food'
  | 'Still Life'
  | 'Wildlife'
  | 'Macro'
  | 'Astro'
  | 'Travel'
  | 'Other';

export type SessionStatus = 'capturing' | 'shot' | 'culled' | 'edited' | 'backed up' | 'posted' | 'archived';

export interface WeekPlan {
  id: string;
  weekOf: string;          // YYYY-MM-DD of Monday of the planned week
  weekLabel: string;       // e.g. "Apr 7 – Apr 13, 2026"
  sessionTitles: string[]; // for display in the pin card
  result: string;          // generated plan text
  createdAt: number;
}

export interface Session {
  id: string;
  date: string;
  location: string;
  genre: Genre[];
  status: SessionStatus;
  name: string;
  title?: string;
  notes: string;
  strategy?: string;
  dayPlan?: string;
}

export type GearCategory = 'Body' | 'Lens' | 'Flash' | 'Modifier' | 'Support' | 'Accessory';

export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  details?: string;
  tags?: string[];
  available: boolean;
}

export type CfeType = 'Competition' | 'Grant' | 'Fellowship' | 'Residency' | 'Open Call' | 'Call for Entry' | 'Portfolio Review' | 'Festival' | 'Event';

export type BulletinStatus = 'unmarked' | 'considering' | 'applied' | 'archived';

export type BulletinRegion = 'Global' | 'US' | 'Europe' | 'Asia' | 'Latin America' | 'Africa' | 'Other';

export type BulletinPriority = 'high' | 'medium' | 'low';

export interface CfeBulletinItem {
  id: string;
  name: string;
  organizer?: string;
  type: CfeType;
  url: string;
  location?: string;
  deadline?: string; 
  genres?: string[];
  blurb?: string;
  fee?: string;
  status: BulletinStatus;
  region: BulletinRegion;
  priority: BulletinPriority;
}

export interface PhotoQuote {
  text: string;
  author: string;
}

export interface WorkflowPlan {
  overview: string;
  shootPlan: string;
  editSessionA: string;
  editSessionB: string;
  pjNotes: string;
  improvement: string;
  nextStep: string;
}

export interface AssignmentPhase {
  timeframe: string;
  label: string;
  tasks: string[];
}

export interface JournalImage {
  id: string;
  name: string;
  dataUrl: string; // base64 data URL
}

export interface JournalEntry {
  id: string;
  date: string;            // ISO date
  sessionIds: string[];    // related Session ids
  title: string;
  notes: string;           // reflection
  tags: string[];          // e.g. ["lighting win", "composition"]
  resultRating?: number;   // 1–5
  processRating?: number;  // 1–5
  images: JournalImage[];
}

export type EditingApp =
  | 'Lightroom Classic'
  | 'Lightroom (Cloud)'
  | 'Photoshop'
  | 'Capture One Pro'
  | 'Affinity Photo'
  | 'DxO PhotoLab'
  | 'ON1 Photo RAW'
  | 'Luminar Neo'
  | 'Apple Photos'
  | 'Windows Photos'
  | 'Other';

export type TetheringApp =
  | 'Capture One (Tethering)'
  | 'Lightroom Classic (Tethering)'
  | 'Canon EOS Utility'
  | 'Nikon Camera Control'
  | 'CamRanger'
  | 'Honcho'
  | 'None'
  | 'Other';

export interface PhotographerProfile {
  name: string;
  yearsShooting: string;
  primaryGenres: Genre[];
  typicalWork: string;
  styleKeywords: string[];
  riskProfile: 'cautious' | 'balanced' | 'experimental';
  strengths: string;
  struggles: string;
  physicalConstraints: string;
  accessReality: string;
  timeBudget: string;
  growthGoals: string;
  editingApps: EditingApp[];
  tetheringApps: TetheringApp[];
  otherEditingAppNote?: string;
  otherTetheringAppNote?: string;
  otherGenreNote?: string;
}

export interface FeedbackEntry {
  id: string;
  section: 'Processing Guides' | 'Ask a Pro';
  note: string;
  createdAt: string; // ISO string
}

export type AssignmentTimeframe = '30min' | '1hr' | '2hr' | '4hr' | 'fullday';

# PhotoVise — Claude Code Project Context

## What this project is
PhotoVise is a React + TypeScript web app for photographers. It helps users plan assignments, manage sessions, journal their work, and get AI-powered guidance. Built with Vite, Firebase (Auth, Firestore, Storage), and Tailwind CSS. Deployed to GitHub Pages.

## Tech stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Firebase Auth, Firestore, Firebase Storage, Firebase Cloud Functions
- **AI:** Google Gemini API (via `services/geminiService.ts`)
- **Deploy:** GitHub Pages via `gh-pages` branch

## Key files
| File | Purpose |
|---|---|
| `App.tsx` | Main app — all tabs, state, AI prompt logic |
| `types.ts` | All TypeScript types (SessionStatus, Genre, etc.) |
| `constants.tsx` | Genre icons and shared constants |
| `quotes.ts` | Daily inspiration quote pool |
| `firebase.ts` | Firebase init — exports `auth`, `db`, `storage` |
| `storage.rules` | Firebase Storage security rules |
| `components/Layout.tsx` | Sidebar nav, mobile nav, feedback button |
| `components/SessionCard.tsx` | Session progress stepper and edit form |
| `components/CalendarView.tsx` | Calendar grid and week planner |
| `components/FeedbackModal.tsx` | In-app feedback form (Firestore + Storage) |
| `services/geminiService.ts` | All Gemini API calls |
| `hooks/useFirestore.ts` | Firestore read/write hook |

## AI features and where their prompts live
All prompt instructions are defined inline inside `App.tsx`:

| Feature | Function | Location in App.tsx |
|---|---|---|
| **Assignment Planner** | `handleGeneratePlan()` | Search `handleGeneratePlan` |
| **Assignment Mode** | `handleGenerateAssignment()` | Search `handleGenerateAssignment` |
| **Ask a Pro** | `buildAskProPrompt()` | Search `buildAskProPrompt` |
| **Week Planner** | `generateWeeklyPlan()` | Search `handleSaveWeekPlan` |

## Session progress stages (in order)
`capturing` → `shot` → `culled` → `edited` → `backed up` → `posted` → `archived`

## Deploy workflow
```bash
# Build and deploy to GitHub Pages
npm run build && touch dist/.nojekyll && npx gh-pages -d dist --repo git@github.com:eprosillo/PhotoVise.git --dotfiles

# Deploy Firebase Storage rules only
npx firebase-tools deploy --only storage

# Type check before committing
npx tsc --noEmit
```

## Git workflow
- Branch: `main`
- Remote: `git@github.com:eprosillo/PhotoVise.git`
- Always type-check before committing: `npx tsc --noEmit`
- Commit, push, then deploy — in that order

## Firebase project
- Project ID: `pingstudio-backend`
- Firestore collections: `users/{uid}`, `feedback`
- Storage paths: `journal/{uid}/{imageId}`, `feedback/{submissionId}/{fileName}`

## Colour tokens (Tailwind)
| Token | Use |
|---|---|
| `brand-black` | Primary dark / backgrounds |
| `brand-rose` | Accent / actions |
| `brand-blue` | Secondary accent / info |
| `brand-gray` | Muted text |
| `brand-white` | Light backgrounds |

## Common tasks
- **Add a new session status:** update `types.ts` → `SessionCard.tsx` → `App.tsx` → `CalendarView.tsx`
- **Change an AI prompt:** find the relevant function in `App.tsx` (see table above)
- **Add a new component:** create in `components/`, import in `App.tsx` or `Layout.tsx`
- **Update Storage rules:** edit `storage.rules`, then run `npx firebase-tools deploy --only storage`
- **Update Firestore rules:** edit in Firebase Console → Firestore → Rules tab

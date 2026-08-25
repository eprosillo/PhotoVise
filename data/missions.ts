import { Mission } from '../types';

export const MISSIONS: Mission[] = [
  // ── COMPOSITION ────────────────────────────────────────────────────────────
  {
    id: 'comp-01',
    title: 'Leading Lines',
    promptDetail: 'Find a strong leading line — road, fence, shadow, railing, or edge — and build a composition where it pulls the eye through the frame toward a subject.',
    tip: 'The line needs somewhere to go. Place your subject at the end of the lead, not floating beside it.',
    genre: 'Street',
    skillNode: 'Composition',
    timeBoxMinutes: 15,
    difficulty: 1,
  },
  {
    id: 'comp-02',
    title: 'Frame Within a Frame',
    promptDetail: 'Find a natural frame — doorway, arch, window, gap between structures — and shoot your subject through it.',
    tip: 'Let the outer frame go dark or slightly out of focus. The eye should move inward, not rest on the frame itself.',
    genre: 'Street',
    skillNode: 'Composition',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'comp-03',
    title: 'Negative Space',
    promptDetail: 'Give your subject room to breathe. Fill at least 60% of the frame with sky, wall, or open ground and let the subject exist in the remaining space.',
    tip: 'The direction the subject faces or moves into the space matters — leave room in the direction of gaze or motion.',
    genre: 'Street',
    skillNode: 'Composition',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'comp-04',
    title: 'Layers',
    promptDetail: 'Build a shot with foreground, midground, and background all contributing to the story. No layer should be accidental.',
    tip: 'Shoot from low or use a longer focal length to compress and stack the layers. Moving a few feet changes all three at once.',
    genre: 'Street',
    skillNode: 'Composition',
    timeBoxMinutes: 20,
    difficulty: 3,
  },
  {
    id: 'comp-05',
    title: 'Diagonal Energy',
    promptDetail: 'Capture a moment where the body position, motion, or environment creates a strong diagonal line across the frame.',
    tip: 'A diagonal implies motion and energy. A horizontal line implies rest. Choose which energy your scene actually has.',
    genre: 'Sports',
    skillNode: 'Composition',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'comp-06',
    title: 'Fill the Frame',
    promptDetail: 'Get close enough that your subject fills 80% or more of the frame. No dead corners, no wasted edges.',
    tip: 'Move your feet before you zoom. Physical closeness to a subject reads differently than optical compression.',
    genre: 'Sports',
    skillNode: 'Composition',
    timeBoxMinutes: 10,
    difficulty: 1,
  },
  {
    id: 'comp-07',
    title: 'Pattern Break',
    promptDetail: 'Find a repeating geometric pattern — tiles, windows, seats, uniforms — and photograph the single element that breaks it.',
    tip: 'Find the disruption before you raise the camera. The break is the subject; the pattern is the context.',
    genre: 'Any',
    skillNode: 'Composition',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'comp-08',
    title: 'Dead Center',
    promptDetail: 'Place your subject dead center and make it work without relying on the rule of thirds. Use symmetry, strong foreground, or pure graphic impact.',
    tip: 'Central composition demands a clean background or perfect symmetry. Check all four corners before you shoot.',
    genre: 'Street',
    skillNode: 'Composition',
    timeBoxMinutes: 10,
    difficulty: 2,
  },

  // ── LIGHT ──────────────────────────────────────────────────────────────────
  {
    id: 'light-01',
    title: 'Chasing Shadows',
    promptDetail: 'The shadows are the subject. Find a strong shadow pattern cast by architecture, trees, or a crowd and build your composition around it.',
    tip: 'Shadows shift every few minutes. Pick your spot, set your frame, and wait for a subject to pass through the right zone.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 15,
    difficulty: 1,
  },
  {
    id: 'light-02',
    title: 'Backlight Silhouette',
    promptDetail: 'Position your subject between you and the primary light source. Expose for the background and let the subject go dark.',
    tip: 'The silhouette must be readable — profile, action pose, or clear gesture. An ambiguous blob is not a silhouette.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'light-03',
    title: 'Single Source Light',
    promptDetail: 'Find a subject lit by one clear source — a window, a doorway, a lamp — and use that quality of light intentionally.',
    tip: 'One light source is cleaner than three. Turn or position the subject until the shadow falls where you want it, not where it lands.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 10,
    difficulty: 1,
  },
  {
    id: 'light-04',
    title: 'High Contrast Alley',
    promptDetail: 'Find a narrow passage or gap where direct light creates sharp blocks of light and shadow. Use that contrast as the graphic structure of the frame.',
    tip: 'Expose for the highlights. Let the shadows go black. Wait for a subject to enter the lit zone.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 20,
    difficulty: 3,
  },
  {
    id: 'light-05',
    title: 'Overcast Advantage',
    promptDetail: 'Work in flat, overcast light and shift your focus to color, expression, and story instead of dramatic lighting.',
    tip: 'Overcast is soft portrait light. Skin reads cleanly, no squinting, no blocked shadows. Let it work for you instead of waiting for sun.',
    genre: 'Sports',
    skillNode: 'Light',
    timeBoxMinutes: 10,
    difficulty: 1,
  },
  {
    id: 'light-06',
    title: 'Golden Hour Street',
    promptDetail: 'Shoot in the last 30 minutes before sunset. Let warm backlight define the scene and look for subjects walking into or across the light.',
    tip: 'Meter for the highlights. Let shadows go deep. Do not try to expose for both the backlit subject and the sky — pick one.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'light-07',
    title: 'Dappled Light',
    promptDetail: 'Find light filtering through trees, slatted structures, or venetian blinds and use the pattern it casts as a compositional element.',
    tip: 'The pattern only works if your subject is correctly placed — either fully in a lit zone or deliberately split by the pattern.',
    genre: 'Street',
    skillNode: 'Light',
    timeBoxMinutes: 15,
    difficulty: 2,
  },

  // ── TIMING ─────────────────────────────────────────────────────────────────
  {
    id: 'timing-01',
    title: 'Peak Action',
    promptDetail: 'Capture the peak moment of athletic motion — the apex of a jump, the full extension of a throw, the split second of maximum effort.',
    tip: 'Anticipate, don\'t react. Pre-focus on where the action will peak, not where it is now. Shoot a half-second early.',
    genre: 'Sports',
    skillNode: 'Timing',
    timeBoxMinutes: 20,
    difficulty: 3,
  },
  {
    id: 'timing-02',
    title: 'Pre-Focus Wait',
    promptDetail: 'Choose your background and your composition first. Set your focus on a fixed point. Then wait for the right subject to walk into frame.',
    tip: 'Zone focusing or hyperfocal distance lets you shoot without looking through the viewfinder. Practice this until it is muscle memory.',
    genre: 'Street',
    skillNode: 'Timing',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'timing-03',
    title: 'Burst to One',
    promptDetail: 'Shoot a full burst through a single action sequence — a sprint, a jump, a tackle. Then cull immediately to exactly one frame.',
    tip: 'The strongest frame is almost never the first or last of the burst. Look for peak body position, peak expression, peak clarity.',
    genre: 'Sports',
    skillNode: 'Timing',
    timeBoxMinutes: 15,
    difficulty: 1,
  },
  {
    id: 'timing-04',
    title: 'Decisive Moment',
    promptDetail: 'Work one scene for the full time box. Do not move on. Wait for the single moment when all elements — subject, light, background — align.',
    tip: 'Stay put longer than feels comfortable. Most photographers leave one minute before the scene gives them the shot.',
    genre: 'Street',
    skillNode: 'Timing',
    timeBoxMinutes: 20,
    difficulty: 3,
  },
  {
    id: 'timing-05',
    title: 'Intentional Motion Blur',
    promptDetail: 'Use a slow shutter (1/30 or slower) to show motion in the frame. Keep at least one element sharp — either the subject or the background.',
    tip: 'Pan with a moving subject for a sharp subject on a blurred background. Or stay still with a slow shutter to show a busy environment in motion.',
    genre: 'Street',
    skillNode: 'Timing',
    timeBoxMinutes: 15,
    difficulty: 2,
  },

  // ── MOMENT ─────────────────────────────────────────────────────────────────
  {
    id: 'moment-01',
    title: 'Unguarded Expression',
    promptDetail: 'Capture a genuine, unposed emotional moment — joy, frustration, concentration, surprise. It must be real.',
    tip: 'Shoot from enough distance that people forget you are there, or from the hip. The moment disappears the second someone knows they are being photographed.',
    genre: 'Street',
    skillNode: 'Moment',
    timeBoxMinutes: 20,
    difficulty: 3,
  },
  {
    id: 'moment-02',
    title: 'The Interaction',
    promptDetail: 'Find two or more people interacting and capture the dynamic between them — not just the individuals.',
    tip: 'The connection between subjects is the subject. Body language, eye contact, and proximity tell the story more than faces alone.',
    genre: 'Photojournalism',
    skillNode: 'Moment',
    timeBoxMinutes: 20,
    difficulty: 2,
  },
  {
    id: 'moment-03',
    title: 'Athlete Off the Field',
    promptDetail: 'Find an athlete in a moment away from the action — the bench, the warm-up, the cool-down, the sideline.',
    tip: 'Character shows more clearly before and after the competition than during it. Look for concentration, frustration, or quiet determination.',
    genre: 'Sports',
    skillNode: 'Moment',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'moment-04',
    title: 'Crowd Energy',
    promptDetail: 'Find the collective emotion in a crowd or public gathering and isolate one face or gesture that represents the whole.',
    tip: 'Use a longer focal length to compress the crowd behind your subject. One strong face in a sea of reaction is more powerful than a wide group shot.',
    genre: 'Sports',
    skillNode: 'Moment',
    timeBoxMinutes: 15,
    difficulty: 2,
  },
  {
    id: 'moment-05',
    title: 'The Quiet Moment',
    promptDetail: 'Find and photograph a moment of stillness or solitude inside a busy environment. The contrast is the subject.',
    tip: 'A still person in a moving scene is inherently interesting. Wait for the environment to provide the busyness — you just need the still subject.',
    genre: 'Street',
    skillNode: 'Moment',
    timeBoxMinutes: 15,
    difficulty: 1,
  },
];

export const getDailyMission = (): Mission => {
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return MISSIONS[daysSinceEpoch % MISSIONS.length];
};

export const SKILL_NODE_META: Record<string, { icon: string; color: string; bg: string; border: string; topBorder: string; textInk: string; hexColor: string; hexInk: string; description: string }> = {
  Composition: {
    icon: 'fa-crop-simple',
    color: 'text-node-composition',
    bg: 'bg-node-composition/10',
    border: 'border-node-composition/20',
    topBorder: 'border-t-2 border-t-node-composition',
    textInk: 'text-node-composition-ink',
    hexColor: '#4a6b7c',
    hexInk: '#3f5d6d',
    description: 'How you arrange elements inside the frame.',
  },
  Light: {
    icon: 'fa-sun',
    color: 'text-node-light',
    bg: 'bg-node-light/10',
    border: 'border-node-light/20',
    topBorder: 'border-t-2 border-t-node-light',
    textInk: 'text-node-light-ink',
    hexColor: '#c9a227',
    hexInk: '#8a6b0f',
    description: 'Reading, using, and shaping available light.',
  },
  Timing: {
    icon: 'fa-stopwatch',
    color: 'text-node-timing',
    bg: 'bg-node-timing/10',
    border: 'border-node-timing/20',
    topBorder: 'border-t-2 border-t-node-timing',
    textInk: 'text-node-timing-ink',
    hexColor: '#a35a4a',
    hexInk: '#8f4a3b',
    description: 'When to press the shutter. Anticipation and reaction.',
  },
  Moment: {
    icon: 'fa-eye',
    color: 'text-node-moment',
    bg: 'bg-node-moment/10',
    border: 'border-node-moment/20',
    topBorder: 'border-t-2 border-t-node-moment',
    textInk: 'text-node-moment-ink',
    hexColor: '#4b6b52',
    hexInk: '#3d5a44',
    description: 'Recognizing and capturing genuine human expression.',
  },
};

export const LEVEL_THRESHOLDS = [0, 5, 15, 30, 50] as const;

export const getLevel = (completions: number): number => {
  if (completions >= 50) return 5;
  if (completions >= 30) return 4;
  if (completions >= 15) return 3;
  if (completions >= 5)  return 2;
  return 1;
};

export const getProgressToNextLevel = (completions: number): { current: number; target: number; maxed: boolean } => {
  if (completions >= 50) return { current: completions - 50, target: 50, maxed: true };
  if (completions >= 30) return { current: completions - 30, target: 20, maxed: false };
  if (completions >= 15) return { current: completions - 15, target: 15, maxed: false };
  if (completions >= 5)  return { current: completions - 5,  target: 10, maxed: false };
  return                        { current: completions,       target: 5,  maxed: false };
};

export const FEEDBACK_ENCOURAGEMENT = [
  'Shot logged.',
  'One more rep.',
  'Keep going.',
  'Progress.',
  'Building the eye.',
  'That one counted.',
  'Deliberate practice.',
  'Good.',
];

export const getEncouragement = (): string => {
  const i = Math.floor(Math.random() * FEEDBACK_ENCOURAGEMENT.length);
  return FEEDBACK_ENCOURAGEMENT[i];
};

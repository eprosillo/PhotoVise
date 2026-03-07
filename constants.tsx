
import React from 'react';
import { Genre, CfeBulletinItem } from './types';

export const GENRE_ICONS: Record<Genre, React.ReactNode> = {
  Street: <i className="fa-solid fa-camera"></i>,
  Sports: <i className="fa-solid fa-person-running"></i>,
  Photojournalism: <i className="fa-solid fa-newspaper"></i>,
  Portrait: <i className="fa-solid fa-user"></i>,
  Wedding: <i className="fa-solid fa-ring"></i>,
  Event: <i className="fa-solid fa-calendar-check"></i>,
  Landscape: <i className="fa-solid fa-mountain"></i>,
  Architecture: <i className="fa-solid fa-city"></i>,
  Documentary: <i className="fa-solid fa-briefcase"></i>,
  Commercial: <i className="fa-solid fa-building"></i>,
  Editorial: <i className="fa-solid fa-pen-nib"></i>,
  Fashion: <i className="fa-solid fa-shirt"></i>,
  Product: <i className="fa-solid fa-box"></i>,
  Food: <i className="fa-solid fa-utensils"></i>,
  'Still Life': <i className="fa-solid fa-apple-whole"></i>,
  Wildlife: <i className="fa-solid fa-paw"></i>,
  Macro: <i className="fa-solid fa-bug"></i>,
  Astro: <i className="fa-solid fa-star"></i>,
  Travel: <i className="fa-solid fa-plane"></i>,
  Other: <i className="fa-solid fa-ellipsis"></i>,
};

export const CURATED_CFE_FEED: CfeBulletinItem[] = [
  {
    id: 'cfe-1',
    name: 'World Press Photo Contest 2026',
    organizer: 'World Press Photo Foundation',
    type: 'Competition',
    url: 'https://www.worldpressphoto.org/contest/2026',
    location: 'Amsterdam / Global',
    deadline: '2026-01-10',
    genres: ['Photojournalism'],
    blurb: 'The world\'s most prestigious award for photojournalism and documentary photography.',
    fee: 'Free',
    status: 'unmarked',
    region: 'Global',
    priority: 'high'
  },
  {
    id: 'cfe-2',
    name: 'Magnum Foundation Fellowship',
    organizer: 'Magnum Foundation',
    type: 'Grant',
    url: 'https://www.magnumfoundation.org/grants',
    location: 'New York / Online',
    deadline: '2025-11-15',
    genres: ['Photojournalism', 'Street'],
    blurb: 'Supporting next-generation photographers with funding and mentorship for long-term projects.',
    fee: 'Free',
    status: 'unmarked',
    region: 'Global',
    priority: 'high'
  },
  {
    id: 'cfe-3',
    name: 'LensCulture Street Photography Awards',
    organizer: 'LensCulture',
    type: 'Competition',
    url: 'https://www.lensculture.com/street-photography-awards-2025',
    location: 'Online',
    deadline: '2025-06-20',
    genres: ['Street'],
    blurb: 'A global call for photographers capturing the unplanned moments of life in public spaces.',
    fee: '$35 per single entry',
    status: 'unmarked',
    region: 'Global',
    priority: 'medium'
  },
  {
    id: 'cfe-4',
    name: 'Leica Oskar Barnack Award',
    organizer: 'Leica Camera AG',
    type: 'Competition',
    url: 'https://www.leica-oskar-barnack-award.com/',
    location: 'Wetzlar, Germany',
    deadline: '2025-05-30',
    genres: ['Landscape', 'Street', 'Architecture'],
    blurb: 'Recognizing photographers whose unerring powers of observation capture the relationship between man and the environment.',
    fee: 'Free (Nomination required)',
    status: 'unmarked',
    region: 'Europe',
    priority: 'high'
  },
  {
    id: 'cfe-5',
    name: 'Rencontres d\'Arles 2025',
    organizer: 'Les Rencontres d\'Arles',
    type: 'Festival',
    url: 'https://www.rencontres-arles.com/',
    location: 'Arles, France',
    deadline: 'TBA',
    genres: ['Landscape', 'Street', 'Photojournalism', 'Architecture'],
    blurb: 'The annual summer photography festival in Arles, featuring dozens of exhibitions throughout the city.',
    fee: 'Varies by exhibition',
    status: 'unmarked',
    region: 'Europe',
    priority: 'high'
  },
  {
    id: 'cfe-6',
    name: 'Sony World Photography Awards',
    organizer: 'World Photography Organisation',
    type: 'Competition',
    url: 'https://www.worldphoto.org/sony-world-photography-awards',
    location: 'London / Global',
    deadline: '2026-01-05',
    genres: ['Landscape', 'Street', 'Architecture'],
    blurb: 'One of the largest global competitions, celebrating the best contemporary photography from the past year.',
    fee: 'Free',
    status: 'unmarked',
    region: 'Global',
    priority: 'high'
  },
  {
    id: 'cfe-7',
    name: 'National Geographic Society Grant',
    organizer: 'National Geographic',
    type: 'Grant',
    url: 'https://www.nationalgeographic.org/funding-opportunities/grants/',
    location: 'Global',
    deadline: 'Rolling',
    genres: ['Landscape', 'Photojournalism'],
    blurb: 'Funding for storytellers and researchers working to illuminate and protect the wonder of our world.',
    fee: 'Free',
    status: 'unmarked',
    region: 'Global',
    priority: 'high'
  },
  {
    id: 'cfe-8',
    name: 'Aperture Portfolio Prize',
    organizer: 'Aperture Foundation',
    type: 'Open Call',
    url: 'https://aperture.org/portfolio-prize/',
    location: 'New York / Global',
    deadline: '2026-01-20',
    genres: ['Landscape', 'Street', 'Architecture'],
    blurb: 'An annual competition that aims to identify and promote fresh talent in contemporary photography.',
    fee: 'Free for members',
    status: 'unmarked',
    region: 'Global',
    priority: 'high'
  },
  {
    id: 'cfe-9',
    name: 'Architectural Photography Awards',
    organizer: 'WAF',
    type: 'Competition',
    url: 'https://www.archphotoawards.com/',
    location: 'Global',
    deadline: '2025-08-15',
    genres: ['Architecture'],
    blurb: 'Celebrating the world\'s best architectural photography across professional and mobile categories.',
    fee: '$30 per entry',
    status: 'unmarked',
    region: 'Global',
    priority: 'medium'
  },
  {
    id: 'cfe-10',
    name: 'Gomma Grant 2025',
    organizer: 'Gomma Books',
    type: 'Grant',
    url: 'https://www.gommagrant.com/',
    location: 'Online',
    deadline: '2025-11-03',
    genres: ['Street', 'Photojournalism'],
    blurb: 'Open to all photographers, providing funding and publishing opportunities for cohesive bodies of work.',
    fee: '€25 early bird',
    status: 'unmarked',
    region: 'Global',
    priority: 'medium'
  }
];

export const CULLING_GUIDES: Partial<Record<Genre, string[]>> = {
  Landscape: [
    'Light: Is the golden/blue hour utilized or light dynamic?',
    'Atmosphere: Does the weather/mood enhance the scale?',
    'Composition: Lead-in lines, foreground interest, rule of thirds?',
    'Distractions: Are there sensor spots, planes, or modern intrusions?'
  ],
  Street: [
    'Timing: Did I catch the "decisive moment"?',
    'Gesture: Is the person moving or posing naturally?',
    'Interaction: Is there a connection between subjects or environment?',
    'Layering: Is there a clear foreground, middle, and background?'
  ],
  Photojournalism: [
    'Story: Does the image have an opener, detail, or closer vibe?',
    'Clarity: Is the main subject identifiable and in focus?',
    'Editorial Honesty: Does this represent the truth of the event?',
    'Captionable: Can you answer Who, What, Where, When, Why?'
  ],
  Architecture: [
    'Lines: Are vertical lines perfectly parallel?',
    'Symmetry: Is the center point accurate?',
    'Perspective: Is the distortion controlled or intentionally creative?',
    'Clarity: Is detail sharp from the facade to the background?'
  ],
  Portrait: [
    'Expression: Is the subject\'s expression authentic or effective?',
    'Eyes: Are the eyes sharp and catching the light?',
    'Posing: Is the body language flattering and aligned with intent?',
    'Background: Is the background supportive or distracting?'
  ]
};

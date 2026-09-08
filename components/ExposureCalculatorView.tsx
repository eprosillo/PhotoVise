import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Photographic values (1/3-stop increments) ─────────────────────────────────

const ISO_STOPS = [
  50, 64, 80, 100, 125, 160, 200, 250, 320, 400,
  500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200,
  4000, 5000, 6400, 12800, 25600,
];

const SHUTTER_STOPS: { label: string; sec: number }[] = [
  { label: '30"',    sec: 30      }, { label: '25"',    sec: 25      },
  { label: '20"',    sec: 20      }, { label: '15"',    sec: 15      },
  { label: '13"',    sec: 13      }, { label: '10"',    sec: 10      },
  { label: '8"',     sec: 8       }, { label: '6"',     sec: 6       },
  { label: '5"',     sec: 5       }, { label: '4"',     sec: 4       },
  { label: '3"',     sec: 3.2     }, { label: '2.5"',   sec: 2.5     },
  { label: '2"',     sec: 2       }, { label: '1.6"',   sec: 1.6     },
  { label: '1.3"',   sec: 1.3     }, { label: '1"',     sec: 1       },
  { label: '1/1.3',  sec: 1/1.3   }, { label: '1/1.6',  sec: 1/1.6   },
  { label: '1/2',    sec: 0.5     }, { label: '1/2.5',  sec: 0.4     },
  { label: '1/3',    sec: 1/3     }, { label: '1/4',    sec: 0.25    },
  { label: '1/5',    sec: 0.2     }, { label: '1/6',    sec: 1/6     },
  { label: '1/8',    sec: 0.125   }, { label: '1/10',   sec: 0.1     },
  { label: '1/13',   sec: 1/13    }, { label: '1/15',   sec: 1/15    },
  { label: '1/20',   sec: 1/20    }, { label: '1/25',   sec: 1/25    },
  { label: '1/30',   sec: 1/30    }, { label: '1/40',   sec: 1/40    },
  { label: '1/50',   sec: 1/50    }, { label: '1/60',   sec: 1/60    },
  { label: '1/80',   sec: 1/80    }, { label: '1/100',  sec: 1/100   },
  { label: '1/125',  sec: 1/125   }, { label: '1/160',  sec: 1/160   },
  { label: '1/200',  sec: 1/200   }, { label: '1/250',  sec: 1/250   },
  { label: '1/320',  sec: 1/320   }, { label: '1/400',  sec: 1/400   },
  { label: '1/500',  sec: 1/500   }, { label: '1/640',  sec: 1/640   },
  { label: '1/800',  sec: 1/800   }, { label: '1/1000', sec: 1/1000  },
  { label: '1/1250', sec: 1/1250  }, { label: '1/1600', sec: 1/1600  },
  { label: '1/2000', sec: 1/2000  }, { label: '1/2500', sec: 1/2500  },
  { label: '1/3200', sec: 1/3200  }, { label: '1/4000', sec: 1/4000  },
  { label: '1/5000', sec: 1/5000  }, { label: '1/6400', sec: 1/6400  },
  { label: '1/8000', sec: 1/8000  },
];

const APERTURE_STOPS: { label: string; f: number }[] = [
  { label: 'f/1',    f: 1    }, { label: 'f/1.1',  f: 1.1  },
  { label: 'f/1.2',  f: 1.2  }, { label: 'f/1.4',  f: 1.4  },
  { label: 'f/1.6',  f: 1.6  }, { label: 'f/1.8',  f: 1.8  },
  { label: 'f/2',    f: 2    }, { label: 'f/2.2',  f: 2.2  },
  { label: 'f/2.5',  f: 2.5  }, { label: 'f/2.8',  f: 2.8  },
  { label: 'f/3.2',  f: 3.2  }, { label: 'f/3.5',  f: 3.5  },
  { label: 'f/4',    f: 4    }, { label: 'f/4.5',  f: 4.5  },
  { label: 'f/5',    f: 5    }, { label: 'f/5.6',  f: 5.6  },
  { label: 'f/6.3',  f: 6.3  }, { label: 'f/7.1',  f: 7.1  },
  { label: 'f/8',    f: 8    }, { label: 'f/9',    f: 9    },
  { label: 'f/10',   f: 10   }, { label: 'f/11',   f: 11   },
  { label: 'f/13',   f: 13   }, { label: 'f/14',   f: 14   },
  { label: 'f/16',   f: 16   }, { label: 'f/18',   f: 18   },
  { label: 'f/20',   f: 20   }, { label: 'f/22',   f: 22   },
  { label: 'f/25',   f: 25   }, { label: 'f/29',   f: 29   },
  { label: 'f/32',   f: 32   },
];

// ── EV reference scenes ───────────────────────────────────────────────────────

const EV_SCENES = [
  { ev: -4,  label: 'Starlight only'             },
  { ev: 0,   label: 'Moonlit night scene'         },
  { ev: 3,   label: 'Indoor: candles'             },
  { ev: 5,   label: 'Indoor: dim artificial light' },
  { ev: 7,   label: 'Stage / bright indoor'       },
  { ev: 9,   label: 'Indoors near window'         },
  { ev: 11,  label: 'Overcast / open shade'       },
  { ev: 12,  label: 'Overcast day'                },
  { ev: 13,  label: 'Hazy sun'                    },
  { ev: 14,  label: 'Sunny, slight haze'          },
  { ev: 15,  label: 'Sunny, clear (Sunny 16)'     },
  { ev: 16,  label: 'Bright sun on sand or snow'  },
];

// ── Math helpers ──────────────────────────────────────────────────────────────

// EV at ISO 100: log₂(N²/t)
function ev100(n: number, t: number) {
  return Math.log2((n * n) / t);
}

// Invariant for equivalent exposures: log₂(N² · 100 / (t · ISO))
function exposureIndex(n: number, t: number, iso: number) {
  return Math.log2((n * n * 100) / (t * iso));
}

// Find array index whose log₂ value is closest to target
function nearestLog2Idx(values: number[], target: number): number {
  const logT = Math.log2(Math.max(target, 1e-12));
  let best = 0, bestDiff = Infinity;
  values.forEach((v, i) => {
    const d = Math.abs(Math.log2(v) - logT);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

function sceneLabel(ev: number): string {
  const rounded = Math.round(ev);
  for (let i = EV_SCENES.length - 1; i >= 0; i--) {
    if (rounded >= EV_SCENES[i].ev) return EV_SCENES[i].label;
  }
  return 'Very low light';
}

// ── Weather helpers ───────────────────────────────────────────────────────────

function weatherCodeLabel(code: number, isDay: boolean): string {
  if (!isDay) return 'Night';
  if (code === 0)                        return 'Clear sky';
  if (code === 1)                        return 'Mainly clear';
  if (code === 2)                        return 'Partly cloudy';
  if (code === 3)                        return 'Overcast';
  if (code >= 45 && code <= 48)          return 'Foggy';
  if (code >= 51 && code <= 57)          return 'Drizzle';
  if (code >= 61 && code <= 67)          return 'Rain';
  if (code >= 71 && code <= 77)          return 'Snow';
  if (code >= 80 && code <= 82)          return 'Rain showers';
  if (code >= 85 && code <= 86)          return 'Snow showers';
  if (code >= 95)                        return 'Thunderstorm';
  return 'Mixed conditions';
}

function weatherToEV(code: number, cloudCover: number, uvIndex: number, isDay: boolean): number {
  if (!isDay) return 5; // city streets at night

  // Base EV from UV index when clear
  let ev = uvIndex >= 8 ? 15 : uvIndex >= 5 ? 14 : uvIndex >= 2 ? 13 : 12;

  // Cloud cover pulls EV down
  ev -= (cloudCover / 100) * 3;

  // Precipitation further reduces light
  if (code >= 45 && code <= 48) ev -= 4; // fog
  if (code >= 51 && code <= 57) ev -= 2; // drizzle
  if (code >= 61 && code <= 67) ev -= 3; // rain
  if (code >= 80 && code <= 82) ev -= 2; // showers
  if (code >= 95)                ev -= 4; // thunderstorm

  return Math.round(Math.max(1, Math.min(16, ev)));
}

// Pick sensible defaults for the EV level
function evToStartingExposure(ev: number): { iso: number; aperture: number } {
  if (ev >= 13) return { iso: 100, aperture: 8 };
  if (ev >= 11) return { iso: 200, aperture: 8 };
  if (ev >= 9)  return { iso: 400, aperture: 5.6 };
  if (ev >= 7)  return { iso: 800, aperture: 4 };
  return { iso: 1600, aperture: 2.8 };
}

interface WeatherState {
  status: 'idle' | 'loading' | 'success' | 'error';
  condition?: string;
  location?: string;
  ev?: number;
  error?: string;
}

// ── Style tokens ──────────────────────────────────────────────────────────────
const INK   = '#17191a';
const PAPER = '#f8f7f4';
const GOLD  = '#c9a227';
const MUTED = 'rgba(23,25,26,0.42)';
const RULE  = 'rgba(23,25,26,0.10)';
const MONO  = "'IBM Plex Mono', monospace";

// ── Column component ──────────────────────────────────────────────────────────

type ColId = 'iso' | 'shutter' | 'aperture';

interface ColumnProps {
  title: string;
  labels: string[];
  selectedIdx: number;
  locked: boolean;
  onSelect: (idx: number) => void;
  onLockToggle: () => void;
}

const ExposureColumn: React.FC<ColumnProps> = ({
  title, labels, selectedIdx, locked, onSelect, onLockToggle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs     = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll selected item into center of container
  useEffect(() => {
    const container = containerRef.current;
    const item      = itemRefs.current[selectedIdx];
    if (!container || !item) return;
    const itemTop    = item.offsetTop;
    const itemH      = item.offsetHeight;
    const containerH = container.offsetHeight;
    container.scrollTo({ top: itemTop - containerH / 2 + itemH / 2, behavior: 'smooth' });
  }, [selectedIdx]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Column header */}
      <div style={{ borderBottom: `1px solid ${RULE}`, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: PAPER }}>
        <span style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase', color: locked ? GOLD : INK, fontWeight: locked ? 700 : 400 }}>
          {title}
        </span>
        <button
          onClick={onLockToggle}
          title={locked ? 'Unlock this scale' : 'Lock this scale'}
          style={{
            fontFamily: MONO, fontSize: '9px', letterSpacing: '0.12em',
            background: locked ? GOLD : 'none',
            color: locked ? INK : MUTED,
            border: `1px solid ${locked ? GOLD : 'rgba(23,25,26,0.18)'}`,
            cursor: 'pointer', padding: '3px 8px',
          }}
        >
          {locked ? '🔒 Locked' : 'Lock'}
        </button>
      </div>

      {/* Scrollable scale */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          height: '360px',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'rgba(23,25,26,0.015)',
          border: `1px solid ${RULE}`,
          borderTop: 'none',
          scrollbarWidth: 'thin',
        }}
      >
        {/* Center indicator line */}
        <div style={{
          position: 'sticky', top: '50%', left: 0, right: 0,
          height: '2px', background: `${GOLD}40`, zIndex: 2,
          pointerEvents: 'none', marginBottom: '-2px',
        }} />

        {/* Top padding so first item can reach center */}
        <div style={{ height: '160px' }} />

        {labels.map((label, i) => {
          const isSelected = i === selectedIdx;
          return (
            <button
              key={i}
              ref={el => itemRefs.current[i] = el}
              onClick={() => !locked && onSelect(i)}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '6px 14px', border: 'none', cursor: locked ? 'default' : 'pointer',
                background: isSelected ? `rgba(201,162,39,0.10)` : 'transparent',
                borderLeft: isSelected ? `3px solid ${GOLD}` : '3px solid transparent',
                transition: 'background 0.1s',
              }}
            >
              {/* Tick marks (like the ruler) */}
              <span style={{
                display: 'inline-block', width: i % 3 === 0 ? '10px' : '6px',
                height: '1px', background: isSelected ? GOLD : 'rgba(23,25,26,0.25)',
                marginRight: '8px', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: MONO, fontSize: '11px', letterSpacing: '0.06em',
                color: isSelected ? GOLD : MUTED,
                fontWeight: isSelected ? 700 : 400,
              }}>
                {label}
              </span>
            </button>
          );
        })}

        {/* Bottom padding */}
        <div style={{ height: '160px' }} />
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ExposureCalculatorView: React.FC = () => {
  // Default: ISO 100, 1/125s, f/8 (EV ≈ 13)
  const [isoIdx,    setIsoIdx]    = useState(ISO_STOPS.indexOf(100));
  const [shutIdx,   setShutIdx]   = useState(SHUTTER_STOPS.findIndex(s => s.label === '1/125'));
  const [aptIdx,    setAptIdx]    = useState(APERTURE_STOPS.findIndex(a => a.label === 'f/8'));
  const [lockedCol, setLockedCol] = useState<ColId | null>(null);
  const [eiTarget,  setEiTarget]  = useState<number | null>(null);
  const [isMobile,  setIsMobile]  = useState(window.innerWidth < 640);
  const [weather,   setWeather]   = useState<WeatherState>({ status: 'idle' });

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Current values
  const iso = ISO_STOPS[isoIdx];
  const t   = SHUTTER_STOPS[shutIdx].sec;
  const n   = APERTURE_STOPS[aptIdx].f;

  const ev      = ev100(n, t);
  const evRound = Math.round(ev * 10) / 10;
  const scene   = sceneLabel(ev);

  // ── Lock toggle ────────────────────────────────────────────────────────────
  const handleLockToggle = useCallback((col: ColId) => {
    if (lockedCol === col) { setLockedCol(null); setEiTarget(null); return; }
    setLockedCol(col);
    setEiTarget(exposureIndex(n, t, iso));
  }, [lockedCol, n, t, iso]);

  // ── Column selection with auto-solve ──────────────────────────────────────
  const selectISO = useCallback((idx: number) => {
    setIsoIdx(idx);
    if (!lockedCol || eiTarget === null) return;
    const newISO = ISO_STOPS[idx];
    if (lockedCol === 'aperture') {
      // Solve for shutter: t = N² * 100 / (2^ei * ISO)
      const tNew = (n * n * 100) / (Math.pow(2, eiTarget) * newISO);
      setShutIdx(nearestLog2Idx(SHUTTER_STOPS.map(s => s.sec), tNew));
    }
    if (lockedCol === 'shutter') {
      // Solve for aperture: N = sqrt(2^ei * t * ISO / 100)
      const nNew = Math.sqrt(Math.pow(2, eiTarget) * t * newISO / 100);
      setAptIdx(nearestLog2Idx(APERTURE_STOPS.map(a => a.f), nNew));
    }
  }, [lockedCol, eiTarget, n, t]);

  const selectShutter = useCallback((idx: number) => {
    setShutIdx(idx);
    if (!lockedCol || eiTarget === null) return;
    const newT = SHUTTER_STOPS[idx].sec;
    if (lockedCol === 'aperture') {
      // Solve for ISO: ISO = N² * 100 / (2^ei * t)
      const isoNew = (n * n * 100) / (Math.pow(2, eiTarget) * newT);
      setIsoIdx(nearestLog2Idx(ISO_STOPS.map(v => v), isoNew));
    }
    if (lockedCol === 'iso') {
      // Solve for aperture: N = sqrt(2^ei * t * ISO / 100)
      const nNew = Math.sqrt(Math.pow(2, eiTarget) * newT * iso / 100);
      setAptIdx(nearestLog2Idx(APERTURE_STOPS.map(a => a.f), nNew));
    }
  }, [lockedCol, eiTarget, n, iso]);

  const selectAperture = useCallback((idx: number) => {
    setAptIdx(idx);
    if (!lockedCol || eiTarget === null) return;
    const newN = APERTURE_STOPS[idx].f;
    if (lockedCol === 'iso') {
      // Solve for shutter: t = N² * 100 / (2^ei * ISO)
      const tNew = (newN * newN * 100) / (Math.pow(2, eiTarget) * iso);
      setShutIdx(nearestLog2Idx(SHUTTER_STOPS.map(s => s.sec), tNew));
    }
    if (lockedCol === 'shutter') {
      // Solve for ISO: ISO = N² * 100 / (2^ei * t)
      const isoNew = (newN * newN * 100) / (Math.pow(2, eiTarget) * t);
      setIsoIdx(nearestLog2Idx(ISO_STOPS.map(v => v), isoNew));
    }
  }, [lockedCol, eiTarget, iso, t]);

  // ── Weather / location suggest ────────────────────────────────────────────
  const handleWeatherSuggest = useCallback(async () => {
    setWeather({ status: 'loading' });
    try {
      const coords = await new Promise<GeolocationCoordinates>((res, rej) =>
        navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { timeout: 10000 })
      );
      const { latitude, longitude } = coords;

      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,cloud_cover,uv_index,is_day&timezone=auto&forecast_days=1`
      );
      const wData = await wRes.json();
      const { weather_code, cloud_cover, uv_index, is_day } = wData.current;

      // Best-effort reverse geocode
      let locationName = `${latitude.toFixed(2)}°N, ${Math.abs(longitude).toFixed(2)}°${longitude < 0 ? 'W' : 'E'}`;
      try {
        const gRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const gData = await gRes.json();
        const a = gData.address || {};
        locationName = a.city || a.town || a.village || a.county || locationName;
      } catch { /* keep coordinates */ }

      const suggestedEV  = weatherToEV(weather_code, cloud_cover, uv_index, !!is_day);
      const condition    = weatherCodeLabel(weather_code, !!is_day);
      const { iso, aperture } = evToStartingExposure(suggestedEV);

      // Shutter: t = N² × 100 / (2^EV × ISO)
      const tNew = (aperture * aperture * 100) / (Math.pow(2, suggestedEV) * iso);

      setIsoIdx(nearestLog2Idx(ISO_STOPS, iso));
      setAptIdx(nearestLog2Idx(APERTURE_STOPS.map(a => a.f), aperture));
      setShutIdx(nearestLog2Idx(SHUTTER_STOPS.map(s => s.sec), tNew));
      setLockedCol(null);
      setEiTarget(null);
      setWeather({ status: 'success', condition, location: locationName, ev: suggestedEV });
    } catch {
      setWeather({ status: 'error', error: 'Could not retrieve location or weather. Check browser permissions.' });
    }
  }, []);

  // ── EV bar position (0-16 range clamped) ──────────────────────────────────
  const evClamped  = Math.max(-4, Math.min(16, ev));
  const evPercent  = ((evClamped + 4) / 20) * 100;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: INK, margin: 0 }}>Exposure Calculator</h2>
        <button
          onClick={handleWeatherSuggest}
          disabled={weather.status === 'loading'}
          style={{
            fontFamily: MONO, fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase',
            background: INK, color: PAPER, border: 'none', cursor: weather.status === 'loading' ? 'wait' : 'pointer',
            padding: '9px 16px', opacity: weather.status === 'loading' ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {weather.status === 'loading' ? 'Detecting…' : 'Suggest from location'}
        </button>
      </div>

      {/* How to use */}
      <div style={{ border: `1px solid ${RULE}`, borderLeft: `3px solid ${GOLD}`, background: PAPER, padding: '14px 18px', marginBottom: '24px' }}>
        <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase', color: GOLD, margin: '0 0 7px' }}>How to use</p>
        <p style={{ fontSize: '13px', color: INK, margin: '0 0 8px', lineHeight: 1.6 }}>
          Scroll each scale and click a value to set your ISO, shutter speed, and aperture. The EV readout updates instantly.
        </p>
        <p style={{ fontSize: '13px', color: INK, margin: '0 0 8px', lineHeight: 1.6 }}>
          To find equivalent exposures — same light, different settings — hit <strong>Lock</strong> on the parameter you want to hold fixed (e.g. aperture for depth of field, shutter for motion). Then pick a new value in either of the other two columns and the third auto-adjusts to maintain the same exposure.
        </p>
        <p style={{ fontSize: '12px', color: MUTED, margin: 0, lineHeight: 1.5 }}>
          <strong>Studio tip:</strong> set shutter to your sync speed (1/160–1/250) and lock it. Use aperture and ISO to explore the flash-to-ambient balance — aperture controls flash exposure, shutter controls ambient bleed.
        </p>
      </div>

      {/* Weather result card */}
      {weather.status === 'success' && weather.ev !== undefined && (
        <div style={{ border: `1px solid ${RULE}`, borderLeft: `3px solid #4a9eda`, background: PAPER, padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(74,158,218,0.8)', margin: '0 0 4px' }}>
              Current conditions — {weather.location}
            </p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: INK, margin: 0 }}>
              {weather.condition} &nbsp;·&nbsp; EV {weather.ev}
            </p>
          </div>
          <p style={{ fontSize: '12px', color: MUTED, margin: 0, flex: 1 }}>
            Scales set to a suggested starting exposure. Lock any parameter and adjust from here.
          </p>
          <button
            onClick={() => setWeather({ status: 'idle' })}
            style={{ fontFamily: MONO, fontSize: '9px', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            Dismiss
          </button>
        </div>
      )}
      {weather.status === 'error' && (
        <div style={{ border: `1px solid rgba(200,50,50,0.2)`, borderLeft: '3px solid #c83232', background: PAPER, padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: '#c83232', margin: 0 }}>{weather.error}</p>
          <button onClick={() => setWeather({ status: 'idle' })} style={{ fontFamily: MONO, fontSize: '9px', color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      {/* Three scales */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <ExposureColumn
          title="ISO"
          labels={ISO_STOPS.map(String)}
          selectedIdx={isoIdx}
          locked={lockedCol === 'iso'}
          onSelect={selectISO}
          onLockToggle={() => handleLockToggle('iso')}
        />
        <ExposureColumn
          title="Shutter Speed"
          labels={SHUTTER_STOPS.map(s => s.label)}
          selectedIdx={shutIdx}
          locked={lockedCol === 'shutter'}
          onSelect={selectShutter}
          onLockToggle={() => handleLockToggle('shutter')}
        />
        <ExposureColumn
          title="Aperture"
          labels={APERTURE_STOPS.map(a => a.label)}
          selectedIdx={aptIdx}
          locked={lockedCol === 'aperture'}
          onSelect={selectAperture}
          onLockToggle={() => handleLockToggle('aperture')}
        />
      </div>

      {/* EV readout */}
      <div style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED, margin: '0 0 4px' }}>
              Exposure Value (ISO 100)
            </p>
            <p style={{ fontSize: '42px', fontWeight: 700, color: INK, margin: 0, lineHeight: 1 }}>
              EV {evRound}
            </p>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <p style={{ fontSize: '13px', color: 'rgba(23,25,26,0.60)', margin: 0 }}>{scene}</p>
          </div>
        </div>

        {/* EV bar */}
        <div style={{ position: 'relative', height: '6px', background: 'rgba(23,25,26,0.08)', borderRadius: '3px', overflow: 'visible' }}>
          <div style={{
            position: 'absolute', left: `${evPercent}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '14px', height: '14px', borderRadius: '50%',
            background: GOLD, border: `2px solid ${PAPER}`,
            boxShadow: '0 0 0 1px rgba(201,162,39,0.5)',
          }} />
          {/* Gradient fill */}
          <div style={{ height: '100%', width: `${evPercent}%`, background: `linear-gradient(to right, rgba(23,25,26,0.15), ${GOLD})`, borderRadius: '3px' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontFamily: MONO, fontSize: '8px', color: MUTED }}>Low light</span>
          <span style={{ fontFamily: MONO, fontSize: '8px', color: MUTED }}>Bright sun</span>
        </div>

        {/* Current settings summary */}
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${RULE}`, display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'ISO',     value: String(iso)                    },
            { label: 'Shutter', value: SHUTTER_STOPS[shutIdx].label  },
            { label: 'Aperture',value: APERTURE_STOPS[aptIdx].label  },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.16em', textTransform: 'uppercase', color: MUTED, margin: '0 0 3px' }}>{label}</p>
              <p style={{ fontFamily: MONO, fontSize: '16px', fontWeight: 700, color: INK, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* EV Reference chart */}
      <div style={{ border: `1px solid ${RULE}`, background: PAPER }}>
        <div style={{ borderBottom: `1px solid ${RULE}`, padding: '10px 16px' }}>
          <span style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase', color: MUTED }}>
            EV Reference — Common Lighting Conditions
          </span>
        </div>
        <div style={{ padding: '12px 0' }}>
          {EV_SCENES.map(({ ev: sceneEV, label }) => {
            const isNear = Math.abs(Math.round(ev) - sceneEV) <= 1;
            return (
              <div
                key={sceneEV}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '6px 16px',
                  background: isNear ? `rgba(201,162,39,0.07)` : 'transparent',
                  borderLeft: isNear ? `3px solid ${GOLD}` : '3px solid transparent',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: isNear ? GOLD : 'rgba(23,25,26,0.30)', minWidth: '32px', textAlign: 'right' }}>
                  {sceneEV}
                </span>
                <span style={{ fontSize: '12px', color: isNear ? INK : MUTED }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ExposureCalculatorView;

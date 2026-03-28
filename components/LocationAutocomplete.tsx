import React, { useState, useEffect, useRef } from 'react';
import { fetchLocationSuggestions } from '../services/geminiService';

interface LocationAutocompleteProps {
  name: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  initialValue?: string;
  onChange?: (value: string) => void;
}

interface Suggestion {
  title: string;
  uri?: string;
}

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  name,
  placeholder,
  required,
  className,
  initialValue,
  onChange,
}) => {
  const [inputValue, setInputValue] = useState(initialValue || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsLoading(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      } catch {
        // proceed without coordinates
      }

      const results = await fetchLocationSuggestions(query, lat, lng);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    } catch (err) {
      console.error('Photovise: Location suggestion fetch failed', err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange?.(val);
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    if (val.length >= 3) {
      debounceTimerRef.current = window.setTimeout(() => fetchSuggestions(val), 600);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (s: Suggestion) => {
    setInputValue(s.title);
    onChange?.(s.title);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.length >= 3 && suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={`${className} pr-10`}
          autoComplete="off"
        />

        <input type="hidden" name={name} value={inputValue} required={required} />

        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <i className="fa-solid fa-circle-notch animate-spin text-brand-rose text-[10px]"></i>
          </div>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-brand-black border border-white/10 rounded-sm shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-col">
            {suggestions.map((s, idx) => (
              <div key={idx} className="flex border-b border-white/5 last:border-0 hover:bg-white/10 transition-colors group">
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="flex-1 text-left px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-location-dot text-brand-blue/60 group-hover:text-brand-rose text-[10px]"></i>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">{s.title}</span>
                  </div>
                </button>
                {s.uri && (
                  <a
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-3 flex items-center justify-center text-brand-blue/40 hover:text-brand-rose transition-colors border-l border-white/5"
                    title="View on Google Maps"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i className="fa-solid fa-up-right-from-square text-[10px]"></i>
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="bg-white/5 px-4 py-1.5 flex justify-between items-center">
            <span className="text-[8px] font-bold text-brand-gray uppercase tracking-widest">GEMINI MAPS ENGINE</span>
            <i className="fa-brands fa-google text-[10px] text-brand-gray/30"></i>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;

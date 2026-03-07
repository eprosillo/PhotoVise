import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

interface LocationAutocompleteProps {
  name: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

interface Suggestion {
  title: string;
  address?: string;
  uri?: string;
}

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  name,
  placeholder,
  required,
  className
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      let latLng = undefined;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        latLng = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch (e) {
        console.debug("Photovise: Location access denied or timed out, proceeding without coordinates.");
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide 5 specific real-world place or address suggestions that match: "${query}". Return only the names of the places.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: latLng
            }
          }
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const mapsSuggestions: Suggestion[] = chunks
        .filter(chunk => chunk.maps)
        .map(chunk => ({
          title: chunk.maps?.title || '',
          uri: chunk.maps?.uri
        }))
        .filter(s => s.title.length > 0);

      if (mapsSuggestions.length > 0) {
        setSuggestions(mapsSuggestions);
      } else {
        const textOutput = response.text || "";
        const lines = textOutput.split('\n')
          .map(l => l.replace(/^[•\-\d.\s]+/, '').trim())
          .filter(l => l.length > 0)
          .slice(0, 5);
        setSuggestions(lines.map(l => ({ title: l })));
      }
      setShowDropdown(true);
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : JSON.stringify(err);
      if (errStr.includes("429")) {
        console.warn("Photovise: Maps Quota Exhausted.");
      } else {
        console.error("Photovise: Location suggestion fetch failed", err);
      }
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (val.length >= 3) {
      debounceTimerRef.current = window.setTimeout(() => {
        fetchSuggestions(val);
      }, 600);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (s: Suggestion) => {
    setInputValue(s.title);
    setShowDropdown(false);

    const hiddenInput = containerRef.current?.querySelector('input[type="hidden"]') as HTMLInputElement;
    if (hiddenInput) {
      hiddenInput.value = s.title;
      const event = new Event('change', { bubbles: true });
      hiddenInput.dispatchEvent(event);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.length >= 3 && setShowDropdown(true)}
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

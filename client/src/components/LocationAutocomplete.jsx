import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Route, Compass, Building, Landmark, ChevronRight, X } from 'lucide-react';

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search streets, barangays, landmarks...',
  className = '',
  inputClassName = '',
  icon = null,
  required = false,
  autoFocus = false,
  filterType = 'ALL', // 'ALL' | 'LOCATION' | 'ROUTE'
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Synchronize internal query with incoming value prop
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Debounced suggestion fetch
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            let filtered = data;
            if (filterType === 'LOCATION') {
              filtered = data.filter(item => item.category === 'location');
            } else if (filterType === 'ROUTE') {
              filtered = data.filter(item => item.category === 'route');
            }
            setSuggestions(filtered);
          }
        }
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, isOpen, filterType]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  const handleSelectSuggestion = (item) => {
    setQuery(item.name);
    onChange(item.name, item);
    if (onSelect) onSelect(item);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const getBadgeStyle = (typeLabel) => {
    switch (typeLabel) {
      case 'Street / Road':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Barangay':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Landmark':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Terminal':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'River Stop':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'Route':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getCategoryIcon = (typeLabel) => {
    switch (typeLabel) {
      case 'Street / Road':
        return <Navigation className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
      case 'Barangay':
        return <Compass className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />;
      case 'Landmark':
        return <Landmark className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />;
      case 'Terminal':
        return <Building className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />;
      case 'Route':
        return <Route className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />;
      default:
        return <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 w-full">
        {icon}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim().length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full bg-transparent text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none ${inputClassName}`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onChange('');
              setSuggestions([]);
              inputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/50"
            title="Clear"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dropdown Suggestions */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl shadow-slate-300/40 border border-slate-200/90 overflow-hidden max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          {loading && suggestions.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
              Searching Dagupan locations...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs font-semibold text-slate-600">No matching location found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Try searching by street name, barangay, or landmark.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 py-1">
              {suggestions.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <li
                    key={`${item.category}-${item.id || item.name}-${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(item);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? 'bg-emerald-50/70 text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {getCategoryIcon(item.typeLabel)}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs sm:text-sm text-slate-800 truncate">
                          {item.name}
                        </div>
                        {(item.barangay || item.address || item.origin) && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {item.category === 'route'
                              ? `${item.origin} → ${item.destination}`
                              : item.barangay
                              ? `Brgy. ${item.barangay}`
                              : item.address}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getBadgeStyle(item.typeLabel)}`}>
                        {item.typeLabel}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

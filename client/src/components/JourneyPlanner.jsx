import React, { useState, useEffect } from 'react';
import { 
  Navigation, 
  ArrowUpDown, 
  Clock, 
  Bus, 
  CarFront, 
  Bike, 
  Ship, 
  MapPin, 
  AlertTriangle, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Info, 
  X,
  Search,
  Footprints,
  Sparkles
} from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';

export default function JourneyPlanner({
  origin = null,
  setOrigin,
  destination = null,
  setDestination,
  onSelectJourney,
  selectedJourney = null,
  className = ''
}) {
  const [originText, setOriginText] = useState(origin?.name || '');
  const [destText, setDestText] = useState(destination?.name || '');
  const [preferredMode, setPreferredMode] = useState('ALL');
  const [leaveNow, setLeaveNow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [itineraries, setItineraries] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // Sync external origin prop
  useEffect(() => {
    if (origin) {
      setOriginText(origin.name || `${origin.latitude?.toFixed(4)}, ${origin.longitude?.toFixed(4)}`);
    }
  }, [origin]);

  // Sync external destination prop
  useEffect(() => {
    if (destination) {
      setDestText(destination.name || `${destination.latitude?.toFixed(4)}, ${destination.longitude?.toFixed(4)}`);
    }
  }, [destination]);

  // Auto-plan when both origin and destination are set
  useEffect(() => {
    if (origin && destination) {
      handleSearch();
    }
  }, [origin, destination, preferredMode]);

  const handleSwap = () => {
    const tempText = originText;
    const tempObj = origin;

    setOriginText(destText);
    if (setOrigin) setOrigin(destination);

    setDestText(tempText);
    if (setDestination) setDestination(tempObj);
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!originText.trim() || !destText.trim()) {
      setError('Please select both origin and destination.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/journey/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: origin || originText,
          destination: destination || destText,
          preferredModes: preferredMode,
          leaveNow
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to find commute routes.');
      }

      setItineraries(data.itineraries || []);
      if (data.itineraries && data.itineraries.length > 0) {
        setExpandedId(data.itineraries[0].id);
        if (onSelectJourney) {
          onSelectJourney(data.itineraries[0]);
        }
      } else {
        setError('No direct transit route found for this pair. Try walking or searching a nearby major avenue.');
      }
    } catch (err) {
      console.error('Journey search error:', err);
      setError(err.message || 'Unable to plan route.');
      setItineraries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPick = (item) => {
    if (!originText) {
      setOriginText(item.name);
      if (setOrigin) setOrigin(item);
    } else {
      setDestText(item.name);
      if (setDestination) setDestination(item);
    }
  };

  const getModeIcon = (mode) => {
    const m = (mode || '').toLowerCase();
    if (m.includes('jeepney')) return <CarFront className="w-3.5 h-3.5 text-pink-600" />;
    if (m.includes('bus')) return <Bus className="w-3.5 h-3.5 text-emerald-600" />;
    if (m.includes('tricycle')) return <Bike className="w-3.5 h-3.5 text-cyan-600" />;
    if (m.includes('boat')) return <Ship className="w-3.5 h-3.5 text-blue-600" />;
    return <Footprints className="w-3.5 h-3.5 text-slate-500" />;
  };

  return (
    <div className={`bg-white flex flex-col h-full overflow-hidden border-r border-slate-200/90 ${className}`}>
      
      {/* Top Search Form (Matching UX Reference Screenshot 2) */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Journey Planner
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">Dagupan Transit</span>
        </div>

        {/* Origin / Destination Card */}
        <div className="relative bg-white rounded-2xl p-2.5 border border-slate-200/80 shadow-sm space-y-2">
          {/* Origin Input */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0 ml-1"></div>
            <LocationAutocomplete
              value={originText}
              onChange={(val, item) => {
                setOriginText(val);
                if (setOrigin) setOrigin(item || (val ? { name: val } : null));
              }}
              onSelect={(item) => {
                setOriginText(item.name);
                if (setOrigin) setOrigin(item);
              }}
              placeholder="Origin: e.g. City Plaza, UPang..."
              className="flex-1"
              inputClassName="text-xs font-semibold py-1"
            />
          </div>

          {/* Divider with Swap Button */}
          <div className="relative flex items-center justify-center my-0.5">
            <div className="w-full border-t border-slate-100"></div>
            <button
              type="button"
              onClick={handleSwap}
              title="Swap origin and destination"
              className="absolute right-2 p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all hover:scale-105 active:scale-95 shadow-xs"
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>

          {/* Destination Input */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500 flex-shrink-0 ml-1"></div>
            <LocationAutocomplete
              value={destText}
              onChange={(val, item) => {
                setDestText(val);
                if (setDestination) setDestination(item || (val ? { name: val } : null));
              }}
              onSelect={(item) => {
                setDestText(item.name);
                if (setDestination) setDestination(item);
              }}
              placeholder="Destination: e.g. Bonuan Beach, LNU..."
              className="flex-1"
              inputClassName="text-xs font-semibold py-1"
            />
          </div>
        </div>

        {/* Preferred Modes & Departure Time Controls */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Preferred Mode
            </label>
            <select
              value={preferredMode}
              onChange={(e) => setPreferredMode(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="ALL">All Modes</option>
              <option value="Jeepney">Jeepney Only</option>
              <option value="Bus">Bus Only</option>
              <option value="Tricycle">Tricycle Only</option>
              <option value="Boat">🚤 River Boat Only</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Departure
            </label>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>Leaving Now</span>
            </div>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 text-[11px] scrollbar-none">
          <span className="text-slate-400 text-[10px] font-bold flex-shrink-0">Quick:</span>
          {[
            { name: 'PHINMA UPang', lat: 16.0410, lng: 120.3340 },
            { name: 'University of Luzon', lat: 16.0440, lng: 120.3385 },
            { name: 'Bonuan Beach', lat: 16.0820, lng: 120.3480 },
            { name: 'City Plaza', lat: 16.0433, lng: 120.3333 },
            { name: 'CSI Mall Lucao', lat: 16.0280, lng: 120.3240 }
          ].map((chip) => (
            <button
              key={chip.name}
              type="button"
              onClick={() => handleQuickPick(chip)}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-full text-slate-600 font-medium whitespace-nowrap transition-colors"
            >
              {chip.name}
            </button>
          ))}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !originText.trim() || !destText.trim()}
          className="w-full mt-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Finding best routes...
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              Find Commute Routes
            </>
          )}
        </button>
      </div>

      {/* Results Section */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">No Routes Available</p>
              <p className="mt-0.5 text-rose-600">{error}</p>
            </div>
          </div>
        )}

        {!loading && itineraries.length === 0 && !error && (
          <div className="text-center py-10 px-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-3">
              <Navigation className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Plan Your Commute</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              Enter your starting point and destination in Dagupan City to see flood-aware jeepney, bus, tricycle, and river boat routes.
            </p>
          </div>
        )}

        {itineraries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Suggested Routes ({itineraries.length})
              </span>
              <span className="text-[10px] text-slate-400 italic">Sorted by fastest</span>
            </div>

            <div className="space-y-3">
              {itineraries.map((itinerary, idx) => {
                const isSelected = selectedJourney?.id === itinerary.id;
                const isExpanded = expandedId === itinerary.id;
                const isDetour = itinerary.floodStatus === 'DETOUR_ACTIVE';

                return (
                  <div
                    key={itinerary.id || idx}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-1 ring-emerald-500/30'
                        : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {/* Itinerary Card Header */}
                    <div 
                      onClick={() => {
                        setExpandedId(isExpanded ? null : itinerary.id);
                        if (onSelectJourney) onSelectJourney(itinerary);
                      }}
                      className="p-3.5 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-slate-900">
                              {itinerary.totalDurationFormatted}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {itinerary.totalFareFormatted}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-700 mt-1">
                            {itinerary.title}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectJourney) onSelectJourney(itinerary);
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Viewing' : 'View Route'}
                        </button>
                      </div>

                      {/* Leg Summary Badges */}
                      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                        {itinerary.legs.map((leg, lIdx) => (
                          <React.Fragment key={leg.id || lIdx}>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200/60">
                              {getModeIcon(leg.mode)}
                              <span>{leg.mode}</span>
                              <span className="text-slate-400 font-normal">({leg.durationMinutes}m)</span>
                            </span>
                            {lIdx < itinerary.legs.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-slate-300" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Flood / Detour Warning Banner */}
                      {itinerary.floodWarning && (
                        <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="leading-snug">{itinerary.floodWarning}</p>
                        </div>
                      )}
                    </div>

                    {/* Expandable Step-by-Step Breakdown */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-3.5 space-y-2.5 text-xs">
                        <div className="font-bold text-slate-600 uppercase text-[10px] tracking-wider mb-1">
                          Commute Steps
                        </div>
                        {itinerary.legs.map((leg, stepIdx) => (
                          <div key={leg.id || stepIdx} className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-bold shadow-2xs flex-shrink-0 mt-0.5">
                              {stepIdx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-slate-800 text-[11px]">
                                {leg.instruction}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {leg.durationFormatted} • {leg.distanceMeters}m
                                {leg.fare > 0 && ` • ₱${leg.fare.toFixed(2)}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Bike,
  CarFront,
  Bus,
  Car,
  Ship,
  Info,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Users
} from 'lucide-react';

export default function FareCalculator() {
  const [selectedMode, setSelectedMode] = useState('tricycle'); // 'tricycle' | 'jeepney' | 'modern_puv' | 'uv_express' | 'provincial_bus' | 'water_boat'

  // Data states
  const [tricycleFares, setTricycleFares] = useState([]);
  const [routeFares, setRouteFares] = useState([]);
  const [boatFares, setBoatFares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tricycle state
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [passengerCount, setPassengerCount] = useState('solo'); // 'solo' | 'pax2' | 'pax3'

  // Route fares state (jeepney, modern_puv, uv_express, provincial_bus)
  const [selectedRouteName, setSelectedRouteName] = useState('');
  const [hasDiscountId, setHasDiscountId] = useState(false);

  // Boat fares state
  const [selectedServiceType, setSelectedServiceType] = useState('');

  const modes = [
    { key: 'tricycle', label: 'Tricycle', icon: Bike, desc: 'Zone-based (Per-Barangay)' },
    { key: 'jeepney', label: 'Traditional Jeepney', icon: CarFront, desc: 'Route-based (LTFRB Matrix)' },
    { key: 'modern_puv', label: 'Modern Aircon PUV', icon: Bus, desc: 'Distance-range (Aircon)' },
    { key: 'uv_express', label: 'UV Express Van', icon: Car, desc: 'Terminal Point-to-Point' },
    { key: 'provincial_bus', label: 'Provincial Bus', icon: Bus, desc: 'Inter-City & Regional' },
    { key: 'water_boat', label: 'Water Boat', icon: Ship, desc: 'Pantal River Ferry & Charter' }
  ];

  // Helper: Format fare range strictly as "₱X – ₱Y" when min !== max, or "₱X" when min === max
  const formatFareRange = (range) => {
    if (!range || range.min === undefined || range.max === undefined) return '—';
    const minStr = Number.isInteger(range.min) ? range.min.toString() : range.min.toFixed(2);
    const maxStr = Number.isInteger(range.max) ? range.max.toString() : range.max.toFixed(2);
    if (range.min === range.max) {
      return `₱${minStr}`;
    }
    return `₱${minStr} – ₱${maxStr}`;
  };

  // Fetch data based on selected mode
  useEffect(() => {
    setLoading(true);
    setError('');

    if (selectedMode === 'tricycle') {
      fetch('/api/fares/tricycles')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load tricycle fares');
          return res.json();
        })
        .then((data) => {
          setTricycleFares(data);
          if (data.length > 0 && !selectedBarangay) {
            setSelectedBarangay(data[0].barangay);
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else if (selectedMode === 'water_boat') {
      fetch('/api/fares/boats')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load boat fares');
          return res.json();
        })
        .then((data) => {
          setBoatFares(data);
          if (data.length > 0 && !selectedServiceType) {
            setSelectedServiceType(data[0].service_type);
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      // Route fare modes: jeepney, modern_puv, uv_express, provincial_bus
      fetch(`/api/fares/routes?mode=${selectedMode}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load ${selectedMode} fares`);
          return res.json();
        })
        .then((data) => {
          setRouteFares(data);
          if (data.length > 0) {
            setSelectedRouteName(data[0].route_name);
          } else {
            setSelectedRouteName('');
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [selectedMode]);

  // Derived current selections
  const currentTricycle = tricycleFares.find((f) => f.barangay === selectedBarangay);
  const currentRoute = routeFares.find((f) => f.route_name === selectedRouteName);
  const currentBoat = boatFares.find((f) => f.service_type === selectedServiceType);

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 pt-10 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-100">
              <Calculator className="w-3.5 h-3.5 text-emerald-600" />
              Authoritative Fare Matrix
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Dagupan Transit Fare Calculator
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-2 leading-relaxed">
              Official POSO and LTFRB tariff schedules across all 6 transport categories serving Dagupan City.
            </p>
          </div>

          {/* Mode Selector Tabs */}
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setSelectedMode(mode.key)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-md shadow-emerald-700/10'
                      : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200/90'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm font-medium text-slate-400">
            Loading fare schedules...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* ══════════════════════════════════════════════════════════════
                1. TRICYCLE VIEW (Zone & Barangay Based)
               ══════════════════════════════════════════════════════════════ */}
            {selectedMode === 'tricycle' && (
              <>
                {/* Left Card: Input Options */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
                    <Bike className="w-4 h-4" />
                    Tricycle Zone Tariff
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-6">Select Destination Barangay</h2>

                  <div className="space-y-6">
                    {/* Barangay Dropdown */}
                    <div>
                      <label htmlFor="barangay-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Destination Barangay
                      </label>
                      <div className="relative">
                        <select
                          id="barangay-select"
                          value={selectedBarangay}
                          onChange={(e) => setSelectedBarangay(e.target.value)}
                          className="w-full py-3.5 px-4 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white appearance-none cursor-pointer"
                        >
                          {tricycleFares.map((f) => (
                            <option key={f.barangay} value={f.barangay}>
                              {f.barangay} ({f.zone})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                          ▼
                        </div>
                      </div>
                    </div>

                    {/* Passenger Count Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Passenger Count / Trip Arrangement
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { key: 'solo', label: 'Solo Passenger', sub: 'Special Trip' },
                          { key: 'pax2', label: '2 Passengers', sub: 'Per Person' },
                          { key: 'pax3', label: '3+ Shared', sub: 'Per Person' }
                        ].map((tier) => {
                          const isSelected = passengerCount === tier.key;
                          return (
                            <button
                              key={tier.key}
                              type="button"
                              onClick={() => setPassengerCount(tier.key)}
                              className={`p-3.5 rounded-2xl text-left border transition-all ${
                                isSelected
                                  ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-600/20 text-slate-900'
                                  : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-600'
                              }`}
                            >
                              <div className="text-xs font-bold">{tier.label}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{tier.sub}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Location Context */}
                    {currentTricycle && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          Key Landmarks / Coverage:
                        </div>
                        <p className="text-slate-500 leading-relaxed">
                          {currentTricycle.landmarks || 'Central barangay thoroughfares'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Card: Result & Pricing Breakdown */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      {currentTricycle?.zone || 'Zone'}
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Official Rate
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-slate-900">
                    {currentTricycle?.barangay || 'Select Barangay'}
                  </h3>

                  {/* Primary Highlighted Fare Box */}
                  <div className="my-6 p-6 rounded-3xl bg-emerald-50/70 border border-emerald-100 flex items-baseline justify-between">
                    <div>
                      <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        {passengerCount === 'solo' && 'Special Trip (Solo)'}
                        {passengerCount === 'pax2' && 'Fare per Person (2 Pax)'}
                        {passengerCount === 'pax3' && 'Shared Fare per Person (3+ Pax)'}
                      </div>
                      <div className="text-xs text-emerald-600/80 mt-1">
                        {passengerCount === 'solo'
                          ? 'Full charter rate for direct ride'
                          : 'Per passenger regular tariff'}
                      </div>
                    </div>

                    <div className="text-3xl sm:text-4xl font-black text-emerald-800 tracking-tight">
                      {currentTricycle && (
                        passengerCount === 'solo'
                          ? formatFareRange(currentTricycle.solo_fare)
                          : passengerCount === 'pax2'
                          ? formatFareRange(currentTricycle.fare_per_2pax)
                          : formatFareRange(currentTricycle.fare_per_3pax_shared)
                      )}
                    </div>
                  </div>

                  {/* Tier Comparison Table */}
                  {currentTricycle && (
                    <div className="space-y-3 pt-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Complete Tariff Tiers for {currentTricycle.barangay}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className={`p-3 rounded-2xl border ${passengerCount === 'solo' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <div className="text-[10px] uppercase text-slate-400">Solo</div>
                          <div className="text-sm font-extrabold mt-1">{formatFareRange(currentTricycle.solo_fare)}</div>
                        </div>

                        <div className={`p-3 rounded-2xl border ${passengerCount === 'pax2' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <div className="text-[10px] uppercase text-slate-400">2 Pax (Each)</div>
                          <div className="text-sm font-extrabold mt-1">{formatFareRange(currentTricycle.fare_per_2pax)}</div>
                        </div>

                        <div className={`p-3 rounded-2xl border ${passengerCount === 'pax3' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <div className="text-[10px] uppercase text-slate-400">3+ Shared</div>
                          <div className="text-sm font-extrabold mt-1">{formatFareRange(currentTricycle.fare_per_3pax_shared)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                2. ROUTE-BASED VIEW (Jeepney, Modern PUV, UV, Provincial Bus)
               ══════════════════════════════════════════════════════════════ */}
            {['jeepney', 'modern_puv', 'uv_express', 'provincial_bus'].includes(selectedMode) && (
              <>
                {/* Left Card: Route Selection & Discount Toggle */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
                    {selectedMode === 'jeepney' && <CarFront className="w-4 h-4" />}
                    {selectedMode === 'modern_puv' && <Bus className="w-4 h-4" />}
                    {selectedMode === 'uv_express' && <Car className="w-4 h-4" />}
                    {selectedMode === 'provincial_bus' && <Bus className="w-4 h-4" />}
                    {modes.find((m) => m.key === selectedMode)?.label} Tariff
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-6">Select Route</h2>

                  <div className="space-y-6">
                    {/* Route Dropdown */}
                    <div>
                      <label htmlFor="route-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Transit Line / Destination
                      </label>
                      <div className="relative">
                        <select
                          id="route-select"
                          value={selectedRouteName}
                          onChange={(e) => setSelectedRouteName(e.target.value)}
                          className="w-full py-3.5 px-4 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white appearance-none cursor-pointer"
                        >
                          {routeFares.map((f) => (
                            <option key={f.route_name} value={f.route_name}>
                              {f.route_name} {f.distance_km ? `(${f.distance_km})` : ''}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                          ▼
                        </div>
                      </div>
                    </div>

                    {/* Route Details Box */}
                    {currentRoute && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-2">
                        <div>
                          <span className="font-bold text-slate-900">Origin / Terminal: </span>
                          <span className="text-slate-600">{currentRoute.terminal}</span>
                        </div>
                        {currentRoute.waypoints && (
                          <div>
                            <span className="font-bold text-slate-900">Waypoints & Coverage: </span>
                            <span className="text-slate-600">{currentRoute.waypoints}</span>
                          </div>
                        )}
                        {currentRoute.distance_km && (
                          <div>
                            <span className="font-bold text-slate-900">Est. Distance: </span>
                            <span className="text-slate-600">{currentRoute.distance_km}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Statutory 20% Discount Toggle */}
                    <div className="pt-2">
                      <label className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 cursor-pointer hover:bg-emerald-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={hasDiscountId}
                          onChange={(e) => setHasDiscountId(e.target.checked)}
                          className="w-5 h-5 rounded-lg text-emerald-700 focus:ring-emerald-500 border-slate-300"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-slate-900">
                            Apply 20% Concession Discount
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            Valid for Student, Senior Citizen, or PWD ID holders
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right Card: Side-by-Side Regular & Discounted Rates */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      {modes.find((m) => m.key === selectedMode)?.label}
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Authorized Fares
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-slate-900 mb-6">
                    {currentRoute?.route_name || 'Select a Route'}
                  </h3>

                  {currentRoute && (
                    <div className="space-y-4">
                      {/* Regular Fare Card */}
                      <div
                        className={`p-6 rounded-3xl border transition-all ${
                          !hasDiscountId
                            ? 'bg-emerald-50/80 border-emerald-200 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Regular Passenger Fare
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">Standard commuter rate</div>
                          </div>
                          <div
                            className={`text-3xl font-black ${
                              !hasDiscountId ? 'text-emerald-800' : 'text-slate-700'
                            }`}
                          >
                            {formatFareRange(currentRoute.regular_fare)}
                          </div>
                        </div>
                      </div>

                      {/* 20% Discounted Fare Card */}
                      <div
                        className={`p-6 rounded-3xl border transition-all ${
                          hasDiscountId
                            ? 'bg-emerald-50/80 border-emerald-200 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                              <span>20% Discounted Fare</span>
                              {hasDiscountId && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Student, Senior Citizen, and PWD
                            </div>
                          </div>
                          <div
                            className={`text-3xl font-black ${
                              hasDiscountId ? 'text-emerald-800' : 'text-slate-600'
                            }`}
                          >
                            {formatFareRange(currentRoute.discounted_fare_20pct)}
                          </div>
                        </div>
                      </div>

                      {hasDiscountId && (
                        <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span>Present your valid Student / Senior / PWD ID to the driver upon boarding.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                3. WATER BOAT VIEW (Service & Variable Note Based)
               ══════════════════════════════════════════════════════════════ */}
            {selectedMode === 'water_boat' && (
              <>
                {/* Left Card: Service Type Selection */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
                    <Ship className="w-4 h-4" />
                    Pantal River Water Transport
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-6">Select Boat Service Type</h2>

                  <div className="space-y-6">
                    <div>
                      <label htmlFor="boat-service-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Service Type
                      </label>
                      <div className="relative">
                        <select
                          id="boat-service-select"
                          value={selectedServiceType}
                          onChange={(e) => setSelectedServiceType(e.target.value)}
                          className="w-full py-3.5 px-4 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white appearance-none cursor-pointer"
                        >
                          {boatFares.map((f) => (
                            <option key={f.service_type} value={f.service_type}>
                              {f.service_type}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                          ▼
                        </div>
                      </div>
                    </div>

                    {currentBoat && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-2">
                        <div>
                          <span className="font-bold text-slate-900">Dock Location: </span>
                          <span className="text-slate-600">{currentBoat.dock_location}</span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">Destinations Covered: </span>
                          <span className="text-slate-600">{currentBoat.destinations}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Card: Descriptive Boat Rate Box */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      Watercraft Service
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Variable Rates
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-slate-900">
                    {currentBoat?.service_type || 'Select Service'}
                  </h3>

                  <div className="my-6 p-6 rounded-3xl bg-blue-50/60 border border-blue-100 space-y-2">
                    <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                      Fare / Rate Range Note
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-blue-900">
                      {currentBoat?.fare_rate_note || '—'}
                    </div>
                    <p className="text-xs text-blue-700/80 pt-1 leading-relaxed">
                      Boat fares are variable and agreed upon directly with the boat operators (bangkeros) depending on tides, passenger load, and river conditions.
                    </p>
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 5 — Data Integrity & Regulatory Disclaimer
           ══════════════════════════════════════════════════════════════ */}
        <div className="mt-10 p-5 rounded-2xl bg-slate-100/70 border border-slate-200 text-xs text-slate-500 leading-relaxed max-w-4xl mx-auto text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 font-bold text-slate-700">
            <Info className="w-4 h-4 text-emerald-600" />
            <span>Official Regulatory Tariff Disclaimer</span>
          </div>
          <p>
            Fares displayed in this matrix are indicative and based on published POSO (Public Order and Safety Office - Dagupan City) tricycle ordinances and LTFRB regional fare matrices for Region I. Actual charged rates may vary due to localized detours, peak hours, or special charter arrangements. Range values (e.g. ₱X – ₱Y) reflect official minimum and maximum thresholds and should not be treated as guaranteed fixed prices.
          </p>
        </div>
      </div>
    </div>
  );
}

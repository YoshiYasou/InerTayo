import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { 
  ArrowUpDown, 
  MapPin, 
  Navigation, 
  Compass, 
  Route, 
  ShieldAlert, 
  Bus, 
  Bike, 
  CarFront,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';

export default function Home() {
  const { navigate } = useRouter();
  const [fromLocation, setFromLocation] = useState('Dagupan Plaza');
  const [toLocation, setToLocation] = useState('Bonuan Beach, Dagupan');
  const [preference, setPreference] = useState('fastest'); // 'fastest' | 'cheapest'
  const [activeAdvisory, setActiveAdvisory] = useState(null);
  const [modes, setModes] = useState([]);

  useEffect(() => {
    // Fetch active advisories
    fetch('/api/advisories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setActiveAdvisory(data[0]);
        }
      })
      .catch(err => console.error('Error loading advisories:', err));

    // Fetch transport modes
    fetch('/api/transport-modes')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setModes(data);
        }
      })
      .catch(err => console.error('Error loading modes:', err));
  }, []);

  const handleSwap = () => {
    const temp = fromLocation;
    setFromLocation(toLocation);
    setToLocation(temp);
  };

  const handleGetDirections = (e) => {
    e.preventDefault();
    // Route to Route Directory pre-filtered per §0.9
    navigate('/routes', {
      from: fromLocation,
      to: toLocation,
      sort: preference === 'fastest' ? 'Fastest Travel Time' : 'Cheapest Fare'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      
      {/* ========================================================================= */}
      {/* HERO SECTION matching Page 1 UI Reference */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-8 pb-16 lg:py-16 bg-gradient-to-b from-slate-100/60 via-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* Left Hero Card: Route Finder Form */}
            <div className="lg:col-span-5 flex flex-col justify-center">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-100 relative">
                
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Where are you heading?
                </h1>
                <p className="text-sm text-slate-500 mt-1.5 mb-6">
                  Find the best Jeepney, Tricycle, and Bus routes in Dagupan.
                </p>

                <form onSubmit={handleGetDirections} className="space-y-4">
                  {/* FROM / TO inputs with vertical swap */}
                  <div className="relative space-y-3">
                    
                    {/* FROM Input */}
                    <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white transition-all">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                        FROM (START)
                      </label>
                      <LocationAutocomplete
                        value={fromLocation}
                        onChange={setFromLocation}
                        placeholder="e.g. Bonuan Beach, Dagupan"
                        required
                        icon={
                          <div className="w-5 h-5 rounded-full border-2 border-slate-400 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                          </div>
                        }
                      />
                    </div>

                    {/* Swap Button */}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10">
                      <button
                        type="button"
                        onClick={handleSwap}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition-all active:scale-95"
                        title="Swap locations"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* TO Input */}
                    <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white transition-all">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                        TO (DESTINATION)
                      </label>
                      <LocationAutocomplete
                        value={toLocation}
                        onChange={setToLocation}
                        placeholder="e.g. CSI Mall, Dagupan"
                        required
                        icon={<MapPin className="w-5 h-5 text-rose-500 flex-shrink-0" />}
                      />
                    </div>

                  </div>

                  {/* Fastest / Cheapest Toggle */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreference('fastest')}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        preference === 'fastest'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Fastest
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreference('cheapest')}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        preference === 'cheapest'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Cheapest
                    </button>
                  </div>

                  {/* Primary Action Button */}
                  <button
                    type="submit"
                    className="w-full mt-4 py-3.5 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/20 active:scale-98 transition-all"
                  >
                    <ArrowUpDown className="w-4 h-4 rotate-90" />
                    Get Commute Directions
                  </button>

                </form>

              </div>
            </div>

            {/* Right Hero Card: Map Graphic & Flood-Aware Narrative */}
            <div className="lg:col-span-7">
              <div className="h-full rounded-3xl bg-slate-900 text-white p-8 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col justify-between border border-slate-800">
                
                {/* Visual Map Graphic Background */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <svg className="w-full h-full object-cover" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    {/* Pantal River SVG Curve */}
                    <path d="M 100,50 Q 250,200 450,250 T 750,450" fill="none" stroke="#0284c7" strokeWidth="18" strokeLinecap="round" opacity="0.6"/>
                    <path d="M 300,50 Q 400,150 500,280 T 700,550" fill="none" stroke="#0284c7" strokeWidth="10" strokeLinecap="round" opacity="0.4"/>
                    {/* Transit Routes */}
                    <path d="M 120,400 L 350,300 L 520,240 L 700,180" fill="none" stroke="#10b981" strokeWidth="5" strokeDasharray="8,6" />
                    <path d="M 220,500 L 380,380 L 480,200 L 600,100" fill="none" stroke="#ec4899" strokeWidth="5" strokeDasharray="8,6" />
                  </svg>
                </div>

                {/* Floating Landmark Badges */}
                <div className="absolute top-6 right-6 hidden sm:flex flex-col gap-2 pointer-events-none opacity-80">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 backdrop-blur rounded-full text-[11px] font-medium border border-slate-700">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    SM Center Dagupan
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 backdrop-blur rounded-full text-[11px] font-medium border border-slate-700">
                    <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                    Dagupan Doctors Villaflor
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 backdrop-blur rounded-full text-[11px] font-medium border border-slate-700">
                    <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                    Robinsons Place Pangasinan
                  </div>
                </div>

                {/* Top Content */}
                <div className="relative z-10 max-w-lg space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-400/30">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Flood-Aware Route Finder
                  </div>

                  <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                    Navigate Dagupan, <br className="hidden sm:inline" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
                      rain or shine.
                    </span>
                  </h2>

                  {/* Supporting Copy rephrased per §0.3 */}
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    Get step-by-step commute directions that reflect detour advisories during heavy rain and high tide. Routes reflect current advisories.
                  </p>

                  {/* Non-quantified Stat per §0.10 & Direct Map Launch CTA */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="inline-block">
                      <div className="text-3xl sm:text-4xl font-extrabold text-white">
                        Built for Dagupan
                      </div>
                      <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mt-0.5">
                        Fully Localized Transit Routes
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/map')}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex-shrink-0"
                    >
                      <Compass className="w-4 h-4" />
                      Launch Web Map
                    </button>
                  </div>
                </div>

                {/* Bottom Active Advisory Pill matching design */}
                <div className="relative z-10 mt-8 pt-4">
                  <div 
                    onClick={() => navigate('/routes')}
                    className="w-full bg-amber-500/15 border border-amber-400/40 hover:border-amber-400/70 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between gap-3 text-amber-200 cursor-pointer transition-all hover:bg-amber-500/20"
                  >
                    <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>
                        {activeAdvisory 
                          ? `${activeAdvisory.affected_road} flooded — routes reflect this advisory`
                          : 'AB Fernandez Ave flooded — routes reflect this advisory'}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* HOW IT WORKS matching Page 1 UI Reference */}
      {/* ========================================================================= */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              Beating Dagupan traffic in three simple steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Step 01 */}
            <div className="bg-slate-50/80 rounded-3xl p-8 border border-slate-100 relative group hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                  <Compass className="w-6 h-6" />
                </div>
                <span className="text-3xl font-black text-slate-300 group-hover:text-emerald-500/40 transition-colors">
                  01
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Enter Destination
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Type where you are and where you want to go. We support landmarks, malls, schools, and streets across Dagupan.
              </p>
            </div>

            {/* Step 02 */}
            <div className="bg-slate-50/80 rounded-3xl p-8 border border-slate-100 relative group hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                  <Route className="w-6 h-6" />
                </div>
                <span className="text-3xl font-black text-slate-300 group-hover:text-emerald-500/40 transition-colors">
                  02
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Choose Best Route
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Compare options based on travel time, walk distance, fare cost, and your preferred modes of transit.
              </p>
            </div>

            {/* Step 03 */}
            <div className="bg-slate-50/80 rounded-3xl p-8 border border-slate-100 relative group hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                  <Navigation className="w-6 h-6" />
                </div>
                <span className="text-3xl font-black text-slate-300 group-hover:text-emerald-500/40 transition-colors">
                  03
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Start Commuting
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Follow easy, step-by-step instructions on where to walk, what signboard to look for, and how much to pay.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SUPPORTED TRANSIT matching Page 1 UI Reference */}
      {/* ========================================================================= */}
      <section className="py-20 bg-slate-50/70 border-t border-slate-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              Supported Transit
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              We integrate all local modes of transport in Dagupan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Mode 1: Jeepney */}
            <div 
              onClick={() => navigate('/routes', { mode: 'Jeepney' })}
              className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-4 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-pink-50 text-pink-600 border border-pink-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <CarFront className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Jeepney
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Classic & Modern e-Jeeps
                </p>
              </div>
            </div>

            {/* Mode 2: Bus */}
            <div 
              onClick={() => navigate('/routes', { mode: 'Bus' })}
              className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-4 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <Bus className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Bus
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dagupan Loop
                </p>
              </div>
            </div>

            {/* Mode 3: Tricycle */}
            <div 
              onClick={() => navigate('/routes', { mode: 'Tricycle' })}
              className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-4 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <Bike className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Tricycle
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Last-mile neighborhood transit
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

    </div>
  );
}

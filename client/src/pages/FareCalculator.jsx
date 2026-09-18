import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { Calculator, MapPin, Footprints, CarFront, Bike, Bus, AlertCircle, Ship } from 'lucide-react';

export default function FareCalculator() {
  const { queryParams } = useRouter();

  const [fromLoc, setFromLoc] = useState(queryParams.from || 'Bonuan Beach');
  const [toLoc, setToLoc] = useState(queryParams.to || 'Dagupan Plaza');
  const [passengerType, setPassengerType] = useState('STUDENT');
  const [calculationResult, setCalculationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const passengerTypes = [
    { key: 'REGULAR', label: 'Regular' },
    { key: 'STUDENT', label: 'Student' },
    { key: 'SENIOR_CITIZEN', label: 'Senior Citizen' },
    { key: 'PWD', label: 'PWD' }
  ];

  // Perform initial calculation on mount
  useEffect(() => {
    handleCalculate();
  }, []);

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/fare-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromLoc,
          to: toLoc,
          passengerType
        })
      });

      const data = await res.json();
      setCalculationResult(data);
    } catch (err) {
      console.error('Error calculating fare:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderLegIcon = (mode) => {
    const m = (mode || '').toLowerCase();
    if (m.includes('walk')) return <Footprints className="w-4 h-4 text-emerald-600" />;
    if (m.includes('jeep')) return <CarFront className="w-4 h-4 text-pink-600" />;
    if (m.includes('bus')) return <Bus className="w-4 h-4 text-emerald-700" />;
    if (m.includes('boat') || m.includes('ship') || m.includes('river')) return <Ship className="w-4 h-4 text-blue-600" />;
    return <Bike className="w-4 h-4 text-cyan-600" />;
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      
      {/* Header matching Page 6 */}
      <div className="bg-white border-b border-slate-100 pt-10 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            {/* Neutral Eyebrow per §0.2 */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-100">
              <Calculator className="w-3.5 h-3.5 text-emerald-600" />
              Fare Calculator
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Fare Calculator
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-2 leading-relaxed">
              Get fare estimates for jeepney, tricycle, and bus routes in Dagupan.
            </p>
          </div>
        </div>
      </div>

      {/* Main Calculator Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Card: Calculate Route Fare */}
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Calculate Route Fare
            </h2>

            <form onSubmit={handleCalculate} className="space-y-5">
              
              {/* FROM */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  FROM
                </label>
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white transition-all">
                  <LocationAutocomplete
                    value={fromLoc}
                    onChange={setFromLoc}
                    placeholder="Enter starting landmark, street, or terminal"
                    required
                    icon={<MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  />
                </div>
              </div>

              {/* TO */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  TO
                </label>
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white transition-all">
                  <LocationAutocomplete
                    value={toLoc}
                    onChange={setToLoc}
                    placeholder="Enter destination landmark, street, or terminal"
                    required
                    icon={<MapPin className="w-4 h-4 text-rose-500 flex-shrink-0" />}
                  />
                </div>
              </div>

              {/* Passenger Type Pills matching Page 6 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Passenger Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {passengerTypes.map((type) => {
                    const isSelected = passengerType === type.key;
                    return (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => setPassengerType(type.key)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Calculate Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? 'Calculating...' : 'Calculate Fare'}
              </button>

            </form>
          </div>

          {/* Right Card: Fare Breakdown matching Page 6 */}
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Fare Breakdown
            </h2>

            {calculationResult ? (
              <div className="space-y-6">
                
                {/* Leg List */}
                <div className="space-y-4">
                  {calculationResult.legs.map((leg, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                          {renderLegIcon(leg.mode)}
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-slate-900">
                            {leg.instruction}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {leg.mode}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {leg.isFree ? (
                          <span className="text-sm font-bold text-slate-400">Free</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {leg.discountPercent > 0 && (
                              <span className="text-xs text-slate-400 line-through">
                                ₱{leg.baseFare.toFixed(2)}
                              </span>
                            )}
                            <span className="text-sm font-extrabold text-slate-900">
                              ₱{leg.finalFare.toFixed(2)}
                            </span>
                            {leg.discountPercent > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {leg.discountPercent}% off
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Estimated Fare Highlight */}
                <div className="pt-5 border-t border-slate-100">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Total Estimated Fare
                      </span>
                      {calculationResult.discountPercentage > 0 && (
                        <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-lg border border-emerald-100">
                          Based on {passengerTypes.find(p => p.key === calculationResult.passengerType)?.label} fare discount ({calculationResult.discountPercentage}%)
                        </span>
                      )}
                    </div>
                    
                    <div className="text-3xl sm:text-4xl font-black text-emerald-700">
                      ₱{calculationResult.totalEstimatedFare.toFixed(2)}
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">
                Click "Calculate Fare" to view itemized transit leg rates.
              </div>
            )}

          </div>

        </div>

        {/* Disclaimer Footer per §0.2 (Removing false legal citations) */}
        <div className="mt-8 p-4 rounded-2xl bg-slate-100/70 border border-slate-200 text-xs text-slate-500 leading-relaxed max-w-4xl mx-auto text-center">
          <p>
            {calculationResult?.disclaimer ||
              'Fare estimates are based on project/sample route data and configured discount rules. They are not officially verified municipal rates and may vary.'}
          </p>
        </div>

      </div>

    </div>
  );
}

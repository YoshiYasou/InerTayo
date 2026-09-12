import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Heart, 
  Send, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  Compass, 
  Users, 
  ShieldCheck 
} from 'lucide-react';

export default function About() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: '', msg: '' });

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('inertayo_token') ? { 'Authorization': `Bearer ${localStorage.getItem('inertayo_token')}` } : {})
        },
        body: JSON.stringify({ name, email, message })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback.');
      }

      setStatus({
        type: 'success',
        msg: 'Thank you! Your feedback has been received and helps keep Dagupan routes accurate.'
      });
      setMessage('');
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err.message || 'An error occurred while submitting your message.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      
      {/* Hero Header */}
      <div className="bg-slate-50 border-b border-slate-100 pt-16 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-4 border border-emerald-100">
            <Heart className="w-3.5 h-3.5 text-emerald-600" />
            Our Story
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            About InerTayo
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mt-6 leading-relaxed max-w-2xl mx-auto">
            InerTayo was created to solve a daily reality for thousands of commuters in Dagupan City: navigating an intricate network of jeepneys, tricycles, and buses while dealing with unpredictable high tides and seasonal flooding along key arteries.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 space-y-20">
        
        {/* Our Mission Section */}
        <section className="space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Our Mission
          </h2>
          <p className="text-slate-600 leading-relaxed text-base sm:text-lg">
            Our mission is to empower everyday commuters, students, workers, and visitors in Dagupan City with clear, transparent, and flood-resilient route information. We believe public transit is the heartbeat of local commerce, and when commuters can easily plan their journeys, compare fares, and receive timely road advisories, the entire community moves forward together.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <Compass className="w-6 h-6 text-emerald-600 mb-3" />
              <h3 className="font-bold text-slate-900 text-base mb-1">Clear Directions</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Step-by-step guidance for every leg of your commute across major terminals, plazas, and commercial hubs.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <MapPin className="w-6 h-6 text-emerald-600 mb-3" />
              <h3 className="font-bold text-slate-900 text-base mb-1">Flood Awareness</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Database-backed advisories alerting commuters to high tide inundations and active detour corridors.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <ShieldCheck className="w-6 h-6 text-emerald-600 mb-3" />
              <h3 className="font-bold text-slate-900 text-base mb-1">Fair Fare Estimates</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Leg-by-leg fare estimations with transparent student, senior citizen, and PWD discount calculations.
              </p>
            </div>
          </div>
        </section>

        {/* The Team Behind InerTayo per §0.4 (Generic, non-celebrity personas) */}
        <section className="space-y-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              The Team Behind InerTayo
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Dedicated technologists and transit researchers building for Pangasinan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Team Member 1 */}
            <div className="bg-slate-50/80 rounded-3xl p-6 border border-slate-100 flex flex-col items-start hover:shadow-md transition-all">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg mb-4">
                AS
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Alex Santos
              </h3>
              <span className="text-xs font-semibold text-emerald-700 mb-3">
                Transit Network Specialist
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Passionate about optimizing Dagupan's multi-modal transit corridors and ensuring route data reflects daily commuter patterns.
              </p>
            </div>

            {/* Team Member 2 */}
            <div className="bg-slate-50/80 rounded-3xl p-6 border border-slate-100 flex flex-col items-start hover:shadow-md transition-all">
              <div className="w-14 h-14 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold text-lg mb-4">
                JR
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Jordan Rivera
              </h3>
              <span className="text-xs font-semibold text-cyan-700 mb-3">
                Full-Stack Systems Engineer
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Architects reliable database schemas, fast search indices, and accessible user interfaces for commuters of all ages.
              </p>
            </div>

            {/* Team Member 3 */}
            <div className="bg-slate-50/80 rounded-3xl p-6 border border-slate-100 flex flex-col items-start hover:shadow-md transition-all">
              <div className="w-14 h-14 rounded-2xl bg-pink-100 text-pink-800 flex items-center justify-center font-bold text-lg mb-4">
                SD
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Sam Dela Cruz
              </h3>
              <span className="text-xs font-semibold text-pink-700 mb-3">
                GIS & Local Research Mapper
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Spends mornings documenting tricycle stations, transfer hubs, and low-lying flood points across Pangasinan.
              </p>
            </div>

          </div>
        </section>

        {/* Get in Touch Section matching Page 5 */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 border border-slate-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            
            <div className="lg:col-span-6 space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  Contact Us
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold mt-2">
                  Get in Touch
                </h2>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  Have questions about a route or want to report a transit schedule update? Drop us a line. We are constantly improving our localized directory to serve Dagupan commuters.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2.5 text-slate-300">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span>Email us: <a href="mailto:support@inertayo.ph" className="text-white underline font-semibold">support@inertayo.ph</a></span>
                </div>
              </div>

              <div className="pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Follow Commuter Advisory
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  <span className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors">
                    Facebook
                  </span>
                  <span className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors">
                    Twitter
                  </span>
                  <span className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors">
                    Instagram
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Feedback Form */}
            <div className="lg:col-span-6 bg-slate-800/80 rounded-2xl p-6 sm:p-8 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-4">
                Send Commuter Feedback
              </h3>

              {status.msg && (
                <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  status.type === 'success' ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-200' : 'bg-rose-900/50 border border-rose-700 text-rose-200'
                }`}>
                  {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{status.msg}</span>
                </div>
              )}

              <form onSubmit={handleSubmitFeedback} className="space-y-4 text-slate-900">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Juan Dela Cruz"
                    className="w-full px-3.5 py-2.5 bg-slate-900 text-white border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@dagupan.ph"
                    className="w-full px-3.5 py-2.5 bg-slate-900 text-white border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Report or Suggestion
                  </label>
                  <textarea
                    required
                    rows="3"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. AB Fernandez Ave is clear today, or tricycle fares to Lucao changed..."
                    className="w-full px-3.5 py-2.5 bg-slate-900 text-white border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Submitting...' : 'Submit Commuter Feedback'}
                </button>
              </form>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}

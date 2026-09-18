import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, Mail, User, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function AuthModal() {
  const { authModalOpen, authModalMode, closeAuth, setAuthModalMode, login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!authModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (authModalMode === 'login') {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      // Reset form
      setUsername('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
    } catch (err) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCreds = (type) => {
    if (type === 'admin') {
      setUsername('admin');
      setPassword('AdminPassword123!');
      setAuthModalMode('login');
    } else {
      setUsername('commuter');
      setPassword('Commuter123!');
      setAuthModalMode('login');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={closeAuth}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3 shadow">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">
            {authModalMode === 'login' ? 'Sign In to InerTayo' : 'Create Commuter Account'}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {authModalMode === 'login'
              ? 'Access saved routes and submit verified commuter feedback.'
              : 'Join fellow Dagupan commuters to save daily routes.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. commuter or admin"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {authModalMode === 'register' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="commuter@example.ph"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm transition-all shadow-md active:scale-98 disabled:opacity-50"
          >
            {loading
              ? 'Processing...'
              : authModalMode === 'login'
              ? 'Sign In'
              : 'Register Account'}
          </button>
        </form>

        {/* Quick Credentials for Demo/Testing */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Quick fill credentials:</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fillQuickCreds('commuter')}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Commuter
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => fillQuickCreds('admin')}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Admin
            </button>
          </div>
        </div>

        {/* Mode Switch */}
        <div className="mt-4 text-center text-xs text-slate-500">
          {authModalMode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setError(''); setAuthModalMode('register'); }}
                className="text-emerald-700 font-bold hover:underline"
              >
                Register as Commuter
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setError(''); setAuthModalMode('login'); }}
                className="text-emerald-700 font-bold hover:underline"
              >
                Sign In
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

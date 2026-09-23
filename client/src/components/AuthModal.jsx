import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Lock, 
  Mail, 
  User, 
  ShieldCheck, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Check, 
  Clock,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Info
} from 'lucide-react';

export default function AuthModal() {
  const { 
    authModalOpen, 
    authModalMode, 
    closeAuth, 
    setAuthModalMode, 
    login, 
    register,
    forgotPassword,
    resetPassword
  } = useAuth();
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [devCodeHint, setDevCodeHint] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Security & Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Countdown timer for rate limiting lockout
  useEffect(() => {
    let interval = null;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            setFailedAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  // Real-time password criteria evaluation
  const passwordCriteria = useMemo(() => {
    return {
      hasMinLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
    };
  }, [password]);

  // Password strength calculation (0 to 5)
  const strengthScore = useMemo(() => {
    let score = 0;
    if (passwordCriteria.hasMinLength) score++;
    if (passwordCriteria.hasUpper) score++;
    if (passwordCriteria.hasLower) score++;
    if (passwordCriteria.hasNumber) score++;
    if (passwordCriteria.hasSpecial) score++;
    return score;
  }, [passwordCriteria]);

  const strengthLabel = useMemo(() => {
    if (!password) return { text: '', color: 'bg-slate-200' };
    if (strengthScore <= 2) return { text: 'Weak', color: 'bg-rose-500' };
    if (strengthScore <= 4) return { text: 'Moderate', color: 'bg-amber-500' };
    return { text: 'Strong', color: 'bg-emerald-500' };
  }, [strengthScore, password]);

  const passwordsMatch = useMemo(() => {
    if (!confirmPassword) return null;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  if (!authModalOpen) return null;

  const resetFormState = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setResetCode('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError('');
    setSuccessMsg('');
    setDevCodeHint('');
  };

  const handleSwitchMode = (mode) => {
    resetFormState();
    setAuthModalMode(mode);
  };

  const validatePasswordRules = () => {
    if (!passwordCriteria.hasMinLength) {
      setError('Password must be at least 8 characters long.');
      return false;
    }
    if (!passwordCriteria.hasUpper) {
      setError('Password must contain at least one uppercase letter (A-Z).');
      return false;
    }
    if (!passwordCriteria.hasLower) {
      setError('Password must contain at least one lowercase letter (a-z).');
      return false;
    }
    if (!passwordCriteria.hasNumber) {
      setError('Password must contain at least one number (0-9).');
      return false;
    }
    if (!passwordCriteria.hasSpecial) {
      setError('Password must contain at least one special character (e.g. !@#$%).');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-type your password.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // Check rate limit lockout
    if (authModalMode === 'login' && lockoutTimer > 0) {
      setError(`Too many attempts. Please wait ${lockoutTimer} seconds.`);
      return;
    }

    // 1. REGISTER MODE
    if (authModalMode === 'register') {
      const cleanUsername = username.trim();
      if (cleanUsername.length < 3 || cleanUsername.length > 30) {
        setError('Username must be between 3 and 30 characters.');
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
        setError('Username can only contain letters, numbers, underscores, and hyphens.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address.');
        return;
      }

      if (!validatePasswordRules()) return;

      setLoading(true);
      try {
        await register(cleanUsername, email.trim(), password);
        resetFormState();
      } catch (err) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. FORGOT PASSWORD REQUEST MODE
    if (authModalMode === 'forgot_request') {
      if (!email.trim() && !username.trim()) {
        setError('Please enter your registered email address or username.');
        return;
      }

      setLoading(true);
      try {
        const identifier = email.trim() || username.trim();
        const res = await forgotPassword(identifier);
        
        if (res.devCode) {
          setDevCodeHint(res.devCode);
          setResetCode(res.devCode); // Auto-fill for developer convenience
        }
        if (res.email) {
          setEmail(res.email);
        }

        setSuccessMsg(res.message || 'Reset code generated. Please check your email.');
        setAuthModalMode('forgot_reset');
      } catch (err) {
        setError(err.message || 'Failed to request password reset code.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. FORGOT PASSWORD RESET MODE
    if (authModalMode === 'forgot_reset') {
      if (!resetCode.trim()) {
        setError('Please enter the 6-digit verification code.');
        return;
      }
      if (!validatePasswordRules()) return;

      setLoading(true);
      try {
        const res = await resetPassword(email.trim(), resetCode.trim(), password);
        resetFormState();
        setSuccessMsg(res.message || 'Password reset successfully! Please sign in with your new password.');
        setAuthModalMode('login');
      } catch (err) {
        setError(err.message || 'Failed to reset password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 4. LOGIN MODE
    setLoading(true);
    try {
      await login(username.trim(), password);
      setFailedAttempts(0);
      resetFormState();
    } catch (err) {
      const errMsg = err.message || 'Authentication error.';
      setError(errMsg);

      // Brute-force protection: increment failed attempts on login failure
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);

      if (nextAttempts >= 5 || errMsg.includes('429') || errMsg.includes('Too many')) {
        setLockoutTimer(60); // 60-second cooldown
        setError('Too many failed attempts. For your security, please wait 60 seconds.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCreds = (type) => {
    if (type === 'admin') {
      setUsername('admin');
      setPassword('AdminPassword123!');
    } else {
      setUsername('commuter');
      setPassword('Commuter123!');
    }
    setError('');
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

        {/* Back Button (For Forgot Password sub-views) */}
        {(authModalMode === 'forgot_request' || authModalMode === 'forgot_reset') && (
          <button
            onClick={() => handleSwitchMode('login')}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3 shadow">
            {authModalMode === 'login' ? (
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            ) : authModalMode === 'register' ? (
              <User className="w-6 h-6 text-emerald-400" />
            ) : (
              <KeyRound className="w-6 h-6 text-emerald-400" />
            )}
          </div>

          <h3 className="text-2xl font-bold text-slate-900">
            {authModalMode === 'login' && 'Sign In to InerTayo'}
            {authModalMode === 'register' && 'Create Commuter Account'}
            {authModalMode === 'forgot_request' && 'Reset Your Password'}
            {authModalMode === 'forgot_reset' && 'Set New Password'}
          </h3>

          <p className="text-sm text-slate-500 mt-1">
            {authModalMode === 'login' && 'Access saved routes and submit verified commuter feedback.'}
            {authModalMode === 'register' && 'Join fellow Dagupan commuters to save daily routes.'}
            {authModalMode === 'forgot_request' && 'Enter your registered email to receive a 6-digit verification code.'}
            {authModalMode === 'forgot_reset' && 'Enter the 6-digit code and choose a new secure password.'}
          </p>
        </div>

        {/* Lockout Warning */}
        {authModalMode === 'login' && lockoutTimer > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 animate-spin" />
            <span>Rate limit active. Please wait {lockoutTimer}s before retrying.</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Developer Demo Code Notice */}
        {devCodeHint && authModalMode === 'forgot_reset' && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>Demo Reset Code: <strong>{devCodeHint}</strong></span>
            </div>
            <span className="text-[10px] bg-indigo-200/60 text-indigo-800 px-2 py-0.5 rounded font-mono font-bold">15m valid</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (authModalMode !== 'login' || lockoutTimer === 0) && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* USERNAME / IDENTIFIER FIELD */}
          {(authModalMode === 'login' || authModalMode === 'register' || authModalMode === 'forgot_request') && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                {authModalMode === 'login' ? 'Username or Email' : authModalMode === 'register' ? 'Username' : 'Registered Email or Username'}
              </label>
              <div className="relative">
                {authModalMode === 'forgot_request' ? (
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                ) : (
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                )}
                <input
                  type={authModalMode === 'forgot_request' ? 'text' : 'text'}
                  required
                  value={authModalMode === 'forgot_request' ? (email || username) : username}
                  disabled={authModalMode === 'login' && lockoutTimer > 0}
                  onChange={(e) => {
                    if (authModalMode === 'forgot_request') {
                      setEmail(e.target.value);
                      setUsername(e.target.value);
                    } else {
                      setUsername(e.target.value);
                    }
                  }}
                  placeholder={
                    authModalMode === 'login'
                      ? 'e.g. commuter or admin'
                      : authModalMode === 'register'
                      ? 'e.g. juan_commuter'
                      : 'e.g. commuter@example.ph or commuter'
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
                />
              </div>
              {authModalMode === 'register' && (
                <p className="text-[11px] text-slate-400 mt-1">3–30 characters, letters & numbers</p>
              )}
            </div>
          )}

          {/* EMAIL FIELD (REGISTER ONLY) */}
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
                  disabled={authModalMode === 'login' && lockoutTimer > 0}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="commuter@example.ph"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* 6-DIGIT RESET CODE (FORGOT_RESET ONLY) */}
          {authModalMode === 'forgot_reset' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          )}

          {/* PASSWORD FIELD (LOGIN, REGISTER, FORGOT_RESET) */}
          {(authModalMode === 'login' || authModalMode === 'register' || authModalMode === 'forgot_reset') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  {authModalMode === 'forgot_reset' ? 'New Password' : 'Password'}
                </label>
                {authModalMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('forgot_request')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  disabled={authModalMode === 'login' && lockoutTimer > 0}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* PASSWORD STRENGTH & REQUIREMENTS (REGISTER & RESET) */}
              {(authModalMode === 'register' || authModalMode === 'forgot_reset') && password.length > 0 && (
                <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[11px] font-semibold text-slate-500">Password Strength:</span>
                    <span className="text-[11px] font-bold text-slate-700">{strengthLabel.text}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${strengthLabel.color}`} 
                      style={{ width: `${(strengthScore / 5) * 100}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      <Check className={`w-3.5 h-3.5 ${passwordCriteria.hasMinLength ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>8+ characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUpper ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      <Check className={`w-3.5 h-3.5 ${passwordCriteria.hasUpper ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>1 uppercase (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasLower ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      <Check className={`w-3.5 h-3.5 ${passwordCriteria.hasLower ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>1 lowercase (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      <Check className={`w-3.5 h-3.5 ${passwordCriteria.hasNumber ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>1 number (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 col-span-2 ${passwordCriteria.hasSpecial ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      <Check className={`w-3.5 h-3.5 ${passwordCriteria.hasSpecial ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>1 special character (e.g. !@#$%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONFIRM PASSWORD (REGISTER & RESET) */}
          {(authModalMode === 'register' || authModalMode === 'forgot_reset') && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                {authModalMode === 'forgot_reset' ? 'Confirm New Password' : 'Confirm Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  disabled={authModalMode === 'login' && lockoutTimer > 0}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Match Feedback */}
              {passwordsMatch !== null && (
                <p className={`text-[11px] mt-1 font-semibold flex items-center gap-1 ${passwordsMatch ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {passwordsMatch ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Passwords match
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loading || (authModalMode === 'login' && lockoutTimer > 0)}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm transition-all shadow-md active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Processing...
              </span>
            ) : authModalMode === 'login' && lockoutTimer > 0 ? (
              `Locked (${lockoutTimer}s)`
            ) : authModalMode === 'login' ? (
              'Sign In'
            ) : authModalMode === 'register' ? (
              'Create Account'
            ) : authModalMode === 'forgot_request' ? (
              'Send Reset Code'
            ) : (
              'Reset Password & Sign In'
            )}
          </button>
        </form>

        {/* QUICK CREDENTIALS FOR DEMO/TESTING (LOGIN ONLY!) */}
        {authModalMode === 'login' && (
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
        )}

        {/* MODE SWITCH */}
        <div className="mt-4 text-center text-xs text-slate-500">
          {authModalMode === 'login' && (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('register')}
                className="text-emerald-700 font-bold hover:underline"
              >
                Create Account
              </button>
            </p>
          )}

          {authModalMode === 'register' && (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className="text-emerald-700 font-bold hover:underline"
              >
                Sign In
              </button>
            </p>
          )}

          {authModalMode === 'forgot_request' && (
            <p>
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className="text-emerald-700 font-bold hover:underline"
              >
                Sign In
              </button>
            </p>
          )}

          {authModalMode === 'forgot_reset' && (
            <p>
              Didn't receive a code?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('forgot_request')}
                className="text-emerald-700 font-bold hover:underline"
              >
                Request Again
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

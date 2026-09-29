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
} from 'lucide-react';

export default function AuthModal() {
  const { 
    user,
    authModalOpen, 
    authModalMode, 
    closeAuth, 
    setAuthModalMode, 
    login, 
    register,
    forgotPassword,
    resetPassword,
    requestChangePasswordCode,
    confirmChangePassword
  } = useAuth();
  
  // Sign In state (strictly user-entered)
  const [username, setUsername] = useState('');
  
  // Registration state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');

  // Password Reset flow state (completely isolated from Sign In)
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');

  // Password inputs
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Isolated feedback and alert states
  const [error, setError] = useState('');
  const [loginSuccessMsg, setLoginSuccessMsg] = useState('');
  const [resetNoticeMsg, setResetNoticeMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Change Password flow state
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [codeRequestLoading, setCodeRequestLoading] = useState(false);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  
  // Security & Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Clear transient reset messages and reset inputs whenever mode changes
  useEffect(() => {
    setError('');
    setResetNoticeMsg('');
  }, [authModalMode]);

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

  // Countdown timer for verification code resend
  useEffect(() => {
    let timer = null;
    if (codeCooldown > 0) {
      timer = setInterval(() => {
        setCodeCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [codeCooldown]);

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
    setPassword('');
    setConfirmPassword('');
    setResetCode('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError('');
    setResetNoticeMsg('');
    setLoginSuccessMsg('');
    setResetIdentifier('');
    setResetEmail('');
    setRegUsername('');
    setRegEmail('');
    setChangePasswordSuccess(false);
  };

  const handleSendChangePasswordCode = async () => {
    setError('');
    setResetNoticeMsg('');
    setCodeRequestLoading(true);
    try {
      const res = await requestChangePasswordCode();
      setResetNoticeMsg(res.message || 'A 6-digit verification code has been sent to your registered email.');
      setCodeCooldown(60);
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setCodeRequestLoading(false);
    }
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
    setLoginSuccessMsg('');
    setResetNoticeMsg('');

    // Check rate limit lockout
    if (authModalMode === 'login' && lockoutTimer > 0) {
      setError(`Too many attempts. Please wait ${lockoutTimer} seconds.`);
      return;
    }

    // 1. REGISTER MODE
    if (authModalMode === 'register') {
      const cleanUsername = regUsername.trim();
      if (cleanUsername.length < 3 || cleanUsername.length > 30) {
        setError('Username must be between 3 and 30 characters.');
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
        setError('Username can only contain letters, numbers, underscores, and hyphens.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(regEmail.trim())) {
        setError('Please enter a valid email address.');
        return;
      }

      if (!validatePasswordRules()) return;

      setLoading(true);
      try {
        await register(cleanUsername, regEmail.trim(), password);
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
      const cleanId = resetIdentifier.trim();
      if (!cleanId) {
        setError('Please enter your registered email address or username.');
        return;
      }

      setLoading(true);
      try {
        const res = await forgotPassword(cleanId);
        setResetEmail(cleanId);
        setResetNoticeMsg(res.message || 'If an account matches that email or username, a verification code has been sent.');
        setResetCode(''); // Verification code starts completely empty
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
        const res = await resetPassword(resetEmail.trim(), resetCode.trim(), password);
        resetFormState();
        setLoginSuccessMsg(res.message || 'Password reset successfully! Please sign in with your new password.');
        setAuthModalMode('login');
      } catch (err) {
        setError(err.message || 'Failed to reset password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 4. CHANGE PASSWORD MODE (AUTHENTICATED)
    if (authModalMode === 'change_password') {
      if (!resetCode.trim()) {
        setError('Please enter the 6-digit verification code.');
        return;
      }
      if (!validatePasswordRules()) return;

      setLoading(true);
      try {
        const res = await confirmChangePassword(resetCode.trim(), password);
        setChangePasswordSuccess(true);
        setResetNoticeMsg('');
      } catch (err) {
        setError(err.message || 'Failed to update password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 5. LOGIN MODE
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
          onClick={() => {
            resetFormState();
            closeAuth();
          }}
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
            {authModalMode === 'change_password' && 'Change Account Password'}
          </h3>

          <p className="text-sm text-slate-500 mt-1">
            {authModalMode === 'login' && 'Access saved routes and submit verified commuter feedback.'}
            {authModalMode === 'register' && 'Join fellow Dagupan commuters to save daily routes.'}
            {authModalMode === 'forgot_request' && 'Enter your registered email to receive a 6-digit verification code.'}
            {authModalMode === 'forgot_reset' && 'Enter the 6-digit code sent to your email and choose a new secure password.'}
            {authModalMode === 'change_password' && 'Verify your email to securely update your account password.'}
          </p>
        </div>

        {/* Lockout Warning */}
        {authModalMode === 'login' && lockoutTimer > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 animate-spin" />
            <span>Rate limit active. Please wait {lockoutTimer}s before retrying.</span>
          </div>
        )}

        {/* Sign In Success Alert (Post-Password Reset Only) */}
        {authModalMode === 'login' && loginSuccessMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{loginSuccessMsg}</span>
          </div>
        )}

        {/* Verification Code Notice (Reset / Change Password Only) */}
        {(authModalMode === 'forgot_request' || authModalMode === 'forgot_reset' || authModalMode === 'change_password') && resetNoticeMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{resetNoticeMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (authModalMode !== 'login' || lockoutTimer === 0) && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Card for Change Password */}
        {changePasswordSuccess && authModalMode === 'change_password' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Password Changed Successfully!</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Your password has been securely updated. Please remember to use your new password next time you sign in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetFormState();
                closeAuth();
              }}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-semibold rounded-xl text-xs transition-colors shadow"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* USERNAME FIELD (LOGIN ONLY) */}
          {authModalMode === 'login' && (
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
                  disabled={lockoutTimer > 0}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. commuter or admin"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* USERNAME & EMAIL (REGISTER ONLY) */}
          {authModalMode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. juan_commuter"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">3–30 characters, letters & numbers</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="commuter@example.ph"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {/* REGISTERED EMAIL OR USERNAME (FORGOT REQUEST ONLY) */}
          {authModalMode === 'forgot_request' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Registered Email or Username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="e.g. commuter@example.ph or commuter"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          )}

          {/* 6-DIGIT RESET CODE (FORGOT_RESET ONLY - NEVER AUTO-FILLED) */}
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

          {/* VERIFICATION CODE SECTION (CHANGE PASSWORD ONLY - NEVER AUTO-FILLED) */}
          {authModalMode === 'change_password' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Account Email:</span>
                  <span className="font-mono text-emerald-700 font-bold">{user?.email || 'Authenticated User'}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] text-slate-500">Need a verification code?</span>
                  <button
                    type="button"
                    onClick={handleSendChangePasswordCode}
                    disabled={codeRequestLoading || codeCooldown > 0}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {codeRequestLoading ? 'Sending...' : codeCooldown > 0 ? `Resend in ${codeCooldown}s` : 'Send Code'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  6-Digit Verification Code *
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
            </div>
          )}

          {/* PASSWORD FIELD (LOGIN, REGISTER, FORGOT_RESET, CHANGE_PASSWORD) */}
          {(authModalMode === 'login' || authModalMode === 'register' || authModalMode === 'forgot_reset' || authModalMode === 'change_password') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  {(authModalMode === 'forgot_reset' || authModalMode === 'change_password') ? 'New Password' : 'Password'}
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

              {/* PASSWORD STRENGTH & REQUIREMENTS (REGISTER, RESET, CHANGE_PASSWORD) */}
              {(authModalMode === 'register' || authModalMode === 'forgot_reset' || authModalMode === 'change_password') && password.length > 0 && (
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

          {/* CONFIRM PASSWORD (REGISTER, RESET, CHANGE_PASSWORD) */}
          {(authModalMode === 'register' || authModalMode === 'forgot_reset' || authModalMode === 'change_password') && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                {(authModalMode === 'forgot_reset' || authModalMode === 'change_password') ? 'Confirm New Password' : 'Confirm Password'}
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
            ) : authModalMode === 'change_password' ? (
              'Update Password'
            ) : (
              'Reset Password & Sign In'
            )}
          </button>

          {authModalMode === 'change_password' && (
            <button
              type="button"
              onClick={closeAuth}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
          )}
        </form>
        )}

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

import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { Menu, X, ShieldCheck, LogOut, Compass, User, Bookmark } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function Navbar() {
  const { currentPath, navigate } = useRouter();
  const { user, isAdmin, isCommuter, logout, openAuth } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const navItems = [
    { label: 'Routes', path: '/routes' },
    { label: 'Fare Calculator', path: '/fare-calculator' },
    { label: 'About', path: '/about' },
  ];

  const handleNav = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const requestLogout = () => {
    setMobileMenuOpen(false);
    setLogoutDialogOpen(true);
  };

  const confirmLogout = () => {
    setLogoutDialogOpen(false);
    logout();
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Brand Logo matching design */}
          <div 
            onClick={() => handleNav('/')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-md group-hover:bg-brand-600 transition-colors">
              <div className="flex flex-col gap-1 items-center">
                <div className="w-4 h-1.5 bg-white rounded-full"></div>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                Iner<span className="text-emerald-600">Tayo</span>
              </span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-400 -mt-1">
                Dagupan Transit System
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`text-sm font-semibold transition-colors relative py-1 ${
                    isActive
                      ? 'text-emerald-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full"></span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {/* Single Combined 'Launch Web Map' Button per §0.1 */}
            <button
              onClick={() => handleNav('/map')}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-semibold transition-all shadow-sm active:scale-95 ${
                currentPath === '/map'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-300 text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4 text-emerald-500" />
              Launch Web Map
            </button>
            {isCommuter && (
              <button
                onClick={() => handleNav('/saved-routes')}
                className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                  currentPath === '/saved-routes' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Bookmark className="w-4 h-4" />
                Saved Routes
              </button>
            )}

            {/* Auth Buttons */}
            {user ? (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                {isAdmin ? (
                  <button
                    onClick={() => handleNav('/admin')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      currentPath === '/admin'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                    }`}
                    title="Open Admin Portal"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Admin Portal
                  </button>
                ) : (
                  <button
                    onClick={() => handleNav('/routes')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                    title="Commuter Account"
                  >
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {user.username}
                  </button>
                )}
                <button
                  onClick={requestLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-slate-100"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <button
                  onClick={() => openAuth('login')}
                  className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuth('register')}
                  className="px-3.5 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                >
                  Register
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => handleNav('/map')}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100"
              title="Launch Web Map"
            >
              <Compass className="w-5 h-5 text-emerald-600" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-6 space-y-3 shadow-lg">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-base font-medium ${
                currentPath === item.path
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => handleNav('/map')}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm shadow"
          >
            <Compass className="w-4 h-4 text-emerald-400" />
            Launch Web Map
          </button>
          {isCommuter && (
            <button
              onClick={() => handleNav('/saved-routes')}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-sm"
            >
              <Bookmark className="w-4 h-4" />
              Saved Routes
            </button>
          )}
          
          <div className="pt-3 border-t border-slate-100">
            {user ? (
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">
                  Signed in as {user.username} ({user.role})
                </span>
                <button
                  onClick={requestLogout}
                  className="text-xs text-rose-600 font-semibold hover:underline"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { openAuth('login'); setMobileMenuOpen(false); }}
                  className="py-2 text-center text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { openAuth('register'); setMobileMenuOpen(false); }}
                  className="py-2 text-center text-sm font-semibold text-white bg-emerald-600 rounded-lg"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={logoutDialogOpen}
        title="Log out?"
        message="Are you sure you want to log out?"
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={confirmLogout}
      />
    </header>
  );
}

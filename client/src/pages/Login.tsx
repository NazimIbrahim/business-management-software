import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import {
  Server,
  AlertCircle,
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  LogIn,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  onOpenServerSettings: () => void;
}

export const Login: React.FC<Props> = ({ onOpenServerSettings }) => {
  const { login } = useAuth();
  const { status, serverUrl, company } = useServer();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Standard Login with Username & Password (for All Roles: Admin, Salespersons & Staff)
  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both your username and password.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password. Please verify your credentials or contact Administrator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0f1d] flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Animated Ambient Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Floating Glowing Ambient Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-3xl animate-login-orb-1 pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl animate-login-orb-2 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-blue-600/10 blur-[120px] animate-login-orb-3 pointer-events-none" />

      {/* Sleek Minimalistic Unified Glassmorphic Login Card */}
      <div className="relative z-10 w-full max-w-[420px] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border border-white/60 p-7 sm:p-9 animate-page-enter">
        {/* Harmonious Header with Logo & Typography */}
        <div className="text-center">
          {company?.logo_base64 ? (
            <div className="flex justify-center mb-4">
              <img
                src={company.logo_base64}
                alt={company.company_name || 'Logo'}
                className="max-h-16 max-w-[210px] w-auto object-contain transition-transform duration-300 hover:scale-105"
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-center font-black text-xl shadow-lg mx-auto mb-4 tracking-wider">
              {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
            </div>
          )}

          <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 mb-2">
            <Sparkles size={11} className="text-indigo-600" />
            <span>Quotation Network</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
            {company?.company_name || 'AMA CERAMICS PVT LTD'}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {company?.tagline || 'Commercial Quotation Management'}
          </p>

          {/* Minimalist Server Connection Pill */}
          <div className="flex items-center justify-between px-3 py-1.5 mt-4 bg-slate-100/90 rounded-full border border-slate-200 text-[11px]">
            <div className="flex items-center space-x-1.5 truncate max-w-[240px]">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="font-mono text-slate-600 text-[11px] truncate" title={serverUrl}>
                {serverUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenServerSettings}
              className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 shrink-0 ml-2 cursor-pointer hover:underline"
            >
              <Server size={11} />
              <span>Configure</span>
            </button>
          </div>
        </div>

        {/* Server Disconnected Alert */}
        {status !== 'connected' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span className="font-semibold">Server disconnected</span>
            </div>
            <button
              type="button"
              onClick={onOpenServerSettings}
              className="btn btn-primary btn-xs py-1 px-2.5 text-[10px] font-bold rounded-lg"
            >
              Connect
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start space-x-2 shadow-xs animate-fade-in">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" />
            <span className="font-medium whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleCredentialSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Username or Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon size={15} />
              </div>
              <input
                type="text"
                className="w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-hidden text-slate-900 placeholder:text-slate-400"
                placeholder="Enter username or email..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={15} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full text-xs font-mono pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-hidden text-slate-900 placeholder:text-slate-400"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Minimalist High-End Sign-In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 text-xs sm:text-sm font-bold tracking-wide flex items-center justify-center space-x-2 rounded-xl text-white bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 hover:from-slate-800 hover:to-indigo-900 shadow-lg shadow-slate-900/25 active:scale-[0.99] transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw size={15} className="animate-spin text-white" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <LogIn size={15} className="text-white" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Minimal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1">
            <ShieldCheck size={11} className="text-emerald-600" />
            <span>Secure Enterprise Session</span>
          </span>
          <span>v2.4.23</span>
        </div>
      </div>
    </div>
  );
};

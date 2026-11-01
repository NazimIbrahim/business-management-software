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
    <div className="min-h-screen bg-[#F4F5F7] flex flex-col justify-center items-center p-4">
      <div className="card w-full max-w-md overflow-hidden shadow-2xl border border-[#CBD5E1] animate-page-enter">
        {/* Top Header Banner */}
        <div className="bg-[#0D1B2A] text-[#E0E1DD] p-6 text-center relative">
          {company?.logo_base64 && (
            <div className="flex justify-center mb-3">
              <img
                src={company.logo_base64}
                alt={company.company_name || 'Logo'}
                className="max-h-16 max-w-[200px] object-contain rounded-md bg-white/10 p-1.5 backdrop-blur-sm border border-white/20 shadow-md"
              />
            </div>
          )}
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-[11px] font-semibold tracking-wider uppercase mb-2.5 border border-emerald-400/30">
            <Sparkles size={12} className="text-emerald-400" />
            <span>Central Quotation Network</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[#E0E1DD]">
            {company?.company_name || 'QUOTATION SYSTEM'}
          </h1>
          <p className="text-xs text-[#778DA9] mt-1 font-medium">
            {company?.tagline || 'Commercial Quotation Management'}
          </p>
        </div>

        {/* Server status pill */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            ></span>
            <span className="text-slate-700 font-mono text-[11px] font-semibold truncate max-w-[220px]">
              {serverUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenServerSettings}
            className="text-blue-700 hover:text-blue-800 text-xs font-semibold flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded border border-blue-200 transition-colors cursor-pointer"
          >
            <Server size={12} />
            <span>Configure Server</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {status !== 'connected' && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold block">Server Disconnected</span>
                  <span className="text-[11px] text-amber-700">Connect to the host PC LAN IP or Cloud URL to sign in.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenServerSettings}
                className="btn btn-primary btn-xs py-1 px-3 text-[11px] shrink-0 font-bold"
              >
                Configure
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start space-x-2 shadow-2xs animate-fade-in">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="font-medium whitespace-pre-wrap">{error}</span>
            </div>
          )}

          {/* Secure Credential Login Form */}
          <form onSubmit={handleCredentialSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon size={16} />
                </div>
                <input
                  type="text"
                  className="input pl-9 text-xs w-full font-medium"
                  placeholder="Enter your username or email..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-9 pr-9 text-xs w-full font-mono"
                  placeholder="Enter your password..."
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
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Prominent High-Contrast Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3 text-sm font-extrabold flex items-center justify-center space-x-2 shadow-lg cursor-pointer mt-4 rounded-xl text-white transition-all transform hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, #1B263B 0%, #0D1B2A 100%)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                boxShadow: '0 4px 14px rgba(13, 27, 42, 0.35)',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-white" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn size={16} className="text-white" />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-500 text-center pt-2">
              Please log in with your assigned credentials. Session is securely authenticated.
            </p>
          </form>
        </div>

        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between">
          <span>Security: Direct LAN / Cloud Session</span>
          <span>{company?.company_name ? `${company.company_name} • v2.4.21` : 'Quotation System v2.4.21'}</span>
        </div>
      </div>
    </div>
  );
};

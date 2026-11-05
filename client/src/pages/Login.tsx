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
      setError(
        err.message || 'Invalid username or password. Please verify your credentials or contact Administrator.'
      );
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="stream-login-viewport">
      {/* Ambient Animated Floating Smokey Fog Clouds */}
      <div className="stream-smoke-container" aria-hidden="true">
        <div className="stream-smoke-orb stream-smoke-1" />
        <div className="stream-smoke-orb stream-smoke-2" />
        <div className="stream-smoke-orb stream-smoke-3" />
        <div className="stream-smoke-orb stream-smoke-4" />
      </div>

      {/* Top Header Navigation (Clean Light Theme) */}
      <header className="stream-header">
        <div className="stream-header-brand">
          <div className="stream-header-monogram">
            {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
          </div>
          <div className="stream-header-info">
            <span className="stream-header-title">
              {company?.company_name || 'AMA CERAMICS PVT LTD'}
            </span>
            <span className="stream-header-subtitle">
              Commercial Quotation & Dispatch Portal
            </span>
          </div>
        </div>

        {/* Minimized Minimalist Actions */}
        <div className="stream-header-actions">
          <div
            className="stream-status-pill-mini"
            title={`Connected to ${serverUrl}`}
          >
            <span
              className={`stream-status-dot-mini ${
                isConnected ? 'connected' : 'disconnected'
              }`}
            />
            <span>{isConnected ? 'Connected' : 'Offline'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenServerSettings}
            className="stream-config-btn-mini"
            title="Configure Server Settings"
          >
            <Server size={11} />
            <span>Config</span>
          </button>
        </div>
      </header>

      {/* Center Stage: Physical Lanyard + Pass Badge Card */}
      <main className="stream-center-stage">
        {/* Realistic Physical Lanyard Assembly (Guaranteed from top: 0 with zero gap) */}
        <div className="stream-lanyard-hanger" aria-hidden="true">
          <div className="stream-strap-ribbon" />
          <div className="stream-metal-clamp">
            <div className="stream-metal-ferrule">
              <div className="stream-crimp-emblem">AMA</div>
            </div>
          </div>
          <div className="stream-vinyl-loop-assembly">
            <div className="stream-vinyl-stem" />
            <div className="stream-vinyl-strap">
              <div className="stream-snap-rivet" />
            </div>
          </div>
        </div>

        {/* Physical ID Badge Card Plate (Clean Porcelain Light Theme) */}
        <div className="stream-badge-card animate-page-enter">
          {/* Punched slot cutout at top */}
          <div className="stream-punch-slot" aria-hidden="true" />

          <div className="stream-card-content">
            {/* Brand Logo / Monogram */}
            <div className="stream-badge-brand">
              {company?.logo_base64 ? (
                <img
                  src={company.logo_base64}
                  alt={company.company_name || 'Logo'}
                  className="stream-badge-logo"
                />
              ) : (
                <div className="stream-badge-icon">
                  <span className="font-extrabold text-white text-base tracking-wider">
                    AMA
                  </span>
                </div>
              )}
            </div>

            {/* Single-line Title (No ellipsis cut-off) */}
            <h1
              className="stream-badge-title"
              title={`Welcome to ${company?.company_name || 'AMA CERAMICS PVT LTD'}`}
            >
              Welcome to {company?.company_name || 'AMA CERAMICS PVT LTD'}
            </h1>

            <p className="stream-badge-subtitle">
              {company?.tagline || 'Commercial Quotation & Dispatch Management'}
            </p>

            {/* Disconnected Warning */}
            {!isConnected && (
              <div className="stream-alert-box warning">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 flex items-center justify-between">
                  <span>Server is not reachable.</span>
                  <button
                    type="button"
                    onClick={onOpenServerSettings}
                    className="underline font-semibold ml-2 text-amber-700 hover:text-amber-900"
                  >
                    Configure
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="stream-alert-box error">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleCredentialSubmit} className="stream-form">
              <div className="stream-field-group">
                <label className="stream-field-label">Email or Username</label>
                <div className="stream-input-wrap">
                  <div className="stream-input-icon">
                    <UserIcon size={15} />
                  </div>
                  <input
                    type="text"
                    className="stream-input-field"
                    placeholder="Enter your username or email..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className="stream-field-group">
                <label className="stream-field-label">Password</label>
                <div className="stream-input-wrap">
                  <div className="stream-input-icon">
                    <Lock size={15} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="stream-input-field"
                    style={{ paddingRight: '2.5rem' }}
                    placeholder="Enter your password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="stream-password-toggle"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="stream-btn-primary"
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

            {/* Badge Bottom Security Line */}
            <div className="stream-badge-security">
              <ShieldCheck size={13} className="text-emerald-600 flex-shrink-0" />
              <span>Secure 256-Bit SSL Enterprise Session</span>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Minimalist Footer (Light Theme) */}
      <footer className="stream-footer">
        <span className="stream-footer-copy">
          © {new Date().getFullYear()} {company?.company_name || 'AMA CERAMICS PVT LTD'}. All rights reserved.
        </span>
        <span className="stream-footer-version">v2.4.30</span>
      </footer>
    </div>
  );
};

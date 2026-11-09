import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { User } from '../types';
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
  CheckCircle2,
} from 'lucide-react';

interface Props {
  onOpenServerSettings: () => void;
}

export const Login: React.FC<Props> = ({ onOpenServerSettings }) => {
  const { authenticate, completeLogin } = useAuth();
  const { status, serverUrl, setServerUrl, company } = useServer();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3D Card Flip & Access Granted States
  const [isFlipped, setIsFlipped] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [grantedUser, setGrantedUser] = useState<User | null>(null);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both your username and password.');
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // 1. Authenticate credentials with server
      const data = await authenticate(username.trim(), password);
      setGrantedUser(data.user);

      // 2. Trigger 3D Card Flip Animation to reveal "ACCESS GRANTED"
      setIsFlipped(true);

      // 3. Allow user to view the clearance animation before transitioning to Dashboard
      setTimeout(() => {
        completeLogin(data);
      }, 1450);
    } catch (err: any) {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      setError(
        err.message || 'Invalid username or password. Please verify your credentials or contact Administrator.'
      );
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

        {/* 3D Card Flip Perspective Container */}
        <div className="stream-badge-flipper-container">
          <div
            className={`stream-badge-flipper ${isFlipped ? 'flipped' : ''} ${
              shakeError ? 'shake' : ''
            }`}
          >
            {/* FRONT FACE: Physical ID Badge Pass */}
            <div
              className="stream-badge-card stream-badge-front"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                margin: 0,
              }}
            >
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

                {/* Connecting Indicator */}
                {status === 'connecting' && (
                  <div className="flex items-center justify-center space-x-2 py-1.5 px-3 text-xs text-blue-700 bg-blue-50/80 border border-blue-200/60 rounded-md">
                    <RefreshCw size={13} className="animate-spin text-blue-600 flex-shrink-0" />
                    <span className="truncate">Connecting to server ({serverUrl})...</span>
                  </div>
                )}

                {/* Disconnected Warning */}
                {status === 'disconnected' && (
                  <div className="stream-alert-box warning text-xs">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-900">Server is not reachable</span>
                        <button
                          type="button"
                          onClick={onOpenServerSettings}
                          className="underline font-bold text-amber-800 hover:text-amber-950 ml-2"
                        >
                          Configure
                        </button>
                      </div>
                      <p className="text-[11px] text-amber-700/90 break-all font-mono">
                        Target: {serverUrl}
                      </p>
                      {serverUrl !== 'http://localhost:4000' && (
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setServerUrl('http://localhost:4000');
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200/90 hover:bg-amber-300 text-amber-950 transition-colors"
                          >
                            Switch to Local Host (localhost:4000)
                          </button>
                        </div>
                      )}
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
                        disabled={loading || isFlipped}
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
                        disabled={loading || isFlipped}
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
                    disabled={loading || isFlipped}
                    className="stream-btn-primary"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={15} className="animate-spin text-white" />
                        <span>Verifying Identity...</span>
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

            {/* BACK FACE: ACCESS GRANTED Clearance Hologram */}
            <div
              className="stream-badge-card stream-badge-back"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                margin: 0,
              }}
            >
              {/* Punched slot cutout at top */}
              <div className="stream-punch-slot" aria-hidden="true" />

              <div className="stream-card-content">
                <div>
                  <div className="stream-granted-biometric">
                    <div className="stream-granted-ring-1" />
                    <div className="stream-granted-ring-2" />
                    <div className="stream-granted-icon-box">
                      <CheckCircle2 size={36} />
                    </div>
                  </div>

                  <div className="stream-granted-badge">
                    <span className="stream-granted-dot" />
                    <span>SECURITY CLEARANCE VERIFIED</span>
                  </div>

                  <h2 className="stream-granted-title">ACCESS GRANTED</h2>
                </div>

                <div className="stream-granted-user-card">
                  <div className="stream-granted-avatar">
                    {(grantedUser?.full_name || grantedUser?.username || username || 'U')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="stream-granted-user-info">
                    <span className="stream-granted-username">
                      {grantedUser?.full_name || grantedUser?.username || username}
                    </span>
                    <span className="stream-granted-role">
                      ROLE: {(grantedUser?.role || 'User').toUpperCase()} • CLEARANCE LEVEL 4
                    </span>
                  </div>
                </div>

                <div className="stream-granted-progress-wrap">
                  <div className="stream-granted-progress-bar">
                    <div className="stream-granted-progress-fill" />
                  </div>
                  <span className="stream-granted-redirect-text">
                    Session Authorized • Redirecting to Dashboard...
                  </span>
                </div>

                <div className="stream-badge-security" style={{ marginTop: '0.85rem' }}>
                  <ShieldCheck size={13} className="text-emerald-600 flex-shrink-0" />
                  <span>AMA-AUTH-SECURE // 256-BIT ENCRYPTION // VERIFIED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Minimalist Footer (Light Theme) */}
      <footer className="stream-footer">
        <span className="stream-footer-copy">
          © {new Date().getFullYear()} {company?.company_name || 'AMA CERAMICS PVT LTD'}. All rights reserved.
        </span>
        <span className="stream-footer-version">v2.4.58</span>
      </footer>
    </div>
  );
};

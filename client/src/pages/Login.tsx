import React, { useState, useMemo } from 'react';
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

  // Generate 40 deterministic pseudo-random floating particles across the black background
  const particles = useMemo(() => {
    const colors = [
      'rgba(56, 189, 248, 0.85)',  // cyan
      'rgba(99, 102, 241, 0.85)',  // indigo
      'rgba(168, 85, 247, 0.85)',  // purple
      'rgba(52, 211, 153, 0.85)',  // emerald
      'rgba(251, 191, 36, 0.8)',   // amber
      'rgba(255, 255, 255, 0.9)',  // white star
    ];

    return Array.from({ length: 42 }, (_, i) => {
      const left = ((i * 19 + 7) % 94) + 3; // 3% to 97%
      const top = ((i * 29 + 11) % 94) + 3; // 3% to 97%
      const size = (i % 4) + 2.5;           // 2.5px to 5.5px
      const duration = 6 + (i % 8) * 2;     // 6s to 20s
      const delay = -((i * 1.7) % 12);      // -0s to -12s
      const color = colors[i % colors.length];

      return {
        id: i,
        left: `${left}%`,
        top: `${top}%`,
        size,
        duration: `${duration}s`,
        delay: `${delay}s`,
        color,
      };
    });
  }, []);

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
    <div className="login-universe-bg">
      {/* Random Floating Glowing Particles across Black Background */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="login-particle"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Ambient Pulsing Glow Nebulae in Background */}
      <div className="login-nebula-1" />
      <div className="login-nebula-2" />
      <div className="login-nebula-3" />

      {/* Centered Minimalistic Login Card in the Classic Style */}
      <div
        className="card animate-page-enter"
        style={{
          width: '100%',
          maxWidth: '430px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 10,
          overflow: 'hidden',
          borderRadius: '1rem',
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Top Header Banner - Clean Minimalist Dark Navy */}
        <div
          style={{
            backgroundColor: '#0D1B2A',
            color: '#E0E1DD',
            padding: '1.5rem',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {company?.logo_base64 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <img
                src={company.logo_base64}
                alt={company.company_name || 'Logo'}
                style={{
                  maxHeight: '58px',
                  maxWidth: '220px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.25rem',
                margin: '0 auto 0.75rem auto',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
            </div>
          )}

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.2rem 0.65rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#6EE7B7',
              borderRadius: '9999px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.5rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <Sparkles size={11} style={{ color: '#34D399' }} />
            <span>Central Quotation Network</span>
          </div>

          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              margin: '0 0 0.25rem 0',
              lineHeight: 1.2,
            }}
          >
            {company?.company_name || 'AMA CERAMICS PVT LTD'}
          </h1>
          <p
            style={{
              fontSize: '11px',
              color: '#778DA9',
              margin: 0,
              fontWeight: 500,
            }}
          >
            {company?.tagline || 'Commercial Quotation Management'}
          </p>
        </div>

        {/* Minimalist Server Connection Bar */}
        <div
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: status === 'connected' ? '#10B981' : '#EF4444',
                boxShadow: status === 'connected' ? '0 0 6px #10B981' : 'none',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: '#475569',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '220px',
              }}
              title={serverUrl}
            >
              {serverUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenServerSettings}
            style={{
              color: '#1D4ED8',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              backgroundColor: '#EFF6FF',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #BFDBFE',
              cursor: 'pointer',
            }}
          >
            <Server size={11} />
            <span>Configure Server</span>
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '1.25rem 1.5rem', backgroundColor: '#FFFFFF' }}>
          {status !== 'connected' && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#92400E',
                borderRadius: '0.5rem',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={15} style={{ color: '#D97706', flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>Server Disconnected</span>
              </div>
              <button
                type="button"
                onClick={onOpenServerSettings}
                className="btn btn-primary btn-xs"
                style={{ padding: '0.25rem 0.65rem', fontSize: '10px' }}
              >
                Connect
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                borderRadius: '0.5rem',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={15} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleCredentialSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Username or Email
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    paddingLeft: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    color: '#94A3B8',
                  }}
                >
                  <UserIcon size={15} />
                </div>
                <input
                  type="text"
                  className="input text-xs w-full font-medium"
                  style={{ paddingLeft: '2.25rem', height: '2.4rem' }}
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
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    paddingLeft: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    color: '#94A3B8',
                  }}
                >
                  <Lock size={15} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input text-xs w-full font-mono"
                  style={{ paddingLeft: '2.25rem', paddingRight: '2.25rem', height: '2.4rem' }}
                  placeholder="Enter your password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: 0,
                    paddingRight: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#94A3B8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, #1B263B 0%, #0D1B2A 100%)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 14px rgba(13, 27, 42, 0.35)',
                cursor: 'pointer',
              }}
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

            <p style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center', margin: '0.25rem 0 0 0' }}>
              Please log in with your assigned credentials. Session is securely authenticated.
            </p>
          </form>
        </div>

        {/* Minimal Footer */}
        <div
          style={{
            padding: '0.625rem 1.25rem',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            fontSize: '10px',
            color: '#64748B',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ShieldCheck size={12} style={{ color: '#059669' }} />
            <span>Secure Enterprise Session</span>
          </span>
          <span>{company?.company_name ? `${company.company_name} • v2.4.26` : 'Quotation System v2.4.26'}</span>
        </div>
      </div>
    </div>
  );
};

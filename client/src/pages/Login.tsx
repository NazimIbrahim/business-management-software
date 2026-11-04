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
  CheckCircle2,
  Radio,
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

  // Soft micro-particles in deep space background
  const particles = useMemo(() => {
    const colors = [
      'rgba(99, 102, 241, 0.7)',   // indigo
      'rgba(168, 85, 247, 0.7)',   // purple
      'rgba(56, 189, 248, 0.65)',  // sky
      'rgba(255, 255, 255, 0.75)',  // star
    ];

    return Array.from({ length: 28 }, (_, i) => {
      const left = ((i * 19 + 7) % 94) + 3;
      const top = ((i * 29 + 11) % 94) + 3;
      const size = (i % 3) + 2;
      const duration = 10 + (i % 6) * 3;
      const delay = -((i * 2.1) % 10);
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
    <div className="badge-login-viewport">
      {/* Background Soft Particles & Ambient Nebulae */}
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
      <div className="login-nebula-1" />
      <div className="login-nebula-2" />
      <div className="login-nebula-3" />

      {/* Top Navigation Bar */}
      <header
        style={{
          width: '100%',
          padding: '1.25rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 30,
        }}
      >
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: '13px',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.45)',
            }}
          >
            {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '13px', letterSpacing: '0.04em' }}>
              {company?.company_name || 'AMA CERAMICS'}
            </span>
            <span style={{ color: '#64748B', fontSize: '10px', fontWeight: 500 }}>
              Quotation & Dispatch Portal
            </span>
          </div>
        </div>

        {/* Center navigation hints (desktop view) */}
        <nav
          className="hidden md:flex"
          style={{
            alignItems: 'center',
            gap: '1.75rem',
            fontSize: '12px',
            color: '#94A3B8',
            fontWeight: 500,
          }}
        >
          <span style={{ color: '#E2E8F0', cursor: 'default' }}>Portal Access</span>
          <span style={{ cursor: 'default', opacity: 0.7 }}>Quotation Workflow</span>
          <span style={{ cursor: 'default', opacity: 0.7 }}>Dispatch Management</span>
          <span style={{ cursor: 'default', opacity: 0.7 }}>Encrypted Ledger</span>
        </nav>

        {/* Right server status pill & settings trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor: status === 'connected' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${status === 'connected' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              fontSize: '11px',
              fontWeight: 600,
              color: status === 'connected' ? '#34D399' : '#F87171',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: status === 'connected' ? '#10B981' : '#EF4444',
                boxShadow: status === 'connected' ? '0 0 8px #10B981' : 'none',
              }}
            />
            <span>{status === 'connected' ? 'Server Connected' : 'Server Offline'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenServerSettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#E2E8F0',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
          >
            <Server size={12} className="text-indigo-400" />
            <span>Configure</span>
          </button>
        </div>
      </header>

      {/* Main Center Stage: Suspended Lanyard & ID Pass Badge */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 1rem 2rem 1rem',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Lanyard Suspender descending to card */}
        <div className="badge-lanyard-hanger">
          <div className="badge-lanyard-strap" />
          <div className="badge-clip-clasp">
            <div className="badge-clip-ring" />
          </div>
        </div>

        {/* Suspended ID Badge Card */}
        <div className="badge-glass-card animate-page-enter" style={{ marginTop: '-4px' }}>
          {/* Iridescent Holographic Sheen */}
          <div className="badge-hologram-sheen" />

          {/* Punch Slot Hole */}
          <div className="badge-slot-punch" />

          {/* Card Content Container */}
          <div style={{ padding: '1.25rem 2rem 2rem 2rem', position: 'relative', zIndex: 5 }}>
            {/* Logo / Monogram Display */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              {company?.logo_base64 ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <img
                    src={company.logo_base64}
                    alt={company.company_name || 'Logo'}
                    style={{
                      maxHeight: '62px',
                      maxWidth: '220px',
                      width: 'auto',
                      objectFit: 'contain',
                      display: 'block',
                      filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6))',
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.3) 0%, rgba(124, 58, 237, 0.3) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem auto',
                    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
                  }}
                >
                  <Sparkles size={24} style={{ color: '#818CF8' }} />
                </div>
              )}

              {/* Title & Welcome */}
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  letterSpacing: '-0.025em',
                  margin: '0 0 0.3rem 0',
                  lineHeight: 1.2,
                }}
              >
                Welcome to {company?.company_name || 'AMA Ceramics'}
              </h1>
              <p
                style={{
                  fontSize: '12px',
                  color: '#94A3B8',
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Commercial Quotation & Dispatch Portal
              </p>
            </div>

            {/* Offline Alert */}
            {status !== 'connected' && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.65rem 0.9rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#FCA5A5',
                  borderRadius: '12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <AlertCircle size={15} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Server is offline or unreachable
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  style={{
                    backgroundColor: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Connect
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem 0.9rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  borderRadius: '12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={15} style={{ color: '#EF4444', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleCredentialSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* Username Field */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '0.45rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Email or Username
                </label>
                <div className="badge-input-wrapper">
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      paddingLeft: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                      color: '#818CF8',
                    }}
                  >
                    <UserIcon size={16} />
                  </div>
                  <input
                    type="text"
                    className="badge-input font-medium"
                    placeholder="Enter your username or email..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '0.45rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Password
                </label>
                <div className="badge-input-wrapper">
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      paddingLeft: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                      color: '#818CF8',
                    }}
                  >
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="badge-input font-mono"
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
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: 0,
                      paddingRight: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#64748B',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#C7D2FE')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Sign In CTA */}
              <button
                type="submit"
                disabled={loading}
                className="badge-signin-btn"
                style={{ marginTop: '0.5rem' }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin text-white" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={16} className="text-white" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {/* Security Tag */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  fontSize: '11px',
                  color: '#64748B',
                  marginTop: '0.25rem',
                }}
              >
                <ShieldCheck size={13} style={{ color: '#10B981' }} />
                <span>Secure 256-Bit SSL Enterprise Session</span>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Minimal Footer matching reference image */}
      <footer
        style={{
          width: '100%',
          padding: '1.25rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#475569',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          position: 'relative',
          zIndex: 30,
        }}
      >
        <span>
          © {new Date().getFullYear()} {company?.company_name || 'AMA Ceramics Pvt Ltd'}. All rights reserved.
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontFamily: 'monospace', color: '#64748B' }}>v2.4.30</span>
          <span className="hidden sm:inline" style={{ color: '#334155' }}>•</span>
          <span className="hidden sm:inline" style={{ color: '#64748B' }}>Role-Based Access Control</span>
        </div>
      </footer>
    </div>
  );
};

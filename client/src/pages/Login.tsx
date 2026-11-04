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
  Cpu,
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
      setError(err.message || 'Invalid username or password. Please verify your credentials or contact Administrator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="idcard-login-viewport">
      {/* Sleek Top Navigation Header */}
      <header className="w-full px-3.5 py-2.5 sm:px-8 sm:py-5 flex items-center justify-between relative z-40">
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              background: '#161922',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '11px',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
              flexShrink: 0,
            }}
          >
            {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '12px', letterSpacing: '0.04em' }}>
              {company?.company_name || 'AMA CERAMICS'}
            </span>
            <span className="hidden sm:inline" style={{ color: '#64748B', fontSize: '10px', fontWeight: 500 }}>
              Commercial Quotation & Dispatch Portal
            </span>
          </div>
        </div>

        {/* Left-aligned navigation hints, keeping center corridor open for lanyard */}
        <nav
          className="hidden lg:flex"
          style={{
            alignItems: 'center',
            gap: '1.5rem',
            fontSize: '11px',
            color: '#64748B',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginRight: 'auto',
            marginLeft: '2.5rem',
          }}
        >
          <span style={{ color: '#E2E8F0', cursor: 'default' }}>Portal Access</span>
          <span style={{ cursor: 'default', opacity: 0.6 }}>Quotation Network</span>
          <span style={{ cursor: 'default', opacity: 0.6 }}>Dispatch Manager</span>
        </nav>

        {/* Right server status pill & settings trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.28rem 0.65rem',
              borderRadius: '9999px',
              backgroundColor: '#12151C',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#E2E8F0',
            }}
          >
            <span
              style={{
                width: '6.5px',
                height: '6.5px',
                borderRadius: '50%',
                backgroundColor: status === 'connected' ? '#10B981' : '#EF4444',
                boxShadow: status === 'connected' ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(239, 68, 68, 0.6)',
                flexShrink: 0,
              }}
            />
            <span className="hidden sm:inline">{status === 'connected' ? 'Server Connected' : 'Server Offline'}</span>
            <span className="sm:hidden text-[10px]">{status === 'connected' ? 'Online' : 'Offline'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenServerSettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.65rem',
              borderRadius: '8px',
              backgroundColor: '#12151C',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#E2E8F0',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1C212D';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#12151C';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
            }}
          >
            <Server size={12} className="text-gray-300" />
            <span className="hidden sm:inline">Configure</span>
          </button>
        </div>
      </header>

      {/* Main Centerpiece: Hanging Physical ID Access Pass */}
      <main className="w-full flex-1 flex flex-col items-center justify-center px-3.5 pb-6 sm:px-4 sm:pb-8 relative z-20">
        {/* Realistic Lanyard Ribbon & Chrome Clasp Assembly */}
        <div className="idcard-lanyard-assembly">
          {/* Woven Fabric Ribbon */}
          <div className="idcard-ribbon" />

          {/* Metal Crimp Band */}
          <div className="idcard-metal-crimp" />

          {/* Swivel Loop Ring */}
          <div className="idcard-swivel-loop" />

          {/* Alligator / Badge Clip Body overlapping the card */}
          <div className="idcard-clip-body">
            <div className="idcard-clip-screw" />
            <div className="idcard-clip-jaw" />
          </div>
        </div>

        {/* Realistic Matte Black PVC Card */}
        <div className="idcard-badge-plate animate-page-enter">
          {/* Specular Glare Reflection across card */}
          <div className="idcard-sheen-glare" />

          {/* Physical Punch Hole Cutout (clamped by clip above) */}
          <div className="idcard-punch-hole" />

          {/* Card Body */}
          <div className="idcard-card-body">
            {/* Top Micro-Security Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '0.4rem',
                marginBottom: '1rem',
              }}
            >
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}
              >
                CORPORATE ACCESS PASS
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#64748B',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}
              >
                SEC-ID // LEVEL 4
              </span>
            </div>

            {/* Smart Chip & Brand Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              {/* Smart Card IC Contact Pad */}
              <div className="idcard-smart-chip" title="RFID & Smartcard Security Contact">
                <Cpu size={14} style={{ color: '#374151', position: 'relative', zIndex: 2 }} />
              </div>

              {/* Company Logo / Monogram */}
              {company?.logo_base64 ? (
                <img
                  src={company.logo_base64}
                  alt={company.company_name || 'Logo'}
                  style={{
                    maxHeight: '44px',
                    maxWidth: '180px',
                    width: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.7))',
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 900,
                    letterSpacing: '0.06em',
                    color: '#FFFFFF',
                  }}
                >
                  {(company?.company_name || 'AMA CERAMICS').toUpperCase()}
                </div>
              )}
            </div>

            {/* Card Title & Welcome */}
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <h1 className="idcard-title" title={`Welcome to ${company?.company_name || 'AMA CERAMICS PVT LTD'}`}>
                Welcome to {company?.company_name || 'AMA CERAMICS PVT LTD'}
              </h1>
              <p className="idcard-subtitle" style={{ margin: '0.35rem 0 0 0' }}>
                Commercial Quotation & Dispatch Management
              </p>
            </div>

            {/* Offline Alert */}
            {status !== 'connected' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.6rem 0.85rem',
                  backgroundColor: '#1E1416',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  borderRadius: '10px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Server Offline / Unreachable
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#0A0A0A',
                    border: 'none',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 800,
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
                  marginBottom: '1rem',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#1E1416',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#FCA5A5',
                  borderRadius: '10px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={14} style={{ color: '#EF4444', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{error}</span>
              </div>
            )}

            {/* Login Form (Black, Grey, White) */}
            <form onSubmit={handleCredentialSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Username Field */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '0.4rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Email or Username
                </label>
                <div style={{ position: 'relative' }}>
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
                      color: '#94A3B8',
                    }}
                  >
                    <UserIcon size={15} />
                  </div>
                  <input
                    type="text"
                    className="idcard-input-box font-medium"
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
                    marginBottom: '0.4rem',
                    letterSpacing: '0.02em',
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
                      paddingLeft: '0.85rem',
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
                    className="idcard-input-box font-mono"
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
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* High Contrast Pure White Action Button with Black Text */}
              <button
                type="submit"
                disabled={loading}
                className="idcard-btn-white"
                style={{ marginTop: '0.35rem' }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin text-black" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={15} className="text-black" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {/* Realistic Security Barcode & Serial Identification */}
              <div className="idcard-barcode-strip">
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '20px' }}>
                  {[2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 3, 2, 4, 1, 2, 1, 3, 1, 2, 3, 1].map((w, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: `${w}px`,
                        height: idx % 6 === 0 ? '20px' : '15px',
                        backgroundColor: idx % 2 === 0 ? '#E2E8F0' : '#475569',
                        borderRadius: '0.5px',
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    color: '#64748B',
                    letterSpacing: '0.1em',
                  }}
                >
                  <ShieldCheck size={11} style={{ color: '#94A3B8' }} />
                  <span>AMA-AUTH-SECURE // 256-BIT ENCRYPTION</span>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Minimal Monochrome Footer */}
      <footer className="w-full px-6 py-4 sm:px-10 sm:py-5 flex flex-row items-center justify-between text-[10px] sm:text-[11px] text-[#475569] border-none relative z-40">
        <span className="text-left">
          &copy; {new Date().getFullYear()} {company?.company_name || 'AMA CERAMICS PVT LTD'}. All rights reserved.
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

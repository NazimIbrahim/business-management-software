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

  // Clean company display name (avoid awkward uppercase multi-line wrapping on mobile)
  const displayCompanyName = company?.company_name
    ? company.company_name.replace(/\s+PVT\.?\s+LTD\.?/i, '').trim()
    : 'AMA Ceramics';

  return (
    <div className="idcard-login-viewport">
      {/* Top Minimal Navigation Bar (Responsive Black, Grey, White) */}
      <header
        className="w-full px-3 py-2.5 sm:px-6 sm:py-3.5 flex items-center justify-between relative z-40"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: 'rgba(5, 6, 8, 0.65)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Brand identity */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-extrabold text-[11px] sm:text-xs text-white shrink-0 shadow-sm"
            style={{
              background: '#161922',
              border: '1px solid rgba(255, 255, 255, 0.16)',
            }}
          >
            {(company?.company_name || 'AMA').slice(0, 3).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-white font-bold text-xs sm:text-[13px] tracking-wide truncate">
              {displayCompanyName}
            </span>
            <span className="text-[#64748B] text-[9px] sm:text-[10px] font-medium hidden sm:inline">
              Commercial Quotation & Dispatch Portal
            </span>
          </div>
        </div>

        {/* Center navigation hints (desktop view, leaves center corridor open for lanyard) */}
        <nav
          className="hidden lg:flex items-center gap-6 text-[11px] text-[#64748B] font-semibold tracking-wider uppercase ml-8 mr-auto"
        >
          <span className="text-[#E2E8F0] cursor-default">Portal Access</span>
          <span className="cursor-default opacity-60">Quotation Network</span>
          <span className="cursor-default opacity-60">Dispatch Manager</span>
        </nav>

        {/* Right server status pill & settings trigger */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div
            className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold text-[#E2E8F0]"
            style={{
              backgroundColor: '#12151C',
              border: '1px solid rgba(255, 255, 255, 0.14)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: status === 'connected' ? '#10B981' : '#EF4444',
                boxShadow: status === 'connected' ? '0 0 6px rgba(16, 185, 129, 0.7)' : '0 0 6px rgba(239, 68, 68, 0.7)',
              }}
            />
            <span className="hidden xs:inline">{status === 'connected' ? 'Connected' : 'Offline'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenServerSettings}
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold text-[#E2E8F0] transition-colors cursor-pointer"
            style={{
              backgroundColor: '#12151C',
              border: '1px solid rgba(255, 255, 255, 0.16)',
            }}
            title="Configure Server Connection"
          >
            <Server size={12} className="text-gray-300" />
            <span className="hidden sm:inline">Configure</span>
          </button>
        </div>
      </header>

      {/* Main Centerpiece: Hanging Physical ID Access Pass */}
      <main
        className="flex-1 flex flex-col items-center justify-center relative z-20 px-3 py-4 sm:py-6"
      >
        {/* Realistic Lanyard Ribbon & Chrome Clasp Assembly */}
        <div className="idcard-lanyard-assembly">
          {/* Continuous Woven Fabric Ribbon from Top of Screen (Zero Gap) */}
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
              className="flex items-center justify-between pb-2 mb-3 sm:mb-4 border-b border-white/10"
            >
              <span className="text-[9px] font-bold tracking-widest text-[#94A3B8] uppercase font-mono">
                CORPORATE ACCESS PASS
              </span>
              <span className="text-[9px] font-bold tracking-wider text-[#64748B] uppercase font-mono">
                SEC-ID // LEVEL 4
              </span>
            </div>

            {/* Smart Chip & Brand Header */}
            <div className="flex items-center justify-between mb-3 sm:mb-3.5">
              {/* Smart Card IC Contact Pad */}
              <div className="idcard-smart-chip" title="RFID & Smartcard Security Contact">
                <Cpu size={14} style={{ color: '#374151', position: 'relative', zIndex: 2 }} />
              </div>

              {/* Company Logo / Monogram */}
              {company?.logo_base64 ? (
                <img
                  src={company.logo_base64}
                  alt={displayCompanyName}
                  className="max-h-8 sm:max-h-9 max-w-[150px] sm:max-w-[170px] w-auto object-contain block drop-shadow-md"
                />
              ) : (
                <div className="text-xs sm:text-sm font-black tracking-wider text-white">
                  {displayCompanyName.toUpperCase()}
                </div>
              )}
            </div>

            {/* Card Title & Welcome (Clean, Refined Typography) */}
            <div className="text-center mb-3.5 sm:mb-4">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug mb-1">
                Welcome to {displayCompanyName}
              </h1>
              <p className="text-[11px] text-[#94A3B8] font-medium m-0 tracking-wide">
                Commercial Quotation & Dispatch Portal
              </p>
            </div>

            {/* Offline Alert */}
            {status !== 'connected' && (
              <div className="mb-3 px-3 py-2 bg-[#1E1416] border border-red-500/40 text-red-200 rounded-lg text-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span className="font-semibold truncate">
                    Server Offline / Unreachable
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  className="bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  Connect
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-3 px-3 py-2 bg-[#1E1416] border border-red-500/40 text-red-200 rounded-lg text-[11px] flex items-start gap-2">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <span className="font-medium whitespace-pre-wrap">{error}</span>
              </div>
            )}

            {/* Login Form (Black, Grey, White) */}
            <form onSubmit={handleCredentialSubmit} className="flex flex-col gap-3 sm:gap-3.5">
              {/* Username Field */}
              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1 tracking-wide">
                  Email or Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
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
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1 tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
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
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#64748B] hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* High Contrast Pure White Action Button with Black Text */}
              <button
                type="submit"
                disabled={loading}
                className="idcard-btn-white mt-1 cursor-pointer"
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
              <div className="idcard-barcode-strip mt-2">
                <div className="flex items-center gap-0.5 h-4 sm:h-4.5 opacity-75">
                  {[2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 3, 2, 4, 1, 2, 1, 3, 1, 2, 3, 1].map((w, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: `${w}px`,
                        height: idx % 6 === 0 ? '16px' : '12px',
                        backgroundColor: idx % 2 === 0 ? '#E2E8F0' : '#475569',
                        borderRadius: '0.5px',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#64748B] tracking-wider">
                  <ShieldCheck size={11} className="text-[#94A3B8]" />
                  <span>AMA-AUTH-SECURE // 256-BIT ENCRYPTION</span>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Minimal Monochrome Footer */}
      <footer
        className="w-full px-4 py-2.5 sm:px-8 sm:py-3.5 flex items-center justify-between text-[10px] sm:text-[11px] text-[#475569] relative z-40"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <span className="truncate">
          © {new Date().getFullYear()} {displayCompanyName}
        </span>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0 ml-2">
          <span className="font-mono text-[#64748B]">v2.4.30</span>
          <span className="hidden sm:inline text-[#334155]">•</span>
          <span className="hidden sm:inline text-[#64748B]">Enterprise Clearance</span>
        </div>
      </footer>
    </div>
  );
};

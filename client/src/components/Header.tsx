import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { Wifi, WifiOff, RefreshCw, User as UserIcon, LogOut, Server, Menu, X } from 'lucide-react';

interface Props {
  onOpenServerSettings: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<Props> = ({ onOpenServerSettings, onToggleSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { status, serverUrl, latencyMs, company } = useServer();

  const companyInitials = (company?.company_name || 'AMA')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'AMA';

  const getStatusBadge = () => {
    if (status === 'connected') {
      return (
        <button
          onClick={onOpenServerSettings}
          title={`Server: ${serverUrl}\nClick to change connection`}
          className="inline-flex items-center space-x-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium bg-emerald-50/80 backdrop-blur-md text-emerald-800 border border-emerald-300/70 hover:bg-emerald-100/90 shadow-xs transition-colors cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="font-semibold text-[11px] sm:text-xs">Online</span>
          {latencyMs !== null && (
            <span className="text-emerald-700/80 font-mono text-[10px] sm:text-[11px] hidden sm:inline">({latencyMs}ms)</span>
          )}
        </button>
      );
    }
    if (status === 'connecting') {
      return (
        <button
          onClick={onOpenServerSettings}
          className="inline-flex items-center space-x-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium bg-amber-50/80 backdrop-blur-md text-amber-900 border border-amber-300/70 cursor-pointer"
        >
          <RefreshCw size={11} className="animate-spin text-amber-600" />
          <span className="text-[11px] sm:text-xs font-semibold">Connecting...</span>
        </button>
      );
    }
    return (
      <button
        onClick={onOpenServerSettings}
        title="Cannot connect to server. Click to configure host."
        className="inline-flex items-center space-x-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium bg-rose-50/80 backdrop-blur-md text-rose-800 border border-rose-300/70 hover:bg-rose-100 transition-colors cursor-pointer"
      >
        <WifiOff size={11} className="text-rose-500" />
        <span className="text-[11px] sm:text-xs font-semibold">Offline</span>
      </button>
    );
  };

  return (
    <header className="glass-header px-3 sm:px-6 py-2.5 flex items-center justify-between select-none shrink-0 z-30">
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
        {/* Mobile Hamburger Drawer Toggle Button */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="mobile-hamburger-btn p-1.5 -ml-1 text-[#0D1B2A] hover:bg-slate-200/70 active:bg-slate-300/70 rounded-lg transition-colors cursor-pointer items-center justify-center shrink-0"
          aria-label="Toggle navigation menu"
        >
          {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
          {company?.logo_base64 ? (
            <img
              src={company.logo_base64}
              alt={company.company_name || 'Logo'}
              className="h-7 sm:h-8 max-w-[120px] w-auto rounded-lg object-contain bg-white shadow-md border border-slate-200 shrink-0 transition-transform duration-200 hover:scale-105"
            />
          ) : (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#1B263B] to-[#0D1B2A] text-[#E0E1DD] flex items-center justify-center font-bold text-xs tracking-wider shadow-md border border-white/20 transition-transform duration-200 hover:scale-105 shrink-0 cursor-default">
              {companyInitials}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h1 className="text-xs sm:text-sm font-bold text-[#0D1B2A] tracking-tight leading-none truncate max-w-[200px] sm:max-w-[320px]">
                {company?.company_name || 'QUOTATION SYSTEM'}
              </h1>
            </div>
            <p className="text-[9px] sm:text-[10px] text-[#415A77] font-medium tracking-wide mt-0.5 hidden sm:block truncate max-w-[200px] sm:max-w-[320px]">
              {company?.tagline || 'Commercial Quotation Management'}
            </p>
          </div>
        </div>

        {/* Status Divider */}
        <div className="pl-2 sm:pl-4 border-l border-[#E0E1DD] flex items-center shrink-0">
          {getStatusBadge()}
        </div>
      </div>

      {/* Right User Bar */}
      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
        {user && (
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="text-right hidden md:block">
              <div className="text-xs font-semibold text-[#0D1B2A] leading-tight">
                {user.full_name}
              </div>
              <div className="text-[10px] font-bold text-[#415A77] uppercase tracking-wider">
                {user.role}
              </div>
            </div>

            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1B263B] border border-[#415A77] flex items-center justify-center text-[#E0E1DD] font-bold text-xs shadow-sm"
              title={`${user.full_name} (${user.role})`}
            >
              {user.full_name.charAt(0).toUpperCase()}
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200/80 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

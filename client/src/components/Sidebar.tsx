import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Users,
  Layers,
  CreditCard,
  Target,
  BarChart3,
  Building,
  ShieldCheck,
  Database,
  Cpu,
  UserCheck,
  Grid,
  Bath,
  ChevronDown,
  ChevronRight,
  Truck,
  X,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'quotations'
  | 'dispatch'
  | 'quotation-create'
  | 'quotation-create-tiles'
  | 'quotation-create-sanitary'
  | 'salespersons'
  | 'customers'
  | 'products'
  | 'sanitary-catalog'
  | 'payments'
  | 'targets'
  | 'reports'
  | 'admin-panel'
  | 'company'
  | 'audit'
  | 'backup';

interface Props {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab, isOpen = false, onClose }) => {
  const { user } = useAuth();
  const { company, fetchApi, subscribeToEvents } = useServer();
  const [newQuotationExpanded, setNewQuotationExpanded] = useState<boolean>(true);
  const [dispatchChangesCount, setDispatchChangesCount] = useState<number>(0);

  if (!user) return null;

  const companyInitials = (company?.company_name || 'AMA')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'AMA';

  const handleNavSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (onClose) onClose();
  };

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const isSalesperson = user.role === 'salesperson';
  const isDispatch = user.role === 'dispatch' || user.role === 'dispatch_team';
  const canAudit = isAdmin || isManager;
  const canDispatch = isAdmin || isManager || isDispatch || isSalesperson || user.role === 'accounts';

  useEffect(() => {
    if (!canDispatch) return;
    const loadStats = async () => {
      try {
        const stats = await fetchApi<any>('/api/dispatch/stats');
        setDispatchChangesCount(stats?.pending_item_changes_count || 0);
      } catch {
        // silent
      }
    };
    loadStats();

    const unsubscribe = subscribeToEvents((event) => {
      if (['DISPATCH_ITEM_CHANGED', 'DISPATCH_CHANGES_ACKNOWLEDGED', 'DISPATCH_UPDATED'].includes(event.type)) {
        loadStats();
      }
    });
    return () => unsubscribe();
  }, [canDispatch]);

  const isTileCreateActive = activeTab === 'quotation-create' || activeTab === 'quotation-create-tiles';
  const isSanitaryCreateActive = activeTab === 'quotation-create-sanitary';
  const isAnyCreateActive = isTileCreateActive || isSanitaryCreateActive;

  const analyticsNav = [
    { id: 'targets' as NavTab, label: 'Sales Targets', icon: Target },
    { id: 'reports' as NavTab, label: 'Reports & Export', icon: BarChart3 },
  ];

  const adminNav = [
    ...(isAdmin ? [{ id: 'admin-panel' as NavTab, label: 'Admin Panel', icon: ShieldCheck }] : []),
    ...(isAdmin ? [{ id: 'company' as NavTab, label: 'Company Settings', icon: Building }] : []),
    ...(canAudit ? [{ id: 'audit' as NavTab, label: 'Audit Trail', icon: Layers }] : []),
    ...(isAdmin ? [{ id: 'backup' as NavTab, label: 'Database Backup', icon: Database }] : []),
  ];

  const renderNavBody = () => (
    <div className="p-3 overflow-y-auto space-y-4 flex-1">
      {/* Operations Section */}
      <div>
        <div className="px-3 mb-1.5">
          <span className="sidebar-heading">Operations</span>
        </div>
        <div className="space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => handleNavSelect('dashboard')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
              activeTab === 'dashboard' ? 'sidebar-nav-active' : 'sidebar-nav-item'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <LayoutDashboard size={16} className="nav-icon" />
              <span className="tracking-wide">Dashboard</span>
            </div>
          </button>

          {/* Quotations List */}
          <button
            onClick={() => handleNavSelect('quotations')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
              activeTab === 'quotations' ? 'sidebar-nav-active' : 'sidebar-nav-item'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <FileText size={16} className="nav-icon" />
              <span className="tracking-wide">Quotations</span>
            </div>
          </button>

          {/* Dispatch Management */}
          {canDispatch && (
            <button
              onClick={() => handleNavSelect('dispatch')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                activeTab === 'dispatch' ? 'sidebar-nav-active' : 'sidebar-nav-item'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Truck size={16} className={activeTab === 'dispatch' ? 'text-teal-300' : 'nav-icon'} />
                <span className="tracking-wide font-semibold">Dispatch Management</span>
              </div>
              <div className="flex items-center space-x-1">
                {dispatchChangesCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold animate-pulse shadow-xs">
                    {dispatchChangesCount} changed
                  </span>
                )}
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-mono border border-teal-400/20">
                  {isDispatch || isAdmin ? 'Orders' : 'View Only'}
                </span>
              </div>
            </button>
          )}

          {/* Salesperson Dashboard */}
          {!isDispatch && (
            <button
              onClick={() => handleNavSelect('salespersons')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                activeTab === 'salespersons' ? 'sidebar-nav-active' : 'sidebar-nav-item'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <UserCheck size={16} className="nav-icon" />
                <span className="tracking-wide">Salesperson Dashboard</span>
              </div>
            </button>
          )}

          {/* New Quotation Expandable Group */}
          {!isDispatch && (
            <div className="pt-1 pb-1">
            <button
              type="button"
              onClick={() => setNewQuotationExpanded((prev) => !prev)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer text-left transition-all ${
                isAnyCreateActive
                  ? 'bg-[#1B263B]/90 text-white border border-[#415A77]/60 shadow-sm'
                  : 'sidebar-nav-action'
              }`}
              title="Create New Quotation"
            >
              <div className="flex items-center space-x-2">
                <PlusCircle size={15} className="text-amber-400" />
                <span className="font-semibold tracking-wide text-white">New Quotation</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {newQuotationExpanded ? (
                  <ChevronDown size={14} className="text-[#778DA9]" />
                ) : (
                  <ChevronRight size={14} className="text-[#778DA9]" />
                )}
              </div>
            </button>

            {/* Sub-options for Tile and Sanitary */}
            {newQuotationExpanded && (
              <div className="mt-1 pl-2.5 space-y-1 border-l-2 border-white/10 ml-3.5 animate-dropdown-open">
                {/* Tile Quotation Option */}
                <button
                  onClick={() => handleNavSelect('quotation-create-tiles')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] cursor-pointer text-left transition-all ${
                    isTileCreateActive
                      ? 'sidebar-nav-active font-semibold shadow-xs'
                      : 'sidebar-nav-item text-[#E0E1DD]/90 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Grid size={14} className={isTileCreateActive ? 'text-blue-300' : 'text-blue-400/80'} />
                    <span>Tile Quotation</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono border border-blue-400/20">
                    Sqft
                  </span>
                </button>

                {/* Sanitary Quotation Option */}
                <button
                  onClick={() => handleNavSelect('quotation-create-sanitary')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] cursor-pointer text-left transition-all ${
                    isSanitaryCreateActive
                      ? 'sidebar-nav-active font-semibold shadow-xs'
                      : 'sidebar-nav-item text-[#E0E1DD]/90 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Bath size={14} className={isSanitaryCreateActive ? 'text-teal-300' : 'text-teal-400/80'} />
                    <span>Sanitary Quotation</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-mono border border-teal-400/20">
                    Nos
                  </span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* Customers */}
          {!isDispatch && (
            <button
              onClick={() => handleNavSelect('customers')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                activeTab === 'customers' ? 'sidebar-nav-active' : 'sidebar-nav-item'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Users size={16} className="nav-icon" />
                <span className="tracking-wide">Customers</span>
              </div>
            </button>
          )}

          {/* Tile Catalog */}
          <button
            onClick={() => handleNavSelect('products')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
              activeTab === 'products' ? 'sidebar-nav-active' : 'sidebar-nav-item'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Layers size={16} className="nav-icon" />
              <span className="tracking-wide">Tile Catalog</span>
            </div>
          </button>

          {/* Sanitary Catalog */}
          <button
            onClick={() => handleNavSelect('sanitary-catalog')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
              activeTab === 'sanitary-catalog' ? 'sidebar-nav-active' : 'sidebar-nav-item'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Bath size={16} className={activeTab === 'sanitary-catalog' ? 'text-teal-300' : 'nav-icon'} />
              <span className="tracking-wide">Sanitary Catalog</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-mono border border-teal-400/20">
              PDF
            </span>
          </button>

          {/* Payments & Receipts */}
          {!isDispatch && (
            <button
              onClick={() => handleNavSelect('payments')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                activeTab === 'payments' ? 'sidebar-nav-active' : 'sidebar-nav-item'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <CreditCard size={16} className="nav-icon" />
                <span className="tracking-wide">Payments & Receipts</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Performance Section */}
      {!isDispatch && (
        <div>
          <div className="px-3 mb-1.5">
            <span className="sidebar-heading">Performance</span>
          </div>
          <div className="space-y-1">
            {analyticsNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavSelect(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                    isActive ? 'sidebar-nav-active' : 'sidebar-nav-item'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon size={16} className="nav-icon" />
                    <span className="tracking-wide">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* System Admin Section */}
      {adminNav.length > 0 && (
        <div>
          <div className="px-3 mb-1.5">
            <span className="sidebar-heading">System Admin</span>
          </div>
          <div className="space-y-1">
            {adminNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavSelect(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                    isActive ? 'sidebar-nav-active' : 'sidebar-nav-item'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon size={16} className="nav-icon" />
                    <span className="tracking-wide">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderFooter = () => (
    <div className="p-3 border-t border-white/10 bg-[#09131F]/80 backdrop-blur-md text-[11px] text-[#778DA9] space-y-1.5 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Cpu size={12} className="text-emerald-400" />
          <span className="text-[#E0E1DD]/90 font-medium">Memory Mode</span>
        </div>
        <span className="font-semibold text-emerald-300 font-mono text-[10px] bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded-full shadow-xs">
          4GB RAM Opt.
        </span>
      </div>
      <div className="flex justify-between items-center text-[#778DA9] text-[10px] pt-0.5">
        <span>App Build:</span>
        <span className="font-mono text-[#E0E1DD]/80">v2.4.21</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`mobile-drawer-backdrop ${isOpen ? 'drawer-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile Slide-in Drawer */}
      <aside
        className={`mobile-drawer-aside glass-sidebar select-none text-[#E0E1DD] ${
          isOpen ? 'drawer-open' : ''
        }`}
      >
        {/* Mobile Drawer Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            {company?.logo_base64 ? (
              <img
                src={company.logo_base64}
                alt={company.company_name || 'Logo'}
                className="h-7 max-w-[100px] w-auto rounded-lg object-contain bg-white shadow-sm shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1B263B] to-[#0D1B2A] text-[#E0E1DD] border border-white/20 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                {companyInitials}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white tracking-tight truncate max-w-[170px]">
                {company?.company_name || 'QUOTATION SYSTEM'}
              </div>
              <div className="text-[10px] text-[#778DA9] truncate">
                {company?.tagline || 'Navigation Menu'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#778DA9] hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {renderNavBody()}
        {renderFooter()}
      </aside>

      {/* Desktop Permanent Docked Sidebar */}
      <aside className="desktop-sidebar glass-sidebar flex-col justify-between shrink-0 select-none z-10 text-[#E0E1DD]">
        {renderNavBody()}
        {renderFooter()}
      </aside>
    </>
  );
};

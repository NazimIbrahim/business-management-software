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
  Package,
  PackageCheck,
  Factory,
  CheckCircle2,
  Calendar,
  History,
  X,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'quotations'
  | 'dispatch'
  | 'dispatch-all-closed'
  | 'dispatch-processing'
  | 'dispatch-completed'
  | 'dispatch-schedule'
  | 'dispatch-local-tracker'
  | 'dispatch-factory-tracker'
  | 'dispatch-payment-tracking'
  | 'dispatch-local-history'
  | 'dispatch-factory-history'
  | 'dispatch-reports'
  | 'dispatch-local'
  | 'dispatch-factory'
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
  const [localActiveCount, setLocalActiveCount] = useState<number>(0);
  const [factoryActiveCount, setFactoryActiveCount] = useState<number>(0);
  const [closedCount, setClosedCount] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [dispatchSubmenuExpanded, setDispatchSubmenuExpanded] = useState<boolean>(true);

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
  const isAccounts = user.role === 'accounts' || user.role === 'accountant';
  const canAudit = isAdmin || isManager;
  const canDispatch = isAdmin || isManager || isDispatch || isSalesperson || isAccounts;
  const canSeeItemChangesNotice = isAdmin || isManager || isDispatch || isAccounts;
  const isViewOnly = !isDispatch && !isAdmin;

  useEffect(() => {
    if (activeTab.startsWith('dispatch')) {
      setDispatchSubmenuExpanded(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!canDispatch) return;
    const loadStats = async () => {
      try {
        const stats = await fetchApi<any>('/api/dispatch/stats');
        setDispatchChangesCount(stats?.pending_item_changes_count || 0);
        setLocalActiveCount(stats?.local_active_count || 0);
        setFactoryActiveCount(stats?.factory_active_count || 0);
        setClosedCount(stats?.total_closed_quotations || stats?.closed_count || 0);
        setOverdueCount(stats?.overdue_count || 0);
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

  const dispatchNavItems = [
    {
      id: 'dispatch-all-closed' as NavTab,
      label: 'All Closed Quotations',
      icon: CheckCircle2,
      badge: closedCount > 0 ? closedCount : undefined,
      badgeColor: 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/30',
    },
    {
      id: 'dispatch-processing' as NavTab,
      label: 'Processing Dispatch',
      icon: Truck,
      badge: canSeeItemChangesNotice && dispatchChangesCount > 0 ? dispatchChangesCount : undefined,
      badgeColor: 'bg-rose-500 text-white font-extrabold shadow-xs',
    },
    {
      id: 'dispatch-completed' as NavTab,
      label: 'Dispatch Completed',
      icon: PackageCheck,
    },
    {
      id: 'dispatch-schedule' as NavTab,
      label: 'Dispatch Schedule',
      icon: Calendar,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeColor: 'bg-rose-500 text-white font-extrabold shadow-xs',
    },
    {
      id: 'dispatch-local-tracker' as NavTab,
      label: 'Local Purchase Tracker',
      icon: Package,
      badge: localActiveCount > 0 ? localActiveCount : undefined,
      badgeColor: 'bg-amber-500 text-white font-extrabold shadow-xs',
    },
    {
      id: 'dispatch-factory-tracker' as NavTab,
      label: 'Factory Order Tracking',
      icon: Factory,
      badge: factoryActiveCount > 0 ? factoryActiveCount : undefined,
      badgeColor: 'bg-indigo-500 text-white font-extrabold shadow-xs',
    },
    {
      id: 'dispatch-payment-tracking' as NavTab,
      label: 'Client Payment Tracking',
      icon: CreditCard,
    },
    {
      id: 'dispatch-local-history' as NavTab,
      label: 'Local Purchase History',
      icon: History,
    },
    {
      id: 'dispatch-factory-history' as NavTab,
      label: 'Factory Order History',
      icon: History,
    },
    {
      id: 'dispatch-reports' as NavTab,
      label: 'Reports',
      icon: BarChart3,
    },
  ];

  const renderNavBody = () => (
    <div className="p-3 overflow-y-auto space-y-4 flex-1">
      {/* Operations Section */}
      <div>
        <div className="px-3 mb-1.5">
          <span className="sidebar-heading">Operations</span>
        </div>
        <div className="space-y-1">
          {isDispatch ? (
            /* Dedicated Dispatch Team Navigation with all 10 views */
            <div className="space-y-1">
              {dispatchNavItems.map((item) => {
                const Icon = item.icon;
                const isItemActive =
                  activeTab === item.id ||
                  (item.id === 'dispatch-local-tracker' && activeTab === 'dispatch-local') ||
                  (item.id === 'dispatch-factory-tracker' && activeTab === 'dispatch-factory') ||
                  (item.id === 'dispatch-all-closed' && activeTab === 'dispatch');
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavSelect(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs cursor-pointer text-left transition-colors ${
                      isItemActive ? 'sidebar-nav-active font-bold text-white' : 'sidebar-nav-item'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Icon size={15} className={isItemActive ? 'text-teal-300' : 'nav-icon'} />
                      <span className="tracking-wide truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${item.badgeColor || 'bg-slate-700 text-slate-200'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
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

              {/* Dispatch Management Expandable Group */}
              {canDispatch && (
                <div className="pt-0.5 pb-0.5">
                  <button
                    onClick={() => {
                      setDispatchSubmenuExpanded((prev) => !prev);
                      if (!dispatchSubmenuExpanded && !activeTab.startsWith('dispatch')) {
                        handleNavSelect('dispatch-all-closed');
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer text-left ${
                      activeTab.startsWith('dispatch') ? 'sidebar-nav-active font-semibold' : 'sidebar-nav-item'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Truck size={16} className={activeTab.startsWith('dispatch') ? 'text-teal-300' : 'nav-icon'} />
                      <span className="tracking-wide font-semibold truncate">Dispatch Management</span>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0 ml-1.5">
                      {canSeeItemChangesNotice && dispatchChangesCount > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold shadow-xs">
                          {dispatchChangesCount}
                        </span>
                      ) : isViewOnly ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/20">
                          View
                        </span>
                      ) : null}
                      {dispatchSubmenuExpanded ? (
                        <ChevronDown size={14} className="text-white/60" />
                      ) : (
                        <ChevronRight size={14} className="text-white/60" />
                      )}
                    </div>
                  </button>

                  {/* Sub-items featuring exactly the 10 distinct views */}
                  {dispatchSubmenuExpanded && (
                    <div className="mt-1 pl-2 space-y-0.5 border-l-2 border-white/10 ml-3.5">
                      {dispatchNavItems.map((item) => {
                        const Icon = item.icon;
                        const isItemActive =
                          activeTab === item.id ||
                          (item.id === 'dispatch-local-tracker' && activeTab === 'dispatch-local') ||
                          (item.id === 'dispatch-factory-tracker' && activeTab === 'dispatch-factory') ||
                          (item.id === 'dispatch-all-closed' && activeTab === 'dispatch');
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavSelect(item.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer text-left transition-colors ${
                              isItemActive
                                ? 'sidebar-nav-active font-semibold shadow-xs text-teal-300'
                                : 'sidebar-nav-item text-[#E0E1DD]/90 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center space-x-2 min-w-0">
                              <Icon size={13} className={isItemActive ? 'text-teal-300' : 'text-[#E0E1DD]/60'} />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge !== undefined && (
                              <span className={`text-[9px] px-1.5 py-0.2 rounded-full shrink-0 ml-1 ${item.badgeColor || 'bg-slate-700 text-slate-200'}`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
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
          {!isDispatch && (
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
          )}

          {/* Sanitary Catalog */}
          {!isDispatch && (
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
          )}

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
        <span className="font-mono text-[#E0E1DD]/80">v2.4.54</span>
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

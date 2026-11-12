import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import {
  LucideIcon,
  LayoutDashboard,
  Handshake,
  LayoutGrid,
  Boxes,
  Warehouse,
  IndianRupee,
  ShoppingCart,
  Share2,
  Megaphone,
  Calculator,
  BarChart3,
  Settings,
  LifeBuoy,
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Archive,
  FolderArchive,
  LogOut,
  Users,
  FileText,
  Truck,
  Package,
  PackageCheck,
  Factory,
  CheckCircle2,
  Calendar,
  History,
  RotateCcw,
  Cpu,
  ShieldCheck,
  Building,
  Database,
  Layers,
  Bath,
  Target,
  UserCheck,
  CreditCard,
  PlusCircle,
  Grid,
} from 'lucide-react';

export type NavTab =
  // Existing legacy tabs
  | 'dashboard'
  | 'quotations'
  | 'dispatch'
  | 'dispatch-all-closed'
  | 'dispatch-processing'
  | 'dispatch-completed'
  | 'dispatch-damage-replacement'
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
  | 'backup'
  // New ERP Navigation Routes
  | 'crm-pipeline'
  | 'crm-projects'
  | 'crm-inquiries'
  | 'items-services'
  | 'items-price-lists'
  | 'items-kits'
  | 'items-import-export'
  | 'inventory-manual-entry'
  | 'inventory-bulk-update'
  | 'inventory-opening-stock'
  | 'inventory-transfers'
  | 'inventory-adjustments'
  | 'inventory-assemble-kits'
  | 'inventory-item-history'
  | 'inventory-reserved'
  | 'inventory-incoming'
  | 'inventory-unloading-tally'
  | 'inventory-loading-alerts'
  | 'sales-cart'
  | 'sales-orders'
  | 'sales-proforma'
  | 'sales-delivery-orders'
  | 'sales-delivery-challans'
  | 'sales-invoices'
  | 'sales-payment-reminders'
  | 'sales-eway-bills'
  | 'purchases-preferred-vendors'
  | 'purchases-purchase-orders'
  | 'purchases-bills'
  | 'purchases-transit-claims'
  | 'purchases-payments-made'
  | 'purchases-expenses'
  | 'purchases-landed-cost'
  | 'dealers-list'
  | 'dealers-find'
  | 'dealers-panel'
  | 'dealers-expenses'
  | 'dealers-whatsapp'
  | 'marketing-catalog'
  | 'marketing-documents'
  | 'marketing-mail'
  | 'accounting-bank-cash'
  | 'accounting-journal-vouchers'
  | 'accounting-tds'
  | 'accounting-cheques'
  | 'accounting-cost-centres'
  | 'accounting-budgets'
  | 'accounting-fixed-assets'
  | 'accounting-payroll'
  | 'accounting-recurring'
  | 'help';

interface Props {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onQuickAction?: (tab: NavTab) => void;
}

interface NavSubItemDef {
  id: NavTab;
  label: string;
  hasAdd?: boolean;
  badge?: number | string;
  badgeColor?: string;
  roles?: string[]; // Allowed roles (if omitted, accessible by all allowed by parent)
}

interface NavCategoryDef {
  id: string;
  label: string;
  icon: LucideIcon;
  isDirectLink?: boolean;
  directTab?: NavTab;
  items?: NavSubItemDef[];
  roles?: string[]; // Allowed roles
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  isOpen = false,
  onClose,
  onQuickAction,
}) => {
  const { user, logout } = useAuth();
  const { company, fetchApi, subscribeToEvents } = useServer();

  // Search input state
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Accordion open/close map for New Menu categories
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    crm: false,
    items: false,
    inventory: false,
    sales: true, // Default open sales for workflow
    purchases: false,
    dealers: false,
    marketing: false,
    accounting: false,
  });

  // Old Menu collapsed/expanded state
  const [oldMenuExpanded, setOldMenuExpanded] = useState<boolean>(false);
  const [newQuotationExpanded, setNewQuotationExpanded] = useState<boolean>(true);
  const [dispatchSubmenuExpanded, setDispatchSubmenuExpanded] = useState<boolean>(true);

  // Dispatch Live WebSocket Statistics
  const [dispatchChangesCount, setDispatchChangesCount] = useState<number>(0);
  const [localActiveCount, setLocalActiveCount] = useState<number>(0);
  const [factoryActiveCount, setFactoryActiveCount] = useState<number>(0);
  const [closedCount, setClosedCount] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState<number>(0);

  if (!user) return null;

  // Role helpers
  const userRole = (user.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const isSalesperson = userRole === 'salesperson';
  const isDispatch = userRole === 'dispatch' || userRole === 'dispatch_team';
  const isAccounts = userRole === 'accounts' || userRole === 'accountant';
  const canAudit = isAdmin || isManager;
  const canDispatch = isAdmin || isManager || isDispatch || isSalesperson || isAccounts;
  const canSeeItemChangesNotice = isAdmin || isManager || isDispatch || isAccounts;
  const isViewOnly = !isDispatch && !isAdmin;

  // Load Dispatch Stats
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

  // Handle navigation selection
  const handleNavSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (onClose) onClose();
  };

  // Handle [+] Quick Action
  const handleQuickAction = (e: React.MouseEvent, tab: NavTab) => {
    e.stopPropagation();
    if (onQuickAction) {
      onQuickAction(tab);
    } else {
      setActiveTab(tab);
    }
    if (onClose) onClose();
  };

  // Toggle category
  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Define All New ERP Categories & Sub-items
  const newMenuCategories: NavCategoryDef[] = useMemo(() => {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: Grid,
        isDirectLink: true,
        directTab: 'dashboard',
      },
      {
        id: 'crm',
        label: 'CRM',
        icon: Handshake,
        items: [
          { id: 'crm-pipeline', label: 'Pipeline', hasAdd: true },
          { id: 'crm-projects', label: 'Projects', hasAdd: true },
          { id: 'crm-inquiries', label: 'Inquiries' },
        ],
      },
      {
        id: 'items',
        label: 'Items',
        icon: LayoutGrid,
        items: [
          { id: 'products', label: 'Items', hasAdd: true },
          { id: 'items-services', label: 'Services', hasAdd: true },
          { id: 'items-price-lists', label: 'Price Lists', hasAdd: true },
          { id: 'items-kits', label: 'Kits', hasAdd: true },
          { id: 'items-import-export', label: 'Import & Export' },
        ],
      },
      {
        id: 'inventory',
        label: 'Inventory',
        icon: Warehouse,
        items: [
          { id: 'inventory-manual-entry', label: 'Manual Stock Entry' },
          { id: 'inventory-bulk-update', label: 'Bulk Stock Update' },
          { id: 'inventory-opening-stock', label: 'Opening Stock' },
          { id: 'inventory-transfers', label: 'Stock Transfers', hasAdd: true },
          { id: 'inventory-adjustments', label: 'Stock Adjustments', hasAdd: true },
          { id: 'inventory-assemble-kits', label: 'Assemble Kits', hasAdd: true },
          { id: 'dispatch-local-history', label: 'Item History' },
          { id: 'inventory-reserved', label: 'Reserved Stock' },
          { id: 'dispatch-factory-tracker', label: 'Incoming Stock', badge: factoryActiveCount > 0 ? factoryActiveCount : undefined },
          { id: 'dispatch-local-tracker', label: 'Unloading Tally', badge: localActiveCount > 0 ? localActiveCount : undefined },
          { id: 'dispatch-damage-replacement', label: 'Damaged Goods' },
          { id: 'inventory-loading-alerts', label: 'Loading Alerts', badge: overdueCount > 0 ? overdueCount : undefined },
        ],
      },
      {
        id: 'sales',
        label: 'Sales',
        icon: IndianRupee,
        items: [
          { id: 'customers', label: 'Customers', hasAdd: true },
          { id: 'quotations', label: 'Quotations', hasAdd: true },
          { id: 'sales-cart', label: 'Cart' },
          { id: 'sales-orders', label: 'Sales Orders', hasAdd: true },
          { id: 'sales-proforma', label: 'Proforma Invoices' },
          { id: 'sales-delivery-orders', label: 'Delivery Orders', hasAdd: true },
          { id: 'dispatch-schedule', label: 'Delivery Challans' },
          { id: 'sales-invoices', label: 'Invoices', hasAdd: true },
          { id: 'payments', label: 'Payments Received', hasAdd: true },
          { id: 'dispatch-payment-tracking', label: 'Payment Reminders' },
          { id: 'dispatch-damage-replacement', label: 'Credit Notes', hasAdd: true },
          { id: 'sales-eway-bills', label: 'e-Way Bills' },
        ],
      },
      {
        id: 'purchases',
        label: 'Purchases',
        icon: ShoppingCart,
        items: [
          { id: 'purchases-preferred-vendors', label: 'Preferred Vendors' },
          { id: 'purchases-purchase-orders', label: 'Purchase Orders' },
          { id: 'purchases-bills', label: 'Purchase Bills' },
          { id: 'purchases-transit-claims', label: 'Transit Claims' },
          { id: 'purchases-payments-made', label: 'Payments Made' },
          { id: 'purchases-expenses', label: 'Expenses' },
          { id: 'purchases-landed-cost', label: 'Landed Cost Calculator' },
        ],
      },
      {
        id: 'dealers',
        label: 'Dealer Network',
        icon: Share2,
        items: [
          { id: 'dealers-list', label: 'Dealers', hasAdd: true },
          { id: 'dealers-find', label: 'Find New Dealers' },
          { id: 'dealers-panel', label: 'Panel Management' },
          { id: 'dealers-expenses', label: 'Sample & Promo Expenses' },
          { id: 'dealers-whatsapp', label: 'WhatsApp Chatbot' },
        ],
      },
      {
        id: 'marketing',
        label: 'Marketing & Documents',
        icon: Megaphone,
        items: [
          { id: 'sanitary-catalog', label: 'Product Catalog' },
          { id: 'marketing-documents', label: 'Documents' },
          { id: 'marketing-mail', label: 'Mail', hasAdd: true },
        ],
      },
      {
        id: 'accounting',
        label: 'Accounting',
        icon: Calculator,
        items: [
          { id: 'accounting-bank-cash', label: 'Bank & Cash Accounts', hasAdd: true },
          { id: 'accounting-journal-vouchers', label: 'Journal Vouchers' },
          { id: 'accounting-tds', label: 'TDS' },
          { id: 'accounting-cheques', label: 'Cheques' },
          { id: 'accounting-cost-centres', label: 'Cost Centres' },
          { id: 'accounting-budgets', label: 'Budgets' },
          { id: 'accounting-fixed-assets', label: 'Fixed Assets' },
          { id: 'accounting-payroll', label: 'Payroll' },
          { id: 'accounting-recurring', label: 'Recurring Transactions', hasAdd: true },
        ],
      },
      {
        id: 'reports',
        label: 'Reports',
        icon: BarChart3,
        isDirectLink: true,
        directTab: 'reports',
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        isDirectLink: true,
        directTab: 'company',
      },
      {
        id: 'help',
        label: 'Help',
        icon: LifeBuoy,
        isDirectLink: true,
        directTab: 'help',
      },
    ];
  }, [localActiveCount, factoryActiveCount, overdueCount]);

  // Legacy Tabs list for auto-expanding Old Menu
  const oldMenuTabIds = useMemo(() => {
    return [
      'quotations',
      'quotation-create',
      'quotation-create-tiles',
      'quotation-create-sanitary',
      'dispatch',
      'dispatch-all-closed',
      'dispatch-processing',
      'dispatch-completed',
      'dispatch-damage-replacement',
      'dispatch-schedule',
      'dispatch-local-tracker',
      'dispatch-factory-tracker',
      'dispatch-payment-tracking',
      'dispatch-local-history',
      'dispatch-factory-history',
      'dispatch-reports',
      'dispatch-local',
      'dispatch-factory',
      'salespersons',
      'customers',
      'products',
      'sanitary-catalog',
      'payments',
      'targets',
      'admin-panel',
      'company',
      'audit',
      'backup',
    ];
  }, []);

  // Dispatch items configuration for Old Menu
  const dispatchNavItems = [
    {
      id: 'dispatch-all-closed' as NavTab,
      label: 'All Closed Quotations',
      icon: CheckCircle2,
      badge: closedCount > 0 ? closedCount : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30',
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
      id: 'dispatch-damage-replacement' as NavTab,
      label: 'Damage / Credit Note',
      icon: RotateCcw,
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

  // Auto-expand category or Old Menu when activeTab changes
  useEffect(() => {
    // If activeTab is within oldMenuTabIds, ensure Old Menu is open
    if (oldMenuTabIds.includes(activeTab) || activeTab.startsWith('dispatch')) {
      // Auto-expand Old Menu
      setOldMenuExpanded(true);
    }

    // Auto-expand corresponding New Menu category if matched
    newMenuCategories.forEach((cat) => {
      if (cat.items?.some((sub) => sub.id === activeTab)) {
        setExpandedCategories((prev) => ({ ...prev, [cat.id]: true }));
      }
    });

    if (activeTab.startsWith('dispatch')) {
      setDispatchSubmenuExpanded(true);
    }
  }, [activeTab, oldMenuTabIds, newMenuCategories]);

  // Real-time Search Filtering
  const cleanSearch = searchTerm.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!cleanSearch) return newMenuCategories;

    return newMenuCategories
      .map((cat) => {
        const catMatch = cat.label.toLowerCase().includes(cleanSearch);
        if (cat.isDirectLink) {
          return catMatch ? cat : null;
        }

        const matchedSubItems = cat.items?.filter((sub) =>
          sub.label.toLowerCase().includes(cleanSearch)
        );

        if (catMatch || (matchedSubItems && matchedSubItems.length > 0)) {
          return {
            ...cat,
            items: matchedSubItems && matchedSubItems.length > 0 ? matchedSubItems : cat.items,
          };
        }
        return null;
      })
      .filter(Boolean) as NavCategoryDef[];
  }, [newMenuCategories, cleanSearch]);

  const hasAnyMatches = filteredCategories.length > 0 || (cleanSearch ? 'old menu'.includes(cleanSearch) : true);

  // Render New Navigation List
  const renderNewMenu = () => {
    if (filteredCategories.length === 0 && cleanSearch) {
      return (
        <div className="py-6 px-3 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">No menu items matching "{searchTerm}"</p>
          <button
            onClick={() => setSearchTerm('')}
            className="mt-2 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        {filteredCategories.map((cat) => {
          const Icon = cat.icon;
          const isDirect = cat.isDirectLink;
          const directTab = cat.directTab || (cat.id as NavTab);
          const isDirectActive = isDirect && activeTab === directTab;

          // If direct link (Dashboard, Reports, Settings, Help)
          if (isDirect) {
            return (
              <button
                key={cat.id}
                onClick={() => handleNavSelect(directTab)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                  isDirectActive
                    ? 'bg-teal-700 text-white font-semibold shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Icon
                    size={16}
                    className={isDirectActive ? 'text-teal-200 shrink-0' : 'text-slate-500 dark:text-slate-400 shrink-0'}
                  />
                  <span className="truncate font-medium">{cat.label}</span>
                </div>
              </button>
            );
          }

          // Collapsible Category
          const isExpanded = cleanSearch ? true : !!expandedCategories[cat.id];
          const hasActiveChild = cat.items?.some((sub) => sub.id === activeTab);

          return (
            <div key={cat.id} className="pt-0.5">
              {/* Category Header Button */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                  hasActiveChild && !isExpanded
                    ? 'bg-teal-700/10 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 font-semibold'
                    : isExpanded
                    ? 'bg-stone-100/80 dark:bg-slate-800/60 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Icon
                    size={16}
                    className={
                      hasActiveChild
                        ? 'text-teal-600 dark:text-teal-400 shrink-0'
                        : 'text-slate-500 dark:text-slate-400 shrink-0'
                    }
                  />
                  <span className="truncate">{cat.label}</span>
                </div>
                <div className="flex items-center space-x-1 shrink-0 ml-1">
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" />
                  ) : (
                    <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" />
                  )}
                </div>
              </button>

              {/* Sub-Items with 1px Vertical Indent Guide Line */}
              {isExpanded && cat.items && (
                <div className="mt-0.5 ml-5 pl-4 border-l border-slate-200 dark:border-slate-700/80 space-y-0.5">
                  {cat.items.map((sub) => {
                    const isSubActive = activeTab === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className={`group flex items-center justify-between rounded-lg transition-colors ${
                          isSubActive
                            ? 'bg-teal-700 text-white font-semibold shadow-xs'
                            : 'hover:bg-stone-100 dark:hover:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <button
                          onClick={() => handleNavSelect(sub.id)}
                          className="flex-1 flex items-center justify-between px-2.5 py-1.5 text-xs text-left cursor-pointer min-w-0"
                        >
                          <span className="truncate">{sub.label}</span>
                          {sub.badge !== undefined && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 ml-1.5 font-bold ${
                                sub.badgeColor || 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {sub.badge}
                            </span>
                          )}
                        </button>

                        {/* Quick-Create [+] Button */}
                        {sub.hasAdd && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickAction(e, sub.id)}
                            title={`Quick create ${sub.label}`}
                            className={`p-1 mr-1 rounded-md transition-all cursor-pointer ${
                              isSubActive
                                ? 'text-teal-100 hover:bg-white/20 hover:text-white'
                                : 'text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50'
                            }`}
                          >
                            <Plus size={13} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render "Old Menu" Archive Group
  const renderOldMenuArchive = () => {
    const isLegacyActive = oldMenuTabIds.includes(activeTab);
    const isTileCreateActive = activeTab === 'quotation-create' || activeTab === 'quotation-create-tiles';
    const isSanitaryCreateActive = activeTab === 'quotation-create-sanitary';
    const isAnyCreateActive = isTileCreateActive || isSanitaryCreateActive;

    return (
      <div className="pt-2">
        {/* Subtle Horizontal Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          </div>
          <div className="relative flex justify-start">
            <span className="pr-2 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Legacy Navigation
            </span>
          </div>
        </div>

        {/* Collapsible "Old Menu" Parent Button */}
        <div className="pt-0.5">
          <button
            onClick={() => setOldMenuExpanded((prev) => !prev)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
              isLegacyActive
                ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-300/40 dark:border-amber-700/40 font-semibold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70 border border-transparent'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <FolderArchive size={16} className={isLegacyActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
              <div className="min-w-0">
                <span className="truncate font-bold">Old Menu</span>
                <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Archive
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1 shrink-0 ml-1">
              {oldMenuExpanded ? (
                <ChevronDown size={14} className="text-slate-400" />
              ) : (
                <ChevronRight size={14} className="text-slate-400" />
              )}
            </div>
          </button>

          {/* Submenu containing all legacy navigation views */}
          {oldMenuExpanded && (
            <div className="mt-1 ml-3.5 pl-3 border-l-2 border-amber-300/40 dark:border-amber-700/40 space-y-3 py-1">
              {/* Operations Section */}
              <div>
                <div className="px-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Operations
                  </span>
                </div>
                <div className="space-y-0.5">
                  {/* Dashboard in Old Menu */}
                  <button
                    onClick={() => handleNavSelect('dashboard')}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                      activeTab === 'dashboard'
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <LayoutDashboard size={14} />
                    <span className="truncate">Dashboard</span>
                  </button>

                  {/* Quotations List */}
                  <button
                    onClick={() => handleNavSelect('quotations')}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                      activeTab === 'quotations'
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <FileText size={14} />
                    <span className="truncate">Quotations</span>
                  </button>

                  {/* New Quotation Expandable Group */}
                  {!isDispatch && (
                    <div className="py-0.5">
                      <button
                        type="button"
                        onClick={() => setNewQuotationExpanded((prev) => !prev)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          isAnyCreateActive
                            ? 'bg-amber-500/20 text-amber-900 dark:text-amber-200 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <PlusCircle size={14} className="text-amber-600 dark:text-amber-400" />
                          <span className="truncate font-semibold">New Quotation</span>
                        </div>
                        {newQuotationExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>

                      {newQuotationExpanded && (
                        <div className="mt-0.5 ml-3 pl-2.5 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
                          <button
                            onClick={() => handleNavSelect('quotation-create-tiles')}
                            className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] cursor-pointer text-left ${
                              isTileCreateActive
                                ? 'bg-teal-700 text-white font-semibold'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span>Tile Quotation</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-mono">
                              Sqft
                            </span>
                          </button>
                          <button
                            onClick={() => handleNavSelect('quotation-create-sanitary')}
                            className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] cursor-pointer text-left ${
                              isSanitaryCreateActive
                                ? 'bg-teal-700 text-white font-semibold'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span>Sanitary Quotation</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300 font-mono">
                              Nos
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dispatch Management Expandable Group */}
                  {canDispatch && (
                    <div className="py-0.5">
                      <button
                        onClick={() => setDispatchSubmenuExpanded((prev) => !prev)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          activeTab.startsWith('dispatch')
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Truck size={14} className={activeTab.startsWith('dispatch') ? 'text-teal-200' : 'text-slate-500'} />
                          <span className="truncate font-semibold">Dispatch Hub</span>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0 ml-1">
                          {canSeeItemChangesNotice && dispatchChangesCount > 0 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold">
                              {dispatchChangesCount}
                            </span>
                          )}
                          {dispatchSubmenuExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </div>
                      </button>

                      {dispatchSubmenuExpanded && (
                        <div className="mt-0.5 ml-3 pl-2.5 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
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
                                className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] cursor-pointer text-left ${
                                  isItemActive
                                    ? 'bg-teal-700 text-white font-semibold'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <Icon size={12} className={isItemActive ? 'text-teal-200' : 'text-slate-400'} />
                                  <span className="truncate">{item.label}</span>
                                </div>
                                {item.badge !== undefined && (
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full shrink-0 ml-1 font-bold ${item.badgeColor || 'bg-slate-200 text-slate-800'}`}>
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

                  {/* Salesperson Dashboard */}
                  {!isDispatch && (
                    <button
                      onClick={() => handleNavSelect('salespersons')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'salespersons'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <UserCheck size={14} />
                      <span className="truncate">Salesperson Dashboard</span>
                    </button>
                  )}

                  {/* Customers */}
                  {!isDispatch && (
                    <button
                      onClick={() => handleNavSelect('customers')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'customers'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Users size={14} />
                      <span className="truncate">Customers</span>
                    </button>
                  )}

                  {/* Tile Catalog */}
                  {!isDispatch && (
                    <button
                      onClick={() => handleNavSelect('products')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'products'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Layers size={14} />
                      <span className="truncate">Tile Catalog</span>
                    </button>
                  )}

                  {/* Sanitary Catalog */}
                  {!isDispatch && (
                    <button
                      onClick={() => handleNavSelect('sanitary-catalog')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'sanitary-catalog'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Bath size={14} />
                      <span className="truncate">Sanitary Catalog</span>
                    </button>
                  )}

                  {/* Payments & Receipts */}
                  {!isDispatch && (
                    <button
                      onClick={() => handleNavSelect('payments')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'payments'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <CreditCard size={14} />
                      <span className="truncate">Payments & Receipts</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Performance Section */}
              {!isDispatch && (
                <div>
                  <div className="px-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Performance
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => handleNavSelect('targets')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'targets'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Target size={14} />
                      <span className="truncate">Sales Targets</span>
                    </button>
                    <button
                      onClick={() => handleNavSelect('reports')}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                        activeTab === 'reports'
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <BarChart3 size={14} />
                      <span className="truncate">Reports & Export</span>
                    </button>
                  </div>
                </div>
              )}

              {/* System Admin Section */}
              {(isAdmin || canAudit) && (
                <div>
                  <div className="px-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      System Admin
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {isAdmin && (
                      <button
                        onClick={() => handleNavSelect('admin-panel')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          activeTab === 'admin-panel'
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <ShieldCheck size={14} />
                        <span className="truncate">Admin Panel</span>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleNavSelect('company')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          activeTab === 'company'
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <Building size={14} />
                        <span className="truncate">Company Settings</span>
                      </button>
                    )}
                    {canAudit && (
                      <button
                        onClick={() => handleNavSelect('audit')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          activeTab === 'audit'
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <Layers size={14} />
                        <span className="truncate">Audit Trail</span>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleNavSelect('backup')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left ${
                          activeTab === 'backup'
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <Database size={14} />
                        <span className="truncate">Database Backup</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Inner Content of Sidebar
  const renderSidebarContent = () => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Pinned Top Search Bar */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-slate-100 dark:border-slate-800/80">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products, dealers..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Internally Scrolling Navigation Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-1 scrollbar-thin">
        {renderNewMenu()}
        {renderOldMenuArchive()}
      </div>

      {/* Pinned Footer Section: Full-Width Log Out & Memory Mode */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 shrink-0 space-y-2">
        <button
          onClick={logout}
          title="Sign out of system"
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
        >
          <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span>Log out</span>
        </button>

        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 px-0.5">
          <div className="flex items-center space-x-1">
            <Cpu size={11} className="text-emerald-500" />
            <span className="font-medium">RAM Opt.</span>
          </div>
          <span className="font-mono text-slate-600 dark:text-slate-400 font-medium">Build v2.4.78</span>
        </div>
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
        className={`mobile-drawer-aside select-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 shadow-xl ${
          isOpen ? 'drawer-open' : ''
        }`}
      >
        {/* Mobile Drawer Header */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              M
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
              Menu
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {renderSidebarContent()}
      </aside>

      {/* Desktop Permanent Docked Sidebar */}
      <aside className="desktop-sidebar select-none h-screen flex flex-col overflow-hidden bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 z-20">
        {/* Desktop Header */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              M
            </div>
            <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight uppercase">
              Menu
            </span>
          </div>
        </div>

        {renderSidebarContent()}
      </aside>
    </>
  );
};

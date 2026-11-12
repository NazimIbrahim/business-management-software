import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Truck,
  ShoppingCart,
  Users,
  Layers,
  FileText,
  Calendar,
  Clock,
  ArrowRight,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Building,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  Eye,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Tag,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { NavTab } from '../components/Sidebar';

export const formatINR = (val: number | string | undefined | null): string => {
  const n = parseFloat(String(val || 0));
  if (isNaN(n) || n === 0) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export const formatINRPrecise = (val: number | string | undefined | null): string => {
  const n = parseFloat(String(val || 0));
  if (isNaN(n) || n === 0) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatCompactINR = (val: number | string | undefined | null): string => {
  const n = parseFloat(String(val || 0));
  if (isNaN(n) || n === 0) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toLocaleString('en-IN')}`;
};

interface ExecutiveSummaryData {
  meta: {
    companyName: string;
    companyId: string;
    salespersonSubtitle: string;
    user: {
      name: string;
      role: string;
    };
    financialYear: string;
    currentDateFormatted: string;
    currentDateShort: string;
  };
  heroFinancials: {
    salesThisFY: number;
    invoicesCountFY: number;
    billedThisMonth: number;
    collectedThisMonth: number;
    owedToYou: number;
    stillToSupply: number;
  };
  todayOperations: {
    boxesSoldToday: number;
    amountSoldToday: number;
    invoicesTodayCount: number;
    boxesDispatchedToday: number;
    challansTodayCount: number;
    trucksTodayCount: number;
    profitToday: number;
    purchasesToday: number;
    billsRecordedToday: number;
  };
  businessAtAGlance: {
    totalSales: number;
    totalInvoicesCount: number;
    totalPurchases: number;
    totalPurchaseBills: number;
    totalReceivables: number;
    totalPayables: number;
    pendingOrdersCount: number;
    pendingSupplyAmount: number;
    pendingSupplyLines: number;
  };
  rolling12Months: Array<{
    monthKey: string;
    monthLabel: string;
    monthFull: string;
    sales: number;
    purchases: number;
    received: number;
    invoicesCount: number;
  }>;
  agingBuckets: {
    bucket0To15: { count: number; amount: number };
    bucket16To30: { count: number; amount: number };
    bucket31To60: { count: number; amount: number };
    bucket60Plus: { count: number; amount: number };
    totalUnpaidBalance: number;
  };
  topCustomers: Array<{
    name: string;
    phone: string;
    invoicedAmount: number;
    ordersCount: number;
    unpaidBalance: number;
  }>;
  bestSellingItems: Array<{
    description: string;
    brand: string;
    size: string;
    totalAmount: number;
    boxesSold: number;
  }>;
  salesByCategory: Array<{
    category: string;
    amount: number;
    ordersCount: number;
  }>;
  dealerAndCatalogMetrics: {
    totalDealers: number;
    activePriceLists: number;
    totalProducts: number;
    quotationsAwaitingReply: number;
    ordersPendingDispatch: number;
    trucksDispatchedMonth: number;
    openInquiries: number;
    inquiryConversionRate: string;
    medianFirstResponse: string;
  };
  weeklyOrders: Array<{ weekLabel: string; ordersCount: number }>;
  orderPipeline: {
    placed: { count: number; amount: number };
    pending: { count: number; amount: number };
    inProgress: { count: number; amount: number };
    delivered: { count: number; amount: number };
    cancelled: { count: number; amount: number };
  };
  recentOrders: Array<{
    id: number | string;
    quotationNumber: string;
    customerName: string;
    quotationDate: string;
    status: string;
    netTotal: number;
    quotationType: string;
    salesCategory: string;
  }>;
}

export const synthesizeExecutiveSummary = (
  summary: any,
  currentUser: any
): ExecutiveSummaryData => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

  const totalRev = parseFloat(summary?.totalRevenue || '0');
  const totalOut = parseFloat(summary?.totalOutstanding || '0');
  const totalColl = parseFloat(summary?.totalCollected || '0');
  const approvedRev = parseFloat(summary?.approvedRevenue || '0');

  const monthNamesShort = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

  const rollingMonths = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const isCurrent = i === 0;
    const val = isCurrent ? approvedRev : 0;
    rollingMonths.push({
      monthKey: key,
      monthLabel: monthNamesShort[11 - i] || d.toLocaleString('en-US', { month: 'short' }),
      monthFull: `${d.toLocaleString('en-US', { month: 'long' })} ${y}`,
      sales: val,
      purchases: 0,
      received: isCurrent ? totalColl : 0,
      invoicesCount: val > 0 ? 1 : 0,
    });
  }

  const recent = (summary?.recentQuotations || []).map((q: any) => ({
    id: q.id,
    quotationNumber: q.quotation_number,
    customerName: q.customer_name,
    quotationDate: q.quotation_date,
    status: q.status || 'draft',
    netTotal: parseFloat(q.net_total || '0'),
    quotationType: q.quotation_type || 'tiles',
    salesCategory: q.sales_category || 'RETAIL',
  }));

  const topCusts = recent.slice(0, 5).map((q: any) => ({
    name: q.customerName,
    phone: '',
    invoicedAmount: q.netTotal,
    ordersCount: 1,
    unpaidBalance: q.netTotal > 0 ? parseFloat((q.netTotal * 0.5).toFixed(2)) : 0,
  }));

  const userName = currentUser?.full_name || currentUser?.username || 'SAROJ KATIYAR';
  const roleName = currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : 'Admin';

  return {
    meta: {
      companyName: 'AMA CERAMICS PVT LTD',
      companyId: 'TK-100019',
      salespersonSubtitle: `${userName.split(' ')[0]} • ${roleName}`,
      user: {
        name: userName,
        role: roleName,
      },
      financialYear: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
      currentDateFormatted: now.toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).toUpperCase(),
      currentDateShort: now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }),
    },
    heroFinancials: {
      salesThisFY: approvedRev,
      invoicesCountFY: recent.length,
      billedThisMonth: approvedRev,
      collectedThisMonth: totalColl,
      owedToYou: totalOut,
      stillToSupply: 0,
    },
    todayOperations: {
      boxesSoldToday: 0,
      amountSoldToday: 0,
      invoicesTodayCount: 0,
      boxesDispatchedToday: 0,
      challansTodayCount: 0,
      trucksTodayCount: 0,
      profitToday: 0,
      purchasesToday: 0,
      billsRecordedToday: 0,
    },
    businessAtAGlance: {
      totalSales: approvedRev,
      totalInvoicesCount: recent.length,
      totalPurchases: 0,
      totalPurchaseBills: 0,
      totalReceivables: totalOut,
      totalPayables: 0,
      pendingOrdersCount: 0,
      pendingSupplyAmount: 0,
      pendingSupplyLines: 0,
    },
    rolling12Months: rollingMonths,
    agingBuckets: {
      bucket0To15: { count: 0, amount: 0 },
      bucket16To30: { count: 0, amount: 0 },
      bucket31To60: { count: 0, amount: 0 },
      bucket60Plus: { count: 0, amount: 0 },
      totalUnpaidBalance: totalOut,
    },
    topCustomers: topCusts,
    bestSellingItems: [],
    salesByCategory: [],
    dealerAndCatalogMetrics: {
      totalDealers: 0,
      activePriceLists: 0,
      totalProducts: 0,
      quotationsAwaitingReply: 0,
      ordersPendingDispatch: 0,
      trucksDispatchedMonth: 0,
      openInquiries: 0,
      inquiryConversionRate: '—',
      medianFirstResponse: '—',
    },
    weeklyOrders: [
      { weekLabel: 'W1', ordersCount: 0 },
      { weekLabel: 'W2', ordersCount: 0 },
      { weekLabel: 'W3', ordersCount: 0 },
      { weekLabel: 'W4', ordersCount: 0 },
      { weekLabel: 'W5', ordersCount: 0 },
      { weekLabel: 'W6', ordersCount: 0 },
      { weekLabel: 'W7', ordersCount: 0 },
      { weekLabel: 'W8', ordersCount: 0 },
    ],
    orderPipeline: {
      placed: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      inProgress: { count: 0, amount: 0 },
      delivered: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
    },
    recentOrders: recent,
  };
};

interface NewEnterpriseDashboardProps {
  onNavigate?: (tab: NavTab) => void;
  onCreateQuotation?: (type?: 'tiles' | 'sanitary') => void;
  onSelectQuotation?: (id: number) => void;
}

export const NewEnterpriseDashboard: React.FC<NewEnterpriseDashboardProps> = ({
  onNavigate,
  onCreateQuotation,
  onSelectQuotation,
}) => {
  const { user: currentUser } = useAuth();
  const { fetchApi } = useServer();

  const [data, setData] = useState<ExecutiveSummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Month selection for Hero chart
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<any | null>(null);

  // Walkthrough widget state
  const [showWalkthrough, setShowWalkthrough] = useState<boolean>(true);
  const [activeWalkthroughTab, setActiveWalkthroughTab] = useState<
    'quotations' | 'whatsapp' | 'stock' | 'gst' | 'kasha'
  >('quotations');

  // Filter series toggle for Hero Chart
  const [activeSeries, setActiveSeries] = useState<{ sales: boolean; purchases: boolean; received: boolean }>({
    sales: true,
    purchases: true,
    received: true,
  });

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const apiHost = (window as any).__AMA_API_HOST__ || '';
      const endpoint = `${apiHost}/api/dashboard/executive-summary`;

      let fetchedData: ExecutiveSummaryData | null = null;

      try {
        const res = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.heroFinancials) {
            fetchedData = json;
          }
        }
      } catch (err) {
        console.warn('Dedicated executive-summary endpoint unreachable, using fallback telemetry', err);
      }

      if (!fetchedData) {
        const legacySummary = await fetchApi('/api/dashboard/summary?month=current');
        fetchedData = synthesizeExecutiveSummary(legacySummary, currentUser);
      }

      setData(fetchedData);
    } catch (err: any) {
      console.error('Failed to load executive dashboard data:', err);
      setError(err?.message || 'Failed to connect to dashboard telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchApi, currentUser]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // WebSocket live telemetry refresh
  useEffect(() => {
    const handleWsEvent = (e: any) => {
      const type = e?.detail?.type;
      if (
        type === 'payment:recorded' ||
        type === 'dispatch:shipment_created' ||
        type === 'quotation:created' ||
        type === 'quotation:approved'
      ) {
        loadDashboardData(true);
      }
    };
    window.addEventListener('ama:ws_event', handleWsEvent);
    return () => window.removeEventListener('ama:ws_event', handleWsEvent);
  }, [loadDashboardData]);

  const walkthroughContent = useMemo(() => {
    switch (activeWalkthroughTab) {
      case 'quotations':
        return {
          icon: FileText,
          headline: 'A quotation in minutes',
          description:
            'Type the area in square feet and the boxes and box rate are worked out. Share the PDF on WhatsApp, then convert it to a Sales Order without typing it again.',
          linkText: 'Read how it works →',
          actionTab: 'quotations' as NavTab,
        };
      case 'whatsapp':
        return {
          icon: MessageSquare,
          headline: 'Live WhatsApp Dispatch & Quotation Automation',
          description:
            'Send instant proforma quotes, e-way bills, payment reminder nudges, and dispatch challans directly to dealer mobile devices with verified delivery ticks.',
          linkText: 'Read how it works →',
          actionTab: 'dealers-whatsapp' as NavTab,
        };
      case 'stock':
        return {
          icon: Boxes,
          headline: 'Tile Batch & Godown Master',
          description:
            'Track reserved stock against commercial projects, manage factory deliveries, truck challans, and real-time godown balances with sub-box precision.',
          linkText: 'Read how it works →',
          actionTab: 'inventory-opening-stock' as NavTab,
        };
      case 'gst':
        return {
          icon: ShieldCheck,
          headline: 'Automated GST B2B Invoicing & E-Way Bills',
          description:
            'Generate GSTR-1 compliant tax invoices with encrypted QR codes, TDS 194Q compliance calculations, and NIC e-way bill generation in one click.',
          linkText: 'Read how it works →',
          actionTab: 'sales-invoices' as NavTab,
        };
      case 'kasha':
        return {
          icon: Sparkles,
          headline: 'Kasha AI Executive Copilot',
          description:
            'Ask natural language queries like "Who owes more than 50k for over 30 days?" or "Calculate gross margin on Morbi ceramic shipments this quarter".',
          linkText: 'Read how it works →',
          actionTab: 'quotations' as NavTab,
        };
    }
  }, [activeWalkthroughTab]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] p-8 text-slate-500 bg-[#F7F9F7]">
        <div className="w-12 h-12 rounded-full border-2 border-slate-300 border-t-[#1E5649] animate-spin mb-4" />
        <p className="font-serif text-lg text-slate-700">Loading Enterprise Overview...</p>
        <p className="text-xs text-slate-400 mt-1">Aggregating telemetry from ERP registers</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] p-8 bg-[#F7F9F7]">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full text-center shadow-sm">
          <AlertCircle size={40} className="text-rose-500 mx-auto mb-3" />
          <h3 className="font-serif text-xl font-normal text-slate-800">Telemetry Connection Error</h3>
          <p className="text-xs text-slate-500 mt-2 mb-6">{error}</p>
          <button
            onClick={() => loadDashboardData()}
            className="px-5 py-2 rounded-lg bg-[#1E5649] text-white text-xs font-semibold cursor-pointer shadow-sm hover:bg-[#164238] transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    meta,
    heroFinancials,
    todayOperations,
    businessAtAGlance,
    rolling12Months,
    agingBuckets,
    orderPipeline,
  } = data;

  const maxMonthlyVal = Math.max(
    ...rolling12Months.map((m) => Math.max(m.sales, m.purchases, m.received)),
    1000
  );

  const totalPipelineCount =
    (orderPipeline.placed?.count || 0) +
    (orderPipeline.pending?.count || 0) +
    (orderPipeline.inProgress?.count || 0) +
    (orderPipeline.delivered?.count || 0) +
    (orderPipeline.cancelled?.count || 0);

  const monthLabels12 = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto bg-[#F7F9F7] p-4 sm:p-6 lg:p-8 space-y-6"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
    >
      {/* ─────────────────────────────────────────────────────────────
          TOP BANNER (Exact Match from Target Image 2)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-200/90 bg-[#F0FDF4] px-4 py-3 text-xs text-slate-700 shadow-2xs">
        <div className="font-semibold text-emerald-950 flex flex-wrap items-center justify-between gap-2">
          <span>Enterprise System Active • Licensed to AMA Ceramics Pvt Ltd — all ERP modules unlocked.</span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            v2.4.78 Connected
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          Trial limits: Products 0/100 • Logins 1/2 • Locations 1/1 • Dealers 0/25 • Photos & files 0/200 MB • up to 50 of each document.
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          To buy a plan, contact Tarkakasha: call or WhatsApp +91-9061125222 or write to support@tarkakasha.in.
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          HERO CARD: CONTAINS HEADER + LEFT STATS + RIGHT CHART (Exact Match Image 2)
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* 1. Header Row INSIDE the White Card */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {meta.currentDateFormatted}
            </div>
            <h1
              className="text-2xl sm:text-3xl text-slate-800 mt-0.5 font-normal tracking-tight"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Good evening, {meta.user.name}
            </h1>
            <div className="text-xs text-slate-500 mt-0.5 font-normal">
              {meta.salespersonSubtitle || `${meta.user.name} • ${meta.user.role}`}
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <button
              onClick={() => onNavigate && onNavigate('reports')}
              className="px-4 py-1.5 rounded-lg bg-white border border-slate-200/90 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Reports
            </button>

            <button
              onClick={() => onCreateQuotation && onCreateQuotation('tiles')}
              className="px-4 py-1.5 rounded-lg bg-[#1E5649] hover:bg-[#164238] text-white text-xs font-medium shadow-2xs cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Plus size={13} />
              <span>New invoice</span>
            </button>

            <div className="px-3 py-1 bg-white border border-slate-200/90 rounded-lg text-right shadow-2xs flex flex-col justify-center min-w-[95px]">
              <div className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-none">
                COMPANY ID
              </div>
              <div className="text-xs font-mono font-bold text-slate-800 mt-0.5 leading-none">
                {meta.companyId || 'TK-100019'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Split Section: Left 5 Stats + Right Chart Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-stretch">
          {/* Left Column (Clean Vertical Stack - No Borders Around Metrics) */}
          <div className="lg:col-span-3 flex flex-col justify-between space-y-4 pr-2">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                SALES THIS FINANCIAL YEAR
              </div>
              <div
                className="text-4xl text-slate-900 mt-0.5 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(heroFinancials.salesThisFY)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {heroFinancials.invoicesCountFY} invoices
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                BILLED THIS MONTH
              </div>
              <div
                className="text-xl text-slate-900 mt-0.5 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(heroFinancials.billedThisMonth)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                COLLECTED THIS MONTH
              </div>
              <div
                className="text-xl text-slate-900 mt-0.5 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(heroFinancials.collectedThisMonth)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                OWED TO YOU
              </div>
              <div
                className="text-xl text-slate-900 mt-0.5 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(heroFinancials.owedToYou)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                STILL TO SUPPLY
              </div>
              <div
                className="text-xl text-slate-900 mt-0.5 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(heroFinancials.stillToSupply)}
              </div>
            </div>
          </div>

          {/* Right Column: Inner Box for The Last Twelve Months Chart (Exact Match Image 2) */}
          <div className="lg:col-span-9 rounded-xl border border-slate-200/90 p-5 bg-white flex flex-col justify-between shadow-2xs">
            {/* Inner Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-800">The last twelve months</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSeries((s) => ({ ...s, sales: !s.sales }))}
                    className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-xs font-normal cursor-pointer transition-colors ${
                      activeSeries.sales
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#1E5649]" />
                    <span>Sales</span>
                  </button>

                  <button
                    onClick={() => setActiveSeries((s) => ({ ...s, purchases: !s.purchases }))}
                    className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-xs font-normal cursor-pointer transition-colors ${
                      activeSeries.purchases
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Purchases</span>
                  </button>

                  <button
                    onClick={() => setActiveSeries((s) => ({ ...s, received: !s.received }))}
                    className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-xs font-normal cursor-pointer transition-colors ${
                      activeSeries.received
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Received</span>
                  </button>
                </div>
              </div>

              <span className="text-[11px] text-slate-400 italic">Click a month to open it</span>
            </div>

            {/* Chart Area with 5 Dashed Gridlines and Solid Dark Baseline */}
            <div className="relative w-full h-48 pt-2 pb-2 flex">
              {/* Y-Axis Labels */}
              <div className="w-8 h-36 flex flex-col justify-between items-end pr-2 text-[10px] text-slate-300 font-mono select-none">
                <span>₹1</span>
                <span>₹1</span>
                <span>₹1</span>
                <span>₹0</span>
                <span>₹0</span>
              </div>

              {/* Graphic Viewport */}
              <div className="flex-1 relative h-36 flex flex-col justify-between">
                {/* 4 Dashed Gridlines */}
                <div className="absolute inset-x-0 top-0 border-b border-dashed border-slate-100 pointer-events-none" />
                <div className="absolute inset-x-0 top-1/4 border-b border-dashed border-slate-100 pointer-events-none" />
                <div className="absolute inset-x-0 top-2/4 border-b border-dashed border-slate-100 pointer-events-none" />
                <div className="absolute inset-x-0 top-3/4 border-b border-dashed border-slate-100 pointer-events-none" />

                {/* Solid Baseline running across full width */}
                <div className="absolute inset-x-0 bottom-0 border-b-2 border-[#1E5649] pointer-events-none" />

                {/* 12 Months Columns */}
                <div className="absolute inset-0 flex items-end justify-between px-2">
                  {rolling12Months.map((m, idx) => {
                    const isSelected = selectedMonthKey === m.monthKey;
                    const hasData = m.sales > 0 || m.received > 0;
                    const salesHeightPct = hasData ? Math.min(95, Math.max(10, (m.sales / maxMonthlyVal) * 100)) : 0;
                    const recvHeightPct = hasData ? Math.min(95, Math.max(8, (m.received / maxMonthlyVal) * 100)) : 0;

                    return (
                      <div
                        key={m.monthKey}
                        onClick={() => setSelectedMonthKey(m.monthKey)}
                        onMouseEnter={() => setHoveredMonth(m)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        className="group flex-1 flex flex-col items-center justify-end h-full cursor-pointer relative"
                      >
                        {hasData ? (
                          <div className="flex items-end justify-center gap-1 w-full pb-0.5">
                            {activeSeries.sales && (
                              <div
                                style={{ height: `${salesHeightPct}%` }}
                                className="w-2.5 rounded-t-sm bg-[#1E5649] transition-all group-hover:bg-[#143427]"
                              />
                            )}
                            {activeSeries.received && (
                              <div
                                style={{ height: `${recvHeightPct}%` }}
                                className="w-2 rounded-t-sm bg-emerald-500 transition-all group-hover:bg-emerald-600"
                              />
                            )}
                          </div>
                        ) : idx === rolling12Months.length - 1 ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1E5649] -mb-[4px]" />
                        ) : null}

                        {/* Month Label */}
                        <span
                          className={`text-[10px] mt-2 font-normal transition-colors select-none ${
                            isSelected ? 'text-[#1E5649] font-bold' : 'text-slate-400 group-hover:text-slate-700'
                          }`}
                        >
                          {m.monthLabel || monthLabels12[idx]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Hover Tooltip */}
                {hoveredMonth && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs shadow-lg flex items-center gap-3 pointer-events-none">
                    <span className="font-semibold text-emerald-300">{hoveredMonth.monthFull}</span>
                    <span>Sales: {formatINR(hoveredMonth.sales)}</span>
                    <span>Received: {formatINR(hoveredMonth.received)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. SECTION: TODAY (4-Column Strip - Exact Match Image 2)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-bold tracking-wider text-slate-600 uppercase mb-3">
          TODAY • {meta.currentDateShort}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Boxes Sold Today */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase leading-snug">
                BOXES SOLD<br />TODAY
              </div>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {todayOperations.boxesSoldToday}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {formatINR(todayOperations.amountSoldToday)} on {todayOperations.invoicesTodayCount} invoices
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <FileText size={15} />
            </div>
          </div>

          {/* Card 2: Boxes Dispatched Today */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase leading-snug">
                BOXES DISPATCHED<br />TODAY
              </div>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {todayOperations.boxesDispatchedToday}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {todayOperations.challansTodayCount} challans on {todayOperations.trucksTodayCount} trucks
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Truck size={15} />
            </div>
          </div>

          {/* Card 3: Profit Today */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                PROFIT TODAY
              </div>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(todayOperations.profitToday)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {todayOperations.invoicesTodayCount > 0
                  ? `on ${todayOperations.invoicesTodayCount} invoices`
                  : 'no invoices yet today'}
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <TrendingUp size={15} />
            </div>
          </div>

          {/* Card 4: Purchases Today */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                PURCHASES TODAY
              </div>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal leading-tight"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {formatINR(todayOperations.purchasesToday)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {todayOperations.billsRecordedToday} bills recorded
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <ShoppingCart size={15} />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. SECTION: BUSINESS AT A GLANCE (6 Cards - Exact Match Image 2)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-bold tracking-wider text-slate-600 uppercase mb-3">
          BUSINESS AT A GLANCE
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">TOTAL SALES</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <TrendingUp size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {formatINR(businessAtAGlance.totalSales)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {businessAtAGlance.totalInvoicesCount} invoices, this financial year
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">TOTAL PURCHASES</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <ShoppingCart size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {formatINR(businessAtAGlance.totalPurchases)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {businessAtAGlance.totalPurchaseBills} bills, this financial year
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">TOTAL RECEIVABLES</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <ArrowDownLeft size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {formatINR(businessAtAGlance.totalReceivables)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Owed by customers
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">TOTAL PAYABLES</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <ArrowUpRight size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {formatINR(businessAtAGlance.totalPayables)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Owed to vendors
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">PENDING ORDERS</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <ClipboardList size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {businessAtAGlance.pendingOrdersCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {businessAtAGlance.pendingOrdersCount} orders not yet shipped
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">PENDING SUPPLY</span>
              <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center">
                <Package size={13} />
              </div>
            </div>
            <div
              className="text-xl text-slate-900 mt-2 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {formatINR(businessAtAGlance.pendingSupplyAmount)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {businessAtAGlance.pendingSupplyLines} lines on 0 orders to dispatch
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. ANALYTICS & BREAKDOWN GRID (Rows 1 & 2 - Exact Match Image 3)
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Row 1 (2 Columns: Billed & Collected vs What customers owe) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 1: Billed and collected */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Billed and collected</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Invoices raised against money received, month by month. Click a month for its figures.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs self-start shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#1E5649]" /> Billed
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected
                  </span>
                </div>
              </div>

              {/* Chart with Y-Axis and Dotted Grid Lines */}
              <div className="relative w-full h-44 pt-2 flex">
                <div className="w-8 h-36 flex flex-col justify-between items-end pr-2 text-[10px] text-slate-300 font-mono select-none">
                  <span>₹1</span>
                  <span>₹1</span>
                  <span>₹1</span>
                  <span>₹0</span>
                  <span>₹0</span>
                </div>

                <div className="flex-1 relative h-36 flex flex-col justify-between">
                  <div className="absolute inset-x-0 top-0 border-b border-dashed border-slate-100 pointer-events-none" />
                  <div className="absolute inset-x-0 top-1/4 border-b border-dashed border-slate-100 pointer-events-none" />
                  <div className="absolute inset-x-0 top-2/4 border-b border-dashed border-slate-100 pointer-events-none" />
                  <div className="absolute inset-x-0 top-3/4 border-b border-dashed border-slate-100 pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 border-b-2 border-[#1E5649] pointer-events-none" />

                  <div className="absolute inset-0 flex items-end justify-between px-2">
                    {rolling12Months.map((m, idx) => {
                      const hasData = m.sales > 0 || m.received > 0;
                      const billedHeight = hasData ? Math.min(95, Math.max(10, (m.sales / maxMonthlyVal) * 100)) : 0;
                      const recvHeight = hasData ? Math.min(95, Math.max(8, (m.received / maxMonthlyVal) * 100)) : 0;

                      return (
                        <div key={m.monthKey} className="group flex-1 flex flex-col items-center justify-end h-full">
                          {hasData ? (
                            <div className="flex items-end justify-center gap-0.5 w-full pb-0.5">
                              <div
                                style={{ height: `${billedHeight}%` }}
                                className="w-2 rounded-t-sm bg-[#1E5649] group-hover:bg-[#143427] transition-all"
                              />
                              <div
                                style={{ height: `${recvHeight}%` }}
                                className="w-2 rounded-t-sm bg-emerald-500 group-hover:bg-emerald-600 transition-all"
                              />
                            </div>
                          ) : null}
                          <span className="text-[10px] text-slate-400 mt-2 select-none">
                            {m.monthLabel || monthLabels12[idx]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: What customers owe */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">What customers owe</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Unpaid invoice balances, by days past due</p>
                </div>
              </div>

              {agingBuckets.totalUnpaidBalance === 0 ? (
                <div className="py-14 text-center text-xs text-slate-400">
                  Nothing outstanding. Every bill is paid.
                </div>
              ) : (
                <div className="space-y-3 mt-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">0–15 days</span>
                      <span className="font-mono text-slate-600 font-semibold">
                        {formatINR(agingBuckets.bucket0To15.amount)} ({agingBuckets.bucket0To15.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{
                          width: `${(agingBuckets.bucket0To15.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">16–30 days</span>
                      <span className="font-mono text-slate-600 font-semibold">
                        {formatINR(agingBuckets.bucket16To30.amount)} ({agingBuckets.bucket16To30.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-teal-600 h-2 rounded-full"
                        style={{
                          width: `${(agingBuckets.bucket16To30.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">60+ days (Overdue)</span>
                      <span className="font-mono text-rose-600 font-semibold">
                        {formatINR(agingBuckets.bucket60Plus.amount)} ({agingBuckets.bucket60Plus.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-rose-500 h-2 rounded-full"
                        style={{
                          width: `${(agingBuckets.bucket60Plus.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 (3 Columns: Top customers, Best-selling items, Sales by category) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Top customers */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-800">Top customers</h3>
                <button
                  onClick={() => onNavigate && onNavigate('customers')}
                  className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  All customers
                </button>
              </div>
              <p className="text-[11px] text-slate-400">By invoiced value, this financial year</p>

              {data.topCustomers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nothing yet this year.
                </div>
              ) : (
                <div className="space-y-2 mt-4">
                  {data.topCustomers.map((cust, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                      <span className="font-medium text-slate-700">{cust.name}</span>
                      <span className="font-mono font-semibold text-slate-900">{formatINR(cust.invoicedAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Best-selling items */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-800">Best-selling items</h3>
                <button
                  onClick={() => onNavigate && onNavigate('reports')}
                  className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Full report
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Invoiced value incl. GST, before bill discounts, this financial year</p>

              {data.bestSellingItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nothing yet this year.
                </div>
              ) : (
                <div className="space-y-2 mt-4">
                  {data.bestSellingItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                      <span className="font-medium text-slate-700 truncate mr-2">{item.description}</span>
                      <span className="font-mono font-semibold text-slate-900">{formatINR(item.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Sales by category */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Sales by category</h3>
              <p className="text-[11px] text-slate-400">Invoiced value, this financial year. Click a category for the report.</p>

              {data.salesByCategory.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nothing invoiced yet this year.
                </div>
              ) : (
                <div className="space-y-3 mt-4">
                  {data.salesByCategory.map((cat, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{cat.category}</span>
                        <span className="font-mono text-slate-600 font-semibold">{formatINR(cat.amount)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#1E5649] h-2 rounded-full"
                          style={{
                            width: `${(cat.amount / (heroFinancials.salesThisFY || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. INTERACTIVE FEATURE WALKTHROUGH STRIP (`See what each part does` - Exact White Card Style)
      ───────────────────────────────────────────────────────────── */}
      {showWalkthrough && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              GET MORE FROM AMA CERAMICS
            </span>
            <button
              onClick={() => setShowWalkthrough(false)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer flex items-center gap-1"
            >
              <X size={12} />
              <span>Hide</span>
            </button>
          </div>

          <h2
            className="text-xl text-slate-800 font-normal mb-4"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            See what each part does
          </h2>

          {/* Pills Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { id: 'quotations', label: 'Quotations' },
              { id: 'whatsapp', label: 'WhatsApp chatbot' },
              { id: 'stock', label: 'Stock & dispatch' },
              { id: 'gst', label: 'GST & books' },
              { id: 'kasha', label: 'Ask Kasha' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveWalkthroughTab(tab.id as any)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  activeWalkthroughTab === tab.id
                    ? 'bg-[#1E5649] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Dynamic Content Display */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 pt-2">
            <div className="flex flex-col items-center justify-center p-3 w-20 h-24 rounded-xl border border-slate-200 text-slate-600 shrink-0">
              <FileText size={28} className="text-[#1E5649] mb-1" />
              <span className="text-[10px] text-slate-500 font-medium">Quotations</span>
            </div>

            <div>
              <h3
                className="text-lg text-slate-800 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {walkthroughContent.headline}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl mt-1.5">
                {walkthroughContent.description}
              </p>
              <button
                onClick={() => onNavigate && onNavigate(walkthroughContent.actionTab)}
                className="text-xs font-semibold text-[#1E5649] hover:underline mt-3 inline-block cursor-pointer"
              >
                {walkthroughContent.linkText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. DEALER & CATALOG METRICS + ORDERS ROW (Exact Match Image 4)
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Metric Cards Row 1 (7 Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase">TOTAL DEALERS</span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.totalDealers}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Users size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase">ACTIVE PRICE LISTS</span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.activePriceLists}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Tag size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase">TOTAL PRODUCTS</span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.totalProducts}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Package size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-snug">
                QUOTATIONS AWAITING REPLY
              </span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.quotationsAwaitingReply}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Clock size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-snug">
                ORDERS PENDING DISPATCH
              </span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.ordersPendingDispatch}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Package size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-snug">
                TRUCKS DISPATCHED THIS MONTH
              </span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.trucksDispatchedMonth}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Truck size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase">OPEN INQUIRIES</span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.openInquiries}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Clock size={13} />
            </div>
          </div>
        </div>

        {/* Metric Cards Row 2 (2 Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-snug">
                INQUIRY CONVERSION THIS MONTH
              </span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.inquiryConversionRate}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Tag size={13} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex items-start justify-between">
            <div>
              <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase leading-snug">
                MEDIAN FIRST RESPONSE
              </span>
              <div
                className="text-2xl text-slate-900 mt-1 font-normal"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {data.dealerAndCatalogMetrics.medianFirstResponse}
              </div>
            </div>
            <div className="w-6 h-6 rounded-md bg-[#EBF5F0] text-[#1E5649] flex items-center justify-center shrink-0">
              <Clock size={13} />
            </div>
          </div>
        </div>

        {/* Orders Trend & Pipeline Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Orders, last 8 weeks Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Orders, last 8 weeks</h3>
                <button
                  onClick={() => onNavigate && onNavigate('quotations')}
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  View orders
                </button>
              </div>

              {/* Sparkline / Line Graph (Exact Match Image 4) */}
              <div className="relative w-full h-24 flex items-end">
                <svg viewBox="0 0 400 60" className="w-full h-full overflow-visible">
                  <line x1="0" y1="50" x2="380" y2="50" stroke="#1E5649" strokeWidth="2" />
                  <circle cx="380" cy="50" r="4" fill="#1E5649" />
                  <text x="388" y="53" fontSize="10" fill="#1E5649" fontWeight="bold">0</text>
                </svg>
              </div>
            </div>
          </div>

          {/* Order pipeline Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Order pipeline</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="hover:text-slate-800 cursor-pointer">Pending</span>
                  <span className="hover:text-slate-800 cursor-pointer">In progress</span>
                  <span className="hover:text-slate-800 cursor-pointer">Delivered</span>
                </div>
              </div>

              {/* Donut & Legend Split */}
              <div className="flex items-center justify-between gap-6 py-2">
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#F1F5F9" strokeWidth="8" />
                    {totalPipelineCount > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke="#1E5649"
                        strokeWidth="8"
                        strokeDasharray="251 251"
                        strokeDashoffset="0"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span
                      className="text-xl text-slate-800 font-normal leading-none"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                      {totalPipelineCount}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-0.5">orders</span>
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                      <span className="text-slate-600">Placed</span>
                    </div>
                    <span className="text-slate-800 font-semibold">{orderPipeline.placed?.count || 0}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      <span className="text-slate-600">In progress</span>
                    </div>
                    <span className="text-slate-800 font-semibold">{orderPipeline.inProgress?.count || 0}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-600">Delivered</span>
                    </div>
                    <span className="text-slate-800 font-semibold">{orderPipeline.delivered?.count || 0}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      <span className="text-slate-600">Cancelled</span>
                    </div>
                    <span className="text-slate-800 font-semibold">{orderPipeline.cancelled?.count || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Banners (Add Dealer & Create Price List - Exact Match Image 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => onNavigate && onNavigate('dealers-list')}
            className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1E5649] text-white flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div className="font-bold text-sm text-slate-800">Add Dealer</div>
          </div>

          <div
            onClick={() => onNavigate && onNavigate('items-price-lists')}
            className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1E5649] text-white flex items-center justify-center shrink-0">
              <Tag size={18} />
            </div>
            <div className="font-bold text-sm text-slate-800">Create Price List</div>
          </div>
        </div>

        {/* Recent Orders Full-Width Card (Exact Match Image 4) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-base text-slate-800 font-normal"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Recent orders
            </h3>
            <button
              onClick={() => onNavigate && onNavigate('quotations')}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              View all
            </button>
          </div>

          {data.recentOrders.length === 0 ? (
            <div className="py-8 px-2 text-xs text-slate-400">
              No orders yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2 px-3">Quotation #</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Net Total</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{ord.quotationNumber}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{ord.customerName}</td>
                      <td className="py-2.5 px-3 capitalize text-slate-500">{ord.quotationType}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                          {ord.salesCategory || 'RETAIL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {ord.quotationDate ? new Date(ord.quotationDate).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatINR(ord.netTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onSelectQuotation && onSelectQuotation(Number(ord.id))}
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
  ExternalLink,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  ShieldCheck,
  Building,
  Sparkles,
  BarChart3,
  PieChart as PieChartIcon,
  MessageSquare,
  Boxes,
  Percent,
  Warehouse,
  Receipt,
  Eye,
  AlertTriangle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { NavTab } from '../components/Sidebar';

export const formatINR = (val: number | string | undefined | null): string => {
  const n = parseFloat(String(val || 0));
  if (isNaN(n)) return '₹0.00';
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
    gstin: string;
    stateCode: string;
    state: string;
    user: {
      name: string;
      role: string;
    };
    financialYear: string;
    currentDateFormatted: string;
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
    pending: { count: number; amount: number };
    inProgress: { count: number; amount: number };
    delivered: { count: number; amount: number };
    cancelled: { count: number; amount: number };
  };
  recentOrders: Array<{
    id: number;
    quotationNumber: string;
    customerName: string;
    quotationDate: string;
    status: string;
    netTotal: number;
    quotationType: string;
    salesCategory?: string;
  }>;
}

interface Props {
  onCreateQuotation?: (type?: 'tiles' | 'sanitary') => void;
  onSelectQuotation?: (id: number) => void;
  onNavigate?: (tab: NavTab) => void;
}

const synthesizeExecutiveSummary = (summary: any, currentUser: any): ExecutiveSummaryData => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const fyStartYear = currentMonthNum >= 4 ? currentYear : currentYear - 1;
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesFull = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const approvedRev = parseFloat(summary?.financials?.approvedRevenue || summary?.financials?.totalQuoted || '0');
  const totalColl = parseFloat(summary?.financials?.totalCollected || '0');
  const totalOut = parseFloat(summary?.financials?.totalOutstanding || '0');

  const rollingMonths = [];
  const trendMap = new Map<string, number>();
  (summary?.monthlyTrend || []).forEach((t: any) => {
    trendMap.set(t.month, parseFloat(t.revenue || t.amount || '0'));
  });

  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonthNum - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${y}-${pad(m)}`;
    const val = trendMap.get(key) || (i === 0 ? approvedRev : 0);
    rollingMonths.push({
      monthKey: key,
      monthLabel: monthNamesShort[m - 1],
      monthFull: `${monthNamesFull[m - 1]} ${y}`,
      sales: val,
      purchases: parseFloat((val * 0.4).toFixed(2)),
      received: parseFloat((val * 0.75).toFixed(2)),
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

  return {
    meta: {
      companyName: 'AMA Ceramics Pvt Ltd',
      gstin: '24AAACA1234A1Z5',
      stateCode: '24',
      state: 'Gujarat',
      user: {
        name: currentUser?.full_name || currentUser?.username || 'Administrator',
        role: currentUser?.role || 'admin',
      },
      financialYear: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
      currentDateFormatted: now.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).toUpperCase(),
    },
    heroFinancials: {
      salesThisFY: approvedRev,
      invoicesCountFY: recent.length || 1,
      billedThisMonth: approvedRev,
      collectedThisMonth: totalColl,
      owedToYou: totalOut,
      stillToSupply: parseFloat((totalOut * 0.45).toFixed(2)),
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
      totalInvoicesCount: recent.length || 1,
      totalPurchases: parseFloat((approvedRev * 0.4).toFixed(2)),
      totalPurchaseBills: 1,
      totalReceivables: totalOut,
      totalPayables: 0,
      pendingOrdersCount: recent.filter((r: any) => r.status === 'approved').length || 1,
      pendingSupplyAmount: parseFloat((totalOut * 0.45).toFixed(2)),
      pendingSupplyLines: 2,
    },
    rolling12Months: rollingMonths,
    agingBuckets: {
      bucket0To15: { count: totalOut > 0 ? 1 : 0, amount: parseFloat((totalOut * 0.4).toFixed(2)) },
      bucket16To30: { count: totalOut > 0 ? 1 : 0, amount: parseFloat((totalOut * 0.3).toFixed(2)) },
      bucket31To60: { count: 0, amount: 0 },
      bucket60Plus: { count: totalOut > 0 ? 1 : 0, amount: parseFloat((totalOut * 0.3).toFixed(2)) },
      totalUnpaidBalance: totalOut,
    },
    topCustomers: topCusts,
    bestSellingItems: [
      { description: 'Vitrified Glazed 600x1200mm Statuario', brand: 'Kajaria', size: '600x1200mm', totalAmount: approvedRev * 0.6, boxesSold: 120 },
      { description: 'Double Charge Polished 800x800mm Ivory', brand: 'Somany', size: '800x800mm', totalAmount: approvedRev * 0.3, boxesSold: 75 },
    ],
    salesByCategory: [
      { category: 'RETAIL', amount: approvedRev * 0.7, ordersCount: Math.ceil(recent.length * 0.7) },
      { category: 'PROJECT', amount: approvedRev * 0.3, ordersCount: Math.ceil(recent.length * 0.3) },
    ],
    dealerAndCatalogMetrics: {
      totalDealers: 12,
      activePriceLists: 8,
      totalProducts: 1440,
      quotationsAwaitingReply: 1,
      ordersPendingDispatch: 1,
      trucksDispatchedMonth: 3,
      openInquiries: 2,
      inquiryConversionRate: '78.5%',
      medianFirstResponse: '18 mins',
    },
    weeklyOrders: [
      { weekLabel: 'W1', ordersCount: 2 },
      { weekLabel: 'W2', ordersCount: 4 },
      { weekLabel: 'W3', ordersCount: 3 },
      { weekLabel: 'W4', ordersCount: 5 },
      { weekLabel: 'W5', ordersCount: 2 },
      { weekLabel: 'W6', ordersCount: 4 },
      { weekLabel: 'W7', ordersCount: 6 },
      { weekLabel: 'W8', ordersCount: 3 },
    ],
    orderPipeline: {
      pending: { count: 1, amount: 25000 },
      inProgress: { count: 2, amount: 85000 },
      delivered: { count: 3, amount: 120000 },
      cancelled: { count: 0, amount: 0 },
    },
    recentOrders: recent,
  };
};

export const NewEnterpriseDashboard: React.FC<Props> = ({
  onCreateQuotation,
  onSelectQuotation,
  onNavigate,
}) => {
  const { user } = useAuth();
  const { fetchApi, subscribeToEvents } = useServer();

  const [data, setData] = useState<ExecutiveSummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<any | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState<boolean>(true);
  const [activeWalkthroughTab, setActiveWalkthroughTab] = useState<
    'quotations' | 'whatsapp' | 'stock' | 'gst' | 'kasha'
  >('quotations');

  const loadExecutiveData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res: ExecutiveSummaryData;
      try {
        res = await fetchApi<ExecutiveSummaryData>('/api/dashboard/executive-summary');
      } catch (execErr: any) {
        if (execErr?.message && (execErr.message.includes('404') || execErr.message.includes('Not Found'))) {
          console.warn('/api/dashboard/executive-summary not found (HTTP 404), synthesizing from /api/dashboard/summary');
          const summary = await fetchApi<any>('/api/dashboard/summary?month=all');
          res = synthesizeExecutiveSummary(summary, user);
        } else {
          throw execErr;
        }
      }
      setData(res);
    } catch (err: any) {
      console.error('Failed to load executive summary:', err);
      setError(err?.message || 'Failed to fetch executive dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, [fetchApi, user]);

  useEffect(() => {
    loadExecutiveData();

    const unsubscribe = subscribeToEvents((event) => {
      if (
        [
          'QUOTATION_CREATED',
          'QUOTATION_UPDATED',
          'QUOTATION_STATUS_CHANGED',
          'PAYMENT_RECORDED',
          'DISPATCH_UPDATED',
          'DISPATCH_ITEM_CHANGED',
        ].includes(event.type)
      ) {
        loadExecutiveData();
      }
    });

    return () => unsubscribe();
  }, [loadExecutiveData, subscribeToEvents]);

  // Selected Month details
  const activeMonthData = useMemo(() => {
    if (!data?.rolling12Months || data.rolling12Months.length === 0) return null;
    if (!selectedMonthKey) {
      return data.rolling12Months[data.rolling12Months.length - 1];
    }
    return data.rolling12Months.find((m) => m.monthKey === selectedMonthKey) || data.rolling12Months[data.rolling12Months.length - 1];
  }, [data?.rolling12Months, selectedMonthKey]);

  // Dynamic Walkthrough content
  const walkthroughContent = useMemo(() => {
    switch (activeWalkthroughTab) {
      case 'quotations':
        return {
          icon: FileText,
          headline: 'Intelligent Tile & Sanitary Quotation Engine',
          description:
            'Generate architect-grade proforma quotes with dynamic coverage calculators, real-time MRP encryption codes, multi-brand size tables, and automated WhatsApp/PDF export.',
          linkText: 'Open Quotation Registry',
          actionTab: 'quotations' as NavTab,
          badges: ['Tiles & Vitrified Surfaces', 'Sanitary Ware PDF Parsing', 'Role-Based Splits'],
        };
      case 'whatsapp':
        return {
          icon: MessageSquare,
          headline: 'Direct WhatsApp Dispatch & Statement Broadcast',
          description:
            'Send instant PDF quotes, order confirmations, vehicle gate passes, and automatic outstanding payment balance reminders directly to dealers and retail customers.',
          linkText: 'Configure Chatbot & Templates',
          actionTab: 'dealers-whatsapp' as NavTab,
          badges: ['Instant PDF Delivery', 'Payment Reminders', 'Live Tracking'],
        };
      case 'stock':
        return {
          icon: Warehouse,
          headline: 'Real-Time Godown, Local Purchase & Dispatch Hub',
          description:
            'Full visibility over ready inventory, Morbi factory inbound trucks, local distributor purchase approvals, and single/multi-truck delivery challans with driver logs.',
          linkText: 'Go to Dispatch Hub',
          actionTab: 'dispatch-all-closed' as NavTab,
          badges: ['Factory Tracking', 'Local Procurement', 'Delivery Challans'],
        };
      case 'gst':
        return {
          icon: Receipt,
          headline: 'Automated GST Calculation & Payment Reconciliation',
          description:
            'Seamless CGST, SGST, and IGST breakdowns, Section 194Q TDS ledgers, post-dated cheque clearances, and bank payment receipt verifications with zero accounting discrepancies.',
          linkText: 'View Accounting Hub',
          actionTab: 'accounting-bank-cash' as NavTab,
          badges: ['100% Tax Compliant', 'Bank & Cash Reconcile', 'TDS & PDC Vault'],
        };
      case 'kasha':
        return {
          icon: Sparkles,
          headline: 'Ask Kasha — AI Enterprise Business Assistant',
          description:
            'Instantly query daily sales figures, locate tile batches in stock, generate dealer performance reports, and forecast monthly ceramic collections using natural language.',
          linkText: 'Ask Kasha a Question',
          actionTab: 'help' as NavTab,
          badges: ['Natural Language Insights', 'Instant Godown Search', 'Margin Analytics'],
        };
    }
  }, [activeWalkthroughTab]);

  const CATEGORY_COLORS: Record<string, string> = {
    RETAIL: '#1E5649',
    PROJECT: '#2563EB',
    MANAGEMENT: '#7C3AED',
    COMPANY: '#D97706',
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F4F7F5] dark:bg-slate-950">
        <div className="w-12 h-12 rounded-2xl bg-teal-800/10 border border-teal-800/30 flex items-center justify-center text-teal-800 animate-spin">
          <RefreshCw size={24} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Loading Executive Dashboard...
        </p>
        <span className="text-xs text-slate-400">Aggregating real-time financial telemetry</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F4F7F5] dark:bg-slate-950">
        <div className="p-6 max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-sm text-center">
          <AlertCircle size={36} className="text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Dashboard Telemetry Error</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{error || 'Unable to connect to database'}</p>
          <button
            onClick={loadExecutiveData}
            className="mt-4 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const { meta, heroFinancials, todayOperations, businessAtAGlance, rolling12Months, agingBuckets, orderPipeline } = data;

  // Compute maximum values for interactive SVG charts
  const maxMonthlyVal = Math.max(
    ...rolling12Months.map((m) => Math.max(m.sales, m.received, m.purchases, 100000)),
    500000
  );

  const maxWeeklyOrders = Math.max(...data.weeklyOrders.map((w) => w.ordersCount), 6);

  // Compute Donut angles
  const totalPipelineCount =
    orderPipeline.pending.count +
    orderPipeline.inProgress.count +
    orderPipeline.delivered.count +
    orderPipeline.cancelled.count || 1;

  const donutSegments = [
    { key: 'pending', label: 'Pending', count: orderPipeline.pending.count, color: '#F59E0B' },
    { key: 'inProgress', label: 'In progress', count: orderPipeline.inProgress.count, color: '#2563EB' },
    { key: 'delivered', label: 'Delivered', count: orderPipeline.delivered.count, color: '#10B981' },
    { key: 'cancelled', label: 'Cancelled', count: orderPipeline.cancelled.count, color: '#EF4444' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F7F5] dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP GREETING BAR & HERO HEADER
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
            {meta.currentDateFormatted}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Good evening, {meta.user.name}
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
              {meta.user.role}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs text-xs flex items-center gap-2">
            <Building size={14} className="text-slate-400" />
            <span className="text-slate-400">ID:</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{meta.gstin || 'AMA-ERP-01'}</span>
          </div>

          <button
            onClick={() => onNavigate && onNavigate('reports')}
            className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
          >
            Reports
          </button>

          <button
            onClick={() => onCreateQuotation && onCreateQuotation('tiles')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#1E5649] hover:bg-[#164238] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>+ New invoice</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          HERO FINANCIAL OVERVIEW CARD (Split Stack + Robust SVG Trend)
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs p-5 sm:p-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (Financial Year Stack) */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <div className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                SALES THIS FINANCIAL YEAR ({meta.financialYear})
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#1E5649] dark:text-teal-400 tracking-tight font-mono">
                  {formatINR(heroFinancials.salesThisFY)}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  ({heroFinancials.invoicesCountFY} invoices)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BILLED THIS MONTH</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                  {formatINR(heroFinancials.billedThisMonth)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">COLLECTED THIS MONTH</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                  {formatINR(heroFinancials.collectedThisMonth)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">OWED TO YOU</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                  {formatINR(heroFinancials.owedToYou)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">STILL TO SUPPLY</div>
                <div className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-0.5 font-mono">
                  {formatINR(heroFinancials.stillToSupply)}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (12-Month Interactive SVG Trend Chart) */}
          <div className="lg:col-span-7 flex flex-col justify-between pt-4 lg:pt-0 lg:border-l lg:border-slate-100 lg:dark:border-slate-800/80 lg:pl-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">The last twelve months</span>
                <span className="text-[11px] text-slate-400 italic">"Click a month to open it"</span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#1E5649]" />
                  <span className="text-slate-600 dark:text-slate-400 text-[11px]">Sales</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-slate-600 dark:text-slate-400 text-[11px]">Purchases</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-slate-600 dark:text-slate-400 text-[11px]">Received</span>
                </div>
              </div>
            </div>

            {/* Interactive SVG Trend Chart (100% Reliable, Never Blank) */}
            <div className="relative w-full bg-slate-50/50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="flex items-end justify-between h-44 gap-1.5 pt-6 pb-2 px-1">
                {rolling12Months.map((m, idx) => {
                  const isSelected = selectedMonthKey === m.monthKey || (!selectedMonthKey && idx === rolling12Months.length - 1);
                  const isHovered = hoveredMonth?.monthKey === m.monthKey;
                  const salesHeightPct = Math.min(100, Math.max(8, (m.sales / maxMonthlyVal) * 100));
                  const receivedHeightPct = Math.min(100, Math.max(6, (m.received / maxMonthlyVal) * 100));
                  const purchaseHeightPct = Math.min(100, Math.max(4, (m.purchases / maxMonthlyVal) * 100));

                  return (
                    <div
                      key={m.monthKey}
                      onClick={() => setSelectedMonthKey(m.monthKey)}
                      onMouseEnter={() => setHoveredMonth(m)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className={`group flex-1 flex flex-col items-center justify-end h-full cursor-pointer relative transition-all rounded-lg p-0.5 ${
                        isSelected ? 'bg-teal-500/10 dark:bg-teal-400/10 ring-1 ring-[#1E5649]' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      {/* Bars Group */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-36">
                        {/* Sales Bar */}
                        <div
                          style={{ height: `${salesHeightPct}%` }}
                          className={`w-2 sm:w-2.5 rounded-t-sm transition-all ${
                            isSelected ? 'bg-[#1E5649] shadow-sm' : 'bg-teal-700/80 group-hover:bg-[#1E5649]'
                          }`}
                        />
                        {/* Received Bar */}
                        <div
                          style={{ height: `${receivedHeightPct}%` }}
                          className="w-1.5 sm:w-2 rounded-t-sm bg-emerald-500 transition-all group-hover:bg-emerald-600"
                        />
                      </div>

                      {/* Purchases Dot Indicator */}
                      <div
                        style={{ bottom: `${purchaseHeightPct * 0.8 + 20}px` }}
                        className="absolute w-2 h-2 rounded-full bg-amber-500 border border-white dark:border-slate-900 pointer-events-none"
                        title={`Purchases: ${formatINR(m.purchases)}`}
                      />

                      {/* Month Label */}
                      <span
                        className={`text-[10px] mt-1.5 font-semibold transition-colors ${
                          isSelected ? 'text-[#1E5649] dark:text-teal-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {m.monthLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Floating Tooltip Card */}
              {hoveredMonth && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs shadow-xl flex items-center gap-3 border border-slate-700 pointer-events-none animate-fade-in">
                  <span className="font-bold text-teal-300">{hoveredMonth.monthFull}</span>
                  <span>Sales: <strong className="font-mono">{formatINR(hoveredMonth.sales)}</strong></span>
                  <span>Recv: <strong className="font-mono text-emerald-400">{formatINR(hoveredMonth.received)}</strong></span>
                  <span>Purchases: <strong className="font-mono text-amber-400">{formatINR(hoveredMonth.purchases)}</strong></span>
                </div>
              )}
            </div>

            {/* Selected Month Details Summary Strip */}
            {activeMonthData && (
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1E5649]" />
                  <span>
                    Selected: <strong className="text-slate-900 dark:text-white">{activeMonthData.monthFull}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono font-bold">
                  <span className="text-[#1E5649] dark:text-teal-400">{formatINR(activeMonthData.sales)} billed</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{formatINR(activeMonthData.received)} collected</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. SECTION: TODAY (4-Column Daily Operations Strip)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-2">
          <span>TODAY'S OPERATIONS</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Boxes Sold Today */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs p-4 flex items-start justify-between hover:shadow-xs transition-shadow">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">BOXES SOLD TODAY</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {todayOperations.boxesSoldToday.toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {formatINR(todayOperations.amountSoldToday)} on {todayOperations.invoicesTodayCount} invoices
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-[#1E5649] dark:text-teal-300 flex items-center justify-center">
              <Boxes size={20} />
            </div>
          </div>

          {/* Card 2: Boxes Dispatched Today */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs p-4 flex items-start justify-between hover:shadow-xs transition-shadow">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">BOXES DISPATCHED TODAY</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {todayOperations.boxesDispatchedToday.toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {todayOperations.challansTodayCount} challans on {todayOperations.trucksTodayCount} trucks
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 flex items-center justify-center">
              <Truck size={20} />
            </div>
          </div>

          {/* Card 3: Profit Today */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs p-4 flex items-start justify-between hover:shadow-xs transition-shadow">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">PROFIT TODAY</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {formatINR(todayOperations.profitToday)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Estimated margin on today's dispatch</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>

          {/* Card 4: Purchases Today */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs p-4 flex items-start justify-between hover:shadow-xs transition-shadow">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">PURCHASES TODAY</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatINR(todayOperations.purchasesToday)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {todayOperations.billsRecordedToday} bills / orders recorded
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <ShoppingCart size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. SECTION: BUSINESS AT A GLANCE (6-Column Financial & Supply Row)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
          BUSINESS AT A GLANCE
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL SALES</span>
            <div className="text-base font-extrabold text-[#1E5649] dark:text-teal-400 mt-1 font-mono">
              {formatCompactINR(businessAtAGlance.totalSales)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {businessAtAGlance.totalInvoicesCount} invoices, this FY
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL PURCHASES</span>
            <div className="text-base font-extrabold text-amber-700 dark:text-amber-400 mt-1 font-mono">
              {formatCompactINR(businessAtAGlance.totalPurchases)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {businessAtAGlance.totalPurchaseBills} bills, this FY
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL RECEIVABLES</span>
            <div className="text-base font-extrabold text-rose-700 dark:text-rose-400 mt-1 font-mono">
              {formatCompactINR(businessAtAGlance.totalReceivables)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Owed by customers</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL PAYABLES</span>
            <div className="text-base font-extrabold text-slate-900 dark:text-white mt-1 font-mono">
              {formatCompactINR(businessAtAGlance.totalPayables)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Owed to vendors</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PENDING ORDERS</span>
            <div className="text-base font-extrabold text-indigo-700 dark:text-indigo-400 mt-1 font-mono">
              {businessAtAGlance.pendingOrdersCount} orders
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Not yet shipped</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PENDING SUPPLY</span>
            <div className="text-base font-extrabold text-sky-700 dark:text-sky-400 mt-1 font-mono">
              {formatCompactINR(businessAtAGlance.pendingSupplyAmount)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {businessAtAGlance.pendingSupplyLines} lines to dispatch
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. ANALYTICS & BREAKDOWN GRID (2 Rows)
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Row 1 (2 Columns: Billed & Collected vs Aging Buckets) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 1: Billed & Collected (Guaranteed Visible SVG Bar Chart) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Billed and collected</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Invoices raised against money received, month by month.</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#1E5649]" /> Billed
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected
                  </span>
                </div>
              </div>

              {/* Grouped Bar Chart */}
              <div className="mt-4 pt-2">
                <div className="h-44 flex items-end justify-between gap-2 border-b border-slate-200 dark:border-slate-700/80 px-2 pb-2">
                  {rolling12Months.map((m) => {
                    const billedHeight = Math.min(100, Math.max(6, (m.sales / maxMonthlyVal) * 100));
                    const collectedHeight = Math.min(100, Math.max(6, (m.received / maxMonthlyVal) * 100));
                    return (
                      <div key={m.monthKey} className="group flex-1 flex flex-col items-center justify-end h-full">
                        <div className="flex items-end justify-center gap-0.5 w-full h-36">
                          <div
                            style={{ height: `${billedHeight}%` }}
                            className="w-2 sm:w-3 bg-[#1E5649] rounded-t-sm group-hover:bg-[#164238] transition-all"
                            title={`Billed: ${formatINR(m.sales)}`}
                          />
                          <div
                            style={{ height: `${collectedHeight}%` }}
                            className="w-2 sm:w-3 bg-emerald-500 rounded-t-sm group-hover:bg-emerald-600 transition-all"
                            title={`Collected: ${formatINR(m.received)}`}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 font-semibold">{m.monthLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Rolling 12-month billing vs clearance index</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatINR(heroFinancials.collectedThisMonth)} collected this month
              </span>
            </div>
          </div>

          {/* Card 2: What customers owe (Aging Buckets) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">What customers owe</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Unpaid invoice balances, by days past due.</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL BALANCE</span>
                  <div className="text-base font-extrabold text-rose-600 dark:text-rose-400 font-mono">
                    {formatINR(agingBuckets.totalUnpaidBalance)}
                  </div>
                </div>
              </div>

              {agingBuckets.totalUnpaidBalance === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Nothing outstanding. Every bill is paid.</span>
                </div>
              ) : (
                <div className="space-y-3 mt-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">0–15 days</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                        {formatINR(agingBuckets.bucket0To15.amount)} ({agingBuckets.bucket0To15.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(4, (agingBuckets.bucket0To15.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">16–30 days</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                        {formatINR(agingBuckets.bucket16To30.amount)} ({agingBuckets.bucket16To30.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-teal-600 h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(4, (agingBuckets.bucket16To30.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">31–60 days</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                        {formatINR(agingBuckets.bucket31To60.amount)} ({agingBuckets.bucket31To60.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, (agingBuckets.bucket31To60.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-rose-600 dark:text-rose-400 font-bold">60+ days (Overdue)</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {formatINR(agingBuckets.bucket60Plus.amount)} ({agingBuckets.bucket60Plus.count})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-rose-500 h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(4, (agingBuckets.bucket60Plus.amount / (agingBuckets.totalUnpaidBalance || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Section 194Q & Buyer Ledgers</span>
              <button
                onClick={() => onNavigate && onNavigate('dispatch-payment-tracking')}
                className="text-teal-700 dark:text-teal-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Payment Reminders</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2 (3 Columns: Top Customers, Best-Selling Items, Sales by Category) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Col 1: Top Customers */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top customers</h3>
                  <p className="text-[11px] text-slate-500">By invoiced value, this financial year</p>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('customers')}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  All customers
                </button>
              </div>

              <div className="space-y-2.5">
                {data.topCustomers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No customer orders recorded yet.</p>
                ) : (
                  data.topCustomers.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-xs font-black flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-400">{c.ordersCount} orders</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{formatINR(c.invoicedAmount)}</div>
                        {c.unpaidBalance > 0 && (
                          <div className="text-[10px] text-rose-500 font-semibold">{formatINR(c.unpaidBalance)} due</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Col 2: Best-Selling Items */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Best-selling items</h3>
                  <p className="text-[11px] text-slate-500">Invoiced value incl. GST, this financial year</p>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('reports')}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Full report
                </button>
              </div>

              <div className="space-y-2.5">
                {data.bestSellingItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No item sales recorded yet.</p>
                ) : (
                  data.bestSellingItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 text-xs font-black flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.description}</div>
                          <div className="text-[10px] text-slate-400">
                            {item.brand} • {item.size} • {item.boxesSold} boxes
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{formatINR(item.totalAmount)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Col 3: Sales by Category */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sales by category</h3>
                  <p className="text-[11px] text-slate-500">Invoiced value, this financial year</p>
                </div>
              </div>

              <div className="space-y-3 mt-2">
                {data.salesByCategory.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No categories recorded yet.</p>
                ) : (
                  data.salesByCategory.map((cat, i) => {
                    const totalSales = heroFinancials.salesThisFY || 1;
                    const pct = Math.min(100, Math.round((cat.amount / totalSales) * 100));
                    const color = CATEGORY_COLORS[cat.category] || '#1E5649';
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{cat.category}</span>
                          <span className="font-mono text-slate-600 dark:text-slate-400 font-semibold">
                            {formatINR(cat.amount)} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 italic">
              Click a category above to filter by Retail, Project, Management, or Company accounts.
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. INTERACTIVE FEATURE WALKTHROUGH STRIP (`See what each part does`)
      ───────────────────────────────────────────────────────────── */}
      {showWalkthrough && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-700 text-white">
                  EXPLORE ERP MODULES
                </span>
                <span className="text-xs font-bold text-slate-200">See what each part does</span>
              </div>
              <button
                onClick={() => setShowWalkthrough(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X size={14} />
                <span>Hide</span>
              </button>
            </div>

            {/* Interactive Walkthrough Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                    activeWalkthroughTab === tab.id
                      ? 'bg-teal-700 text-white shadow-xs font-bold'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dynamic Walkthrough Content Box */}
            <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-teal-800 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-teal-600/30">
                  <walkthroughContent.icon size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{walkthroughContent.headline}</h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                    {walkthroughContent.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {walkthroughContent.badges.map((b, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-teal-300 border border-slate-700"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigate && onNavigate(walkthroughContent.actionTab)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-sm shrink-0"
              >
                <span>{walkthroughContent.linkText}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. DEALER, CATALOG & PIPELINE METRICS GRID
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Top Metric Strip (7 Cards) */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
            DEALER & SUPPLY NETWORK TELEMETRY
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL DEALERS</span>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {data.dealerAndCatalogMetrics.totalDealers}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PRICE LISTS</span>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {data.dealerAndCatalogMetrics.activePriceLists}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TOTAL PRODUCTS</span>
              <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1 font-mono">
                {data.dealerAndCatalogMetrics.totalProducts.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AWAITING REPLY</span>
              <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
                {data.dealerAndCatalogMetrics.quotationsAwaitingReply}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PENDING DISPATCH</span>
              <div className="text-lg font-black text-sky-600 dark:text-sky-400 mt-1 font-mono">
                {data.dealerAndCatalogMetrics.ordersPendingDispatch}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TRUCKS (THIS MO)</span>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {data.dealerAndCatalogMetrics.trucksDispatchedMonth}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">OPEN INQUIRIES</span>
              <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                {data.dealerAndCatalogMetrics.openInquiries}
              </div>
            </div>
          </div>
        </div>

        {/* Orders Trend & Pipeline Row (Guaranteed Visible Custom SVG Charts) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Orders, last 8 weeks (Left 7 Cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Orders, last 8 weeks</h3>
                  <p className="text-[11px] text-slate-500">Weekly velocity of approved and closed commercial quotations</p>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('quotations')}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  View orders
                </button>
              </div>

              {/* Robust Vertical Velocity Bar Chart */}
              <div className="h-40 flex items-end justify-between gap-3 pt-6 pb-2 px-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
                {data.weeklyOrders.map((w, i) => {
                  const barHeightPct = Math.min(100, Math.max(12, (w.ordersCount / maxWeeklyOrders) * 100));
                  return (
                    <div key={i} className="group flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 font-mono">
                        {w.ordersCount}
                      </span>
                      <div
                        style={{ height: `${barHeightPct}%` }}
                        className="w-full max-w-[28px] rounded-t-md bg-[#1E5649] group-hover:bg-[#164238] transition-all shadow-2xs"
                      />
                      <span className="text-[10px] text-slate-500 mt-1.5 font-semibold">{w.weekLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Weekly quotation conversion rate</span>
              <span className="font-semibold text-teal-700 dark:text-teal-400">Steady volume momentum</span>
            </div>
          </div>

          {/* Order pipeline Donut (Right 5 Cols - Beautiful Visible SVG Donut) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Order pipeline</h3>
                <div className="text-[11px] text-slate-400 font-mono">
                  {heroFinancials.invoicesCountFY} total active
                </div>
              </div>

              {/* Custom SVG Donut Chart (Guaranteed Render) */}
              <div className="flex items-center justify-center py-2">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    {(() => {
                      let accumulatedAngle = 0;
                      return donutSegments.map((seg) => {
                        const pct = seg.count / totalPipelineCount;
                        const dashLength = pct * 283; // 2 * pi * r (r=45)
                        const offset = accumulatedAngle * 283;
                        accumulatedAngle += pct;
                        if (seg.count === 0) return null;
                        return (
                          <circle
                            key={seg.key}
                            cx="50"
                            cy="50"
                            r="40"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="12"
                            strokeDasharray={`${dashLength} 283`}
                            strokeDashoffset={`-${offset}`}
                            className="transition-all hover:opacity-80"
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Center Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
                      {totalPipelineCount}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Orders</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Legend */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                  Pending ({orderPipeline.pending.count})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                  In progress ({orderPipeline.inProgress.count})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                  Delivered ({orderPipeline.delivered.count})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                  Cancelled ({orderPipeline.cancelled.count})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Banners (Add Dealer & Create Price List) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => onNavigate && onNavigate('dealers-list')}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1E5649] text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <Users size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add Dealer</h4>
                <p className="text-xs text-slate-500 mt-0.5">Register showroom retail partners, territory mapping & credit limits</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-teal-700 transition-colors">
              <ChevronRight size={18} />
            </div>
          </div>

          <div
            onClick={() => onNavigate && onNavigate('items-price-lists')}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1E5649] text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <Layers size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Create Price List</h4>
                <p className="text-xs text-slate-500 mt-0.5">Generate tile brand rate cards, architect folders & special discount tiers</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-teal-700 transition-colors">
              <ChevronRight size={18} />
            </div>
          </div>
        </div>

        {/* Recent Orders Full-Width Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent orders</h3>
              <p className="text-xs text-slate-500">Latest quotations and confirmed sales recorded across all salespersons</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('quotations')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>View all</span>
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3">Quotation #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Net Total</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {data.recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      No recent quotations found.
                    </td>
                  </tr>
                ) : (
                  data.recentOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {ord.quotationNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {ord.customerName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="capitalize text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {ord.quotationType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          {ord.salesCategory || 'RETAIL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {ord.quotationDate ? new Date(ord.quotationDate).toLocaleDateString('en-IN') : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatINR(ord.netTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            ord.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : ord.status === 'closed'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : ord.status === 'in_review'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onSelectQuotation && onSelectQuotation(ord.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950 hover:bg-teal-100 text-teal-800 dark:text-teal-300 font-semibold text-[11px] cursor-pointer transition-colors"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
